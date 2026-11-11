/**
 * Server-only: cut a finished still to its picked waist-up or head-and-shoulders shot (see
 * shot-reframe.ts) in ComfyUI and return the new image as a ComfyUI view ref.
 */

import {
  comfyBaseUrl,
  parseComfyViewRef,
  readComfyImageGraph,
  runComfyUtilityGraph,
  stageComfyImageAsInput,
  type ComfyImageRef,
} from '@/lib/comfyui/comfy-utility-graph-server';
import { locateFaceInComfy, locateFacesInComfy } from '@/lib/face/locate-server';
import {
  buildShotReframeGraph,
  pickedReframeShot,
  reframeIsSolo,
  reframeSourceOf,
  SHOT_REFRAME_SAVE_NODE,
  shotReframeRect,
  type ReframeRect,
  type ReframeShot,
  shotReframeRectForFaces,
} from './shot-reframe';

export type ShotReframeResult =
  | {
      available: true;
      image: ComfyImageRef;
      shot: ReframeShot;
      rect: ReframeRect;
    }
  | { available: false; reason: string };

/**
 * Plan only (`plan: true`): which shot the still asks for and the crop, without queueing the cut.
 * Otherwise: cut and enlarge (well under a second of ComfyUI, no model loaded).
 */
export async function reframeStillInComfy(input: {
  imageUrl: string;
  comfyUrl?: string;
  plan?: boolean;
  timeoutMs?: number;
}): Promise<
  ShotReframeResult | { available: true; plan: true; shot: ReframeShot; rect: ReframeRect }
> {
  const ref = parseComfyViewRef(input.imageUrl);
  if (!ref) return { available: false, reason: 'The still is not a ComfyUI image.' };
  const baseUrl = comfyBaseUrl(input.comfyUrl);
  const graph = await readComfyImageGraph(baseUrl, ref);
  const source = reframeSourceOf(graph);
  if (!source?.size) {
    return { available: false, reason: 'Not a Qwen-Image 2.1 still (its graph is not readable).' };
  }
  const shot = pickedReframeShot(source.prompt);
  if (!shot) return { available: false, reason: 'No waist-up or close-up shot was picked.' };
  // Two people: the crop is around both faces (2026-11-11). More than two are left as they are.
  if (!reframeIsSolo(source.prompt)) {
    if (/\bthree people\b|\bgroup\b/i.test(source.prompt)) {
      return { available: false, reason: 'A group still keeps its frame.' };
    }
    const stagedName = await stageComfyImageAsInput(baseUrl, ref, 'shot-reframe-faces');
    const faces = await locateFacesInComfy({ imageName: stagedName, comfyUrl: input.comfyUrl });
    if (faces.length < 2) {
      return { available: false, reason: 'two faces weren’t found to frame the shot around.' };
    }
    const pairRect = shotReframeRectForFaces(source.size, faces, shot);
    if (!pairRect) return { available: false, reason: 'the still is already that close.' };
    if (input.plan) return { available: true, plan: true, shot, rect: pairRect };
    return cutToRect({
      baseUrl,
      ref,
      rect: pairRect,
      size: source.size,
      shot,
      timeoutMs: input.timeoutMs,
    });
  }
  const located = await locateFaceInComfy({
    imageUrl: input.imageUrl,
    width: source.size.width,
    height: source.size.height,
    comfyUrl: input.comfyUrl,
  });
  if (!located.available) return { available: false, reason: located.reason };
  if (!located.face) {
    return { available: false, reason: 'no face found to frame the shot around.' };
  }
  // A face found only on a turned still: she is lying down — no upright crop to make.
  if (located.rotation && located.rotation !== 'none') {
    return { available: false, reason: 'she is lying down — the frame is kept.' };
  }
  const rect = shotReframeRect(source.size, located.face, shot);
  if (!rect) return { available: false, reason: 'the still is already that close.' };
  if (input.plan) return { available: true, plan: true, shot, rect };
  return cutToRect({ baseUrl, ref, rect, size: source.size, shot, timeoutMs: input.timeoutMs });
}

/** Cut the still to the rect and enlarge it back to its size (well under a second of ComfyUI). */
async function cutToRect(input: {
  baseUrl: string;
  ref: NonNullable<ReturnType<typeof parseComfyViewRef>>;
  rect: ReframeRect;
  size: { width: number; height: number };
  shot: ReframeShot;
  timeoutMs?: number;
}): Promise<ShotReframeResult> {
  const { baseUrl, ref, rect, shot } = input;
  const stillName = await stageComfyImageAsInput(baseUrl, ref, 'shot-reframe');
  const run = await runComfyUtilityGraph({
    baseUrl,
    label: 'shot-reframe',
    timeoutMs: input.timeoutMs ?? 60_000,
    priority: 'check',
    prompt: buildShotReframeGraph({ stillName, rect, size: input.size }),
    read: entry => {
      const image = (
        entry.outputs?.[SHOT_REFRAME_SAVE_NODE] as { images?: ComfyImageRef[] } | undefined
      )?.images?.[0];
      return image?.filename ? image : undefined;
    },
  });
  if (!run.result) return { available: false, reason: 'The cut produced no image.' };
  return {
    available: true,
    image: {
      filename: run.result.filename,
      subfolder: run.result.subfolder ?? '',
      type: run.result.type ?? 'output',
    },
    shot,
    rect,
  };
}
