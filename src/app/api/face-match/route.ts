import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { measureFaceMatchInComfy } from '@/lib/face-match-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/face-match');
}

/**
 * Face-recognition similarity between a reference image and a finished still (ComfyUI
 * FaceAnalysis). `available: false` + reason when the node pack is missing.
 */
export async function POST(request: Request) {
  let body: { referenceUrl?: string; imageUrl?: string; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const referenceUrl = body.referenceUrl?.trim();
  const imageUrl = body.imageUrl?.trim();
  if (!referenceUrl || !imageUrl) {
    return apiError('referenceUrl and imageUrl are required.', 400);
  }
  try {
    return apiJson(
      await measureFaceMatchInComfy({ referenceUrl, imageUrl, comfyUrl: body.comfyUrl })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Face match failed.';
    // A still with no detectable face fails inside the node — the client treats 422 as "skip".
    const status = /not allowed|Invalid URL|allowlist/i.test(message)
      ? 400
      : /failed in ComfyUI/i.test(message)
        ? 422
        : 502;
    return apiError(message, status);
  }
}
