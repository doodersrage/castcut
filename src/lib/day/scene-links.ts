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
  scenesWithWorking,
  sendSceneToDayPatch,
  upsertScene,
  type SavedScene,
} from './scenes';
import { dayAsShort } from './day-as-short';
import { autopilotRun, type EpisodeAutopilot } from './episode-autopilot';
import { normalizeSceneRun, runFromScript } from './scene-run';
import {
  addScriptPatch,
  setScriptCastPatch,
  setScriptShotsPatch,
  type ScriptsCache,
} from './scene-scripts';
import { scriptsCacheOf } from './scene-script-store';
import { applySceneScriptsPatch, loadSceneScriptStore } from './scene-script-store-client';
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

/**
 * "Make this Day a short" (day-as-short.ts): the Day as a script, its shots and their Scenes,
 * written to the Scene page's settings in one go — the lead confirmed in Who's who, the open
 * scene left as it is. The Day is not changed. Returns the script's id, or an error to show.
 */
export function saveDayAsShort(input: {
  day: DayToolCache;
  castId: string;
  leadName: string;
  /** Make the short: a run over its moments saved too, as an episode run with these settings. */
  render?: EpisodeAutopilot;
}): { scriptId: string; runId?: string } | { error: string } {
  const short = dayAsShort(input);
  if (!short) return { error: 'Nothing to make a short of yet — give a moment a place or a beat.' };
  // One run at a time on Scene: one going (or paused, or listed) is never replaced.
  const before = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const current = before.run ? normalizeSceneRun(before.run) : null;
  if (
    input.render &&
    current &&
    ['prepared', 'running', 'paused', 'handed'].includes(current.state)
  ) {
    return {
      error: `A run is ${current.state === 'prepared' ? 'listed' : current.state === 'paused' ? 'paused' : 'going'} on Scene (“${current.label}”) — finish or cancel it there first.`,
    };
  }
  // The script in the scripts' own store (scene-script-store), its shots and Who's who with it.
  let scripts: ScriptsCache = scriptsCacheOf(loadSceneScriptStore());
  scripts = { ...scripts, ...addScriptPatch(scripts, short.script) };
  scripts = { ...scripts, ...(setScriptShotsPatch(scripts, short.script.id, short.shots) ?? {}) };
  scripts = {
    ...scripts,
    ...(setScriptCastPatch(scripts, short.script.id, short.leadSpeaker, input.castId) ?? {}),
  };
  applySceneScriptsPatch({ scripts: scripts.scripts });
  // Its Scenes in the Scene page's settings, beside the Cast's others (the open one stays open).
  const cache = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const saved = scenesWithWorking(cache) ?? cache.scenes ?? [];
  const scenes = normalizeSavedScenes(
    short.scenes.reduce<SavedScene[]>((all, scene) => upsertScene(all, scene), [...saved])
  );
  const script = scripts.scripts?.find(entry => entry.id === short.script.id) ?? short.script;
  // The moments with no kept still are the run (a kept one is left out, as Prepare a run does).
  const run = input.render
    ? autopilotRun(runFromScript({ script, scenes }), input.render)
    : undefined;
  saveToolSettings('scene', { ...cache, scenes, ...(run ? { run } : {}) });
  return { scriptId: short.script.id, ...(run ? { runId: run.id } : {}) };
}
