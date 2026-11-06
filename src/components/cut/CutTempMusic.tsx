'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCutTime, type CutPreviewLoaded } from '@/hooks/useCutPreview';
import { requestFilmScore } from '@/lib/film/score';
import { tempMusicCues } from '@/lib/film/temp-music';
import type { CutEffect } from '@/lib/video/cut-sound';

/**
 * Cut → Temp music by scene (temp-music.ts): where the film's feeling turns — happy, then sad,
 * then tense — a cue in that style for each stretch (ACE-Step, about 10 s to render each), placed
 * on the effects track at its start. Temp music: it doesn't duck under the lines like the music
 * track does; for one feeling throughout, Score this film is the tool.
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
  const cues = useMemo(() => {
    if (!loaded) return [];
    return tempMusicCues(
      loaded.timeline.items
        .filter(item => item.shot >= 0)
        .flatMap(item => {
          const key = loaded.keys[item.shot];
          return key
            ? [
                {
                  key,
                  title: loaded.shots[item.shot]?.title ?? 'Shot',
                  feeling: feelingOf(key),
                  startSec: item.startSec,
                  durSec: item.durSec,
                },
              ]
            : [];
        })
    );
  }, [feelingOf, loaded]);
  if (!loaded || !cues.length) return null;
  const makeAll = async () => {
    setError(null);
    for (const [index, cue] of cues.entries()) {
      setBusy(`Cue ${index + 1} of ${cues.length}: ${cue.tone}…`);
      try {
        const made = await requestFilmScore({ brief: { tone: cue.tone }, cutSeconds: cue.seconds });
        onAdd(`fx-cue-${Date.now().toString(36)}${index}`, {
          url: made.url,
          name: `Temp music · ${cue.tone}`,
          atSec: cue.atSec,
          level: 0.5,
          // Stops where the next stretch starts (a score renders a few seconds long).
          lengthSec: cue.seconds,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not make that cue.');
        break;
      }
    }
    setBusy(null);
  };
  return (
    <section className="mt-3 space-y-1.5" data-testid="cut-temp-music">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption font-medium">Temp music by scene · {cues.length} cues</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled || busy !== null}
          data-testid="cut-temp-music-make"
          title="A cue in each stretch's style (ACE-Step), placed on the effects track at its start — they don't duck under the lines"
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
            {cue.tone} · {Math.round(cue.seconds)} s · {cue.shots.join(', ')}
          </li>
        ))}
      </ol>
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
