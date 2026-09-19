'use client';

type CastStatusStripProps = {
  statusLine: string;
  plateHint?: string | null;
  plateStatus?: string | null;
  plateError?: string | null;
  className?: string;
};

/**
 * Pinned Cast home context — plate · Part · looks · films, plus plate readiness.
 */
export default function CastStatusStrip({
  statusLine,
  plateHint = null,
  plateStatus = null,
  plateError = null,
  className = '',
}: CastStatusStripProps) {
  return (
    <div className={className.trim() || undefined} data-testid="cast-status-strip" role="status">
      <p className="type-caption text-[var(--text-secondary)]" data-testid="cast-status-line">
        {statusLine}
      </p>
      {plateStatus ? (
        <p className="type-caption mt-1 text-[var(--text-muted)]" data-testid="cast-plate-status">
          {plateStatus}
        </p>
      ) : null}
      {plateHint ? (
        <p
          className="type-caption mt-1 text-[var(--tint-warning-text,var(--text-muted))]"
          data-testid="cast-plate-hint"
        >
          {plateHint}
        </p>
      ) : null}
      {plateError ? (
        <p
          className="type-caption mt-1 text-[var(--tint-warning-text,var(--text-muted))]"
          data-testid="cast-plate-error"
        >
          {plateError}
        </p>
      ) : null}
    </div>
  );
}
