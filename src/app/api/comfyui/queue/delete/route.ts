import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';
import { buildComfyQueueDeletePayload } from '@/lib/comfyui/queue-control';

export const runtime = 'nodejs';

type QueueDeleteRequestBody = {
  comfyUrl?: string;
  promptId?: string;
  clear?: boolean;
};

export async function POST(request: Request) {
  let body: QueueDeleteRequestBody = {};
  try {
    body = (await request.json()) as QueueDeleteRequestBody;
  } catch {
    body = {};
  }

  const promptId = body.promptId?.trim();
  if (!promptId && !body.clear) {
    return apiError('promptId (or clear) is required.', 400);
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  const payload = buildComfyQueueDeletePayload({ promptId, clear: body.clear });

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/queue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return apiError(`ComfyUI queue delete failed: HTTP ${response.status}`, 502);
    }
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI queue delete failed.', 502);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/queue/delete');
}
