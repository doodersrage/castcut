/**
 * Screenplays, one record per script (M6 V6, sqlite/scene-scripts.ts).
 *
 *   GET                       → { scripts, removedAt }
 *   POST { script }           → { script } | { removedAt }  (what the server holds afterwards)
 *   DELETE ?id=…&at=<ms>      → { removed }
 *
 * Per signed-in user with sign-in on (as the storage namespaces are); one shared copy without.
 */
import { apiError, apiJson } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import { readSceneScripts, removeSceneScript, writeSceneScript } from '@/lib/sqlite/scene-scripts';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { resolveStorageUser } from '@/lib/storage/storage-user';

export const runtime = 'nodejs';

/** The scope the request's scripts live in, or a response refusing it. */
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
  return apiJson(readSceneScripts(scope));
}

export async function POST(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  let body: { script?: unknown };
  try {
    body = (await request.json()) as { script?: unknown };
  } catch {
    return apiError('A JSON body is required.', 400);
  }
  const result = writeSceneScript(scope, body.script);
  if (!result) return apiError('That is not a script.', 400);
  return apiJson(result);
}

export async function DELETE(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  const params = new URL(request.url).searchParams;
  const id = params.get('id')?.trim() ?? '';
  const at = Number(params.get('at'));
  if (!id || !Number.isFinite(at) || at <= 0) return apiError('id and at are required.', 400);
  return apiJson({ removed: removeSceneScript(scope, id, at) });
}
