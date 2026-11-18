import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { clipEndFrameUrl } from '@/lib/clip/continue-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/frame');
}

/**
 * POST { clipUrl, comfyUrl?, sharpest? } → { url, atSec? }: the clip's last frame as a ComfyUI
 * image (the still a directed continuation starts from) — with `sharpest`, the sharpest of its
 * last few frames and its time (a continuous take's start; day/continuous-take.ts).
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: { clipUrl?: string; comfyUrl?: string; sharpest?: unknown } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const clipUrl = body.clipUrl?.trim().slice(0, 2000);
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  try {
    const frame = await clipEndFrameUrl({
      clipUrl,
      comfyUrl: body.comfyUrl?.trim().slice(0, 300) || undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
      sharpest: body.sharpest === true,
    });
    return apiJson(frame);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not read the clip.';
    return apiError(message, /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502);
  }
}
