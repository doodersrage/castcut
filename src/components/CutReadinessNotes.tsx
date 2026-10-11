'use client';

/**
 * Under Cut: which checks have run on the shots going in, and what the cut will quietly do
 * (leave a slot out, use a still for a failed clip, play a line silent). Film-delivery-check.ts.
 */
export default function CutReadinessNotes({
  coverage,
  notes = [],
  testId,
}: {
  coverage: string;
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
        <p className="type-caption text-[var(--text-muted)]" data-testid={`${testId}-coverage`}>
          {coverage}
        </p>
      ) : null}
    </div>
  );
}
