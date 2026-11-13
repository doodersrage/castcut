/**
 * Scene runs, one record per run (sqlite/scene-runs.ts): what each run's renderer last saved.
 *
 *   GET ?id=…        → { run: StoredSceneRun | null }
 *   GET ?castId=…    → { runs: StoredSceneRun[] }   (newest first; every run without castId)
 *   POST { run }     → { run }                      (what the server holds afterwards)
 *
 * Per signed-in user with sign-in on (as scripts are); one shared copy without. 503 without
 * server storage (the browser's settings copy is then the only one).
 */
import { apiError, apiJson } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import { readSceneRun, readSceneRuns, writeSceneRun } from '@/lib/sqlite/scene-runs';
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
  const id = params.get('id')?.trim();
  if (id) return apiJson({ run: readSceneRun(scope, id) });
  return apiJson({ runs: readSceneRuns(scope, params.get('castId')?.trim() || undefined) });
}

export async function POST(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  let body: { run?: unknown };
  try {
    body = (await request.json()) as { run?: unknown };
  } catch {
    return apiError('A JSON body is required.', 400);
  }
  const run = writeSceneRun(scope, body.run);
  if (!run) return apiError('That is not a Scene run (or it is too large).', 400);
  return apiJson({ run });
}
