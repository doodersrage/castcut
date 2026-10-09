'use client';

import { useCallback, useEffect, useState } from 'react';
import { storyScenesFromDay, storySeedFromDay } from '@/lib/day-story-seed';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import { loadSettingsCache, loadToolSettings } from '@/lib/settings-cache';
import { DEFAULT_DAY_TOOL_CACHE, type RoleplayToolCache } from '@/lib/play-settings';

export type DayStoryOpening = { count: number; use: () => void };

function readDayScenes(castId: string): RoleplayStoryBeat[] {
  return storyScenesFromDay({
    day: loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE),
    characterId: castId,
    activeCharacterId: loadSettingsCache().shared.activeCharacterId,
  });
}

/**
 * Day → Story: while this Cast's story is empty and its Day has finished stills, offer them as
 * the story's opening scenes (day-story-seed.ts). A choice on the empty reel, never automatic, so
 * a story in progress is never replaced. Read after mount (browser storage).
 */
export function useDayStoryOpening(input: {
  story: RoleplayStoryBeat[] | undefined;
  castId: string | null | undefined;
  updateToolSettings: (patch: Partial<RoleplayToolCache>) => void;
}): DayStoryOpening | null {
  const castId = input.castId?.trim() || '';
  const empty = (input.story?.length ?? 0) === 0;
  const [count, setCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (!cancelled) setCount(empty && castId ? readDayScenes(castId).length : 0);
    });
    return () => {
      cancelled = true;
    };
  }, [castId, empty]);
  const { updateToolSettings } = input;
  const use = useCallback(() => {
    if (!castId) return;
    const scenes = readDayScenes(castId);
    if (scenes.length === 0) return;
    // The Day's tone, rating, place and outfit come along (as "Continue as a story"), so an
    // Intimate Day's stills never open a PG-13 story. Story's own adult gate still applies.
    const shared = loadSettingsCache().shared;
    const seed = storySeedFromDay({
      day: loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE),
      characterId: castId,
      activeCharacterId: shared.activeCharacterId,
      lockedWardrobeId: shared.lockedWardrobeId,
    });
    updateToolSettings({ ...seed, story: scenes });
  }, [castId, updateToolSettings]);
  return empty && count > 0 ? { count, use } : null;
}
