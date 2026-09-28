import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { runFaceFinishInComfy } from '@/lib/face-finish-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/face-finish');
}

/**
 * Day Face finish: re-render the face of a finished still against the Cast face crop.
 * `available: false` + reason when the node packs or the still's engine don't fit.
 */
export async function POST(request: Request) {
  let body: { imageUrl?: string; faceUrl?: string; comfyUrl?: string; seed?: number } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const imageUrl = body.imageUrl?.trim();
  const faceUrl = body.faceUrl?.trim();
  if (!imageUrl || !faceUrl) {
    return apiError('imageUrl and faceUrl are required.', 400);
  }
  try {
    return apiJson(
      await runFaceFinishInComfy({
        imageUrl,
        faceUrl,
        comfyUrl: body.comfyUrl,
        seed: typeof body.seed === 'number' ? body.seed : undefined,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Face finish failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message)
      ? 400
      : /failed in ComfyUI/i.test(message)
        ? 422
        : 502;
    return apiError(message, status);
  }
}
