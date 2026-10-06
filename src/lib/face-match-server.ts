/**
 * Server-only: face-recognition similarity between a reference (the Cast plate) and a finished
 * still, run in ComfyUI with cubiq's ComfyUI_FaceAnalysis pack.
 *
 * Graph: LoadImage ×2 → FaceAnalysisModels → FaceEmbedDistance (cosine) → PreviewAny, reading
 * the distance from PreviewAny's `text` UI output. Node inputs/outputs come from object_info, so
 * pack versions that renamed widgets still work; a missing pack reports `available: false`.
 */

import {
  castcutCanAnalyze,
  castcutFaceDistances,
  castcutRoutes,
} from '@/lib/castcut-routes-server';
import {
  comfyBaseUrl,
  fillComfyNodeInputs,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyImageRef,
  type ComfyNodeInfo,
} from '@/lib/comfy-utility-graph-server';
import {
  faceSimilarityFromDistance,
  isNoFaceDistance,
  parseFaceDistance,
  type FaceMatchResult,
} from '@/lib/face-match';

export type { FaceMatchResult };

/** The still has no detectable face (turned away, helmet, from behind) — skip, don't score 0. */
export class FaceMatchNoFaceError extends Error {
  constructor() {
    super('No face detected in the still.');
    this.name = 'FaceMatchNoFaceError';
  }
}

/** Index of the first output of `type` (e.g. FaceEmbedDistance's FLOAT distance). */
export function comfyOutputIndex(info: ComfyNodeInfo, type: string): number {
  return Math.max(
    0,
    (info.output ?? []).findIndex(output => output === type)
  );
}

/** First required socket name of a node — PreviewAny's only input (`source`). */
function firstInputName(info: ComfyNodeInfo): string | null {
  return Object.keys(info.input?.required ?? {})[0] ?? null;
}

/**
 * The Castcut pack's /castcut/analyze route: the same distance as the graph below, without
 * waiting for the render in progress. Null when the route is missing or fails (the graph runs).
 */
async function measureFaceMatchDirect(
  baseUrl: string,
  reference: ComfyImageRef,
  image: ComfyImageRef,
  timeoutMs?: number
): Promise<FaceMatchResult | null> {
  const routes = await castcutRoutes(baseUrl);
  if (!castcutCanAnalyze(routes, 'face-distance')) return null;
  let distances: number[] | null;
  try {
    distances = await castcutFaceDistances(baseUrl, {
      reference,
      images: [image],
      timeoutMs,
    });
  } catch (error) {
    console.warn('Castcut face check failed; queueing the face graph instead:', error);
    return null;
  }
  if (distances === null) {
    // As FaceEmbedDistance raises it.
    throw new Error('Face check failed in ComfyUI — No face detected in reference image.');
  }
  const value = distances[0];
  if (value === undefined) return null;
  if (isNoFaceDistance(value)) throw new FaceMatchNoFaceError();
  return {
    available: true,
    distance: value,
    metric: 'cosine',
    similarity: faceSimilarityFromDistance(value, 'cosine'),
  };
}

export async function measureFaceMatchInComfy(input: {
  referenceUrl: string;
  imageUrl: string;
  comfyUrl?: string;
  timeoutMs?: number;
}): Promise<FaceMatchResult> {
  const referenceRef = parseComfyViewRef(input.referenceUrl);
  const imageRef = parseComfyViewRef(input.imageUrl);
  if (!referenceRef || !imageRef) {
    return { available: false, reason: 'Reference or still is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const direct = await measureFaceMatchDirect(baseUrl, referenceRef, imageRef, input.timeoutMs);
  if (direct) return direct;
  const [models, distance, preview] = await Promise.all([
    resolveComfyNode(baseUrl, ['FaceAnalysisModels']),
    resolveComfyNode(baseUrl, ['FaceEmbedDistance']),
    resolveComfyNode(baseUrl, ['PreviewAny']),
  ]);
  if (!models || !distance) {
    return {
      available: false,
      reason: 'Face check needs ComfyUI_FaceAnalysis (cubiq) with insightface in ComfyUI.',
    };
  }
  const previewInput = preview ? firstInputName(preview.info) : null;
  if (!preview || !previewInput) {
    return { available: false, reason: 'Face check needs a newer ComfyUI (PreviewAny node).' };
  }
  const [referenceName, imageName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, referenceRef, 'face-check-ref'),
    stageComfyImageAsInput(baseUrl, imageRef, 'face-check'),
  ]);
  const distanceInputs = fillComfyNodeInputs(
    distance.info,
    { analysis_models: ['3', 0], reference: ['1', 0], image: ['2', 0] },
    { similarity_metric: 'cosine', generate_image_overlay: false }
  );
  const metric =
    typeof distanceInputs.similarity_metric === 'string'
      ? distanceInputs.similarity_metric
      : 'cosine';
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'face-check',
    priority: 'check',
    timeoutMs: input.timeoutMs,
    prompt: {
      '1': { class_type: 'LoadImage', inputs: { image: referenceName } },
      '2': { class_type: 'LoadImage', inputs: { image: imageName } },
      '3': { class_type: 'FaceAnalysisModels', inputs: fillComfyNodeInputs(models.info, {}) },
      '4': { class_type: 'FaceEmbedDistance', inputs: distanceInputs },
      '5': {
        class_type: 'PreviewAny',
        inputs: { [previewInput]: ['4', comfyOutputIndex(distance.info, 'FLOAT')] },
      },
    },
    read: entry => entry.outputs?.['5']?.text?.[0],
  });
  const value = run.result === undefined ? null : parseFaceDistance(run.result);
  if (value === null) {
    return { available: false, reason: 'FaceEmbedDistance returned no distance.' };
  }
  if (isNoFaceDistance(value)) {
    throw new FaceMatchNoFaceError();
  }
  return {
    available: true,
    distance: value,
    metric,
    similarity: faceSimilarityFromDistance(value, metric),
  };
}
