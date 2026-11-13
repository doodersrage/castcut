/**
 * Day ↔ Scene, through the saved settings: "Open as Scene" (a Day slot as a new scene, opened on
 * the Scene page) and "Send to Day slot" (a scene's shot and kept take onto a Day slot). The page
 * on the other side is not mounted, so these write its settings directly; it reads them when it
 * opens. The rules are day/scenes.ts.
 */
import { loadToolSettings, saveToolSettings } from '../settings/cache';
import { DEFAULT_SCENE_TOOL_CACHE, type DayToolCache } from '../play/settings';
import {
  addScenePatch,
  nextSceneName,
  normalizeSavedScenes,
  sceneFromDaySlot,
  sceneSlotOf,
  scenesWithWorking,
  sendSceneToDayPatch,
  upsertScene,
  type SavedScene,
} from './scenes';
import {
  dayAsShort,
  dayShortFingerprint,
  shortEditClashes,
  shortScenesUnedited,
} from './day-as-short';
import { shortShotScenes } from './short-render';
import { loadCharacters } from '../character/os';
import { loadLocations } from '../location/records';
import { loadDayBoard } from './day-board-client';
import { autopilotRun, type EpisodeAutopilot } from './episode-autopilot';
import { normalizeSceneRun, runFromScript } from './scene-run';
import {
  addScriptPatch,
  setScriptCastPatch,
  scriptDroppedByAdding,
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

/** The Script page's path beside this one: the phone keeps scripts on its Scene (/m/scene). */
export function scriptPagePath(pathname?: string | null): '/script' | '/m/scene' {
  return scenePagePath(pathname) === '/m/scene' ? '/m/scene' : '/script';
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
  // The Short as its short has it (step 4c): one moment changed, the rest as the Scenes hold them.
  const day = loadDayBoard();
  const result = sendSceneToDayPatch(day, input.scene, input.slotId, input.activeCastId);
  if ('error' in result) return result.error;
  saveToolSettings('day', { ...day, ...result.patch });
  return null;
}

/** The Day the scene would be sent to, read fresh (its slots for the picker). */
export function loadDayForScenes(): DayToolCache {
  return loadDayBoard();
}

/** A Day's short (Short's "This Day as a script"): which script, and the Day it was made from. */
export type DayShortLink = {
  castId: string;
  scriptId: string;
  /** dayShortFingerprint of the Day when the short was last made from it. */
  fingerprint: string;
  /** The script's updatedAt then: later means it was changed on Scene since. */
  syncedAt: number;
};

export function normalizeDayShortLink(raw: unknown): DayShortLink | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const link = raw as Partial<DayShortLink>;
  const castId = typeof link.castId === 'string' ? link.castId.trim() : '';
  const scriptId = typeof link.scriptId === 'string' ? link.scriptId.trim() : '';
  if (!castId || !scriptId) return undefined;
  return {
    castId,
    scriptId,
    fingerprint: typeof link.fingerprint === 'string' ? link.fingerprint : '',
    syncedAt:
      typeof link.syncedAt === 'number' && Number.isFinite(link.syncedAt) ? link.syncedAt : 0,
  };
}

/**
 * "This Day as a script" / "Make the short" (day-as-short.ts): the Day's one short, written to
 * the Scene page's stores — the script (and its shots, the lead in Who's who) in the scripts'
 * own store, its Scenes beside the Cast's others (the open one stays open). The Day is not
 * changed. Made once, then kept up to date: a Day changed since is synced into the same script
 * (each moment's Scene keeps its takes) — unless the script was changed on Scene meanwhile, when
 * it is left as it is and said so. `fresh`: a new copy whatever the link says. Never drops
 * another script to make room (a Cast keeps 12), and never replaces a run on Scene.
 */
export function saveDayAsShort(input: {
  day: DayToolCache;
  castId: string;
  leadName: string;
  /** Make the short: a run over its moments saved too, as an episode run with these settings. */
  render?: EpisodeAutopilot;
  /** The Day's short so far (Short's settings). */
  link?: DayShortLink;
  fresh?: boolean;
  /** The short was changed on Scene since: use it as it is (asked first — `choose`). */
  asIs?: boolean;
}):
  | { scriptId: string; runId?: string; link: DayShortLink }
  | { choose: string }
  | { error: string } {
  const castId = input.castId.trim();
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
  let scripts: ScriptsCache = scriptsCacheOf(loadSceneScriptStore());
  const linked =
    !input.fresh && input.link?.castId === castId
      ? scripts.scripts?.find(entry => entry.id === input.link!.scriptId && entry.castId === castId)
      : undefined;
  const fingerprint = dayShortFingerprint(input.day);
  const cache = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const saved = scenesWithWorking(cache) ?? cache.scenes ?? [];
  let scenes = normalizeSavedScenes(saved);
  let scriptId: string;
  const editedOnScene = linked ? linked.updatedAt > (input.link?.syncedAt ?? 0) : false;
  const boardChanged = fingerprint !== input.link?.fingerprint;
  // Both changed (Step 5b-ii, 2026-11-09): the board's edits go in beside the script's — only
  // what its cards changed, into their scenes — unless both changed the same thing of a moment
  // (its place or time, its beat, its line): then nothing is written until it's chosen.
  const clashes =
    linked && editedOnScene && boardChanged
      ? shortEditClashes({
          day: input.day,
          script: linked,
          scenes: scenes.filter(scene => scene.fromScript?.scriptId === linked.id),
          castId,
          leadName: input.leadName,
        })
      : [];
  if (linked && clashes.length && !input.asIs) {
    const named = clashes.length > 3 ? `${clashes.slice(0, 3).join(', ')}…` : clashes.join(', ');
    return {
      choose: `“${linked.name}” and this board both changed ${named} since they last matched, so the board's changes there aren't in it.`,
    };
  }
  let wrote = false;
  if (linked && (!boardChanged || (editedOnScene && input.asIs))) {
    // As it is: nothing new on the board, or the script kept as it is (chosen).
    scriptId = linked.id;
    // The board's edits its Scenes took at once (Step 5f part 3c) go too: they say what the
    // script says again.
    const back = shortScenesUnedited(scenes, linked.id);
    if (back) scenes = back.reduce<SavedScene[]>((all, scene) => upsertScene(all, scene), scenes);
  } else {
    wrote = true;
    if (!linked) {
      const dropped = scriptDroppedByAdding(scripts.scripts, castId);
      if (dropped) {
        return {
          error: `${input.leadName.trim() || 'This Cast'} has 12 scripts, the most kept — archive one on Script first (Archive: saved as a file, its Scenes stay); making another would drop “${dropped.name}”.`,
        };
      }
    }
    const short = dayAsShort({
      ...input,
      ...(linked
        ? {
            existing: {
              script: linked,
              scenes: scenes.filter(scene => scene.fromScript?.scriptId === linked.id),
            },
          }
        : {}),
    });
    if (!short)
      return { error: 'Nothing to make a short of yet — give a moment a place or a beat.' };
    scripts = { ...scripts, ...addScriptPatch(scripts, short.script) };
    scripts = {
      ...scripts,
      ...(setScriptShotsPatch(scripts, short.script.id, short.shots) ?? {}),
    };
    scripts = {
      ...scripts,
      ...(setScriptCastPatch(scripts, short.script.id, short.leadSpeaker, castId) ?? {}),
    };
    applySceneScriptsPatch({ scripts: scripts.scripts });
    scenes = normalizeSavedScenes(
      short.scenes.reduce<SavedScene[]>((all, scene) => upsertScene(all, scene), [...scenes])
    );
    scriptId = short.script.id;
  }
  let script = scripts.scripts?.find(entry => entry.id === scriptId);
  if (!script) return { error: 'The short could not be kept — try again.' };
  if (input.render) {
    // Every shot of every moment (Step 5d): a moment written as a scene has shots with no Scene
    // yet — made now, dressed as the board is, so the run renders them all.
    const made = shortShotScenes({
      script,
      scenes,
      day: input.day,
      castId,
      cast: loadCharacters().map(member => ({
        id: member.id,
        name: member.name,
        ...(member.traits?.sex ? { sex: member.traits.sex } : {}),
      })),
      locations: loadLocations(),
    });
    // A card's Scene that stood in for a shot is let go of it (cards don't render, 2026-11-13).
    if (made.created.length || made.untied.length) {
      script = made.script;
      const untied = new Map(made.untied.map(scene => [scene.id, scene]));
      scenes = normalizeSavedScenes([
        ...scenes.map(scene => untied.get(scene.id) ?? scene),
        ...made.created,
      ]);
      applySceneScriptsPatch(addScriptPatch(scriptsCacheOf(loadSceneScriptStore()), script));
    }
  }
  // The moments with no kept take are the run (a kept one is left out, as Prepare a run does).
  const run = input.render
    ? autopilotRun(runFromScript({ script, scenes }), input.render)
    : undefined;
  // The Scene open on Scene shows its moment as written now: its page's working copy too, or it
  // would write the old one back (Step 5f).
  const open = scenes.find(
    scene => scene.id === cache.activeSceneId && scene.fromScript?.scriptId === scriptId
  );
  const working =
    open && JSON.stringify(sceneSlotOf(cache.slots)) !== JSON.stringify(open.slot)
      ? { slots: [open.slot] }
      : {};
  saveToolSettings('scene', { ...cache, scenes, ...working, ...(run ? { run } : {}) });
  return {
    scriptId,
    ...(run ? { runId: run.id } : {}),
    link: {
      castId,
      scriptId,
      // A short left as it is keeps the fingerprint it was made from (it is still behind the Day).
      fingerprint: editedOnScene && !wrote ? (input.link?.fingerprint ?? '') : fingerprint,
      syncedAt: editedOnScene && !wrote ? (input.link?.syncedAt ?? 0) : script.updatedAt,
    },
  };
}
