/**
 * Day/Story Image 3 guide → ControlNet extras (opt-in).
 *
 * Image 3 always goes to Qwen Edit as a reference image. With Settings → Pose guide →
 * "Also lock the pose with ControlNet" on, an OpenPose-style guide (a real keypoint map, the
 * input OpenPose / Union ControlNets are trained on) is also sent through a pose-capable
 * ControlNet — mapped for the model, or found in ComfyUI's list — at a soft strength.
 *
 * The legacy filled-capsule mannequin never goes through ControlNet: it isn't a pose map, and
 * InstantX / Union read it as an image — it ghosted into stills and locked Image 1 clothing.
 */

import type { WorkflowParamValues } from './comfyui-config';
import { pickQwenPoseControlNetFilename, type ModelControlNetMap } from './model-controlnet-map';
import { readCachedComfyObjectInfoModels } from './comfyui-object-info-cache';
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

/** A ControlNet trained on pose maps (OpenPose / DWPose) or a Union model that includes them. */
export function isPoseCapableControlNet(filename: string | null | undefined): boolean {
  const name = filename?.trim() || '';
  return Boolean(name) && /openpose|dwpose|[-_ .]pose[-_ .]|pose\.|union|promax/i.test(name);
}

/**
 * Which ControlNet the pose lock uses: one mapped for this model in Settings (trusted as is),
 * else a pose-capable file in ComfyUI's list (Qwen Union first), else the map's default when
 * it is pose-capable. Heal & ready's default can be any ControlNet (canny, depth…), so it is
 * never used blindly.
 */
export function resolvePoseControlNetFilename(input: {
  model?: string | null;
  controlNetMap?: ModelControlNetMap | null;
  inventory?: readonly string[] | null;
}): { filename: string; source: 'map' | 'inventory' } | undefined {
  const model = input.model?.trim() || '';
  const mapped = model ? input.controlNetMap?.[model]?.trim() : '';
  if (mapped) {
    return { filename: mapped, source: 'map' };
  }
  const inventory = (input.inventory ?? []).map(name => name.trim()).filter(Boolean);
  const fromInventory =
    pickQwenPoseControlNetFilename(inventory) ?? inventory.find(isPoseCapableControlNet);
  if (fromInventory) {
    return { filename: fromInventory, source: 'inventory' };
  }
  const fallback = input.controlNetMap?.default?.trim();
  if (fallback && isPoseCapableControlNet(fallback)) {
    return { filename: fallback, source: 'map' };
  }
  return undefined;
}

/** ComfyUI's ControlNet files from the browser's object_info cache (empty when unknown). */
export function cachedControlNetInventory(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return readCachedComfyObjectInfoModels()?.controlNets ?? [];
  } catch {
    return [];
  }
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
  const resolved = resolvePoseControlNetFilename({
    model: input.model,
    controlNetMap,
    inventory: input.controlNetInventory ?? cachedControlNetInventory(),
  });
  if (!resolved) {
    return undefined;
  }
  const controlNetModelFilename = resolved.filename;
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
