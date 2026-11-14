/**
 * A run the server renders (FINISHING_PLAN Phase 3, step 8): its working copy of the Scene
 * settings — what it resumes from after a restart — and the patch queue, what it changed in
 * order, which the page applies (Scenes stay the page's). Stored as sent: what a patch holds is
 * Play's to read (this shared module doesn't import it).
 */
import { decodeJson, encodeJson, getStudioDb } from './studio-db';

/** Patches kept per run once applied pages have read them (the oldest go first). */
export const RUN_PATCHES_KEPT = 500;

export function writeRunState(scope: string, runId: string, state: unknown, now = Date.now()) {
  getStudioDb()
    .prepare(
      'INSERT OR REPLACE INTO scene_run_state (scope, run_id, json, updated_at) VALUES (?, ?, ?, ?)'
    )
    .run(scope, runId, encodeJson(state), now);
}

export function readRunState(scope: string, runId: string): unknown {
  const row = getStudioDb()
    .prepare('SELECT json FROM scene_run_state WHERE scope = ? AND run_id = ?')
    .get(scope, runId) as { json?: string } | undefined;
  if (!row?.json) return null;
  try {
    return decodeJson(row.json);
  } catch {
    return null;
  }
}

/** Add a patch; its sequence number (1, 2, …) — the page asks for those after the last it applied. */
export function appendRunPatch(scope: string, runId: string, patch: unknown, now = Date.now()) {
  const db = getStudioDb();
  const row = db
    .prepare('SELECT MAX(seq) AS seq FROM scene_run_patches WHERE scope = ? AND run_id = ?')
    .get(scope, runId) as { seq?: number | null } | undefined;
  const seq = Number(row?.seq ?? 0) + 1;
  db.prepare(
    'INSERT INTO scene_run_patches (scope, run_id, seq, json, at) VALUES (?, ?, ?, ?, ?)'
  ).run(scope, runId, seq, encodeJson(patch), now);
  db.prepare(`DELETE FROM scene_run_patches WHERE scope = ? AND run_id = ? AND seq <= ?`).run(
    scope,
    runId,
    seq - RUN_PATCHES_KEPT
  );
  return seq;
}

export function readRunPatches(
  scope: string,
  runId: string,
  afterSeq = 0
): Array<{ seq: number; at: number; patch: unknown }> {
  const rows = getStudioDb()
    .prepare(
      'SELECT seq, at, json FROM scene_run_patches WHERE scope = ? AND run_id = ? AND seq > ? ORDER BY seq'
    )
    .all(scope, runId, afterSeq) as Array<{ seq: number; at: number; json: string }>;
  return rows.flatMap(row => {
    try {
      return [{ seq: Number(row.seq), at: Number(row.at), patch: decodeJson(row.json) }];
    } catch {
      return [];
    }
  });
}
