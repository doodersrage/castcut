/**
 * Shadow mode for a run's takes (day/run-bundle.ts): a take reports what it decided; the server
 * decides again from the run's bundle and records the difference.
 *
 *   POST { report }   → { diffs, server }
 *   GET  ?runId=…     → { rows }
 */
import { apiError, apiJson } from '@/lib/api/response';
import { isAuthEnabled } from '@/lib/auth/store';
import type { TakeShadowReport } from '@/lib/day/run-bundle';
import { shadowTakeDecisions } from '@/lib/day/run-bundle-server';
import { kvScopeForUser } from '@/lib/sqlite/kv';
import { readRunShadow } from '@/lib/sqlite/scene-run-bundles';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';
import { resolveStorageUser } from '@/lib/storage/storage-user';

export const runtime = 'nodejs';

function scopeOf(request: Request): string | Response {
  if (!isServerStorageEnabled())
    return apiError('Server storage disabled. Set PROMPT_DATA_DIR.', 503);
  const userId = resolveStorageUser(request);
  if (isAuthEnabled() && !userId) return apiError('Sign in required for user storage sync.', 401);
  return kvScopeForUser(userId);
}

export async function GET(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  const runId = new URL(request.url).searchParams.get('runId')?.trim() ?? '';
  if (!runId) return apiError('runId is required.', 400);
  return apiJson({ rows: readRunShadow(scope, runId) });
}

export async function POST(request: Request) {
  const scope = scopeOf(request);
  if (scope instanceof Response) return scope;
  let body: { report?: TakeShadowReport };
  try {
    body = (await request.json()) as { report?: TakeShadowReport };
  } catch {
    return apiError('A JSON body is required.', 400);
  }
  const report = body.report;
  if (
    !report ||
    typeof report.runId !== 'string' ||
    typeof report.sceneId !== 'string' ||
    !report.slot ||
    !report.decisions
  ) {
    return apiError('A take report is required.', 400);
  }
  const result = await shadowTakeDecisions(scope, {
    ...report,
    outfitScenes: Array.isArray(report.outfitScenes) ? report.outfitScenes : [],
    workingSlots: Array.isArray(report.workingSlots) ? report.workingSlots : [],
    latestSlots: Array.isArray(report.latestSlots) ? report.latestSlots : [],
    scriptShot: report.scriptShot === true,
  });
  if (!result.ok) return apiError(result.error, 404);
  return apiJson({ diffs: result.diffs, server: result.server });
}
