'use client';

/**
 * A Short's board as its short has it, for what reads a Short away from the board (Cut, Play's
 * pose targets and counts, a Cast's file): the saved copy with its short's Scenes on it
 * (dayBoardFromShort, step 4c). Read-only: nothing is written here.
 */
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_SCENE_TOOL_CACHE,
  type DayToolCache,
} from '../play/settings';
import { loadToolSettings } from '../settings/cache';
import { dayBoardFromShort } from './day-as-short';
import { normalizeSavedScenes, type SavedScene } from './scenes';
import { loadSceneScriptStore } from './scene-script-store-client';

/** A Short as its short has it (a parked one keeps no link: as it is). */
export function shortBoardOf<T extends Parameters<typeof dayBoardFromShort>[0]>(
  day: T,
  scenes?: readonly SavedScene[]
): T {
  const scriptId = day.shortLink?.scriptId;
  if (!scriptId) return day;
  const script = loadSceneScriptStore().scripts.find(entry => entry.id === scriptId);
  return dayBoardFromShort(
    day,
    scenes ?? normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes),
    script
  );
}

/** The open Short as its short has it. */
export function loadDayBoard(): DayToolCache {
  return shortBoardOf(loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE));
}
