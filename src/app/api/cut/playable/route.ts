import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { parseRangeHeader } from '@/lib/server/http-range';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * GET ?url=<a shot's clip URL> → the clip as a `<video>` can play it (cut-playable-server.ts):
 * an animated WebP / GIF as an MP4, anything else as it is. Range requests for seeking.
 */
export async function GET(request: Request) {
  const user = isAuthEnabled() ? resolveRequestUser(request) : null;
  if (isAuthEnabled() && !user?.enabled) return apiError('Authentication required.', 401);
  const url = new URL(request.url).searchParams.get('url')?.trim() ?? '';
  if (!url || url.startsWith('data:') || url.length > 4000) {
    return apiError('A clip url is required.', 400);
  }
  let clip: { buffer: Buffer; contentType: string };
  try {
    const { fetchFilmShotBytes } = await import('@/lib/video/shot-fetch');
    const { playableClip } = await import('@/lib/video/cut-playable-server');
    const fetched = await fetchFilmShotBytes({
      url,
      requestOrigin: new URL(request.url).origin,
      userId: user?.id ?? null,
    });
    clip = await playableClip({ buffer: fetched.buffer, contentType: fetched.contentType });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not read that clip.', 502);
  }
  const size = clip.buffer.byteLength;
  const headers: Record<string, string> = {
    'Content-Type': clip.contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  const range = parseRangeHeader(request.headers.get('range'), size);
  if (range) {
    return new NextResponse(new Uint8Array(clip.buffer.subarray(range.start, range.end + 1)), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(range.end - range.start + 1),
      },
    });
  }
  return new NextResponse(new Uint8Array(clip.buffer), {
    status: 200,
    headers: { ...headers, 'Content-Length': String(size) },
  });
}
