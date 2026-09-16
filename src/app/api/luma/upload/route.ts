import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseEngineUploadRequest } from '@/lib/engine-upload-parse';
import { getLumaUpload, storeLumaUpload } from '@/lib/luma-client';
import { LUMA_API_HOST } from '@/lib/engine/capabilities';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const filename = new URL(request.url).searchParams.get('filename')?.trim();
  if (!filename) {
    return apiMethodNotAllowed(['POST'], '/api/luma/upload');
  }

  const file = getLumaUpload(filename);
  if (!file) {
    return apiError('Luma reference image expired. Upload it again, then queue.', 404);
  }

  const body = new Uint8Array(file.bytes.byteLength);
  body.set(file.bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': file.mimeType,
      'Cache-Control': 'private, max-age=1800',
    },
  });
}

export async function POST(request: Request) {
  try {
    const incoming = await parseEngineUploadRequest(request);
    const buffer = Buffer.from(await incoming.file.arrayBuffer());
    const stored = storeLumaUpload({
      bytes: buffer,
      mimeType: incoming.file.type || 'image/png',
    });
    return apiJson({
      name: stored.name,
      subfolder: stored.subfolder,
      type: stored.type,
      engineUrl: LUMA_API_HOST,
      comfyUrl: LUMA_API_HOST,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Luma upload failed.';
    const status = /required|empty|must be|too large|12mb|invalid/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
