'use client';

type FittingStatusStripProps = {
  statusLine: string;
  queueBlockReason?: string | null;
  previewHint?: string | null;
  className?: string;
};

/**
 * Pinned Outfit context — plate · kit/BYO, why Queue is blocked, Preview vs Queue.
 */
export default function FittingStatusStrip({
  statusLine,
  queueBlockReason = null,
  previewHint = null,
  className = '',
}: FittingStatusStripProps) {
  return (
    <div className={className.trim() || undefined} data-testid="fitting-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="fitting-status-line">
        {statusLine}
      </p>
      {previewHint ? (
        <p
          className="type-caption mt-1 text-[var(--text-muted)]"
          data-testid="fitting-preview-hint"
        >
          {previewHint}
        </p>
      ) : null}
      {queueBlockReason ? (
        <p
          className="type-caption mt-1 text-[var(--tint-warning-text,var(--text-muted))]"
          data-testid="fitting-queue-block-reason"
        >
          {queueBlockReason}
        </p>
      ) : null}
    </div>
  );
}
