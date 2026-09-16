import { NextResponse } from 'next/server';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import {
  contentTypeForViewBytes,
  isAnimatedImageBytes,
  isHtmlVideoContentType,
} from '@/lib/comfyui-outputs';
import { ensureLumaOutput } from '@/lib/luma-client';
import { sanitizeComfyViewFilename, sanitizeComfyViewSubfolder } from '@/lib/url-safety';

export const runtime = 'nodejs';
export const maxDuration = 60;

function parseThumbWidth(raw: string | null): number | null {
  if (!raw?.trim()) {
    return null;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.min(Math.floor(value), 2048);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  let filename: string;
  let subfolder: string;
  try {
    filename = sanitizeComfyViewFilename(searchParams.get('filename') ?? '');
    subfolder = sanitizeComfyViewSubfolder(searchParams.get('subfolder') ?? '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid view parameters.', 400);
  }

  try {
    const file = await ensureLumaOutput({
      promptId: searchParams.get('promptId')?.trim() || undefined,
      filename,
      subfolder,
    });
    if (!file) {
      return apiError('Luma video is not available yet.', 404);
    }

    const contentType = contentTypeForViewBytes(filename, file.mimeType, file.bytes);
    const isVideo = isHtmlVideoContentType(contentType);
    const thumbWidth = parseThumbWidth(searchParams.get('w'));
    if (thumbWidth && !isVideo && !isAnimatedImageBytes(filename, file.bytes)) {
      const sharp = (await import('sharp')).default;
      const resized = await sharp(file.bytes)
        .rotate()
        .resize({
          width: thumbWidth,
          height: thumbWidth,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      const body = new Uint8Array(resized.byteLength);
      body.set(resized);
      return new NextResponse(body, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    const body = new Uint8Array(file.bytes.byteLength);
    body.set(file.bytes);
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        ...(isVideo ? { 'Accept-Ranges': 'bytes' } : {}),
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Luma view failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/luma/view');
}
