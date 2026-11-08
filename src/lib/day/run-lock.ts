/**
 * One renderer per run (2026-11-08): with runs rendered on Short as well as Scene, two tabs (or
 * Scene and Short side by side) could both render one run — each queueing its takes, each
 * marking the other's "running" as paused after a reload. The tab rendering a run holds its
 * lock in localStorage (shared by every tab of the app) and renews it while it renders; another
 * tab leaves that run alone while the lock is fresh. A tab that dies stops renewing, and the
 * lock is free again after LOCK_FRESH_MS.
 */

export const RUN_LOCK_KEY = 'castcut-run-lock-v1';
/** A lock this old is a tab that stopped (closed, crashed): free. */
export const RUN_LOCK_FRESH_MS = 20_000;
/** How often the rendering tab renews it. */
export const RUN_LOCK_RENEW_MS = 5_000;

export type RunLock = { runId: string; holder: string; at: number };

export function readRunLock(raw: string | null | undefined): RunLock | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<RunLock>;
    return typeof value.runId === 'string' &&
      typeof value.holder === 'string' &&
      typeof value.at === 'number'
      ? { runId: value.runId, holder: value.holder, at: value.at }
      : null;
  } catch {
    return null;
  }
}

/** Whether another tab is rendering this run now (its lock fresh). Pure. */
export function runHeldElsewhere(
  lock: RunLock | null,
  runId: string,
  me: string,
  now: number
): boolean {
  return Boolean(
    lock && lock.runId === runId && lock.holder !== me && now - lock.at < RUN_LOCK_FRESH_MS
  );
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Client: is this run being rendered by another tab? */
export function runIsHeldElsewhere(runId: string, me: string): boolean {
  return runHeldElsewhere(readRunLock(storage()?.getItem(RUN_LOCK_KEY)), runId, me, Date.now());
}

/** Client: take (or renew) the run's lock; false when another tab holds it. */
export function claimRunLock(runId: string, me: string): boolean {
  const store = storage();
  if (!store) return true;
  if (runIsHeldElsewhere(runId, me)) return false;
  store.setItem(
    RUN_LOCK_KEY,
    JSON.stringify({ runId, holder: me, at: Date.now() } satisfies RunLock)
  );
  return true;
}

/** Client: let go of it (only ours). */
export function releaseRunLock(runId: string, me: string): void {
  const store = storage();
  const lock = readRunLock(store?.getItem(RUN_LOCK_KEY));
  if (store && lock?.runId === runId && lock.holder === me) store.removeItem(RUN_LOCK_KEY);
}
