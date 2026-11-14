/**
 * A run's inputs frozen at Start, and the shadow check of each of its takes (FINISHING_PLAN
 * Phase 3, step 2; day/run-bundle.ts). Stored as sent: what a bundle holds is Play's to read
 * (this shared module doesn't import it).
 */
import { decodeJson, encodeJson, getStudioDb } from './studio-db';

/** A bundle larger than this (a Cast with many inline pictures) is refused. */
export const RUN_BUNDLE_JSON_MAX = 4_000_000;
/** Shadow rows kept per scope, newest first. */
export const RUN_SHADOW_ROWS_KEPT = 2000;

export function writeRunBundle(
  scope: string,
  runId: string,
  bundle: unknown,
  now = Date.now()
): boolean {
  const json = encodeJson(bundle);
  if (!runId.trim() || json.length > RUN_BUNDLE_JSON_MAX) return false;
  getStudioDb()
    .prepare(
      'INSERT OR REPLACE INTO scene_run_bundles (scope, run_id, json, captured_at) VALUES (?, ?, ?, ?)'
    )
    .run(scope, runId, json, now);
  return true;
}

export function readRunBundle(scope: string, runId: string): unknown {
  const row = getStudioDb()
    .prepare('SELECT json FROM scene_run_bundles WHERE scope = ? AND run_id = ?')
    .get(scope, runId) as { json?: string } | undefined;
  if (!row?.json) return null;
  try {
    return decodeJson(row.json);
  } catch {
    return null;
  }
}

export type RunShadowRow = {
  runId: string;
  sceneId: string;
  at: number;
  diffs: string[];
  page: unknown;
  server: unknown;
};

export function recordRunShadow(scope: string, row: RunShadowRow): void {
  const db = getStudioDb();
  db.prepare(
    `INSERT INTO scene_run_shadow (scope, run_id, scene_id, at, diffs_json, page_json, server_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    scope,
    row.runId,
    row.sceneId,
    row.at,
    encodeJson(row.diffs),
    encodeJson(row.page),
    encodeJson(row.server)
  );
  db.prepare(
    `DELETE FROM scene_run_shadow WHERE scope = ? AND rowid NOT IN (
       SELECT rowid FROM scene_run_shadow WHERE scope = ? ORDER BY at DESC LIMIT ?
     )`
  ).run(scope, scope, RUN_SHADOW_ROWS_KEPT);
}

export function readRunShadow(scope: string, runId: string): RunShadowRow[] {
  const rows = getStudioDb()
    .prepare(
      'SELECT run_id, scene_id, at, diffs_json, page_json, server_json FROM scene_run_shadow WHERE scope = ? AND run_id = ? ORDER BY at'
    )
    .all(scope, runId) as Array<{
    run_id: string;
    scene_id: string;
    at: number;
    diffs_json: string;
    page_json: string;
    server_json: string;
  }>;
  return rows.map(row => ({
    runId: row.run_id,
    sceneId: row.scene_id,
    at: Number(row.at),
    diffs: decodeJson<string[]>(row.diffs_json),
    page: decodeJson(row.page_json),
    server: decodeJson(row.server_json),
  }));
}
