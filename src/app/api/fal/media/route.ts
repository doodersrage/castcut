import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { uploadFalCdnFile } from '@/lib/cloud/fal-client';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_CLIP_BYTES = 90 * 1024 * 1024;

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/fal/media');
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return apiError('Clip file is required.', 400);
    }
    if (file.size > MAX_CLIP_BYTES) {
      return apiError('Clip must be 90MB or smaller to upload to Fal.', 400);
    }
    const mime = file.type?.trim() || 'video/mp4';
    if (!mime.startsWith('video/')) {
      return apiError('Fal clip upload needs a video file.', 400);
    }
    const apiKey =
      (typeof form.get('falApiKey') === 'string' && String(form.get('falApiKey')).trim()) ||
      undefined;
    const uploaded = await uploadFalCdnFile({
      bytes: Buffer.from(await file.arrayBuffer()),
      fileName: file.name?.trim() || 'clip.mp4',
      contentType: mime,
      apiKey,
    });
    if (!uploaded.ok || !uploaded.fileUrl) {
      return apiError(uploaded.error || 'Fal clip upload failed.', uploaded.status || 502);
    }
    return apiJson({ fileUrl: uploaded.fileUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fal clip upload failed.';
    return apiError(message, /required|empty|must be|90mb|video/i.test(message) ? 400 : 502);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
