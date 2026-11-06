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
 * storyboarded and cut like any script. The Day stays as it is.
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
  return (
    <span className={className}>
      <Button
        variant="link"
        size="sm"
        disabled={busy}
        data-testid="day-as-short"
        onClick={() => {
          const result = saveDayAsShort({
            day: { ...toolSettings, slots, stills },
            castId,
            leadName: character.name ?? '',
          });
          if ('error' in result) {
            setError(result.error);
            return;
          }
          setError(null);
          const params = new URLSearchParams({ character: castId, script: result.scriptId });
          router.push(`${scenePagePath()}?${params.toString()}`);
        }}
      >
        This Day as a script →
      </Button>
      {error ? (
        <span
          className="type-caption ml-2 text-[var(--tint-warning-text,var(--accent-text))]"
          role="status"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
