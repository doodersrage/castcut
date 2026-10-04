import { fetchComfyObjectInfoPayload } from '@/lib/comfyui-object-info';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui-config';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });
  const forceRefresh = searchParams.get('forceRefresh') === '1';

  try {
    const payload = await fetchComfyObjectInfoPayload(runtime, { forceRefresh });
    if (!payload) {
      return apiJson(comfyOfflineBody('ComfyUI object_info returned no data.'));
    }
    return apiJson({
      ok: true,
      models: payload.models,
      nodeTypes: [...payload.nodeTypes],
      supportsNeuralUpscaleTileSize: payload.supportsNeuralUpscaleTileSize,
      webpSaveAdapters: payload.webpSaveAdapters,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ComfyUI object_info check failed.';
    if (/not allowed|Invalid URL|URL is required|allowlist/i.test(message)) {
      return apiError(message, 400);
    }
    return apiJson(comfyOfflineBody(message));
  }
}

/**
 * ComfyUI down is a state every page polls for, not a failed request: a 502 here put a console
 * error on every page load of an install whose ComfyUI is off. Callers read "no `models`" as
 * offline, as they did a non-OK answer.
 */
function comfyOfflineBody(error: string) {
  return { ok: false, offline: true, error };
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/object-info');
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
