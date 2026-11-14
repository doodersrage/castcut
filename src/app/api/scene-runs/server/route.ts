/**
 * A Scene run rendered by the server (FINISHING_PLAN Phase 3, step 8; day/run-service-server.ts).
 *
 *   POST { runId, action: 'start' }   → { ok, started }  (its bundle must have been sent first)
 *   POST { runId, action: 'pause' | 'cancel' } → { ok }  (after the step it is on)
 *   GET  ?runId=…&after=<seq>         → { active, patches: [{ seq, at, patch }] }
 *
 * The page applies the patches in order (Scenes stay the page's). Per signed-in user with sign-in
 * on; 503 without server storage.
 */
import { apiError, apiJson } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import { pauseServerRun, serverRunActive, startServerRun } from '@/lib/day/run-service-server';
import { SERVER_RUN_CANCELLED } from '@/lib/day/run-loop-server';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import { readRunPatches } from '@/lib/sqlite/scene-run-patches';
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
  const params = new URL(request.url).searchParams;
  const runId = params.get('runId')?.trim() ?? '';
  if (!runId) return apiError('runId is required.', 400);
  const after = Math.max(0, Number(params.get('after') ?? 0) || 0);
  return apiJson({
    active: serverRunActive(scope, runId),
    patches: readRunPatches(scope, runId, after),
  });
}

export async function POST(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  let body: { runId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('A JSON body is required.', 400);
  }
  const runId = typeof body.runId === 'string' ? body.runId.trim() : '';
  if (!runId) return apiError('runId is required.', 400);
  if (body.action === 'pause' || body.action === 'cancel') {
    const stopped = pauseServerRun(
      scope,
      runId,
      body.action === 'cancel' ? SERVER_RUN_CANCELLED : 'Paused'
    );
    return stopped ? apiJson({ ok: true }) : apiError('The server is not rendering that run.', 409);
  }
  if (body.action !== 'start') return apiError("action must be 'start' or 'pause'.", 400);
  const started = startServerRun(scope, runId, new URL(request.url).origin);
  if (!started.ok) return apiError(started.error, started.status);
  return apiJson({ ok: true, started: started.started });
}
