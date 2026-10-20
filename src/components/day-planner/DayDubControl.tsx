'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { DUB_LANGUAGES } from '@/lib/day/dub';

/**
 * "Dub": the Day's spoken lines in another language (day-dub.ts) — translated, then the talking
 * clips made again so the lips match. "As written" puts the original lines back.
 */
export default function DayDubControl({
  language,
  disabled,
  onDub,
}: {
  /** The language the lines are in now; unset = as written. */
  language?: string;
  disabled?: boolean;
  onDub: (language: string | null) => Promise<string>;
}) {
  const [pick, setPick] = useState(language ?? '');
  const [note, setNote] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const changed = pick !== (language ?? '');
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="day-dub">
      <label className="type-caption flex items-center gap-1.5 text-[var(--text-muted)]">
        Dub
        <select
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--text)]"
          value={pick}
          disabled={disabled || running}
          data-testid="day-dub-language"
          onChange={event => setPick(event.target.value)}
        >
          <option value="">As written</option>
          {DUB_LANGUAGES.map(entry => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </label>
      {changed ? (
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || running}
          data-testid="day-dub-run"
          title="Translate every spoken line and make the talking clips again in that language"
          onClick={() => {
            setRunning(true);
            setNote(null);
            onDub(pick || null)
              .then(setNote)
              .catch((error: unknown) =>
                setNote(error instanceof Error ? error.message : 'Dub failed.')
              )
              .finally(() => setRunning(false));
          }}
        >
          {running ? 'Dubbing…' : pick ? `Dub into ${pick}` : 'Back to as written'}
        </Button>
      ) : null}
      {note ? (
        <span
          className="type-caption text-[var(--text-muted)]"
          data-testid="day-dub-note"
          role="status"
        >
          {note}
        </span>
      ) : null}
    </div>
  );
}
