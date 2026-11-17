import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { cutShotFromMaster } from '@/lib/day/scene-master-server';

export const runtime = 'nodejs';
export const maxDuration = 900;

export function GET() {
  return apiMethodNotAllowed(['POST'], '/api/scene-master');
}

/**
 * POST { masterUrl, masterEntryId?, who: both|lead|partner, shot: waist|head, comfyUrl? } →
 * { available, image?, reason? }: a shot cut from its scene's master, its detail back.
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
  const masterUrl = typeof body.masterUrl === 'string' ? body.masterUrl.trim().slice(0, 2000) : '';
  const who =
    body.who === 'lead' || body.who === 'partner' || body.who === 'both' ? body.who : null;
  const shot = body.shot === 'head' || body.shot === 'waist' ? body.shot : null;
  if (!masterUrl || !who || !shot) return apiError('masterUrl, who and shot are required.', 400);
  const result = await cutShotFromMaster({
    masterUrl,
    masterEntryId:
      typeof body.masterEntryId === 'string' ? body.masterEntryId.trim().slice(0, 200) : undefined,
    cut: { who, shot },
    comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
    userId: user?.id ?? null,
    requestOrigin: new URL(request.url).origin,
  });
  return apiJson(result);
}
