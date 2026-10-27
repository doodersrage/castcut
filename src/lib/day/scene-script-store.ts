/**
 * Screenplays in their own store (M6 V6). They lived in the Scene tool's settings, which are
 * written and synced whole, so every edit anywhere re-sent every script (a feature-length script
 * and its shots are 150–470 KB). Here they are kept under their own browser key and synced one
 * script at a time with the server (`/api/scene-scripts`, a row per script). The shape the Script
 * section works with is unchanged ({@link ScriptsCache}: `scripts` and `removedScriptAt`), so the
 * patch functions in scene-scripts.ts apply as before.
 */
import {
  normalizeSavedScript,
  normalizeSavedScripts,
  type SavedScript,
  type ScriptsCache,
} from './scene-scripts';

export const SCENE_SCRIPTS_KEY = 'castcut-scene-scripts-v1';
export const SCENE_SCRIPTS_CHANGED_EVENT = 'castcut-scene-scripts-changed';

export type SceneScriptStore = {
  scripts: SavedScript[];
  /** Deleted scripts and when (ms): a copy made before the deletion never comes back. */
  removedAt: Record<string, number>;
};

const EMPTY: SceneScriptStore = { scripts: [], removedAt: {} };

function removedAtOf(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, number] =>
        Boolean(entry[0]) && typeof entry[1] === 'number' && Number.isFinite(entry[1])
    )
  );
}

export function normalizeSceneScriptStore(raw: unknown, now = Date.now()): SceneScriptStore {
  if (!raw || typeof raw !== 'object') return EMPTY;
  const value = raw as { scripts?: unknown; removedAt?: unknown };
  return {
    scripts: normalizeSavedScripts(value.scripts, now),
    removedAt: removedAtOf(value.removedAt),
  };
}

/**
 * Two copies merged script by script: the newer copy of each, and a deletion over any copy made
 * before it (a copy made after it brings the script back, and the deletion goes).
 */
export function mergeSceneScriptStores(a: SceneScriptStore, b: SceneScriptStore): SceneScriptStore {
  const removedAt: Record<string, number> = { ...a.removedAt };
  for (const [id, at] of Object.entries(b.removedAt))
    removedAt[id] = Math.max(removedAt[id] ?? 0, at);
  const byId = new Map<string, SavedScript>();
  for (const script of [...a.scripts, ...b.scripts]) {
    const had = byId.get(script.id);
    if (!had || script.updatedAt > had.updatedAt) byId.set(script.id, script);
  }
  for (const [id, script] of byId) {
    const at = removedAt[id];
    if (at === undefined) continue;
    if (script.updatedAt > at) delete removedAt[id];
    else byId.delete(id);
  }
  return { scripts: normalizeSavedScripts([...byId.values()]), removedAt };
}

/** What `after` holds that `before` does not: scripts to save and deletions to send. */
export function sceneScriptChanges(
  before: SceneScriptStore,
  after: SceneScriptStore
): { put: SavedScript[]; remove: Array<{ id: string; at: number }> } {
  const was = new Map(before.scripts.map(script => [script.id, script]));
  const put = after.scripts.filter(script => {
    const old = was.get(script.id);
    return (
      !old || old.updatedAt !== script.updatedAt || JSON.stringify(old) !== JSON.stringify(script)
    );
  });
  const remove = Object.entries(after.removedAt)
    .filter(([id, at]) => before.removedAt[id] !== at)
    .map(([id, at]) => ({ id, at }));
  return { put, remove };
}

/** The store with a Script-section patch applied (its `scripts` replace the list). */
export function withScriptsPatch(store: SceneScriptStore, patch: ScriptsCache): SceneScriptStore {
  return {
    scripts: patch.scripts ? normalizeSavedScripts(patch.scripts) : store.scripts,
    removedAt: { ...store.removedAt, ...removedAtOf(patch.removedScriptAt) },
  };
}

/** The store as the Script section reads it. */
export function scriptsCacheOf(store: SceneScriptStore): Required<ScriptsCache> {
  return { scripts: store.scripts, removedScriptAt: store.removedAt };
}

/**
 * The script one push should leave behind: the server's answer to a save (the newer copy it kept,
 * or its deletion), folded into the store.
 */
export function withServerAnswer(
  store: SceneScriptStore,
  id: string,
  answer: unknown
): SceneScriptStore {
  if (!answer || typeof answer !== 'object') return store;
  const value = answer as { script?: unknown; removedAt?: unknown };
  if (typeof value.removedAt === 'number') {
    return mergeSceneScriptStores(store, { scripts: [], removedAt: { [id]: value.removedAt } });
  }
  const script = normalizeSavedScript(value.script);
  return script ? mergeSceneScriptStores(store, { scripts: [script], removedAt: {} }) : store;
}

export { EMPTY as EMPTY_SCENE_SCRIPT_STORE };
