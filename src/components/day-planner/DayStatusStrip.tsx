'use client';

import type { PoseGuidePreview } from '@/lib/pose-guide-status';

type DayStatusStripProps = {
  statusLine: string;
  queueBlockReason?: string | null;
  /** Whether the Image 3 pose guide reached the queue (and why not, when it didn't). */
  poseGuideLine?: string | null;
  /** Thumbnails of the Image 3 guides that were sent, so a wrong stance is visible at a glance. */
  poseGuidePreviews?: PoseGuidePreview[];
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
  className = '',
}: DayStatusStripProps) {
  return (
    <div className={className.trim() || undefined} data-testid="day-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="day-status-line">
        {statusLine}
      </p>
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
