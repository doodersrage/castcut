import { fetchComfyUiHistoryWorkflow, workflowLookupResult } from '@/lib/comfyui/history-workflow';
import { readSubmittedGraph } from '@/lib/sqlite/submitted-graphs';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const promptId = searchParams.get('promptId')?.trim() ?? '';

  if (!promptId) {
    return apiError('promptId is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({
    apiUrl: searchParams.get('comfyUrl') ?? undefined,
  });

  // The graph as Castcut submitted it (M7 T4), when it kept one: on any device, and after
  // ComfyUI restarts. Else ComfyUI's own history.
  try {
    const kept = readSubmittedGraph(promptId);
    if (kept) {
      return apiJson(workflowLookupResult(promptId, kept.comfyUrl ?? '', kept.graph, 'castcut'));
    }
  } catch {
    // the store is best-effort: fall back to ComfyUI
  }

  try {
    const result = await fetchComfyUiHistoryWorkflow(promptId, runtime);
    if (!result.ok) {
      const status = /not found|No workflow/i.test(result.error ?? '')
        ? 404
        : /Invalid URL|not allowed|allowlist/i.test(result.error ?? '')
          ? 400
          : 502;
      return apiError(result.error ?? 'Workflow lookup failed.', status);
    }

    return apiJson(result);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : 'ComfyUI workflow lookup failed.',
      502
    );
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/history/workflow');
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
