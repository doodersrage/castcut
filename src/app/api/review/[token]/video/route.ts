import { NextResponse } from 'next/server';
import { apiError } from '@/lib/api/response';
import { contentTypeForViewBytes } from '@/lib/comfyui-outputs';
import { liveFilmReview } from '@/lib/film-review-store';
import { readGalleryOriginalFile } from '@/lib/gallery-media-store';
import { parseRangeHeader } from '@/lib/http-range';

export const runtime = 'nodejs';

/** Public: the one film a live review link was made for (Range for seeking). */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const review = liveFilmReview(token);
  if (!review) return apiError('This review link has expired or was stopped.', 404);
  const file = readGalleryOriginalFile({ userId: review.ownerId, entryId: review.entryId });
  if (!file) return apiError('The film is no longer on the server.', 404);
  const contentType = contentTypeForViewBytes(
    file.filename ?? 'film.mp4',
    file.contentType,
    file.buffer
  );
  const size = file.buffer.byteLength;
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
  };
  const range = parseRangeHeader(request.headers.get('range'), size);
  if (range) {
    const chunk = file.buffer.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...headers,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(chunk.byteLength),
      },
    });
  }
  return new NextResponse(new Uint8Array(file.buffer), { status: 200, headers });
}
