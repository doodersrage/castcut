import { getDiffusersBaseUrl } from '@/lib/engine/diffusers-client';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import {
  contentTypeForViewBytes,
  isAnimatedImageBytes,
  isHtmlVideoContentType,
} from '@/lib/comfyui/outputs';
import {
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
  normalizeComfyViewType,
} from '@/lib/server/url-safety';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
  let type: string;
  try {
    filename = sanitizeComfyViewFilename(searchParams.get('filename') ?? '');
    subfolder = sanitizeComfyViewSubfolder(searchParams.get('subfolder') ?? '');
    type = normalizeComfyViewType(searchParams.get('type') ?? 'output');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid view parameters.', 400);
  }

  const engineUrlHint =
    searchParams.get('engineUrl')?.trim() || searchParams.get('comfyUrl')?.trim() || undefined;

  let engineUrl: string;
  try {
    engineUrl = getDiffusersBaseUrl(engineUrlHint);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid Diffusers URL.', 400);
  }

  const upstream = new URL(`${engineUrl}/v1/view`);
  upstream.searchParams.set('filename', filename);
  upstream.searchParams.set('subfolder', subfolder);
  upstream.searchParams.set('type', type);

  try {
    const response = await fetch(upstream.toString(), {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const text = await response.text();
      return apiError(text || `Diffusers view returned HTTP ${response.status}`, 502);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = contentTypeForViewBytes(
      filename,
      response.headers.get('Content-Type'),
      buffer
    );
    const isVideo = isHtmlVideoContentType(contentType);
    const thumbWidth = parseThumbWidth(searchParams.get('w'));

    if (thumbWidth && !isVideo && !isAnimatedImageBytes(filename, buffer)) {
      const sharp = (await import('sharp')).default;
      const resized = await sharp(buffer)
        .rotate()
        .resize({
          width: thumbWidth,
          height: thumbWidth,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png()
        .toBuffer();
      return new NextResponse(new Uint8Array(resized), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
        ...(isVideo ? { 'Accept-Ranges': 'bytes' } : {}),
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Diffusers view failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/diffusers/view');
}
