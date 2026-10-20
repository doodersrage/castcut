import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { cancelComfyUiJobOnHost } from '@/lib/comfyui/job-cancel';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { comfyUrl?: string; promptId?: string; deleteHistory?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const promptId = body.promptId?.trim();
  if (!promptId) {
    return apiError('promptId is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const result = await cancelComfyUiJobOnHost({
    baseUrl,
    promptId,
    deleteHistory: body.deleteHistory !== false,
  });
  if (!result.ok) {
    return apiError(result.error ?? 'ComfyUI cancel failed.', 502);
  }
  return apiJson({ ok: true });
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/cancel');
}
