'use client';

import { Button } from '@/components/ui/Button';
import { reviewTimeLabel, type CutReviewNote } from '@/lib/film/review-notes';

/**
 * Cut → Notes: what reviewers said on this cut's review links (Cast → Films → Share for review),
 * each pinned comment a jump to its moment, and a tick once it is dealt with. The times are the
 * film's as it was shared: an edit since moves the shots under them.
 */
export default function CutReviewNotes({
  notes,
  loading,
  error,
  onSeek,
  onResolve,
}: {
  notes: CutReviewNote[];
  loading: boolean;
  error: string | null;
  onSeek: (timeSec: number) => void;
  onResolve: (note: CutReviewNote, resolved: boolean) => void;
}) {
  const films = new Set(notes.map(note => note.film));
  const open = notes.filter(note => !note.resolved).length;
  return (
    <div className="space-y-2" data-testid="cut-review-notes">
      {loading && !notes.length ? (
        <p className="type-caption text-[var(--text-muted)]">Looking for review comments…</p>
      ) : !notes.length ? (
        <p className="type-caption text-[var(--text-muted)]">
          No review comments yet. Share a saved film for review (Cast → Films) and what people say
          shows up here, pinned to the timeline.
        </p>
      ) : (
        <>
          <p className="type-caption text-[var(--text-muted)]">
            {open} open of {notes.length}. Times are the film’s as shared — an edit since moves the
            shots under them.
          </p>
          <ul className="space-y-1.5">
            {notes.map(note => (
              <li
                key={`${note.token}-${note.id}`}
                className={`flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] p-2 text-sm ${note.resolved ? 'opacity-60' : ''}`}
                data-testid="cut-review-note"
              >
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={note.resolved === true}
                  aria-label={note.resolved ? 'Mark as open' : 'Mark as dealt with'}
                  data-testid="cut-review-note-resolve"
                  onChange={event => onResolve(note, event.target.checked)}
                />
                <div className="min-w-0 flex-1">
                  <p className="type-caption text-[var(--text-muted)]">
                    {note.timeSec !== undefined ? (
                      <Button
                        variant="underline"
                        className="mr-1.5 font-medium tabular-nums text-[var(--accent-text)] underline-offset-2 hover:underline"
                        data-testid="cut-review-note-jump"
                        onClick={() => onSeek(note.timeSec!)}
                      >
                        {reviewTimeLabel(note.timeSec)}
                      </Button>
                    ) : null}
                    {note.name}
                    {films.size > 1 ? ` · ${note.film}` : ''}
                  </p>
                  <p className={`whitespace-pre-wrap ${note.resolved ? 'line-through' : ''}`}>
                    {note.text}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {error ? (
        <p className="type-caption text-[var(--tint-danger-text)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
