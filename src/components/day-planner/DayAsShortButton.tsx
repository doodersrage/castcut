'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import type { DaySlot, DaySlotStill } from '@/lib/day/planner';
import {
  normalizeDayShortLink,
  saveDayAsShort,
  scenePagePath,
  type DayShortLink,
} from '@/lib/day/scene-links';

/**
 * "This Day as a script →" (day-as-short.ts): the Day's moments copied into a script with a
 * Scene each — the stills as their kept takes — and opened on the Scene page, where it is run,
 * storyboarded and cut like any script. "Make the short →" does that and starts its run (the
 * script road's Queue: checks, the best take kept, a redo, the cut). The Day stays as it is.
 */
export default function DayAsShortButton({
  character,
  toolSettings,
  slots,
  stills,
  busy,
  onLinked,
  className = '',
}: {
  /** The short made or updated: kept on the Day (its shortLink). */
  onLinked: (link: DayShortLink) => void;
  character: CharacterRecord | null | undefined;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  stills: DaySlotStill[];
  busy?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  /** The short was changed on Scene and the Day since: which to go on with (render or not). */
  const [choice, setChoice] = useState<{ note: string; render: boolean } | null>(null);
  if (!character?.id) return null;
  const castId = character.id;
  const link = normalizeDayShortLink(toolSettings.shortLink);
  const linked = link?.castId === castId;
  const go = (render: boolean, how: { fresh?: boolean; asIs?: boolean } = {}) => {
    const result = saveDayAsShort({
      day: { ...toolSettings, slots, stills },
      castId,
      leadName: character.name ?? '',
      ...(link ? { link } : {}),
      ...how,
      // Make the short: an episode run over the moments with no still kept — the best take by
      // its checks, a redo when it misses one, then the cut (episode-autopilot.ts).
      ...(render
        ? { render: { makeCast: false, redo: 1, animate: 'none' as const, cutWhenDone: true } }
        : {}),
    });
    if ('error' in result) {
      setError(result.error);
      return;
    }
    if ('choose' in result) {
      setChoice({ note: result.choose, render });
      return;
    }
    setError(null);
    setChoice(null);
    onLinked(result.link);
    const params = new URLSearchParams({ character: castId, script: result.scriptId });
    if (result.runId) params.set('start', result.runId);
    router.push(`${scenePagePath()}?${params.toString()}`);
  };
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 ${className}`}>
      <Button
        variant="link"
        size="sm"
        disabled={busy}
        data-testid="day-make-short"
        onClick={() => go(true)}
      >
        Make the short →
      </Button>
      <Button
        variant="link"
        size="sm"
        disabled={busy}
        data-testid="day-as-short"
        onClick={() => go(false)}
      >
        {linked ? 'Its script →' : 'This Day as a script →'}
      </Button>
      {choice ? (
        <span className="inline-flex flex-wrap items-center gap-x-3" data-testid="day-short-choice">
          <span className="type-caption" role="status">
            {choice.note}
          </span>
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-short-as-is"
            onClick={() => go(choice.render, { asIs: true })}
          >
            Use it as it is
          </Button>
          <Button
            variant="link"
            size="sm"
            disabled={busy}
            data-testid="day-short-copy-again"
            onClick={() => go(choice.render, { fresh: true })}
          >
            Copy again (a new short)
          </Button>
        </span>
      ) : null}
      {error ? (
        <span
          className="type-caption text-[var(--tint-warning-text,var(--accent-text))]"
          role="status"
          data-testid="day-as-short-error"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
