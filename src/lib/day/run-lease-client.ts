'use client';

/**
 * The server's lease on a Scene run (sqlite/scene-run-leases.ts, /api/scene-runs/lease) from the
 * browser: on top of this browser's own lock (run-lock.ts), so a run another device renders is
 * left to it. Without server storage, or offline, the server's answer is 'unavailable' and the
 * local lock alone decides — as before.
 */

export type ServerRunLease = 'held' | 'elsewhere' | 'unavailable';

/** Take or renew the run's lease: 'elsewhere' when another renderer holds it, fresh. */
export async function claimServerRunLease(runId: string, holder: string): Promise<ServerRunLease> {
  try {
    const response = await fetch('/api/scene-runs/lease', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, holder, action: 'claim' }),
    });
    if (!response.ok) return 'unavailable';
    const body = (await response.json()) as { held?: unknown };
    return body.held === true ? 'held' : body.held === false ? 'elsewhere' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/** Whether another renderer holds the run's lease now (fresh, not `holder`). */
export async function serverRunHeldElsewhere(runId: string, holder: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/scene-runs/lease?runId=${encodeURIComponent(runId)}`);
    if (!response.ok) return false;
    const body = (await response.json()) as {
      lease?: { holder?: unknown } | null;
      fresh?: unknown;
    };
    // Fresh by the server's clock: devices' clocks differ.
    return body.fresh === true && Boolean(body.lease) && body.lease!.holder !== holder;
  } catch {
    return false;
  }
}

export function releaseServerRunLease(runId: string, holder: string): void {
  void fetch('/api/scene-runs/lease', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ runId, holder, action: 'release' }),
    keepalive: true,
  }).catch(() => undefined);
}
