'use client';

import Link from 'next/link';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import type { SystemTrayAssetJob, SystemTrayPrimary } from '@/hooks/useSystemTrayState';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';
import UiIcon from '@/components/ui/UiIcon';
import { TrayProgressBar } from '@/components/system-tray/TrayProgressBar';
import { GalleryTrayRow } from '@/components/system-tray/GalleryTrayRow';
import { AssetTrayRow } from '@/components/system-tray/AssetTrayRow';
import {
  primaryPercent,
  primarySubtitle,
  primaryTitle,
} from '@/components/system-tray/system-tray-helpers';

type SystemTrayActivityCardProps = {
  panelId: string;
  expanded: boolean;
  setExpanded: (value: boolean | ((previous: boolean) => boolean)) => void;
  primary: SystemTrayPrimary;
  totalActiveCount: number;
  assetJobs: SystemTrayAssetJob[];
  activeGalleryJobs: ComfyGalleryEntry[];
  heldJobs: Array<{ id: string; label: string }>;
  queueHealth: { queuePending: number; queueRunning: number } | null;
  cancellingGalleryIds: Set<string>;
  cancelGalleryJob: (entry: ComfyGalleryEntry) => void;
  cancelAssetJob: (jobId: string) => void;
};

export function SystemTrayActivityCard({
  panelId,
  expanded,
  setExpanded,
  primary,
  totalActiveCount,
  assetJobs,
  activeGalleryJobs,
  heldJobs,
  queueHealth,
  cancellingGalleryIds,
  cancelGalleryJob,
  cancelAssetJob,
}: SystemTrayActivityCardProps) {
  const percent = primaryPercent(primary);
  const subtitle = primarySubtitle(primary);
  const extraCount = Math.max(0, totalActiveCount - 1);
  const downloadAlsoRunning =
    assetJobs.length > 0 && primary.kind !== 'asset' && primary.kind !== 'held';
  const downloadHint =
    downloadAlsoRunning && assetJobs.length === 1
      ? `1 download also running`
      : downloadAlsoRunning
        ? `${assetJobs.length} downloads also running`
        : null;

  return (
    <div
      data-testid="system-tray-card"
      className={`pointer-events-auto ui-tray-card overflow-hidden transition-[box-shadow] duration-200 ${
        expanded
          ? 'ring-1 ring-[var(--accent-ring)]'
          : 'max-md:w-fit max-md:max-w-full max-md:self-end'
      }`}
    >
      <div className="flex w-full items-stretch">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          data-testid="system-tray-toggle"
          onClick={() => setExpanded(value => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 px-3.5 py-3 text-left max-md:gap-2 max-md:py-2 transition hover:bg-[var(--bg-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
        >
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center max-md:h-7 max-md:w-7 justify-center rounded-xl border border-[var(--accent-border)] bg-gradient-to-br from-[var(--accent-muted)] to-[var(--tint-info-bg)] text-[var(--accent-text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            {primary.kind === 'asset' ? (
              <UiIcon name="download" size={14} />
            ) : primary.kind === 'held' ? (
              <UiIcon name="pause" size={14} />
            ) : (
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)]/50" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {primaryTitle(primary)}
                </p>
                {subtitle ? (
                  <p
                    className={`mt-0.5 truncate type-caption text-[var(--text-tertiary)] ${
                      expanded ? '' : 'max-md:hidden'
                    }`}
                  >
                    {subtitle}
                  </p>
                ) : null}
                {downloadHint ? (
                  <p
                    className={`mt-0.5 truncate type-caption text-[var(--tint-info-text)]/80 ${
                      expanded ? '' : 'max-md:hidden'
                    }`}
                  >
                    {downloadHint}
                  </p>
                ) : null}
              </div>
              {extraCount > 0 ? (
                <span className="shrink-0 rounded-full border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--accent-text)]">
                  +{extraCount}
                </span>
              ) : null}
            </div>
            {percent != null && !expanded ? <TrayProgressBar percent={percent} compact /> : null}
          </div>

          <span
            aria-hidden
            className={`mt-1 shrink-0 text-[var(--text-muted)] transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
          >
            ▾
          </span>
        </button>

        {primary.kind === 'gallery' ? (
          <button
            type="button"
            disabled={cancellingGalleryIds.has(primary.entry.id)}
            aria-label="Cancel generation job"
            data-testid="system-tray-cancel-primary"
            onClick={() => cancelGalleryJob(primary.entry)}
            className="shrink-0 border-l border-[var(--border-subtle)] px-3 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancellingGalleryIds.has(primary.entry.id) ? '…' : 'Cancel'}
          </button>
        ) : primary.kind === 'asset' ? (
          <button
            type="button"
            aria-label="Cancel download"
            data-testid="system-tray-cancel-primary-asset"
            onClick={() => cancelAssetJob(primary.job.id)}
            className="shrink-0 border-l border-[var(--border-subtle)] px-3 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
          >
            Cancel
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div
          id={panelId}
          className="max-h-[min(24rem,50vh)] overflow-y-auto border-t border-[var(--border-subtle)] px-3.5 py-3"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
              Activity
            </p>
            <div className="flex items-center gap-2">
              <Link
                href="/queue"
                className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                onClick={() => setExpanded(false)}
              >
                Queue
              </Link>
              <Link
                href="/gallery"
                className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                onClick={() => setExpanded(false)}
              >
                Gallery
              </Link>
              {assetJobs.length > 0 ? (
                <Link
                  href={settingsComfyUiSectionHref('model-assets')}
                  className="type-caption text-[var(--accent-text)] transition hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
                  onClick={() => setExpanded(false)}
                >
                  Assets
                </Link>
              ) : null}
            </div>
          </div>

          {queueHealth && (queueHealth.queuePending > 0 || queueHealth.queueRunning > 0) ? (
            <div className="mb-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-subtle)]/60 px-3 py-2">
              <p className="text-xs text-[var(--text-secondary)]">
                ComfyUI server · {queueHealth.queueRunning} running · {queueHealth.queuePending}{' '}
                pending
              </p>
            </div>
          ) : null}

          {activeGalleryJobs.length > 0 ? (
            <section className="mb-3 space-y-2">
              <h3 className="type-caption font-medium text-[var(--text-muted)]">
                Generations ({activeGalleryJobs.length})
              </h3>
              <ul className="space-y-2">
                {activeGalleryJobs.slice(0, 6).map(entry => (
                  <GalleryTrayRow
                    key={entry.id}
                    entry={entry}
                    onCancel={cancelGalleryJob}
                    cancelling={cancellingGalleryIds.has(entry.id)}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {heldJobs.length > 0 ? (
            <section className="mb-3 space-y-2">
              <h3 className="type-caption font-medium text-[var(--text-muted)]">
                Held Max ({heldJobs.length})
              </h3>
              <ul className="space-y-1.5">
                {heldJobs.slice(0, 5).map(job => (
                  <li
                    key={job.id}
                    className="rounded-lg border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-xs text-[var(--tint-warning-text)]"
                  >
                    <span className="font-medium">{job.label}</span>
                    <span className="text-[var(--tint-warning-text)]/70">
                      {' '}
                      · waiting for idle queue
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {assetJobs.length > 0 ? (
            <section className="space-y-2">
              <h3 className="type-caption font-medium text-[var(--text-muted)]">
                Downloads ({assetJobs.length})
              </h3>
              <ul className="space-y-2">
                {assetJobs.map(job => (
                  <AssetTrayRow key={job.id} job={job} onCancel={cancelAssetJob} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
