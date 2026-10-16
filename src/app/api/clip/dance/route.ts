import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { danceToMusic } from '@/lib/music-dance-server';

export const runtime = 'nodejs';
export const maxDuration = 2800;

/** Under the app's 80 MB request cap. */
const MAX_MUSIC_BYTES = 60 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/clip/dance');
}

const text = (value: FormDataEntryValue | null, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/**
 * POST multipart { music (file), stillUrl, style, amplitude, start?, comfyUrl? } → { url }: the
 * still's person dancing to it (Wan-Dancer).
 */
export async function POST(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError('Expected a multipart form with a song.', 400);
  }
  const music = form.get('music');
  if (!(music instanceof Blob) || music.size === 0) return apiError('music is required.', 400);
  if (music.size > MAX_MUSIC_BYTES)
    return apiError('That song file is too large (60 MB at most).', 413);
  const stillUrl = text(form.get('stillUrl'), 2000);
  if (!stillUrl) return apiError('stillUrl is required.', 400);
  const start = Number(text(form.get('start'), 12));
  try {
    const url = await danceToMusic({
      music: new Uint8Array(await music.arrayBuffer()),
      stillUrl,
      style: text(form.get('style'), 20) || 'street',
      amplitude: text(form.get('amplitude'), 20) || 'medium',
      start: Number.isFinite(start) ? start : 0,
      comfyUrl: text(form.get('comfyUrl'), 300) || undefined,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    return apiJson({ url });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Dance to music failed.', 502);
  }
}
