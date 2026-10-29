import { apiError, apiJson } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import {
  getClipExtendJob,
  planClipExtend,
  startClipExtendJob,
  writeClipBeats,
  type ClipExtendInput,
} from '@/lib/clip/extend-server';
import { parseLlmRequestOptions } from '@/lib/llm/request-options';
import { normalizeSpokenLineTone } from '@/lib/video/ltx25-renderer';

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
 * POST { clipUrl, clipPromptId?, scene, setting?, heat?, targetSec? | extendBySec?, direction?, beats?, comfyUrl?,
 * …llm } → { job }; with `plan: true` → { plan: { total, beats, partSec } } and nothing rendered.
 * With `writeBeats: n` (M11 T2) → { beats }: n beats from the scene and direction, no clip needed
 * (the Animate sheet, before the first clip exists).
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
  const beatCount = Number(body.writeBeats);
  if (Number.isInteger(beatCount) && beatCount > 0) {
    try {
      return apiJson({
        beats: await writeClipBeats({
          scene: text(body.scene, 600) || 'The shot carries on.',
          setting: text(body.setting, 200) || undefined,
          count: Math.min(8, beatCount),
          heat: ['flirty', 'sensual', 'explicit'].includes(String(body.heat))
            ? (body.heat as 'flirty' | 'sensual' | 'explicit')
            : 'clean',
          direction: text(body.direction, 300) || undefined,
          llm: parseLlmRequestOptions(body as Parameters<typeof parseLlmRequestOptions>[0]),
        }),
      });
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Could not write the beats.', 502);
    }
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
    extendBySec:
      Number.isFinite(Number(body.extendBySec)) &&
      Number(body.extendBySec) >= 2 &&
      Number(body.extendBySec) <= 30
        ? Number(body.extendBySec)
        : undefined,
    comfyUrl: text(body.comfyUrl, 300) || undefined,
    requestOrigin: new URL(request.url).origin,
    userId: user?.id ?? null,
    direction: text(body.direction, 300) || undefined,
    // In place: '' is a part to write (M11).
    beats: Array.isArray(body.beats)
      ? body.beats
          .slice(0, 8)
          .map(beat => (typeof beat === 'string' ? beat.trim().slice(0, 240) : ''))
      : undefined,
    // Each part's length in seconds (0 = the engine's own); a shorter part is trimmed (M11 T2).
    partSeconds: Array.isArray(body.partSeconds)
      ? body.partSeconds
          .slice(0, 8)
          .map(sec => (typeof sec === 'number' && sec >= 1 && sec <= 30 ? sec : 0))
      : undefined,
    // The Cast's pictures for H3's reference model (M11): app or ComfyUI URLs, at most four.
    references: Array.isArray(body.references)
      ? body.references.slice(0, 4).flatMap(entry =>
          entry && typeof entry === 'object' && text((entry as { url?: unknown }).url, 2000)
            ? [
                {
                  url: text((entry as { url?: unknown }).url, 2000),
                  shows: text((entry as { shows?: unknown }).shows, 120) || 'her',
                },
              ]
            : []
        )
      : undefined,
    look: text(body.look, 600) || undefined,
    lines: Array.isArray(body.lines)
      ? body.lines
          .slice(0, 8)
          .map(line => (typeof line === 'string' ? line.trim().slice(0, 120) : ''))
      : undefined,
    tones: Array.isArray(body.tones)
      ? body.tones.slice(0, 8).map(tone => normalizeSpokenLineTone(tone) ?? '')
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
