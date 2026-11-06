'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCutTime, type CutPreviewLoaded } from '@/hooks/useCutPreview';
import { cutTempMusicCues, makeTempMusic } from '@/lib/film/temp-music-client';
import type { CutEffect } from '@/lib/video/cut-sound';

/**
 * Cut → Music by scene (temp-music.ts): where the film's feeling turns — happy, then sad, then
 * tense — a cue in that style for each stretch (ACE-Step, about 10 s to render each), a long
 * stretch in two-minute pieces, placed at its start as music: each fades in and ducks under the
 * lines like the music track (Part 19 G4). For one feeling over a short film, Score this film.
 */
export default function CutTempMusic({
  loaded,
  feelingOf,
  disabled,
  onAdd,
}: {
  loaded: CutPreviewLoaded | null;
  /** A shot's feeling in words: its story state's emotion, else its beat. */
  feelingOf: (key: string) => string;
  disabled?: boolean;
  onAdd: (id: string, effect: Partial<CutEffect>) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cues = useMemo(
    () => (loaded ? cutTempMusicCues(loaded, feelingOf) : []),
    [feelingOf, loaded]
  );
  if (!loaded || !cues.length) return null;
  const makeAll = async () => {
    setError(null);
    const result = await makeTempMusic(cues, onAdd, setBusy);
    if (result.error) setError(result.error);
    setBusy(null);
  };
  return (
    <section className="mt-3 space-y-1.5" data-testid="cut-temp-music">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption font-medium">Music by scene · {cues.length} cues</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || busy !== null}
          data-testid="cut-temp-music-make"
          title="A cue in each stretch's style (ACE-Step), placed at its start — each fades in and ducks under the lines like the music track"
          onClick={() => void makeAll()}
        >
          {busy ?? 'Make the cues'}
        </Button>
      </div>
      <ol className="space-y-0.5">
        {cues.map(cue => (
          <li
            key={`${cue.tone}-${cue.atSec}`}
            className="type-caption text-[var(--text-secondary)]"
          >
            <span className="tabular-nums text-[var(--text-muted)]">
              {formatCutTime(cue.atSec)}
            </span>{' '}
            {cue.tone} · {Math.round(cue.seconds)} s ·{' '}
            {cue.shots.length ? cue.shots.join(', ') : 'carries on'}
          </li>
        ))}
      </ol>
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
