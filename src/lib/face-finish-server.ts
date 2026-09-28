/**
 * Server-only: run the Day Face finish pass (see face-finish.ts) in ComfyUI and return the
 * finished image as a ComfyUI view ref.
 */

import {
  comfyBaseUrl,
  parseComfyViewRef,
  resolveComfyNode,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyImageRef,
} from '@/lib/comfy-utility-graph-server';
import {
  buildFaceFinishGraph,
  FACE_FINISH_SAVE_NODE,
  readStillCheckpoint,
  resolveFaceFinisher,
  type FaceFinisher,
} from '@/lib/face-finish';
import { parseTextChunks } from '@/lib/png-metadata';

export type FaceFinishResult =
  | { available: true; image: ComfyImageRef; finisher: FaceFinisher['kind'] }
  | { available: false; reason: string };

async function readStillGraph(baseUrl: string, ref: ComfyImageRef): Promise<unknown> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  const response = await fetch(`${baseUrl}/view?${params.toString()}`, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) return null;
  const chunks = parseTextChunks(await response.arrayBuffer());
  try {
    return chunks.prompt ? JSON.parse(chunks.prompt) : null;
  } catch {
    return null;
  }
}

export async function runFaceFinishInComfy(input: {
  imageUrl: string;
  faceUrl: string;
  comfyUrl?: string;
  seed?: number;
  timeoutMs?: number;
}): Promise<FaceFinishResult> {
  const stillRef = parseComfyViewRef(input.imageUrl);
  const faceRef = parseComfyViewRef(input.faceUrl);
  if (!stillRef || !faceRef) {
    return { available: false, reason: 'Still or face crop is not a ComfyUI image.' };
  }
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const [detailer, detector, unetNode, loraNode, clipNode, vaeNode] = await Promise.all([
    resolveComfyNode(baseUrl, ['FaceDetailer']),
    resolveComfyNode(baseUrl, ['UltralyticsDetectorProvider']),
    resolveComfyNode(baseUrl, ['UNETLoader']),
    resolveComfyNode(baseUrl, ['LoraLoaderModelOnly']),
    resolveComfyNode(baseUrl, ['CLIPLoader']),
    resolveComfyNode(baseUrl, ['VAELoader']),
  ]);
  if (!detailer || !detector) {
    return { available: false, reason: 'Face finish needs ComfyUI Impact Pack + Subpack.' };
  }
  const options = (node: typeof unetNode, input: string): string[] => {
    const spec = node?.info.input?.required?.[input]?.[0];
    return Array.isArray(spec)
      ? spec.filter((name): name is string => typeof name === 'string')
      : [];
  };
  const finisher = resolveFaceFinisher(
    {
      unets: options(unetNode, 'unet_name'),
      loras: options(loraNode, 'lora_name'),
      clips: options(clipNode, 'clip_name'),
      vaes: options(vaeNode, 'vae_name'),
    },
    readStillCheckpoint(await readStillGraph(baseUrl, stillRef))
  );
  if (!finisher) {
    return {
      available: false,
      reason:
        'Face finish needs Qwen Edit 2511 + its Lightning LoRA or FLUX.2 Klein 9B Distilled in ComfyUI.',
    };
  }
  const [stillName, faceName] = await Promise.all([
    stageComfyImageAsInput(baseUrl, stillRef, 'face-finish'),
    stageComfyImageAsInput(baseUrl, faceRef, 'face-finish-ref'),
  ]);
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'face-finish',
    timeoutMs: input.timeoutMs ?? 240_000,
    prompt: buildFaceFinishGraph({ stillName, faceName, finisher, seed: input.seed }),
    read: entry => {
      const image = (
        entry.outputs?.[FACE_FINISH_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return image?.filename ? image : undefined;
    },
  });
  if (!run.result) {
    return { available: false, reason: 'Face finish produced no image.' };
  }
  return {
    available: true,
    image: {
      filename: run.result.filename,
      subfolder: run.result.subfolder ?? '',
      type: run.result.type ?? 'output',
    },
    finisher: finisher.kind,
  };
}
