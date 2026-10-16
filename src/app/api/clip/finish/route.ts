import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { ClipAlreadyFinishedError, finishClip } from '@/lib/clip-finish-server';

export const runtime = 'nodejs';
export const maxDuration = 1300;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/finish');
}

/** POST { clipUrl, comfyUrl? } → { url }: the clip sharpened (SeedVR2) and smoothed (RIFE). */
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
  try {
    const url = await finishClip({
      clipUrl,
      comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    if (error instanceof ClipAlreadyFinishedError) return apiError(error.message, 409);
    return apiError(error instanceof Error ? error.message : 'Finish clip failed.', 502);
  }
}
