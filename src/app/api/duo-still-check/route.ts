import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { countDuoStillInComfy } from '@/lib/duo-still-check-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/duo-still-check');
}

/**
 * Count faces, hands, bodies and limbs on a two-person intimate still (duo-still-check.ts).
 * Returns `available: false` with a reason when ComfyUI lacks a node or model, so the Two takes
 * ordering can switch itself off.
 */
export async function POST(request: Request) {
  let body: { imageUrl?: string; comfyUrl?: string } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) {
    return apiError('imageUrl is required.', 400);
  }
  try {
    const result = await countDuoStillInComfy({ imageUrl, comfyUrl: body.comfyUrl });
    return apiJson(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Duo still check failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
