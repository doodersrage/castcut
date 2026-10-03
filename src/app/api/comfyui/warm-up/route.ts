import { after } from 'next/server';
import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { comfyBaseUrl } from '@/lib/comfy-utility-graph-server';
import { cleanUpWarmUp, runEngineWarmUp } from '@/lib/comfy-warm-up-server';

export const runtime = 'nodejs';
/** The history clean-up waits for the warm-up to finish. */
export const maxDuration = 300;

/**
 * `{ models: string[], comfyUrl? }` — pre-load a tool's engine on an idle ComfyUI (Settings →
 * ComfyUI → "Warm up the engine when I open a tool"). `{ queued: false, reason }` when skipped.
 */
export async function POST(request: Request) {
  let body: { models?: unknown; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const models = Array.isArray(body.models)
    ? body.models.filter((model): model is string => typeof model === 'string' && !!model.trim())
    : [];
  if (models.length === 0) {
    return apiError('models is required.', 400);
  }
  let baseUrl: string;
  try {
    baseUrl = comfyBaseUrl(body.comfyUrl?.trim() || undefined);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Invalid ComfyUI URL.', 400);
  }
  try {
    const result = await runEngineWarmUp({ baseUrl, models });
    if (result.queued) {
      after(() => cleanUpWarmUp(baseUrl, result.promptId, result.modelKey));
    }
    return apiJson(result);
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Warm-up failed.', 502);
  }
}

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/warm-up');
}
