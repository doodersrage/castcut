import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { uploadCutBridgeFrame } from '@/lib/cut-bridge-server';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cut/bridge-frame');
}

/**
 * POST { url, edge: 'first' | 'last' | atSec, comfyUrl? } → { filename }: a Cut shot's first or
 * last frame (a still as it is) — or the frame at `atSec`, a freeze frame — uploaded to ComfyUI's
 * input folder, for a bridge clip (cut-bridge.ts) or a freeze frame.
 */
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
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  // A freeze frame: the frame at `atSec` of a clip.
  const atSec =
    typeof body.atSec === 'number' && Number.isFinite(body.atSec) && body.atSec >= 0
      ? body.atSec
      : null;
  const edge =
    atSec !== null
      ? { atSec }
      : body.edge === 'last'
        ? 'last'
        : body.edge === 'first'
          ? 'first'
          : null;
  if (!url || !edge) return apiError('url and edge (or atSec) are required.', 400);
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(
      stripEmptyComfyUiRuntime({
        apiUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
      })
    ).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  try {
    const filename = await uploadCutBridgeFrame({
      url,
      edge,
      baseUrl,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ filename });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not read that shot.', 502);
  }
}
