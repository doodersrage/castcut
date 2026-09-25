/**
 * Day/Story Image 3 guide → ControlNet extras (opt-in).
 *
 * Image 3 always goes to Qwen Edit as a reference image. With Settings → Pose guide →
 * "Also lock the pose with ControlNet" on, an OpenPose-style guide (a real keypoint map, the
 * input OpenPose / Union ControlNets are trained on) is also sent through the ControlNet the
 * model is mapped to, at a soft strength.
 *
 * The legacy filled-capsule mannequin never goes through ControlNet: it isn't a pose map, and
 * InstantX / Union read it as an image — it ghosted into stills and locked Image 1 clothing.
 */

import type { WorkflowParamValues } from './comfyui-config';
import { resolveControlNetModelFilename, type ModelControlNetMap } from './model-controlnet-map';
import { isOpenPoseStyle, type PoseGuideStylePreference } from './pose-guide-prompt';
import { loadSettingsCache } from './settings-cache';

/** Soft pose lock: enough to hold limbs, low enough to leave clothing and scene to the prompt. */
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
 * InstantX / Qwen Union ControlNets read any image as a control map — safe with an OpenPose
 * keypoint guide, not with the filled mannequin.
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

/** Settings switch, read at queue time. */
export function loadPoseGuideControlNetEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return loadSettingsCache().shared.poseGuideControlNet === true;
}

/**
 * ControlNet params for a pose guide, or undefined: switched off, no guide, a legacy mannequin
 * guide, or no ControlNet mapped for the model (Settings map / {{CONTROLNET_MODEL}} token).
 */
export function resolvePoseGuideControlNetExtras(input: {
  poseGuideFilename?: string | null;
  poseGuideUrl?: string | null;
  model?: string | null;
  /** Style the guide was drawn in — only OpenPose styles are pose maps. */
  style?: PoseGuideStylePreference | null;
  /** Settings switch (defaults to the stored setting). */
  enabled?: boolean;
  controlNetMap?: ModelControlNetMap;
  controlNetInventory?: string[] | null;
}): PoseGuideControlNetExtras | undefined {
  const enabled = input.enabled ?? loadPoseGuideControlNetEnabled();
  // The drawn style must be known — never assume a guide is a keypoint map.
  if (!enabled || !input.style || !isOpenPoseStyle(input.style)) {
    return undefined;
  }
  const filename = input.poseGuideFilename?.trim() || '';
  const url = input.poseGuideUrl?.trim() || '';
  if (!filename && !url) {
    return undefined;
  }
  const controlNetMap =
    input.controlNetMap ??
    (typeof window === 'undefined' ? undefined : loadSettingsCache().shared.modelControlNetMap);
  const controlNetModelFilename = resolveControlNetModelFilename(input.model?.trim() || '', {
    controlNetMap: controlNetMap ?? undefined,
    controlNetInventory: input.controlNetInventory ?? [],
  });
  if (!controlNetModelFilename) {
    return undefined;
  }
  return {
    ...(filename ? { controlImageFilename: filename } : {}),
    ...(url ? { controlImageUrl: url } : {}),
    queueParamsBase: {
      controlNetMode: 'pose',
      controlNetStrengths: [POSE_GUIDE_CONTROLNET_STRENGTH],
      // The guide already is a keypoint map — running DWPose on it again would be wrong.
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
