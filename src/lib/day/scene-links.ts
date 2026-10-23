/**
 * Day ↔ Scene, through the saved settings: "Open as Scene" (a Day slot as a new scene, opened on
 * the Scene page) and "Send to Day slot" (a scene's shot and kept take onto a Day slot). The page
 * on the other side is not mounted, so these write its settings directly; it reads them when it
 * opens. The rules are day/scenes.ts.
 */
import { loadToolSettings, saveToolSettings } from '../settings/cache';
import {
  DEFAULT_DAY_TOOL_CACHE,
  DEFAULT_SCENE_TOOL_CACHE,
  type DayToolCache,
} from '../play/settings';
import {
  addScenePatch,
  nextSceneName,
  normalizeSavedScenes,
  sceneFromDaySlot,
  sendSceneToDayPatch,
  type SavedScene,
} from './scenes';
import type { DaySlotId } from './planner';

/** The Scene page's path beside this one (the phone app keeps to /m). */
export function scenePagePath(pathname?: string | null): '/scene' | '/m/scene' {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/scene');
  return path === '/m' || path.startsWith('/m/') ? '/m/scene' : '/scene';
}

/** Day's path beside this one. */
export function dayPagePath(pathname?: string | null): '/day' | '/m/day' {
  const path = pathname ?? (typeof window !== 'undefined' ? window.location.pathname : '/day');
  return path === '/m' || path.startsWith('/m/') ? '/m/day' : '/day';
}

/**
 * "Open as Scene": the Day slot's shot (and its finished still, as the first take) as a new scene
 * of the Cast, saved and made the open scene. Null when the slot or the Cast is missing.
 */
export function openDaySlotAsScene(input: {
  day: DayToolCache;
  slotId: DaySlotId;
  castId: string;
}): SavedScene | null {
  const castId = input.castId.trim();
  if (!castId) return null;
  const cache = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const scenes = normalizeSavedScenes(cache.scenes);
  const scene = sceneFromDaySlot({
    day: input.day,
    slotId: input.slotId,
    castId,
    name: nextSceneName(scenes, castId),
  });
  if (!scene) return null;
  saveToolSettings('scene', { ...cache, ...addScenePatch({ ...cache, scenes }, scene) });
  return scene;
}

/**
 * "Send to Day slot": the scene's shot on that Day slot, its kept take as the slot's still.
 * Returns an error to show, or null when the Day has it.
 */
export function sendSceneToDaySlot(input: {
  scene: SavedScene;
  slotId: DaySlotId;
  activeCastId: string;
}): string | null {
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const result = sendSceneToDayPatch(day, input.scene, input.slotId, input.activeCastId);
  if ('error' in result) return result.error;
  saveToolSettings('day', { ...day, ...result.patch });
  return null;
}

/** The Day the scene would be sent to, read fresh (its slots for the picker). */
export function loadDayForScenes(): DayToolCache {
  return loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
}
