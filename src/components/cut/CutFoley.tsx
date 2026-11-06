'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { formatCutTime, type CutPreviewLoaded } from '@/hooks/useCutPreview';
import { makeSoundEffectForCut } from '@/lib/clip/sound-effect-client';
import { foleySuggestions, type FoleySuggestion } from '@/lib/film/foley';
import type { CutEffect, CutSoundOptions } from '@/lib/video/cut-sound';

/**
 * Cut → Foley (foley.ts): the sounds the shots say happen — rain on the street shot, a door, a
 * phone, a café's murmur — each made with "Make a sound" (LTX-2.5, about half a minute each) and
 * placed on the effects track at its moment. Make one, or all in turn; Skip hides one for now.
 */
export default function CutFoley({
  loaded,
  beatText,
  sound,
  disabled,
  onAdd,
}: {
  loaded: CutPreviewLoaded | null;
  beatText: Readonly<Record<string, string>>;
  sound: CutSoundOptions | null | undefined;
  disabled?: boolean;
  onAdd: (id: string, effect: Partial<CutEffect>) => void;
}) {
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  const [making, setMaking] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const suggestions = useMemo(() => {
    if (!loaded) return [] as FoleySuggestion[];
    const shots = loaded.timeline.items
      .filter(item => item.shot >= 0)
      .flatMap(item => {
        const key = loaded.keys[item.shot];
        if (!key) return [];
        return [
          {
            key,
            title: loaded.shots[item.shot]?.title ?? 'Shot',
            text: beatText[key] ?? '',
            startSec: item.startSec,
            durSec: item.durSec,
          },
        ];
      });
    return foleySuggestions(shots, sound?.effects ?? []).filter(
      suggestion => !skipped.has(suggestion.id)
    );
  }, [beatText, loaded, skipped, sound?.effects]);

  const make = async (suggestion: FoleySuggestion) => {
    setMaking({ id: suggestion.id, label: 'Starting…' });
    setError(null);
    try {
      const made = await makeSoundEffectForCut({
        words: suggestion.words,
        seconds: suggestion.seconds,
        onProgress: label => setMaking({ id: suggestion.id, label }),
      });
      onAdd(`fx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, {
        url: made.url,
        name: made.label || suggestion.words,
        atSec: suggestion.atSec,
        // A bed (rain, a café) sits under the scene; a hit plays as made.
        ...(suggestion.bed ? { level: 0.6 } : {}),
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not make that sound.');
      return false;
    } finally {
      setMaking(null);
    }
  };
  const makeAll = async () => {
    for (const suggestion of suggestions) {
      if (!(await make(suggestion))) break;
    }
  };

  if (!loaded) return null;
  return (
    <section className="mt-3 space-y-1.5" data-testid="cut-foley">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-caption font-medium">
          Foley{suggestions.length ? ` · ${suggestions.length} suggested` : ''}
        </p>
        {suggestions.length > 1 ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled || making !== null}
            data-testid="cut-foley-make-all"
            title="Make every suggested sound in turn (about half a minute each) and place it"
            onClick={() => void makeAll()}
          >
            Make all
          </Button>
        ) : null}
      </div>
      {suggestions.length ? (
        <ul className="space-y-1">
          {suggestions.map(suggestion => (
            <li
              key={suggestion.id}
              className="type-caption flex flex-wrap items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-subtle)] px-2 py-1"
              data-testid="cut-foley-item"
            >
              <span className="tabular-nums text-[var(--text-muted)]">
                {formatCutTime(suggestion.atSec)}
              </span>
              <span className="min-w-0 flex-1">
                {suggestion.words}
                <span className="text-[var(--text-muted)]">
                  {' '}
                  · {suggestion.shotTitle}
                  {suggestion.bed ? ' · under the shot' : ''}
                </span>
              </span>
              {making?.id === suggestion.id ? (
                <span className="text-[var(--text-muted)]" role="status">
                  {making.label}
                </span>
              ) : (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={disabled || making !== null}
                    data-testid="cut-foley-make"
                    onClick={() => void make(suggestion)}
                  >
                    Make it
                  </Button>
                  <Button
                    size="sm"
                    variant="underline"
                    disabled={making !== null}
                    onClick={() => setSkipped(prev => new Set([...prev, suggestion.id]))}
                  >
                    Skip
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-caption text-[var(--text-muted)]">
          No sounds to suggest — the shots don&apos;t name any, or they are placed already.
        </p>
      )}
      {error ? <p className="type-caption text-[var(--danger)]">{error}</p> : null}
    </section>
  );
}
