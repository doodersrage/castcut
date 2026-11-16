import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { hearClip } from '@/lib/clip/hear-server';

export const runtime = 'nodejs';
export const maxDuration = 360;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/hear');
}

/**
 * POST { clipUrl, entryId?, line?, comfyUrl? } → { heard, transcript?, wrong }: whether a clip
 * said its line as written (or, with no line, kept quiet) — Whisper on ComfyUI.
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
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim().slice(0, 2000) : '';
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  const hearing = await hearClip({
    url: clipUrl,
    entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
    line: typeof body.line === 'string' ? body.line.slice(0, 600) : '',
    comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
    userId: user?.id ?? null,
    requestOrigin: new URL(request.url).origin,
  });
  return apiJson(hearing);
}
