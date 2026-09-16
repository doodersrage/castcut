/**
 * Day tool-cache still/clip counts for Play resume (no campaign imports).
 */

import {
  DEFAULT_DAY_TOOL_CACHE,
  loadSettingsCache,
  loadToolSettings,
  type DayToolCache,
} from './settings-cache';

function loadOwnedDayStills() {
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const activeCharacterId = loadSettingsCache().shared.activeCharacterId?.trim() || '';
  const owner = day.stillsCharacterId?.trim() || '';
  // Unowned legacy stills still count for the current session; owned stills must match Cast.
  if (owner && owner !== activeCharacterId) {
    return [] as NonNullable<DayToolCache['stills']>;
  }
  return day.stills ?? [];
}

/** Completed Day stills currently in the tool cache (survives navigation). */
export function countCachedCompletedDayStills(): number {
  return loadOwnedDayStills().filter(
    entry => entry.status === 'completed' && Boolean(entry.imageUrl?.trim())
  ).length;
}

/** Completed Day motion clips currently in the tool cache. */
export function countCachedCompletedDayClips(): number {
  return loadOwnedDayStills().filter(
    entry => entry.clipStatus === 'completed' && Boolean(entry.clipUrl?.trim())
  ).length;
}
