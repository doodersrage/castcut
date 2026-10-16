import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { RELIGHT_LOOKS } from '@/lib/relight';
import { relightStill, RelightUnavailableError } from '@/lib/relight-server';

export const runtime = 'nodejs';
export const maxDuration = 320;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/still/relight');
}

/** POST { stillUrl, look (a RELIGHT_LOOKS id or words), comfyUrl? } → { url }: the still re-lit. */
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
  const look = typeof body.look === 'string' ? body.look.trim().slice(0, 200) : '';
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  if (!look)
    return apiError(`look is required (${RELIGHT_LOOKS.map(entry => entry.id).join(', ')}).`, 400);
  try {
    const url = await relightStill({
      stillUrl,
      look,
      comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl.trim().slice(0, 300) : undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    if (error instanceof RelightUnavailableError) return apiError(error.message, 409);
    return apiError(error instanceof Error ? error.message : 'Relight failed.', 502);
  }
}
