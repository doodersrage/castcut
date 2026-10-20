import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { getComfyUiBaseUrl } from '@/lib/comfyui/client';
import { stripEmptyComfyUiRuntime } from '@/lib/comfyui/config';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const runtime = stripEmptyComfyUiRuntime({ apiUrl: body.comfyUrl });
  let baseUrl: string;
  try {
    baseUrl = getComfyUiBaseUrl(runtime);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }

  try {
    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    });
    if (!response.ok) {
      return apiError(`ComfyUI free failed: HTTP ${response.status}`, 502);
    }
    return apiJson({ ok: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI free failed.', 502);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/free');
}
