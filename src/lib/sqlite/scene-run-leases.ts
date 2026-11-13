/**
 * Who renders a Scene run (FINISHING_PLAN Phase 3, 2026-11-13): one renderer at a time holds a
 * run's lease and renews it while it renders. Before this, the lock lived in one browser's
 * localStorage (day/run-lock.ts), so a second device — or a page reloaded on another one — could
 * render, or pause, a run another device was rendering. Here it is the server's, so every tab
 * and device sees one holder; later the server's own runner takes it the same way.
 *
 * A lease not renewed within RUN_LEASE_FRESH_MS is free: a renderer that stopped (closed, crashed,
 * lost its network) lets go by not renewing. Claims are compare-and-set in one transaction.
 */
import { withStudioTransaction, getStudioDb } from './studio-db';

/** A lease this old is a renderer that stopped: free. Renewed every few seconds while held. */
export const RUN_LEASE_FRESH_MS = 30_000;

export type RunLease = { runId: string; holder: string; renewedAt: number };

export type RunLeaseClaim =
  | { held: true; lease: RunLease }
  /** Another renderer holds it, fresh. */
  | { held: false; lease: RunLease };

type Row = { holder: string; renewed_at: number };

const idOk = (value: string) => value.length > 0 && value.length <= 200;

export function readRunLease(scope: string, runId: string): RunLease | null {
  const row = getStudioDb()
    .prepare('SELECT holder, renewed_at FROM scene_run_leases WHERE scope = ? AND run_id = ?')
    .get(scope, runId) as Row | undefined;
  return row ? { runId, holder: row.holder, renewedAt: Number(row.renewed_at) } : null;
}

/**
 * Take or renew `runId`'s lease for `holder`: theirs already, free, or stale. Null for an id
 * that can't be one.
 */
export function claimRunLease(
  scope: string,
  runId: string,
  holder: string,
  now = Date.now()
): RunLeaseClaim | null {
  if (!idOk(runId) || !idOk(holder)) return null;
  return withStudioTransaction(db => {
    const row = db
      .prepare('SELECT holder, renewed_at FROM scene_run_leases WHERE scope = ? AND run_id = ?')
      .get(scope, runId) as Row | undefined;
    if (row && row.holder !== holder && now - Number(row.renewed_at) < RUN_LEASE_FRESH_MS) {
      return {
        held: false,
        lease: { runId, holder: row.holder, renewedAt: Number(row.renewed_at) },
      } as const;
    }
    db.prepare(
      'INSERT OR REPLACE INTO scene_run_leases (scope, run_id, holder, renewed_at) VALUES (?, ?, ?, ?)'
    ).run(scope, runId, holder, now);
    return { held: true, lease: { runId, holder, renewedAt: now } } as const;
  });
}

/** Let go of it — only `holder`'s own. True when it was theirs. */
export function releaseRunLease(scope: string, runId: string, holder: string): boolean {
  const result = getStudioDb()
    .prepare('DELETE FROM scene_run_leases WHERE scope = ? AND run_id = ? AND holder = ?')
    .run(scope, runId, holder);
  return Number(result.changes) > 0;
}
