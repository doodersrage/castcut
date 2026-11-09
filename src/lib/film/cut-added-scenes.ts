/**
 * A cut takes scenes from more than one script (Step 5e, 2026-11-09: "the user could append it to
 * existing scenes in Cut"): a short's scene — or any script's — added to a cut of another script,
 * placed after one of its scenes. Kept by the Scenes it was added with (their ids last; a script
 * scene's id is its heading and moves with it), read back as every Scene of that script scene
 * now, in its script's order — a shot planned later comes too. Placed once, by the shot list's
 * order; moved there like any shot after. Pure.
 */

import { scriptScenesInOrder, type SavedScene } from '../day/scenes';

/** Scenes added to a cut from another script: the Scenes they were added by. */
export type CutAddedScenes = { scriptId: string; sceneIds: string[] };

const ADDED_MAX = 24;
const IDS_MAX = 48;

/** Stored added scenes, read back: well-formed entries only, at most 24, no script twice over. */
export function normalizeCutAddedScenes(raw: unknown): CutAddedScenes[] {
  if (!Array.isArray(raw)) return [];
  const out: CutAddedScenes[] = [];
  for (const entry of raw.slice(0, ADDED_MAX * 2)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const scriptId =
      typeof record.scriptId === 'string' ? record.scriptId.trim().slice(0, 160) : '';
    const sceneIds = (Array.isArray(record.sceneIds) ? record.sceneIds : [])
      .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
      .map(id => id.trim().slice(0, 160))
      .slice(0, IDS_MAX);
    if (!scriptId || !sceneIds.length) continue;
    const same = out.find(
      added => added.scriptId === scriptId && added.sceneIds.some(id => sceneIds.includes(id))
    );
    if (same) continue;
    out.push({ scriptId, sceneIds });
    if (out.length >= ADDED_MAX) break;
  }
  return out;
}

/**
 * The added scenes' Scenes now, entry by entry, each in its script's order: every Scene of the
 * script scenes its Scenes are on (a shot planned since comes too). A script not in the cut's
 * reach (gone, another Cast's) or whose Scenes are gone gives nothing — never an error.
 */
export function cutAddedSceneList(input: {
  added: readonly CutAddedScenes[];
  scenes: readonly SavedScene[];
  scripts: ReadonlyArray<{ id: string; shots?: ReadonlyArray<{ madeSceneId?: string }> }>;
  /** The cut's own script: its Scenes are in already. */
  ownScriptId?: string;
}): SavedScene[] {
  const seen = new Set<string>();
  const out: SavedScene[] = [];
  for (const entry of input.added) {
    if (entry.scriptId === input.ownScriptId) continue;
    const script = input.scripts.find(candidate => candidate.id === entry.scriptId);
    if (!script) continue;
    const mine = scriptScenesInOrder(input.scenes, script);
    const sceneIds = new Set(
      mine
        .filter(scene => entry.sceneIds.includes(scene.id))
        .map(scene => scene.fromScript?.sceneId)
        .filter(Boolean)
    );
    for (const scene of mine) {
      if (!sceneIds.has(scene.fromScript?.sceneId) || seen.has(scene.id)) continue;
      seen.add(scene.id);
      out.push(scene);
    }
  }
  return out;
}

/**
 * The shot list's order with new shots placed after one (null: first): the shown order kept, the
 * new keys taken out of wherever they were and put in after `afterKey`.
 */
export function cutOrderWithAfter(
  shown: readonly string[],
  added: readonly string[],
  afterKey: string | null
): string[] {
  const adding = new Set(added);
  const rest = shown.filter(key => !adding.has(key));
  const at = afterKey ? rest.indexOf(afterKey) + 1 : 0;
  // A key not in the list (gone since): at the end.
  const index = afterKey && at === 0 ? rest.length : at;
  return [...rest.slice(0, index), ...added, ...rest.slice(index)];
}
