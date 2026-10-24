import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import {
  galleryProxyEncodeTier,
  calculateDynamicQuality,
  contentTypeForViewBytes,
  isAnimatedImageBytes,
  isHtmlVideoContentType,
  resolveComfyOutputMediaKind,
  shouldSkipGalleryThumbProxy,
} from '@/lib/comfyui/outputs';
// turbopackIgnore: true
import {
  buildViewCacheKey,
  contentTypeForViewFormat,
  negotiateViewFormat,
  readViewCache,
  writeViewCache,
  type ViewCacheFormat,
} from '@/lib/comfyui/view-cache';
import {
  normalizeComfyViewType,
  sanitizeComfyViewFilename,
  sanitizeComfyViewSubfolder,
} from '@/lib/server/url-safety';
import {
  keepComfyInputCopy,
  readComfyInputCopy,
  uploadComfyInputCopy,
} from '@/lib/comfyui/input-store-server';
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

async function encodeThumb(
  buffer: Buffer,
  thumbWidth: number,
  format: ViewCacheFormat
): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const tier = galleryProxyEncodeTier(thumbWidth);
  const dynamicQuality = calculateDynamicQuality(buffer, thumbWidth, format, tier);

  const pipeline = sharp(buffer).rotate().resize({
    width: thumbWidth,
    height: thumbWidth,
    fit: 'inside',
    withoutEnlargement: true,
  });

  if (format === 'avif') {
    return pipeline.avif({ quality: dynamicQuality }).toBuffer();
  }
  if (format === 'webp') {
    return pipeline.webp({ quality: dynamicQuality }).toBuffer();
  }
  return pipeline.jpeg({ quality: dynamicQuality, mozjpeg: true }).toBuffer();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  let filename: string;
  let subfolder: string;
  let type: 'output' | 'input' | 'temp';
  try {
    filename = sanitizeComfyViewFilename(searchParams.get('filename') ?? '');
    subfolder = sanitizeComfyViewSubfolder(searchParams.get('subfolder') ?? '');
    type = normalizeComfyViewType(searchParams.get('type')?.trim() || 'output');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid view parameters.', 400);
  }

  const thumbWidth = parseThumbWidth(searchParams.get('w'));

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  let comfyUrl: string;
  try {
    comfyUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const format = negotiateViewFormat(request.headers.get('accept'));

  // Range requests (video seeking/scrubbing) bypass the thumbnail cache and
  // are proxied straight through so the browser can stream/seek video.
  const rangeHeader = request.headers.get('range');
  if (rangeHeader) {
    const rangeViewUrl = new URL(`${comfyUrl}/view`);
    rangeViewUrl.searchParams.set('filename', filename);
    rangeViewUrl.searchParams.set('subfolder', subfolder);
    rangeViewUrl.searchParams.set('type', type);

    try {
      const rangeResponse = await fetch(rangeViewUrl.toString(), {
        signal: AbortSignal.timeout(15000),
        redirect: 'manual',
        headers: { range: rangeHeader },
      });

      if (!rangeResponse.ok && rangeResponse.status !== 206) {
        return apiError(`ComfyUI view returned HTTP ${rangeResponse.status}`, 502);
      }

      const rangeBuffer = Buffer.from(await rangeResponse.arrayBuffer());
      const rangeType = contentTypeForViewBytes(
        filename,
        rangeResponse.headers.get('content-type')
      );
      const passthroughHeaders: Record<string, string> = {
        'Content-Type': rangeType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'Accept-Ranges': 'bytes',
      };
      const contentRange = rangeResponse.headers.get('content-range');
      if (contentRange) {
        passthroughHeaders['Content-Range'] = contentRange;
      }

      return new NextResponse(new Uint8Array(rangeBuffer), {
        status: rangeResponse.status,
        headers: passthroughHeaders,
      });
    } catch (error) {
      return apiError(
        error instanceof Error ? error.message : 'Failed to fetch ComfyUI video',
        502
      );
    }
  }

  if (thumbWidth) {
    const cacheKey = buildViewCacheKey({
      comfyUrl,
      filename,
      subfolder,
      type,
      width: thumbWidth,
      format,
    });
    const cached = readViewCache(cacheKey, format);
    if (
      cached &&
      !shouldSkipGalleryThumbProxy(filename) &&
      !isHtmlVideoContentType(cached.contentType)
    ) {
      return new NextResponse(new Uint8Array(cached.buffer), {
        status: 200,
        headers: {
          'Content-Type': cached.contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'X-Image-Variant': 'thumb',
          'X-Image-Cache': 'hit',
        },
      });
    }
  }

  const viewUrl = new URL(`${comfyUrl}/view`);
  viewUrl.searchParams.set('filename', filename);
  viewUrl.searchParams.set('subfolder', subfolder);
  viewUrl.searchParams.set('type', type);

  try {
    const storeRef = { filename, subfolder, type };
    let response: Response | null = null;
    let fetchError: unknown = null;
    try {
      response = await fetch(viewUrl.toString(), {
        signal: AbortSignal.timeout(15000),
        redirect: 'manual',
      });
    } catch (error) {
      fetchError = error;
    }

    let buffer: Buffer;
    let upstreamType: string | null = null;
    if (response?.ok) {
      buffer = Buffer.from(await response.arrayBuffer());
      upstreamType = response.headers.get('content-type');
      // An upload from before the app kept its own copies: keep one now.
      if (type === 'input') keepComfyInputCopy(storeRef, new Uint8Array(buffer));
    } else {
      // ComfyUI lost it (new install, cleaned folder) or is down: show the app's copy, and put
      // it back into ComfyUI so the next job can load it.
      const copy = type === 'temp' ? null : readComfyInputCopy(storeRef);
      if (!copy) {
        if (fetchError) throw fetchError;
        return apiError(`ComfyUI view returned HTTP ${response?.status}`, 502);
      }
      buffer = Buffer.from(copy);
      if (response?.status === 404) {
        void uploadComfyInputCopy(comfyUrl, storeRef).catch(() => {});
      }
    }

    const contentType = contentTypeForViewBytes(filename, upstreamType, buffer);
    const isVideo = isHtmlVideoContentType(contentType);
    const isAnimatedImage = isAnimatedImageBytes(filename, buffer);
    const mediaKind = resolveComfyOutputMediaKind({ filename, format: contentType });
    const passthrough =
      isVideo ||
      isAnimatedImage ||
      mediaKind === 'audio' ||
      mediaKind === 'mesh' ||
      contentType.startsWith('audio/') ||
      contentType.startsWith('model/');
    if (!contentType.startsWith('image/') && !passthrough) {
      return apiError('ComfyUI view did not return a supported media file.', 502);
    }

    // Videos, animated gif/webp, audio, and meshes can't be resized by sharp.
    if (thumbWidth && !passthrough) {
      try {
        const resized = await encodeThumb(buffer, thumbWidth, format);
        const encodedType = contentTypeForViewFormat(format);
        const cacheKey = buildViewCacheKey({
          comfyUrl,
          filename,
          subfolder,
          type,
          width: thumbWidth,
          format,
        });
        writeViewCache(cacheKey, format, {
          buffer: resized,
          contentType: encodedType,
        });

        return new NextResponse(new Uint8Array(resized), {
          status: 200,
          headers: {
            'Content-Type': encodedType,
            'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
            'X-Image-Variant': 'thumb',
            'X-Image-Cache': 'miss',
          },
        });
      } catch {
        // Fall through to original bytes if resize fails.
      }
    }

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Image-Variant': 'original',
        ...(isVideo ? { 'Accept-Ranges': 'bytes' } : {}),
      },
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Failed to fetch ComfyUI image', 502);
  }
}

/**
 * Does ComfyUI have the file? Status and size only — checking a dressed plate was still there
 * used to download the whole picture (a GET) just to read the status.
 */
export async function HEAD(request: Request) {
  const { searchParams } = new URL(request.url);
  let filename: string;
  let subfolder: string;
  let type: 'output' | 'input' | 'temp';
  let comfyUrl: string;
  try {
    filename = sanitizeComfyViewFilename(searchParams.get('filename') ?? '');
    subfolder = sanitizeComfyViewSubfolder(searchParams.get('subfolder') ?? '');
    type = normalizeComfyViewType(searchParams.get('type')?.trim() || 'output');
    comfyUrl = getComfyUiBaseUrl(
      stripEmptyComfyUiRuntime({ apiUrl: searchParams.get('comfyUrl') ?? undefined })
    );
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const viewUrl = new URL(`${comfyUrl}/view`);
  viewUrl.searchParams.set('filename', filename);
  viewUrl.searchParams.set('subfolder', subfolder);
  viewUrl.searchParams.set('type', type);
  try {
    const response = await fetch(viewUrl.toString(), {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      redirect: 'manual',
    });
    const headers = new Headers({ 'Cache-Control': 'no-store' });
    if (response.status === 404 && type !== 'temp') {
      // The app kept a copy: put it back, and answer as ComfyUI will from now on.
      const storeRef = { filename, subfolder, type };
      const copy = readComfyInputCopy(storeRef);
      if (copy && (await uploadComfyInputCopy(comfyUrl, storeRef))) {
        headers.set('content-length', String(copy.byteLength));
        return new NextResponse(null, { status: 200, headers });
      }
    }
    for (const name of ['content-length', 'content-type']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new NextResponse(null, { status: response.ok ? 200 : response.status, headers });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET', 'HEAD'], '/api/comfyui/view');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
