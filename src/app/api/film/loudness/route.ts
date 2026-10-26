import { apiError, apiJson, apiOptions } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { measureFilmLoudness } from '@/lib/film/loudness-server';

export const runtime = 'nodejs';
export const maxDuration = 240;

export async function OPTIONS() {
  return apiOptions('POST, OPTIONS');
}

/** A film's loudness (M4 F4): integrated LUFS, range and true peak, from ffmpeg's ebur128. */
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
  if (!url) return apiError('Include the film’s url.', 400);
  const entryId = typeof body.entryId === 'string' ? body.entryId.trim() : '';
  const result = await measureFilmLoudness({
    url,
    ...(entryId ? { entryId } : {}),
    userId: user?.id ?? null,
    requestOrigin: new URL(request.url).origin,
  });
  if (!result.ok) return apiError(result.error, result.status);
  return apiJson({ ok: true, loudness: result.loudness });
}
