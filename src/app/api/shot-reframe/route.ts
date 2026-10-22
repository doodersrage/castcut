import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { reframeStillInComfy } from '@/lib/pose/shot-reframe-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/shot-reframe');
}

/**
 * A picked waist-up or head-and-shoulders shot: cut the finished still to it around her face
 * (shot-reframe.ts). `available: false` + reason when the still asks for no such shot, shows no
 * face, or is already that close — the still is then kept as it is. `plan: true` only answers.
 */
export async function POST(request: Request) {
  let body: { imageUrl?: string; comfyUrl?: string; plan?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const imageUrl = body.imageUrl?.trim();
  if (!imageUrl) return apiError('imageUrl is required.', 400);
  try {
    return apiJson(
      await reframeStillInComfy({
        imageUrl,
        comfyUrl: body.comfyUrl,
        plan: body.plan === true,
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Shot reframe failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message)
      ? 400
      : /failed in ComfyUI/i.test(message)
        ? 422
        : 502;
    return apiError(message, status);
  }
}
