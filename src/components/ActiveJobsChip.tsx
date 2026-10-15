'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useSystemTrayState } from '@/hooks/useSystemTrayState';
import { loadComfyGallery } from '@/lib/comfyui-gallery';
import { estimateQueueEta, formatEta } from '@/lib/queue-eta';
import { openSystemTrayPanel } from '@/lib/system-tray-panel';

/**
 * Compact chip showing live gallery/queue job count — links to Queue, or with `trayToggle` opens
 * the jobs panel (SystemTray) from a header, where the floating card used to cover the page.
 */
export default function ActiveJobsChip({
  className = '',
  compact = false,
  trayToggle,
}: {
  className?: string;
  compact?: boolean;
  /** Open the jobs panel under the header ('top') or by the sidebar ('bottom'). */
  trayToggle?: boolean | 'top' | 'bottom';
}) {
  const { totalActiveCount, activeGalleryJobs, queueHealth } = useSystemTrayState({
    pollAssets: false,
  });
  const galleryActive = activeGalleryJobs.length;
  const queueDepth = (queueHealth?.queuePending ?? 0) + (queueHealth?.queueRunning ?? 0);
  const count = Math.max(totalActiveCount, galleryActive, queueDepth);
  // Rough time left from how long recent jobs took (see queue-eta).
  const etaLabel = useMemo(() => {
    if (activeGalleryJobs.length === 0) return '';
    const eta = estimateQueueEta(activeGalleryJobs, loadComfyGallery());
    return eta.guess ? '' : formatEta(eta.totalSec);
  }, [activeGalleryJobs]);

  if (count <= 0) {
    return null;
  }

  const title = `${count} active job${count === 1 ? '' : 's'}${etaLabel ? `, done in ${etaLabel}` : ''}`;
  if (trayToggle) {
    return (
      <button
        type="button"
        data-testid="active-jobs-chip"
        title={`${title} — show jobs`}
        onClick={() => openSystemTrayPanel(trayToggle === 'bottom' ? 'bottom' : 'top')}
        className={`inline-flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${className}`}
      >
        <span
          className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent-text)]"
          aria-hidden
        />
        {count} {count === 1 ? 'job' : 'jobs'}
        {etaLabel ? <span className="text-[var(--text-muted)]">· {etaLabel}</span> : null}
      </button>
    );
  }

  return (
    <Link
      href="/queue"
      data-testid="active-jobs-chip"
      title={`${title} — open Queue`}
      className={`inline-flex items-center gap-1.5 rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-text)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] ${className}`}
    >
      <span
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--accent-text)]"
        aria-hidden
      />
      {compact ? count : `${count} active`}
      {etaLabel && !compact ? <span className="opacity-80">· {etaLabel}</span> : null}
    </Link>
  );
}
