'use client';

type DayStatusStripProps = {
  statusLine: string;
  queueBlockReason?: string | null;
  className?: string;
};

/**
 * Pinned Day context — plate · mood · stills/clips, why Queue is blocked.
 */
export default function DayStatusStrip({
  statusLine,
  queueBlockReason = null,
  className = '',
}: DayStatusStripProps) {
  return (
    <div className={className.trim() || undefined} data-testid="day-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="day-status-line">
        {statusLine}
      </p>
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
