/**
 * A run's inputs, frozen at Start (day/run-bundle.ts): POST { bundle } → { ok }. Per signed-in
 * user with sign-in on; 503 without server storage (the run renders on the page as always).
 */
import { apiError, apiJson } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import { normalizeRunBundle } from '@/lib/day/run-bundle';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import { writeRunBundle } from '@/lib/sqlite/scene-run-bundles';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { resolveStorageUser } from '@/lib/storage/storage-user';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!isServerStorageEnabled())
    return apiError('Server storage disabled. Set PROMPT_DATA_DIR.', 503);
  const userId = resolveStorageUser(request);
  if (isAuthEnabled() && !userId) return apiError('Sign in required for user storage sync.', 401);
  let body: { bundle?: unknown };
  try {
    body = (await request.json()) as { bundle?: unknown };
  } catch {
    return apiError('A JSON body is required.', 400);
  }
  const bundle = normalizeRunBundle(body.bundle);
  if (!bundle) return apiError('That is not a run bundle.', 400);
  if (!writeRunBundle(kvScopeForUser(userId), bundle.runId, bundle)) {
    return apiError('That run bundle is too large.', 413);
  }
  return apiJson({ ok: true });
}
