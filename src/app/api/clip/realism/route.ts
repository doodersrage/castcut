import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { normalizeClipRealismStrength } from '@/lib/clip/realism';
import { makeClipRealistic } from '@/lib/clip/realism-server';
import { MissingModelsError } from '@/lib/server/heavy-graph-server';

export const runtime = 'nodejs';
// A 30-second clip is several WAN chunks of a few minutes each.
export const maxDuration = 3600;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/realism');
}

/**
 * POST { clipUrl, entryId?, strength?: 'light' | 'medium' | 'strong', comfyUrl? } → { url }: the
 * clip re-rendered at low strength on WAN 2.2 low-noise for real skin, water and detail.
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
  try {
    const url = await makeClipRealistic({
      clipUrl,
      entryId: typeof body.entryId === 'string' ? body.entryId.trim().slice(0, 200) : undefined,
      strength: normalizeClipRealismStrength(body.strength),
      comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    if (error instanceof MissingModelsError) return apiError(error.message, 424);
    return apiError(error instanceof Error ? error.message : 'Make more realistic failed.', 502);
  }
}
