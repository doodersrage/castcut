/**
 * A Scene run's lease: who renders it (sqlite/scene-run-leases.ts).
 *
 *   GET  ?runId=…                                   → { lease: { runId, holder, renewedAt } | null, fresh }
 *   POST { runId, holder, action: 'claim' }          → { held, lease }
 *   POST { runId, holder, action: 'release' }        → { released }
 *
 * Per signed-in user with sign-in on (as scripts are); one shared copy without. 503 without
 * server storage: the browser then keeps its own lock only (day/run-lock.ts).
 */
import { apiError, apiJson } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import {
  claimRunLease,
  readRunLease,
  releaseRunLease,
  RUN_LEASE_FRESH_MS,
} from '@/lib/sqlite/scene-run-leases';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { resolveStorageUser } from '@/lib/storage/storage-user';

export const runtime = 'nodejs';

function scopeOf(request: Request): string | Response {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage disabled. Set PROMPT_DATA_DIR.', 503);
  }
  const userId = resolveStorageUser(request);
  if (isAuthEnabled() && !userId) return apiError('Sign in required for user storage sync.', 401);
  return kvScopeForUser(userId);
}

export async function GET(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  const runId = new URL(request.url).searchParams.get('runId')?.trim() ?? '';
  if (!runId) return apiError('runId is required.', 400);
  const lease = readRunLease(scope, runId);
  // Fresh by the server's clock (devices' clocks differ).
  return apiJson({
    lease,
    fresh: Boolean(lease && Date.now() - lease.renewedAt < RUN_LEASE_FRESH_MS),
  });
}

export async function POST(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  let body: { runId?: unknown; holder?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('A JSON body is required.', 400);
  }
  const runId = typeof body.runId === 'string' ? body.runId.trim() : '';
  const holder = typeof body.holder === 'string' ? body.holder.trim() : '';
  if (!runId || !holder) return apiError('runId and holder are required.', 400);
  if (body.action === 'release')
    return apiJson({ released: releaseRunLease(scope, runId, holder) });
  if (body.action !== 'claim') return apiError('action is claim or release.', 400);
  const claim = claimRunLease(scope, runId, holder);
  if (!claim) return apiError('That run id or holder is too long.', 400);
  return apiJson(claim);
}
