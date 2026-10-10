import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { CAST_VOICE_AUDITION_COUNT } from '@/lib/cast-voice';
import { renderVoiceAudition } from '@/lib/cast-voice-audition-server';

export const runtime = 'nodejs';
export const maxDuration = 280;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/cast-voice/audition');
}

/** POST { plateUrl, name, lead, index, comfyUrl? } → { url }: one voice audition clip (MP4). */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return apiError('Invalid JSON body.', 400);
  }
  const plateUrl = typeof body.plateUrl === 'string' ? body.plateUrl.trim() : '';
  if (!plateUrl) return apiError('This Cast has no picture to audition with.', 400);
  const index = Number(body.index);
  try {
    const url = await renderVoiceAudition({
      plateUrl,
      name: typeof body.name === 'string' ? body.name.slice(0, 40) : '',
      lead: body.lead === 'man' ? 'man' : 'woman',
      index: Number.isInteger(index) ? Math.abs(index) % CAST_VOICE_AUDITION_COUNT : 0,
      comfyUrl: typeof body.comfyUrl === 'string' ? body.comfyUrl : undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'The audition did not render.', 502);
  }
}
