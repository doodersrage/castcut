import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { parseLeadFaceProbe } from '@/lib/face-finish';
import { planFaceFinishInComfy, runFaceFinishInComfy } from '@/lib/face-finish-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/face-finish');
}

/**
 * Day Face finish: re-render the face of a finished still against the Cast face crop.
 * `available: false` + reason when the node packs or the still's engine don't fit.
 */
export async function POST(request: Request) {
  let body: {
    imageUrl?: string;
    faceUrl?: string;
    comfyUrl?: string;
    seed?: number;
    people?: number;
    /**
     * Only say which finisher (and main model) the still would get — no pass is queued. With
     * `faceUrl` the faces are probed too (a quick check) and the answer says whether to finish.
     */
    plan?: boolean;
    /** The plan's lead-face probe, handed back so the pass doesn't probe again. */
    probe?: unknown;
  } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError('JSON body is required.', 400);
  }
  const imageUrl = body.imageUrl?.trim();
  const faceUrl = body.faceUrl?.trim();
  if (body.plan === true && imageUrl) {
    try {
      return apiJson(
        await planFaceFinishInComfy({
          imageUrl,
          comfyUrl: body.comfyUrl,
          ...(faceUrl ? { faceUrl } : {}),
          people: typeof body.people === 'number' ? body.people : undefined,
        })
      );
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Face finish plan failed.', 502);
    }
  }
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
        people: typeof body.people === 'number' ? body.people : undefined,
        ...(body.probe !== undefined ? { probe: parseLeadFaceProbe(body.probe) } : {}),
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
