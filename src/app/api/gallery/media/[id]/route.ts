import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { resolveRequestUser } from '@/lib/auth/access';
import { isAuthEnabled } from '@/lib/auth/store';
import { contentTypeForViewBytes, isHtmlVideoContentType } from '@/lib/comfyui/outputs';
import { readGalleryOriginalFile, readGalleryThumbFile } from '@/lib/gallery/media-store';
import { parseRangeHeader } from '@/lib/server/http-range';
import { isServerStorageEnabled } from '@/lib/storage/server-storage';

export const runtime = 'nodejs';

function resolveMediaUserId(request: Request): string | null {
  if (!isAuthEnabled()) {
    return null;
  }
  const user = resolveRequestUser(request);
  if (!user?.enabled) {
    return null;
  }
  return user.id;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isServerStorageEnabled()) {
    return apiError('Server storage is disabled.', 404);
  }
  const userId = resolveMediaUserId(request);
  if (isAuthEnabled() && !userId) {
    return apiError('Sign in required.', 401);
  }
  const { id } = await context.params;
  const searchParams = new URL(request.url).searchParams;
  const variant = searchParams.get('variant')?.trim() || 'thumb';
  const rawIndex = Number(searchParams.get('index'));
  const index = Number.isInteger(rawIndex) && rawIndex >= 0 ? rawIndex : undefined;
  try {
    if (variant === 'original') {
      const original = readGalleryOriginalFile({ userId, entryId: id, index });
      if (original) {
        const filename = original.filename?.replace(/[\r\n"]+/g, '') || 'original';
        const contentType = contentTypeForViewBytes(
          filename,
          original.contentType,
          original.buffer
        );
        const size = original.buffer.byteLength;
        const baseHeaders: Record<string, string> = {
          'Content-Type': contentType,
          'Content-Disposition': `inline; filename="${filename}"`,
          'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
        };

        // `<video>` needs Accept-Ranges advertised (and Range honored) to
        // seek/scrub — the live ComfyUI proxy already supports this; durable
        // originals need the same so playback doesn't regress once a video
        // is persisted locally.
        if (isHtmlVideoContentType(contentType) || contentType.startsWith('audio/')) {
          baseHeaders['Accept-Ranges'] = 'bytes';
          const range = parseRangeHeader(request.headers.get('range'), size);
          if (range) {
            const chunk = original.buffer.subarray(range.start, range.end + 1);
            return new NextResponse(new Uint8Array(chunk), {
              status: 206,
              headers: {
                ...baseHeaders,
                'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
                'Content-Length': String(chunk.byteLength),
              },
            });
          }
        }

        return new NextResponse(new Uint8Array(original.buffer), {
          status: 200,
          headers: baseHeaders,
        });
      }
    }
    const file = readGalleryThumbFile({ userId, entryId: id, index });
    if (!file) {
      return apiError('Durable thumb not found.', 404);
    }
    return new NextResponse(new Uint8Array(file.buffer), {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid gallery id.', 400);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/gallery/media/[id]');
}
