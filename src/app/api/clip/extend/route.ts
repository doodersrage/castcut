import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  getClipExtendJob,
  planClipExtend,
  startClipExtendJob,
  type ClipExtendInput,
} from '@/lib/clip-extend-server';
import { parseLlmRequestOptions } from '@/lib/llm-request-options';

export const runtime = 'nodejs';

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** GET ?jobId= → { job }: how far a "Make it 30 s" job is. */
export async function GET(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  const jobId = new URL(request.url).searchParams.get('jobId')?.trim();
  const job = jobId ? getClipExtendJob(jobId) : null;
  return job ? apiJson({ job }) : apiError('Extension job not found.', 404);
}

/**
 * POST { clipUrl, clipPromptId?, scene, setting?, heat?, targetSec?, direction?, beats?, comfyUrl?,
 * …llm } → { job }; with `plan: true` → { plan: { total, beats, partSec } } and nothing rendered.
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const clipUrl = text(body.clipUrl, 2000);
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  const target = Number(body.targetSec);
  const input: ClipExtendInput = {
    clipUrl,
    clipPromptId: text(body.clipPromptId, 80) || undefined,
    scene: text(body.scene, 600) || 'The shot carries on.',
    setting: text(body.setting, 200) || undefined,
    heat: ['flirty', 'sensual', 'explicit'].includes(String(body.heat))
      ? (body.heat as 'flirty' | 'sensual' | 'explicit')
      : 'clean',
    targetSec: Number.isFinite(target) && target >= 10 && target <= 60 ? target : undefined,
    comfyUrl: text(body.comfyUrl, 300) || undefined,
    requestOrigin: new URL(request.url).origin,
    userId: user?.id ?? null,
    direction: text(body.direction, 300) || undefined,
    beats: Array.isArray(body.beats)
      ? body.beats
          .filter((beat): beat is string => typeof beat === 'string')
          .map(beat => beat.trim().slice(0, 240))
          .filter(Boolean)
          .slice(0, 8)
      : undefined,
    lines: Array.isArray(body.lines)
      ? body.lines
          .slice(0, 8)
          .map(line => (typeof line === 'string' ? line.trim().slice(0, 120) : ''))
      : undefined,
    lead: body.lead === 'man' ? 'man' : 'woman',
    llm: parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0]),
  };
  if (body.plan === true) {
    try {
      return apiJson({ plan: await planClipExtend(input) });
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : 'Could not plan the extension.',
        502
      );
    }
  }
  return apiJson({ job: startClipExtendJob(input) });
}
