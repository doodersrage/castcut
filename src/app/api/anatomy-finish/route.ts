import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { runAnatomyFinishInComfy } from '@/lib/anatomy-finish-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/anatomy-finish');
}

/**
 * Anatomy finish: re-render the crotch of a finished nude still with the anatomy LoRA and blend
 * it back (anatomy-finish.ts). `available: false` + reason when the LoRA, Turbo or DWPose is
 * missing, or her hips are not found.
 */
export async function POST(request: Request) {
  let body: { imageUrl?: string; comfyUrl?: string; seed?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return apiError('imageUrl is required.', 400);
  try {
    return apiJson(
      await runAnatomyFinishInComfy({
        imageUrl,
        comfyUrl: body.comfyUrl,
        seed: typeof body.seed === 'number' ? body.seed : undefined,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Anatomy finish failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message)
      ? 400
      : /failed in ComfyUI/i.test(message)
        ? 422
        : 502;
    return apiError(message, status);
  }
}
