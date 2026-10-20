import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseEngineUploadRequest } from '@/lib/engine/upload-parse';
import { storeReplicateUpload } from '@/lib/cloud/replicate-client';
import { REPLICATE_API_HOST } from '@/lib/engine/capabilities';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/replicate/upload');
}

export async function POST(request: Request) {
  try {
    const incoming = await parseEngineUploadRequest(request);
    const buffer = Buffer.from(await incoming.file.arrayBuffer());
    const stored = storeReplicateUpload({
      bytes: buffer,
      mimeType: incoming.file.type || 'image/png',
    });
    return apiJson({
      name: stored.name,
      subfolder: stored.subfolder,
      type: stored.type,
      engineUrl: REPLICATE_API_HOST,
      comfyUrl: REPLICATE_API_HOST,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Replicate upload failed.';
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
