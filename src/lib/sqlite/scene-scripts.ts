/**
 * Screenplays on the server, one row per script (M6 V6). They used to ride in the Scene tool's
 * settings, which are stored and synced whole: every edit anywhere re-sent every script. Each
 * script now syncs on its own; the newer copy of a script wins, and a deletion (a tombstone row)
 * wins over any copy made before it.
 */
import { decodeJson, encodeJson, getStudioDb } from './studio-db';

/**
 * A script as this table needs it: its id, Cast and last change. The rest is kept as sent; the
 * Scene page reads it through its own normaliser (day/scene-scripts.ts — Play, which this shared
 * module does not import: docs/architecture-boundaries.md).
 */
export type StoredScript = {
  id: string;
  castId: string;
  name?: string;
  source: string;
  updatedAt: number;
  createdAt?: number;
};

function scriptOf(raw: unknown): StoredScript | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const castId = typeof value.castId === 'string' ? value.castId.trim() : '';
  const updatedAt = value.updatedAt;
  if (!id || !castId || typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;
  if (typeof value.source !== 'string' || !value.source.trim()) return null;
  return { ...(value as StoredScript), id, castId };
}

export type StoredSceneScripts = {
  scripts: StoredScript[];
  /** Deleted scripts and when (ms). */
  removedAt: Record<string, number>;
};

type Row = { id: string; json: string | null; updated_at: number; removed_at: number | null };

/** Every script in a scope, and the deletions. */
export function readSceneScripts(scope: string): StoredSceneScripts {
  const rows = getStudioDb()
    .prepare('SELECT id, json, updated_at, removed_at FROM scene_scripts WHERE scope = ?')
    .all(scope) as Row[];
  const scripts: StoredScript[] = [];
  const removedAt: Record<string, number> = {};
  for (const row of rows) {
    if (row.removed_at != null) {
      removedAt[row.id] = row.removed_at;
      continue;
    }
    if (!row.json) continue;
    try {
      const script = scriptOf(decodeJson(row.json));
      if (script) scripts.push(script);
    } catch {
      // a row that does not parse is skipped, not fatal
    }
  }
  scripts.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  return { scripts, removedAt };
}

function rowOf(scope: string, id: string): Row | undefined {
  return getStudioDb()
    .prepare(
      'SELECT id, json, updated_at, removed_at FROM scene_scripts WHERE scope = ? AND id = ?'
    )
    .get(scope, id) as Row | undefined;
}

/**
 * Save one script unless the server has a newer copy, or deleted it after this copy was made.
 * Returns what the server holds for it afterwards: the script, or its deletion time.
 */
export function writeSceneScript(
  scope: string,
  raw: unknown
): { script: StoredScript } | { removedAt: number } | null {
  const script = scriptOf(raw);
  if (!script) return null;
  const row = rowOf(scope, script.id);
  if (row?.removed_at != null && row.removed_at >= script.updatedAt) {
    return { removedAt: row.removed_at };
  }
  if (row?.json && row.removed_at == null && row.updated_at > script.updatedAt) {
    const kept = scriptOf(decodeJson(row.json));
    if (kept) return { script: kept };
  }
  getStudioDb()
    .prepare(
      `INSERT OR REPLACE INTO scene_scripts (scope, id, cast_id, json, updated_at, removed_at)
       VALUES (?, ?, ?, ?, ?, NULL)`
    )
    .run(scope, script.id, script.castId, encodeJson(script), script.updatedAt);
  return { script };
}

/** Delete a script (a tombstone at `at`), unless the server's copy is newer than the deletion. */
export function removeSceneScript(scope: string, id: string, at: number): boolean {
  const key = id.trim();
  if (!key || !Number.isFinite(at)) return false;
  const row = rowOf(scope, key);
  if (row?.removed_at != null && row.removed_at >= at) return true;
  if (row?.json && row.removed_at == null && row.updated_at > at) return false;
  getStudioDb()
    .prepare(
      `INSERT OR REPLACE INTO scene_scripts (scope, id, cast_id, json, updated_at, removed_at)
       VALUES (?, ?, NULL, NULL, ?, ?)`
    )
    .run(scope, key, at, at);
  return true;
}

/**
 * Settings with their Scene scripts moved into the table (their deletions as tombstones): what
 * an older client sends, and what a server copy saved before the move still holds. Returns the
 * settings without them — the same object when there were none.
 */
export function moveSettingsScriptsToTable(scope: string, settings: unknown): unknown {
  if (!settings || typeof settings !== 'object') return settings;
  const value = settings as { tools?: Record<string, unknown> };
  const scene = value.tools?.scene as
    { scripts?: unknown; removedScriptAt?: unknown; [key: string]: unknown } | undefined;
  if (!scene || (scene.scripts === undefined && scene.removedScriptAt === undefined)) {
    return settings;
  }
  const { scripts, removedScriptAt, ...rest } = scene;
  for (const [id, at] of Object.entries((removedScriptAt ?? {}) as Record<string, unknown>)) {
    if (typeof at === 'number') removeSceneScript(scope, id, at);
  }
  for (const script of Array.isArray(scripts) ? scripts : []) writeSceneScript(scope, script);
  return { ...value, tools: { ...value.tools, scene: rest } };
}
