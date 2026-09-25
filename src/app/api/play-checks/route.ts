import { apiError, apiJson } from '@/lib/api/response';
import { probePlayChecksReadiness } from '@/lib/play-checks-readiness-server';

export const runtime = 'nodejs';

/** Which Play checks / Cut extras this setup supports (DWPose, FaceAnalysis, ffmpeg titles). */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const comfyUrl = params.get('comfyUrl')?.trim() || undefined;
  const sessionVisionModel = params.get('visionModel')?.trim().slice(0, 200) || undefined;
  try {
    return apiJson(await probePlayChecksReadiness(comfyUrl, { sessionVisionModel }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Readiness check failed.';
    return apiError(message, /not allowed|Invalid URL|allowlist/i.test(message) ? 400 : 502);
  }
}
