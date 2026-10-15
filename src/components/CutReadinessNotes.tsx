'use client';

/**
 * Under Cut: which checks have run on the shots going in, and what the cut will quietly do
 * (leave a slot out, use a still for a failed clip, play a line silent). Film-delivery-check.ts.
 */
export default function CutReadinessNotes({
  coverage,
  coverageTitle,
  notes = [],
  testId,
}: {
  coverage: string;
  /** Hover text: what Cut itself checks (CUT_TIME_CHECKS, passed in by the Play caller). */
  coverageTitle?: string;
  notes?: string[];
  testId: string;
}) {
  if (!coverage && notes.length === 0) return null;
  return (
    <div className="mt-1 space-y-0.5" data-testid={testId}>
      {notes.length > 0 ? (
        <ul
          className="type-caption text-[var(--tint-warning-text)]"
          data-testid={`${testId}-notes`}
        >
          {notes.map(note => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      {coverage ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid={`${testId}-coverage`}
          title={coverageTitle}
        >
          {coverage}
        </p>
      ) : null}
    </div>
  );
}
