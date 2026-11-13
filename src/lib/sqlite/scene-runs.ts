/**
 * Scene runs on the server, one row per run (FINISHING_PLAN Phase 3, step 1b, 2026-11-13). The
 * run lives in the Scene tool's settings, which sync whole and merge by device; its renderer also
 * writes each change here, the newer copy winning, so the server holds every run as last saved —
 * what its job watcher and, later, its runner read. Nothing reads runs from here in the browser
 * yet: the settings copy is still the browser's.
 */
import { decodeJson, encodeJson, getStudioDb } from './studio-db';

/**
 * A run as this table needs it: its id, Cast, items and last change. The rest is kept as sent;
 * the Scene page reads runs through its own normaliser (day/scene-run.ts — Play, which this
 * shared module does not import: docs/architecture-boundaries.md).
 */
export type StoredSceneRun = {
  id: string;
  castId: string;
  items: unknown[];
  updatedAt: number;
  state?: string;
};

/** A run's record is bounded (its log keeps the latest entries); a copy past this is refused. */
export const SCENE_RUN_JSON_MAX = 2_000_000;
/** Runs kept per scope, newest first. */
export const SCENE_RUNS_KEPT = 100;

export function sceneRunOf(raw: unknown): StoredSceneRun | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  const castId = typeof value.castId === 'string' ? value.castId.trim() : '';
  const updatedAt = value.updatedAt;
  if (!id || id.length > 200 || !castId || castId.length > 200) return null;
  if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt)) return null;
  if (!Array.isArray(value.items)) return null;
  return { ...(value as StoredSceneRun), id, castId };
}

/**
 * Keep `raw` as the run's record unless the stored copy is newer. Returns what is stored after,
 * or null when `raw` isn't a run (or is too large).
 */
export function writeSceneRun(scope: string, raw: unknown): StoredSceneRun | null {
  const run = sceneRunOf(raw);
  if (!run) return null;
  const json = encodeJson(run);
  if (json.length > SCENE_RUN_JSON_MAX) return null;
  const db = getStudioDb();
  const stored = readSceneRun(scope, run.id);
  if (stored && stored.updatedAt > run.updatedAt) return stored;
  db.prepare(
    'INSERT OR REPLACE INTO scene_runs (scope, id, cast_id, json, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(scope, run.id, run.castId, json, run.updatedAt);
  db.prepare(
    `DELETE FROM scene_runs WHERE scope = ? AND id NOT IN (
       SELECT id FROM scene_runs WHERE scope = ? ORDER BY updated_at DESC LIMIT ?
     )`
  ).run(scope, scope, SCENE_RUNS_KEPT);
  return run;
}

export function readSceneRun(scope: string, id: string): StoredSceneRun | null {
  const row = getStudioDb()
    .prepare('SELECT json FROM scene_runs WHERE scope = ? AND id = ?')
    .get(scope, id) as { json?: string } | undefined;
  if (!row?.json) return null;
  try {
    return sceneRunOf(decodeJson(row.json));
  } catch {
    return null;
  }
}

/** A scope's runs, newest first; a Cast's only with `castId`. */
export function readSceneRuns(scope: string, castId?: string): StoredSceneRun[] {
  const rows = (
    castId
      ? getStudioDb()
          .prepare(
            'SELECT json FROM scene_runs WHERE scope = ? AND cast_id = ? ORDER BY updated_at DESC'
          )
          .all(scope, castId)
      : getStudioDb()
          .prepare('SELECT json FROM scene_runs WHERE scope = ? ORDER BY updated_at DESC')
          .all(scope)
  ) as Array<{ json: string }>;
  const runs: StoredSceneRun[] = [];
  for (const row of rows) {
    try {
      const run = sceneRunOf(decodeJson(row.json));
      if (run) runs.push(run);
    } catch {
      // a row that does not parse is skipped, not fatal
    }
  }
  return runs;
}

/**
 * The run in a settings push (`tools.scene.run`) recorded here — every writer of a run goes
 * through the settings, so the server sees each change as its device pushes it (debounced, a few
 * seconds). The settings are left as they are. Never throws: a push is never refused for this.
 */
export function recordSettingsRun(scope: string, settings: unknown): void {
  try {
    const tools = (settings as { tools?: { scene?: { run?: unknown } } } | null)?.tools;
    const run = tools?.scene?.run;
    if (run) writeSceneRun(scope, run);
  } catch (error) {
    console.warn('Could not record the Scene run from a settings push:', error);
  }
}
