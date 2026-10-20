import { apiError, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { isAllowedComfyModelFolder } from '@/lib/comfyui/models';
import { sanitizeComfyModelPreviewFilename } from '@/lib/comfyui/experiment-models';
import {
  clearModelPreviewMiss,
  hasCachedModelPreviewMiss,
  modelPreviewCacheKey,
  rememberModelPreviewMiss,
} from '@/lib/comfyui/model-preview-cache';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MISS_HEADERS = {
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
};

function missingPreviewResponse(): NextResponse {
  return new NextResponse(null, { status: 204, headers: MISS_HEADERS });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const folder = searchParams.get('folder')?.trim() || 'loras';
  const filename = sanitizeComfyModelPreviewFilename(searchParams.get('filename') ?? '');
  const pathIndexRaw = Number(searchParams.get('pathIndex') ?? '0');
  const pathIndex = Number.isFinite(pathIndexRaw) ? Math.max(0, Math.floor(pathIndexRaw)) : 0;

  if (!filename) {
    return apiError('filename is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime).replace(/\/+$/, '');
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  if (!(await isAllowedComfyModelFolder(folder, runtime))) {
    return apiError(`Unknown ComfyUI model folder "${folder}".`, 400);
  }

  const missKey = modelPreviewCacheKey({
    baseUrl,
    folder,
    pathIndex,
    filename,
  });
  if (hasCachedModelPreviewMiss(missKey)) {
    return missingPreviewResponse();
  }

  const encodedName = filename.split('/').map(encodeURIComponent).join('/');
  const url = `${baseUrl}/experiment/models/preview/${encodeURIComponent(folder)}/${pathIndex}/${encodedName}`;

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      redirect: 'manual',
    });
    if (!response.ok) {
      rememberModelPreviewMiss(missKey);
      return missingPreviewResponse();
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength < 32) {
      rememberModelPreviewMiss(missKey);
      return missingPreviewResponse();
    }
    clearModelPreviewMiss(missKey);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'image/webp',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    rememberModelPreviewMiss(missKey);
    return missingPreviewResponse();
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/model-preview');
}
