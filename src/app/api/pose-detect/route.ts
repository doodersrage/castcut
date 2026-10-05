import { apiError, apiJson, apiMethodNotAllowed } from '@/lib/api/response';
import { detectPeopleInComfyStill, detectPoseInComfyStill } from '@/lib/pose-detect-server';

export const runtime = 'nodejs';

export async function GET() {
  return apiMethodNotAllowed(['POST'], '/api/pose-detect');
}

/**
 * Detect the body pose in a finished ComfyUI still (DWPose). Returns `available: false` with a
 * reason when the detector node pack is missing, so the Day pose check can switch itself off.
 * `perPerson: true` reads each person on their own (two-person stills, pose-person-reads.ts).
 */
export async function POST(request: Request) {
  let body: { imageUrl?: string; comfyUrl?: string; perPerson?: boolean } = {};
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
    const result = await detect({ imageUrl, comfyUrl: body.comfyUrl });
    return apiJson(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Pose detection failed.';
    const status = /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502;
    return apiError(message, status);
  }
}
