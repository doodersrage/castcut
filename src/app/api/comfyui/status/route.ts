import { watchedPromptStatus } from '@/lib/server/run-watcher-server';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const promptId = searchParams.get('promptId')?.trim();

  if (!promptId) {
    return apiError('promptId query parameter is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  try {
    // As the server's run watch has it: a job queued again answers as the job it is now.
    const status = await watchedPromptStatus(promptId, runtime);
    return apiJson(status);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ComfyUI status check failed.';
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/status');
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
