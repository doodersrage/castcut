/**
 * A continuous take (the H3 brief, 2026-11-18: "independent by default, each shot from its own
 * approved keyframe; chain from the last frame only when I mark a shot as a continuous take").
 *
 * A shot marked `continuousTake` continues the shot before it in its script scene: its clip
 * starts on the sharpest of that clip's last frames (taken losslessly from the file) and ends on
 * the shot's own approved still — first and last frame — so every chained clip lands back on a
 * clean keyframe. The parent's clip is cut on that frame, so the join shows no jump. A chain
 * longer than CHAIN_MAX_DEPTH starts again from its own still (re-anchored). When the parent's
 * clip changes, the shot's clip no longer starts where the parent ends: it is stale, and is
 * animated again with the kept takes. Pure.
 */

import { FILM_FPS } from '../video/film-fps';
import { CHAIN_FRAME_WINDOW, sharpestFrameIndex } from '../clip/end-frame';

export { CHAIN_FRAME_WINDOW, sharpestFrameIndex };
import { sceneMasterGroup } from './scene-master';
import type { SavedScene, SceneTake } from './scenes';

export type { SceneTakeChain } from './scenes';

/** Chained clips in a row before one starts again from its own still. */
export const CHAIN_MAX_DEPTH = 3;

const keptTake = (scene: SavedScene): SceneTake | undefined =>
  scene.takes.find(take => take.id === scene.keptTakeId);

/** Script order within a scene: 7B before 7C (the label in the name, as scene-master orders). */
const shotLabel = (scene: SavedScene) => scene.name.split(' ')[0] ?? scene.name;

/** The shot a shot comes after in its script scene; undefined for the first, or none. */
export function previousShotOf(
  scene: SavedScene,
  scenes: readonly SavedScene[]
): SavedScene | undefined {
  const group = sceneMasterGroup(scene);
  if (!group) return undefined;
  const ordered = scenes
    .filter(other => sceneMasterGroup(other) === group)
    .sort((a, b) => shotLabel(a).localeCompare(shotLabel(b), undefined, { numeric: true }));
  const at = ordered.findIndex(other => other.id === scene.id);
  return at > 0 ? ordered[at - 1] : undefined;
}

/** How many continuous shots in a row end on this one (0: it isn't one). */
export function chainDepth(scene: SavedScene, scenes: readonly SavedScene[]): number {
  let depth = 0;
  let at: SavedScene | undefined = scene;
  while (at?.continuousTake === true && depth <= scenes.length) {
    depth += 1;
    at = previousShotOf(at, scenes);
  }
  return depth;
}

export type ChainPlan =
  | { chain: true; parent: SavedScene; parentClipUrl: string; parentEntryId?: string }
  | { chain: false; why?: 'not-marked' | 'first' | 'no-parent-clip' | 're-anchor' };

/**
 * Whether this shot's clip starts on its parent's last frame: marked, a shot before it, that
 * shot's kept clip there, and not past CHAIN_MAX_DEPTH (then its own still: re-anchored).
 */
export function chainPlanFor(scene: SavedScene, scenes: readonly SavedScene[]): ChainPlan {
  if (scene.continuousTake !== true) return { chain: false, why: 'not-marked' };
  const parent = previousShotOf(scene, scenes);
  if (!parent) return { chain: false, why: 'first' };
  if (chainDepth(scene, scenes) > CHAIN_MAX_DEPTH) return { chain: false, why: 're-anchor' };
  const kept = keptTake(parent);
  if (!kept?.clipUrl) return { chain: false, why: 'no-parent-clip' };
  return {
    chain: true,
    parent,
    parentClipUrl: kept.clipUrl,
    ...(kept.promptId ? { parentEntryId: kept.promptId } : {}),
  };
}

/**
 * Its clip no longer starts where its parent ends: the parent's kept clip changed since (a take
 * animated again, another take kept). A shot never chained, or chained to the clip there now, is
 * not stale.
 */
export function chainIsStale(scene: SavedScene, scenes: readonly SavedScene[]): boolean {
  const chain = keptTake(scene)?.chainFrom;
  if (!chain) return false;
  const parent = scenes.find(other => other.id === chain.sceneId);
  const parentClip = parent ? keptTake(parent)?.clipUrl : undefined;
  return parentClip !== chain.clipUrl;
}

/**
 * Where a parent shot's clip is cut in the film: just after the frame its continuation starts
 * on (that frame plays once, at the end of the parent; the child opens on the same picture).
 * Undefined when nothing continues it from its clip there now.
 */
export function chainCutSec(parent: SavedScene, scenes: readonly SavedScene[]): number | undefined {
  const clipUrl = keptTake(parent)?.clipUrl;
  if (!clipUrl) return undefined;
  for (const scene of scenes) {
    const chain = keptTake(scene)?.chainFrom;
    if (scene.continuousTake !== true || chain?.sceneId !== parent.id) continue;
    if (chain.clipUrl !== clipUrl) continue;
    return Math.round((chain.atSec + 1 / FILM_FPS) * 1000) / 1000;
  }
  return undefined;
}

/**
 * Its kept take wants a clip: none yet, or — a continuous take that can chain now — one that
 * doesn't start on the shot before's clip there now (that clip changed: stale; or the shot was
 * marked after it was animated on its own). Animate the kept takes animates these.
 */
export function keptClipNeeded(scene: SavedScene, scenes: readonly SavedScene[]): boolean {
  const kept = keptTake(scene);
  if (!kept) return false;
  if (!kept.clipUrl) return true;
  if (scene.continuousTake !== true) return false;
  const plan = chainPlanFor(scene, scenes);
  return plan.chain && kept.chainFrom?.clipUrl !== plan.parentClipUrl;
}
