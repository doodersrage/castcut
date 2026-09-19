/**
 * Day/Story mannequin → ControlNet extras.
 *
 * Filled capsule pose guides are for Qwen Image 3 Edit only. Feeding them into
 * ControlNet (InstantX or otherwise) ghosts the guide and locks Image 1 clothing
 * into the still — so pose-guide ControlNet stays off.
 */

import type { WorkflowParamValues } from './comfyui-config';
import type { ModelControlNetMap } from './model-controlnet-map';

/** @deprecated Pose-guide ControlNet is disabled; kept for callers/tests. */
export const POSE_GUIDE_CONTROLNET_STRENGTH = 0.35;

export type PoseGuideControlNetExtras = {
  controlImageFilename?: string;
  controlImageUrl?: string;
  queueParamsBase: Pick<
    WorkflowParamValues,
    | 'controlNetMode'
    | 'controlNetStrengths'
    | 'controlNetSkipPreprocessor'
    | 'controlNetModelFilename'
  >;
};

/**
 * InstantX / Qwen Union expects canny/depth/pose maps — not filled capsule mannequins.
 * Feeding Image 3 into InstantX ghosts the guide into the still.
 */
export function isMannequinUnsafeControlNet(filename: string | null | undefined): boolean {
  const name = filename?.trim() || '';
  if (!name) {
    return false;
  }
  return /instantx|qwen[-_]?image[-_]?instantx|qwen[-_]?controlnet[-_]?union|qwen.*controlnet/i.test(
    name
  );
}

/**
 * Never attach ControlNet for filled mannequin pose guides.
 * Image 3 Edit carries pose; CN was locking Cast clothes and leaking schematics.
 */
export function resolvePoseGuideControlNetExtras(_input: {
  poseGuideFilename?: string | null;
  poseGuideUrl?: string | null;
  model?: string | null;
  controlNetMap?: ModelControlNetMap;
  controlNetInventory?: string[] | null;
}): PoseGuideControlNetExtras | undefined {
  return undefined;
}

/** Merge pose-guide ControlNet params into an existing queueParamsBase. */
export function mergePoseGuideControlNetParams(
  base: WorkflowParamValues | Record<string, unknown> | undefined,
  extras: PoseGuideControlNetExtras | undefined
): WorkflowParamValues | Record<string, unknown> | undefined {
  if (!extras) {
    return base;
  }
  return {
    ...(base ?? {}),
    ...extras.queueParamsBase,
  };
}
