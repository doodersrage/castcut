import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { detectPeopleInComfyStill, detectPoseInComfyStill } from '@/lib/pose/detect-server';
import { readVisionPosture } from '@/lib/pose/vision-posture-server';
import { parseLlmRequestOptions, type LlmRequestBody } from '@/lib/llm/request-options';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/pose-detect');
}

/**
 * Detect the body pose in a finished ComfyUI still (DWPose). Returns `available: false` with a
 * reason when the detector node pack is missing, so the Day pose check can switch itself off.
 * `perPerson: true` reads each person on their own (two-person stills, pose-person-reads.ts).
 * `posture: true` also asks the vision model for the posture (vision-posture.ts), in parallel.
 */
export async function POST(request: Request) {
  let body: {
    imageUrl?: string;
    comfyUrl?: string;
    perPerson?: boolean;
    posture?: boolean;
  } & LlmRequestBody = {};
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
    const detect = body.perPerson === true ? detectPeopleInComfyStill : detectPoseInComfyStill;
    const [result, posture] = await Promise.all([
      detect({ imageUrl, comfyUrl: body.comfyUrl }),
      body.posture === true
        ? readVisionPosture({
            imageUrl,
            comfyUrl: body.comfyUrl,
            llm: parseLlmRequestOptions(body),
          })
        : Promise.resolve(undefined),
    ]);
    return apiJson(result.available && posture !== undefined ? { ...result, posture } : result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pose detection failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
