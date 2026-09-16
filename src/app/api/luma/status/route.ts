import { NextResponse } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { fetchLumaJobStatus } from '@/lib/luma-client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const promptId = searchParams.get('promptId')?.trim();
  if (!promptId) {
    return apiError('promptId query parameter is required.', 400);
  }

  const status = await fetchLumaJobStatus(promptId);
  if (!status) {
    return apiError('Luma status check failed.', 502);
  }

  return apiJson({
    promptId: status.promptId,
    status: status.status,
    statusMessage: status.statusMessage,
    engineUrl: status.engineUrl,
    comfyUrl: status.engineUrl,
    engineId: 'luma',
    images: status.images,
    progressValue: status.progressValue,
    progressMax: status.progressMax,
    queuePosition: status.queuePosition ?? null,
  });
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/luma/status');
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
