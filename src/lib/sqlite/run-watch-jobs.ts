/**
 * The server's watch over handed-off runs' jobs (FINISHING_PLAN Phase 3, step 3; server/run-watcher.ts),
 * one row per ComfyUI prompt id: seen queued or rendering, landed (with the status it finished
 * with, so it still lands after ComfyUI forgets it), queued again (as which job), cancelled (by
 * Castcut — never queued again). Prompt ids are ComfyUI's UUIDs: one table for every scope.
 */
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { decodeJson, encodeJson, getStudioDb, withStudioTransaction } from './studio-db';

type Row = {
  prompt_id: string;
  seen_at: number | null;
  landed_at: number | null;
  landed_json: string | null;
  requeued_at: number | null;
  requeued_as: string | null;
  cancelled_at: number | null;
};

function ensure(promptId: string, at: { runId?: string; sceneId?: string; comfyUrl?: string }) {
  getStudioDb()
    .prepare(
      `INSERT INTO run_watch_jobs (prompt_id, run_id, scene_id, comfy_url) VALUES (?, ?, ?, ?)
       ON CONFLICT(prompt_id) DO UPDATE SET
         run_id = COALESCE(excluded.run_id, run_id),
         scene_id = COALESCE(excluded.scene_id, scene_id),
         comfy_url = COALESCE(excluded.comfy_url, comfy_url)`
    )
    .run(promptId, at.runId ?? null, at.sceneId ?? null, at.comfyUrl ?? null);
}

export function markJobSeen(
  promptId: string,
  at: { runId?: string; sceneId?: string; comfyUrl?: string } = {},
  now = Date.now()
): void {
  ensure(promptId, at);
  getStudioDb()
    .prepare('UPDATE run_watch_jobs SET seen_at = COALESCE(seen_at, ?) WHERE prompt_id = ?')
    .run(now, promptId);
}

/** The status it finished with, kept: it lands from here once ComfyUI forgets it. */
export function markJobLanded(promptId: string, status: unknown, now = Date.now()): void {
  ensure(promptId, {});
  getStudioDb()
    .prepare('UPDATE run_watch_jobs SET landed_at = ?, landed_json = ? WHERE prompt_id = ?')
    .run(now, encodeJson(status), promptId);
}

/** Castcut cancelled it: the watch never queues it again. Best-effort; never throws. */
export function markJobCancelled(promptId: string, now = Date.now()): void {
  try {
    if (!isServerStorageEnabled() || !promptId.trim()) return;
    ensure(promptId.trim(), {});
    getStudioDb()
      .prepare('UPDATE run_watch_jobs SET cancelled_at = ? WHERE prompt_id = ?')
      .run(now, promptId.trim());
  } catch (error) {
    console.warn('Could not note a cancelled job for the run watch:', error);
  }
}

/**
 * Claim the right to queue `promptId` again — once ever, and never a cancelled one. Taken before
 * the job is sent: a crash between the two leaves it unsent (the take waits), never sent twice.
 */
export function claimJobRequeue(promptId: string, now = Date.now()): boolean {
  return withStudioTransaction(db => {
    const row = db
      .prepare('SELECT requeued_at, cancelled_at FROM run_watch_jobs WHERE prompt_id = ?')
      .get(promptId) as Pick<Row, 'requeued_at' | 'cancelled_at'> | undefined;
    if (!row || row.requeued_at != null || row.cancelled_at != null) return false;
    db.prepare('UPDATE run_watch_jobs SET requeued_at = ? WHERE prompt_id = ?').run(now, promptId);
    return true;
  });
}

/** A re-queue that didn't go through (ComfyUI still starting): let a later try claim it. */
export function releaseJobRequeue(promptId: string): void {
  getStudioDb()
    .prepare(
      'UPDATE run_watch_jobs SET requeued_at = NULL WHERE prompt_id = ? AND requeued_as IS NULL'
    )
    .run(promptId);
}

export function markJobRequeuedAs(promptId: string, next: string): void {
  getStudioDb()
    .prepare('UPDATE run_watch_jobs SET requeued_as = ? WHERE prompt_id = ?')
    .run(next, promptId);
}

export type RunWatchState = {
  seen: Set<string>;
  landed: Set<string>;
  /** prompt id → the job it was queued again as. */
  requeued: Map<string, string>;
  /** Claimed for a re-queue (sent or not): never again. */
  requeueClaimed: Set<string>;
  cancelled: Set<string>;
};

/** What the watch knows of these prompt ids, and of the jobs they were queued again as. */
export function readRunWatchState(promptIds: readonly string[]): RunWatchState {
  const state: RunWatchState = {
    seen: new Set(),
    landed: new Set(),
    requeued: new Map(),
    requeueClaimed: new Set(),
    cancelled: new Set(),
  };
  const pending = [...new Set(promptIds.filter(Boolean))];
  const done = new Set<string>();
  const select = getStudioDb().prepare('SELECT * FROM run_watch_jobs WHERE prompt_id = ?');
  while (pending.length) {
    const id = pending.pop()!;
    if (done.has(id)) continue;
    done.add(id);
    const row = select.get(id) as Row | undefined;
    if (!row) continue;
    if (row.seen_at != null) state.seen.add(id);
    if (row.landed_at != null) state.landed.add(id);
    if (row.requeued_at != null) state.requeueClaimed.add(id);
    if (row.cancelled_at != null) state.cancelled.add(id);
    if (row.requeued_as) {
      state.requeued.set(id, row.requeued_as);
      pending.push(row.requeued_as);
    }
  }
  return state;
}

/** The job a prompt id was queued again as, followed to the newest (or null). */
export function requeuedJobOf(promptId: string): string | null {
  if (!isServerStorageEnabled()) return null;
  let id = promptId;
  const seen = new Set<string>();
  const select = getStudioDb().prepare(
    'SELECT requeued_as FROM run_watch_jobs WHERE prompt_id = ?'
  );
  for (;;) {
    const row = select.get(id) as { requeued_as?: string | null } | undefined;
    if (!row?.requeued_as || seen.has(row.requeued_as)) break;
    seen.add(id);
    id = row.requeued_as;
  }
  return id === promptId ? null : id;
}

/** The status a job finished with, as the watch kept it (or null). */
export function landedJobStatus(promptId: string): unknown {
  if (!isServerStorageEnabled()) return null;
  const row = getStudioDb()
    .prepare('SELECT landed_json FROM run_watch_jobs WHERE prompt_id = ? AND landed_at IS NOT NULL')
    .get(promptId) as { landed_json?: string | null } | undefined;
  if (!row?.landed_json) return null;
  try {
    return decodeJson(row.landed_json);
  } catch {
    return null;
  }
}
