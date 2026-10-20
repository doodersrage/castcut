import { apiError, apiJson } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import {
  buildComfyHistoryDeletePayload,
  deleteComfyUiHistoryItems,
  listComfyUiHistoryImports,
} from '@/lib/comfyui/status';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Number(searchParams.get('limit') ?? '40');
  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  try {
    const items = await listComfyUiHistoryImports(
      runtime,
      Number.isFinite(limit) ? Math.min(80, Math.max(1, limit)) : 40
    );
    return apiJson({ items, count: items.length, comfyUrl: items[0]?.comfyUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ComfyUI history import failed.';
    const status = /not allowed|Invalid URL|URL is required|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}

export async function POST(request: Request) {
  let body: { comfyUrl?: string; promptIds?: string[]; delete?: string[] } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const promptIds = [
    ...(Array.isArray(body.promptIds) ? body.promptIds : []),
    ...(Array.isArray(body.delete) ? body.delete : []),
  ];
  const payload = buildComfyHistoryDeletePayload(promptIds);
  if (payload.delete.length === 0) {
    return apiError('promptIds are required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const ok = await deleteComfyUiHistoryItems(baseUrl, payload.delete);
  if (!ok) {
    return apiError('ComfyUI history delete failed.', 502);
  }
  return apiJson({ ok: true, deleted: payload.delete.length });
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
