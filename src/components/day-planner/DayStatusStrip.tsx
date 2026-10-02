'use client';

import type { PoseGuidePreview } from '@/lib/pose-guide-status';

type DayStatusStripProps = {
  statusLine: string;
  queueBlockReason?: string | null;
  /** Whether the Image 3 pose guide reached the queue (and why not, when it didn't). */
  poseGuideLine?: string | null;
  /** Thumbnails of the Image 3 guides that were sent, so a wrong stance is visible at a glance. */
  poseGuidePreviews?: PoseGuidePreview[];
  /** The dress plate step: rendering now, ready, or skipped (see day-dress-plate.ts). */
  dressPlateStatus?: { text: string; busy: boolean } | null;
  /** The current dressed plate, and a way to make it again (a new seed) if it came out wrong. */
  dressPlatePreviewUrl?: string | null;
  onRedoDressPlate?: () => void;
  className?: string;
};

/**
 * Pinned Day context — plate · mood · stills/clips, why Queue is blocked.
 */
export default function DayStatusStrip({
  statusLine,
  queueBlockReason = null,
  poseGuideLine = null,
  poseGuidePreviews = [],
  dressPlateStatus = null,
  dressPlatePreviewUrl = null,
  onRedoDressPlate,
  className = '',
}: DayStatusStripProps) {
  return (
    <div className={className.trim() || undefined} data-testid="day-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="day-status-line">
        {statusLine}
      </p>
      {dressPlateStatus ? (
        // An extra render nobody asked for by name: say so while it runs, where Queue was pressed.
        <p
          className={`type-caption mt-1 flex items-center gap-2 ${
            dressPlateStatus.busy
              ? 'rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2.5 py-1.5 font-medium text-[var(--accent-text)]'
              : 'text-[var(--text-muted)]'
          }`}
          data-testid="day-dress-plate-status"
          data-busy={dressPlateStatus.busy ? 'true' : 'false'}
        >
          {dressPlateStatus.busy ? (
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)]/50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
          ) : null}
          {dressPlateStatus.text}
        </p>
      ) : null}
      {dressPlatePreviewUrl && !dressPlateStatus?.busy ? (
        <div className="mt-1.5 flex items-center gap-2" data-testid="day-dress-plate">
          {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI proxy URL */}
          <img
            src={dressPlatePreviewUrl}
            alt="Dressed plate the clothed stills start from"
            className="h-16 w-12 rounded-lg border border-[var(--border-subtle)] bg-white object-cover object-top"
          />
          <div className="min-w-0">
            <p className="type-caption text-[var(--text-secondary)]">
              Dressed plate — clothed stills start from it while the outfit and shoes stay the same.
            </p>
            {onRedoDressPlate ? (
              <button
                type="button"
                className="ui-text-link type-caption max-md:inline-flex max-md:min-h-8 max-md:items-center"
                data-testid="day-dress-plate-redo"
                onClick={onRedoDressPlate}
              >
                Dress her again
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {poseGuideLine ? (
        <p className="type-caption mt-1 text-[var(--text-muted)]" data-testid="day-pose-guide-line">
          {poseGuideLine}
        </p>
      ) : null}
      {poseGuidePreviews.length > 0 ? (
        <details className="mt-1" data-testid="day-pose-guide-previews">
          <summary className="type-caption cursor-pointer text-[var(--text-muted)]">
            Show pose guides
          </summary>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {poseGuidePreviews.map(preview => (
              <figure key={preview.slotId} className="m-0 w-16">
                {/* eslint-disable-next-line @next/next/no-img-element -- ComfyUI proxy URL */}
                <img
                  src={preview.url}
                  alt={`${preview.slotLabel} pose guide`}
                  className="aspect-[2/3] w-16 rounded border border-[var(--border-subtle)] object-cover"
                  loading="lazy"
                />
                <figcaption className="type-caption truncate text-[var(--text-muted)]">
                  {preview.slotLabel}
                </figcaption>
              </figure>
            ))}
          </div>
        </details>
      ) : null}
      {queueBlockReason ? (
        <p
          className="type-caption mt-1 text-[var(--tint-warning-text,var(--text-muted))]"
          data-testid="day-queue-block-reason-strip"
        >
          {queueBlockReason}
        </p>
      ) : null}
    </div>
  );
}
