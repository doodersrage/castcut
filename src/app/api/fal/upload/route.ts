import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseEngineUploadRequest } from '@/lib/engine/upload-parse';
import { storeFalUpload } from '@/lib/cloud/fal-client';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/fal/upload');
}

export async function POST(request: Request) {
  try {
    const incoming = await parseEngineUploadRequest(request);
    const buffer = Buffer.from(await incoming.file.arrayBuffer());
    const stored = storeFalUpload({
      filename: incoming.file.name,
      bytes: buffer,
      mimeType: incoming.file.type || 'image/png',
    });
    return apiJson({
      name: stored.name,
      subfolder: stored.subfolder,
      type: stored.type,
      engineUrl: 'https://queue.fal.run',
      comfyUrl: 'https://queue.fal.run',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Fal upload failed.';
    const status = /required|empty|must be|too large|12mb|invalid/i.test(message) ? 400 : 502;
    return apiError(message, status);
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
