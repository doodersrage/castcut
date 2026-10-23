'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { CharacterRecord } from '@/lib/character/os';
import type { DayToolCache } from '@/lib/play/settings';
import type { DaySlot, DaySlotId, DaySlotStill } from '@/lib/day/planner';
import { openDaySlotAsScene, scenePagePath } from '@/lib/day/scene-links';

/**
 * Day's "Open as Scene": the slot's shot as a new scene of the Cast, then the Scene page. The Day
 * is left as it is. Undefined without a Cast lead (a scene belongs to one).
 */
export function useDayOpenAsScene(input: {
  character: CharacterRecord | null | undefined;
  toolSettings: DayToolCache;
  slots: DaySlot[];
  stills: DaySlotStill[];
  setError: (message: string | null) => void;
}): ((slotId: DaySlotId) => void) | undefined {
  const router = useRouter();
  const { character, toolSettings, slots, stills, setError } = input;
  const castId = character?.id;
  const open = useCallback(
    (slotId: DaySlotId) => {
      if (!castId) return;
      const scene = openDaySlotAsScene({
        day: { ...toolSettings, slots, stills },
        slotId,
        castId,
      });
      if (!scene) {
        setError('Could not open that slot as a scene.');
        return;
      }
      router.push(scenePagePath());
    },
    [castId, router, setError, slots, stills, toolSettings]
  );
  return castId ? open : undefined;
}
