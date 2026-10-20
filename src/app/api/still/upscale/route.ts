import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { MissingModelsError } from '@/lib/server/heavy-graph-server';
import { StillAlreadyLargeError, upscaleStill } from '@/lib/still/upscale-server';

export const runtime = 'nodejs';
export const maxDuration = 920;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/still/upscale');
}

/** POST { stillUrl, target: '2x' | '4k', comfyUrl? } → { url }: the still upscaled (SeedVR2). */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const stillUrl = typeof body.stillUrl === 'string' ? body.stillUrl.trim().slice(0, 2000) : '';
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  try {
    const url = await upscaleStill({
      stillUrl,
      target: body.target === '2x' ? '2x' : '4k',
      comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    if (error instanceof StillAlreadyLargeError || error instanceof MissingModelsError) {
      return apiError(error.message, 409);
    }
    return apiError(error instanceof Error ? error.message : 'Upscale failed.', 502);
  }
}
