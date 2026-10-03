import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { comfyBaseUrl } from '@/lib/comfy-utility-graph-server';
import { fetchComfyEngineState } from '@/lib/comfy-warm-up-server';

export const runtime = 'nodejs';

/**
 * What ComfyUI is doing, for the app's model-aware queue: running and waiting jobs with the
 * main model each loads, the model that ran last, and VRAM.
 */
export async function GET(request: Request) {
  const comfyUrl = new URL(request.url).searchParams.get('comfyUrl')?.trim() || undefined;
  let baseUrl: string;
  try {
    baseUrl = comfyBaseUrl(comfyUrl);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  try {
    return apiJson(await fetchComfyEngineState(baseUrl));
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'ComfyUI state failed.', 502);
  }
}

export async function POST() {
  return apiMethodNotAllowed(['GET'], '/api/comfyui/engine-state');
}
