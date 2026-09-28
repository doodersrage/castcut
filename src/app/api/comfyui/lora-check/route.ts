import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { runLoraCheckRender } from '@/lib/lora-check-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/comfyui/lora-check');
}

/**
 * One "Check on Cast" render: replay a Day still with a LoRA at one strength (0 = without it)
 * and return the image plus its face similarity to the Cast plate.
 */
export async function POST(request: Request) {
  let body: {
    stillUrl?: string;
    referenceUrl?: string;
    loraFilename?: string;
    strength?: number;
    comfyUrl?: string;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const stillUrl = body.stillUrl?.trim();
  const referenceUrl = body.referenceUrl?.trim();
  const loraFilename = body.loraFilename?.trim();
  const strength = body.strength;
  if (
    !stillUrl ||
    !referenceUrl ||
    !loraFilename ||
    typeof strength !== 'number' ||
    !Number.isFinite(strength) ||
    strength < 0 ||
    strength > 2
  ) {
    return apiError('stillUrl, referenceUrl, loraFilename and strength (0–2) are required.', 400);
  }
  try {
    return apiJson(
      await runLoraCheckRender({
        stillUrl,
        referenceUrl,
        loraFilename,
        strength,
        comfyUrl: body.comfyUrl,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'LoRA check failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message)
      ? 400
      : /failed in ComfyUI/i.test(message)
        ? 422
        : 502;
    return apiError(message, status);
  }
}
