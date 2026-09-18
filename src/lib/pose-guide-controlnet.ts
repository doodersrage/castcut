/**
 * Day/Story mannequin → ControlNet extras.
 *
 * Image 3 remains the Qwen Edit pose cue. ControlNet is only attached for
 * explicitly mapped non-InstantX weights. InstantX + filled mannequins ghosts
 * the guide into the still (cyan outlines, translucent doubles) — skip it.
 */

import type { WorkflowParamValues } from './comfyui-config';
import { resolveControlNetModelFilename, type ModelControlNetMap } from './model-controlnet-map';
import { loadSettingsCache } from './settings-cache';

/** Soft pose lock when a safe (non-InstantX) CN is explicitly mapped. */
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
 * Attach pose-guide ControlNet only when Settings explicitly maps a safe weight.
 * InstantX / inventory auto-pick is skipped — Image 3 Edit carries Qwen pose.
 */
export function resolvePoseGuideControlNetExtras(input: {
  poseGuideFilename?: string | null;
  poseGuideUrl?: string | null;
  model?: string | null;
  controlNetMap?: ModelControlNetMap;
  /** Ignored for mannequin guides — InstantX inventory auto-pick causes leaks. */
  controlNetInventory?: string[] | null;
}): PoseGuideControlNetExtras | undefined {
  const filename = input.poseGuideFilename?.trim() || '';
  const url = input.poseGuideUrl?.trim() || '';
  if (!filename && !url) {
    return undefined;
  }

  const controlNetMap =
    input.controlNetMap ?? loadSettingsCache().shared.modelControlNetMap ?? undefined;
  // Map / token only — never inventory InstantX auto-pick for filled mannequins.
  const controlNetModelFilename = resolveControlNetModelFilename(input.model?.trim() || '', {
    controlNetMap,
    controlNetInventory: [],
  });
  if (!controlNetModelFilename || isMannequinUnsafeControlNet(controlNetModelFilename)) {
    return undefined;
  }

  return {
    ...(filename ? { controlImageFilename: filename } : {}),
    ...(url ? { controlImageUrl: url } : {}),
    queueParamsBase: {
      controlNetMode: 'pose',
      controlNetStrengths: [POSE_GUIDE_CONTROLNET_STRENGTH],
      controlNetSkipPreprocessor: true,
      controlNetModelFilename,
    },
  };
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
