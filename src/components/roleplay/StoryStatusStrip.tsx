'use client';

type StoryStatusStripProps = {
  statusLine: string;
  queueBlockReason?: string | null;
  className?: string;
};

/**
 * Pinned Story context — Cast · plate · beats/clips, why Queue is blocked.
 */
export default function StoryStatusStrip({
  statusLine,
  queueBlockReason = null,
  className = '',
}: StoryStatusStripProps) {
  return (
    <div className={className.trim() || undefined} data-testid="story-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="story-status-line">
        {statusLine}
      </p>
      {queueBlockReason ? (
        <p
          className="type-caption mt-1 text-[var(--tint-warning-text,var(--text-muted))]"
          data-testid="story-queue-block-reason-strip"
        >
          {queueBlockReason}
        </p>
      ) : null}
    </div>
  );
}
