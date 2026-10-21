'use client';

import type { ImageLightboxJobChrome } from '@/components/ui/image-lightbox/types';

export type ImageLightboxJobBadgeProps = {
  compact?: boolean;
  job?: ImageLightboxJobChrome | null;
};

const JOB_STATUS_WORD: Record<ImageLightboxJobChrome['status'], string> = {
  pending: 'Queued',
  running: 'Running',
  completed: 'Done',
  error: 'Failed',
};

export default function ImageLightboxJobBadge({
  compact = false,
  job,
}: ImageLightboxJobBadgeProps) {
  if (!job || (job.status !== 'pending' && job.status !== 'running' && job.status !== 'error')) {
    return null;
  }

  return (
    <div
      className="ui-lightbox-pill flex items-center gap-2"
      data-immersive={compact ? 'true' : undefined}
    >
      {/* Shape as well as colour tells the states apart: ! failed, filled pulse running,
          hollow ring queued. The word is there for screen readers. */}
      {job.status === 'error' ? (
        <span
          aria-hidden
          className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--tint-danger-text)] text-3xs font-bold leading-none text-[var(--bg-base)]"
        >
          !
        </span>
      ) : job.status === 'running' ? (
        <span
          aria-hidden
          className="h-2 w-2 animate-pulse rounded-full bg-[var(--tint-warning-text)]"
        />
      ) : (
        <span
          aria-hidden
          className="h-2 w-2 rounded-full border-2 border-[var(--tint-info-text)] bg-transparent"
        />
      )}
      <span className="sr-only">{JOB_STATUS_WORD[job.status]}: </span>
      <span>{job.label}</span>
      {job.percent != null ? (
        <span className={compact ? 'text-white/55' : 'text-[var(--text-muted)]'}>
          {job.percent}%
        </span>
      ) : null}
    </div>
  );
}
