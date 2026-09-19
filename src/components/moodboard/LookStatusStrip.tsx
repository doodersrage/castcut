'use client';

type LookStatusStripProps = {
  statusLine: string;
  extractBlockReason?: string | null;
  queueBlockReason?: string | null;
  previewHint?: string | null;
  lookStatus?: string | null;
  className?: string;
};

/**
 * Pinned Look context — tiles · plate · pack, why Extract/Queue is blocked, Preview vs Queue.
 */
export default function LookStatusStrip({
  statusLine,
  extractBlockReason = null,
  queueBlockReason = null,
  previewHint = null,
  lookStatus = null,
  className = '',
}: LookStatusStripProps) {
  const blockReason = extractBlockReason || queueBlockReason;
  return (
    <div className={className.trim() || undefined} data-testid="look-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="look-status-line">
        {statusLine}
      </p>
      {previewHint ? (
        <p className="type-caption mt-1 text-[var(--text-muted)]" data-testid="look-preview-hint">
          {previewHint}
        </p>
      ) : null}
      {lookStatus ? (
        <p className="type-caption mt-1 text-[var(--text-muted)]" data-testid="look-status-message">
          {lookStatus}
        </p>
      ) : null}
      {blockReason ? (
        <p
          className="type-caption mt-1 text-[var(--tint-warning-text,var(--text-muted))]"
          data-testid="look-block-reason"
        >
          {blockReason}
        </p>
      ) : null}
    </div>
  );
}
