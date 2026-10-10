import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { dubClipWithVoice } from '@/lib/clip-dub-server';

export const runtime = 'nodejs';
export const maxDuration = 280;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip-voice');
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** POST { clipUrl, scene, line?, heat?, lead?, comfyUrl? } → { url }: the clip with a soundtrack. */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const clipUrl = text(body.clipUrl, 2000);
  if (!clipUrl) return apiError('clipUrl is required.', 400);
  const heat = ['flirty', 'sensual', 'explicit'].includes(String(body.heat))
    ? (body.heat as 'flirty' | 'sensual' | 'explicit')
    : 'clean';
  try {
    const url = await dubClipWithVoice({
      clipUrl,
      scene: text(body.scene, 600) || 'Two people together',
      line: text(body.line, 200) || undefined,
      heat,
      lead: body.lead === 'man' ? 'man' : 'woman',
      comfyUrl: text(body.comfyUrl, 300) || undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Add voice failed.', 502);
  }
}
