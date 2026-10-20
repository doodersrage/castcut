import { apiError, apiJson, apiMethodNotAllowed, apiOptions } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { probeDeliveryShots, type DeliveryCheckShot } from '@/lib/film/delivery-check-server';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm-request-options';

export const runtime = 'nodejs';
export const maxDuration = 240;

const MAX_SHOTS = 60;

function parseShots(raw: unknown): DeliveryCheckShot[] {
  if (!Array.isArray(raw)) return [];
  const shots: DeliveryCheckShot[] = [];
  for (const entry of raw.slice(0, MAX_SHOTS)) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const key = typeof record.key === 'string' ? record.key.trim() : '';
    const url = typeof record.url === 'string' ? record.url.trim() : '';
    const kind = record.kind === 'still' ? 'still' : record.kind === 'clip' ? 'clip' : null;
    if (!key || !url || !kind) continue;
    const entryId = typeof record.entryId === 'string' ? record.entryId.trim() : '';
    shots.push({
      key,
      url,
      kind,
      ...(entryId ? { entryId } : {}),
      ...(record.expectSpeech === true ? { expectSpeech: true } : {}),
      ...(record.readText === true ? { readText: true } : {}),
    });
  }
  return shots;
}

export async function OPTIONS() {
  return apiOptions('POST, OPTIONS');
}

/** Delivery check before a cut: missing files, black frames, talking clips with no sound. */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) {
    return apiError('Authentication required.', 401);
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const shots = parseShots(body.shots);
  if (shots.length === 0) {
    return apiError('Include at least one shot with key, url and kind.', 400);
  }
  const { ffmpeg, results } = await probeDeliveryShots(shots, {
    requestOrigin: new URL(request.url).origin,
    userId: user?.id ?? null,
    llm: parseLlmRequestOptions(body as LlmRequestBody),
  });
  return apiJson({ ok: true, ffmpeg, results });
}

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/film/check');
}
