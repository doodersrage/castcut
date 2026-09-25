/**
 * Server-only: probe ComfyUI (object_info) and the local ffmpeg for Play's optional checks.
 */

import { comfyBaseUrl, resolveComfyNode } from '@/lib/comfy-utility-graph-server';
import {
  ffmpegHasDrawtext,
  resolveFfmpegBinary,
  resolveFilmFontFile,
} from '@/lib/film-server-encode';
import { buildPlayChecksReadiness, type PlayChecksReadiness } from '@/lib/play-checks-readiness';

async function comfyReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/system_stats`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function probePlayChecksReadiness(comfyUrl?: string): Promise<PlayChecksReadiness> {
  const baseUrl = comfyBaseUrl(comfyUrl);
  const reachable = await comfyReachable(baseUrl);
  const [pose, models, distance, previewAny] = reachable
    ? await Promise.all([
        resolveComfyNode(baseUrl, ['DWPreprocessor', 'OpenposePreprocessor'], { fresh: true }),
        resolveComfyNode(baseUrl, ['FaceAnalysisModels'], { fresh: true }),
        resolveComfyNode(baseUrl, ['FaceEmbedDistance'], { fresh: true }),
        resolveComfyNode(baseUrl, ['PreviewAny'], { fresh: true }),
      ])
    : [null, null, null, null];
  const ffmpeg = await resolveFfmpegBinary();
  const drawtext = ffmpeg ? await ffmpegHasDrawtext(ffmpeg) : false;
  const font = drawtext ? Boolean(await resolveFilmFontFile()) : false;
  return buildPlayChecksReadiness({
    comfyReachable: reachable,
    poseNode: pose?.node ?? null,
    faceNodes: {
      models: Boolean(models),
      distance: Boolean(distance),
      previewAny: Boolean(previewAny),
    },
    ffmpeg: { available: Boolean(ffmpeg), drawtext, font },
  });
}
