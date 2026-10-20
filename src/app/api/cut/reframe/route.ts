import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { shotReframePath } from '@/lib/video/cut-reframe-server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cut/reframe');
}

const num = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;

/**
 * POST { url, kind: 'still' | 'clip', trimStartSec?, playSec, reverse?, width, height, comfyUrl? }
 * → { path: [{ t, x }] | null }: where a vertical / square cut's crop sits over this shot (the
 * render's own path — cut-reframe-server.ts), so the monitor frames it the same.
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
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  const kind = body.kind === 'clip' ? 'clip' : body.kind === 'still' ? 'still' : null;
  const width = num(body.width, 16, 4096);
  const height = num(body.height, 16, 4096);
  if (!url || !kind || !width || !height) {
    return apiError('url, kind, width and height are required.', 400);
  }
  let comfyUrl: string | undefined;
  try {
    comfyUrl = getComfyUiBaseUrl(
      stripEmptyComfyUiRuntime({
        apiUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
      })
    ).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  try {
    const { fetchFilmShotBytes } = await import('@/lib/video/shot-fetch');
    const fetched = await fetchFilmShotBytes({
      url,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    const path = await shotReframePath({
      bytes: new Uint8Array(fetched.buffer),
      kind,
      trimStart: num(body.trimStartSec, 0, 3600),
      playSec: num(body.playSec, 0, 3600) ?? 4,
      reverse: body.reverse === true,
      output: { width, height },
      comfyUrl,
    });
    return apiJson({ path });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not frame that shot.', 502);
  }
}
