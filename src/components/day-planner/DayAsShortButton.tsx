'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import type { DaySlot, DaySlotStill } from '@/lib/day/planner';
import { saveDayAsShort, scenePagePath } from '@/lib/day/scene-links';

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
  className = '',
}: {
  character: CharacterRecord | null | undefined;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  stills: DaySlotStill[];
  busy?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  if (!character?.id) return null;
  const castId = character.id;
  const go = (render: boolean) => {
    const result = saveDayAsShort({
      day: { ...toolSettings, slots, stills },
      castId,
      leadName: character.name ?? '',
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
    setError(null);
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
        This Day as a script →
      </Button>
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
