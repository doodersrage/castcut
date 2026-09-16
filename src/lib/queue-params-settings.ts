import { isLockLatentSizeParams, type WorkflowParamValues } from './comfyui-config';
import { readBrowserValue, writeBrowserValue } from './browser-storage';
import {
  DEFAULT_MODEL_SAMPLER_PRESET_TIER,
  ensureDistilledSamplerParams,
  normalizeModelSamplerPresetTier,
  pickModelSamplerOverrideFields,
  resolveUserSamplerDenoiseOverride,
  resolveModelSamplerParams,
  type ModelSamplerPresetTier,
  type ModelSamplerOverrideFields,
} from './model-sampler-defaults';
import { resolveModelSamplingParams } from './model-sampling-patch';
import { resolveKleinEditCfg, resolveQueueDenoise } from './model-denoise-defaults';
import { normalizeTurboEditStrength } from './turbo-edit-strength';
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveComposeOutputLatentSize,
  resolveModelResolutionParams,
  toolUsesComposeFigureLatent,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from './model-resolution-defaults';
import type { ComfyImageModel } from './comfy-models/client';
import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from './comfyui-settings';
import {
  realignLoaderFilenamesToWorkflowPrecision,
  resolveLoaderFilenamesForModel,
  resolveRefinerFilenameForModel,
} from './model-checkpoint-map';
import { resolveLoaderPrecisionTier } from './model-loader-precision';
import { resolveUpscaleModelFilename, SUGGESTED_MODEL_UPSCALE_MAP } from './model-upscale-map';
import { resolveControlNetModelFilename } from './model-controlnet-map';
import { loadSettingsCache } from './settings-cache';
import { findComfyWorkflowFile, mergeCustomWorkflowTokens } from './comfyui-workflow-files';
import { getSelectedWorkflowFileId } from './comfyui-runtime';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import { normalizeComposeIdentityKind } from './compose-identity-lock';
import {
  resolveEffectiveResolutionSizeTier,
  resolveEffectiveSamplerPreset,
  resolveQueueQualityProfile,
  type QueueQualityProfile,
} from './queue-quality-profile';
import { rememberedSamplerOverrides } from './sampler-memory';
import { readCachedComfyObjectInfoModels } from './comfyui-object-info-cache';

export const QUEUE_PARAMS_KEY = 'comfy-queue-params-v1';

export type QueueParamsSettings = WorkflowParamValues & {
  enabled?: boolean;
};

export type ResolveQueueParamsOptions = {
  model?: ComfyImageModel | string;
  base?: WorkflowParamValues;
  samplerPreset?: ModelSamplerPresetTier;
  resolutionOrientation?: ResolutionOrientation;
  resolutionSizeTier?: ResolutionSizeTier;
  tool?: string;
  inputImageFilename?: string;
  inputImageFilenames?: string[];
  maskImageFilename?: string;
  controlImageFilename?: string;
  controlImageFilenames?: string[];
  qualityProfile?: QueueQualityProfile;
  workflow?: Record<string, unknown>;
  /** Sidebar KSampler overrides (falls back to shared.modelSamplerOverrides). */
  samplerOverrides?: ModelSamplerOverrideFields;
  /**
   * Roll a fresh random seed on each call unless the user pinned seed in
   * Advanced queue params (ignores base/handoff/model default seeds).
   */
  forceNewSeed?: boolean;
  /** Probed figure pixel size — overrides sidebar/handoff W×H for Compose/Refine I2I. */
  figurePixelSize?: { width: number; height: number };
  /**
   * When false, keep explicit base width/height instead of snapping img2img refs
   * to the Lightning compose ladder (used for tiny Fitting Room draft thumbs).
   */
  preserveInputAspect?: boolean;
};

/** Random KSampler seed for a new queue job. */
export function rollQueueSeed(): string {
  return String(Math.floor(Math.random() * 2 ** 32));
}

export function resolvePinnedQueueSeed(
  settings: QueueParamsSettings = loadQueueParamsSettings()
): string | undefined {
  const pinned = settings.seed?.toString().trim();
  return pinned || undefined;
}

function loadModelSamplerPresetTier(): ModelSamplerPresetTier {
  if (typeof window === 'undefined') {
    return DEFAULT_MODEL_SAMPLER_PRESET_TIER;
  }
  return normalizeModelSamplerPresetTier(loadSettingsCache().shared.modelSamplerPreset);
}

function loadModelResolutionOrientation(): ResolutionOrientation {
  if (typeof window === 'undefined') {
    return DEFAULT_RESOLUTION_ORIENTATION;
  }
  return normalizeResolutionOrientation(loadSettingsCache().shared.modelResolutionOrientation);
}

function loadModelResolutionSizeTier(): ResolutionSizeTier {
  if (typeof window === 'undefined') {
    return DEFAULT_RESOLUTION_SIZE_TIER;
  }
  return normalizeResolutionSizeTier(loadSettingsCache().shared.modelResolutionSizeTier);
}

export const DEFAULT_QUEUE_PARAMS: QueueParamsSettings = {
  enabled: false,
  seed: '',
  width: '',
  height: '',
  cfg: '',
  steps: '',
};

export function loadQueueParamsSettings(): QueueParamsSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_QUEUE_PARAMS;
  }
  try {
    const parsed = readBrowserValue<QueueParamsSettings>(QUEUE_PARAMS_KEY);
    if (!parsed) {
      return DEFAULT_QUEUE_PARAMS;
    }
    return { ...DEFAULT_QUEUE_PARAMS, ...parsed };
  } catch {
    return DEFAULT_QUEUE_PARAMS;
  }
}

export function saveQueueParamsSettings(settings: QueueParamsSettings): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(QUEUE_PARAMS_KEY, settings);
}

function normalizeResolveQueueParamsInput(
  input?: WorkflowParamValues | ResolveQueueParamsOptions
): ResolveQueueParamsOptions {
  if (!input) {
    return {};
  }
  if (
    'model' in input ||
    'base' in input ||
    'samplerPreset' in input ||
    'resolutionOrientation' in input ||
    'resolutionSizeTier' in input ||
    'tool' in input ||
    'inputImageFilename' in input ||
    'inputImageFilenames' in input ||
    'maskImageFilename' in input ||
    'controlImageFilename' in input ||
    'controlImageFilenames' in input ||
    'qualityProfile' in input ||
    'workflow' in input ||
    'samplerOverrides' in input ||
    'forceNewSeed' in input ||
    'figurePixelSize' in input ||
    'preserveInputAspect' in input
  ) {
    return input as ResolveQueueParamsOptions;
  }
  return { base: input as WorkflowParamValues };
}

export function resolveQueueParams(
  input?: WorkflowParamValues | ResolveQueueParamsOptions
): WorkflowParamValues {
  const {
    model,
    base,
    samplerPreset,
    resolutionOrientation,
    resolutionSizeTier,
    tool,
    inputImageFilename,
    inputImageFilenames,
    maskImageFilename,
    controlImageFilename,
    controlImageFilenames,
    qualityProfile,
    workflow,
    samplerOverrides,
    forceNewSeed,
    figurePixelSize,
    preserveInputAspect,
  } = normalizeResolveQueueParamsInput(input);
  const settings = loadQueueParamsSettings();
  const shared = loadSettingsCache().shared;
  const lockExact = isLockLatentSizeParams(base);
  const lockedWidth = lockExact ? base?.width?.toString().trim() : '';
  const lockedHeight = lockExact ? base?.height?.toString().trim() : '';
  const profile = resolveQueueQualityProfile({
    tool,
    override: qualityProfile,
    global: shared.queueQualityProfile,
    toolProfiles: shared.toolQueueQualityProfiles,
    model,
  });
  const presetTier = resolveEffectiveSamplerPreset(
    samplerPreset ?? loadModelSamplerPresetTier(),
    profile,
    { model }
  );
  const orientation = resolutionOrientation ?? loadModelResolutionOrientation();
  const sizeTier = resolveEffectiveResolutionSizeTier(
    resolutionSizeTier ?? loadModelResolutionSizeTier(),
    profile
  );
  const modelDefaults = model
    ? {
        ...resolveModelSamplerParams(model, presetTier),
        ...resolveModelResolutionParams(model, orientation, sizeTier),
        ...resolveModelSamplingParams(model, presetTier),
        // 4–5★ gallery memory overrides catalog sampler defaults (not sidebar overrides).
        ...rememberedSamplerOverrides(model),
        ...pickModelSamplerOverrideFields(samplerOverrides ?? shared.modelSamplerOverrides),
      }
    : {};

  const pinnedSeed = resolvePinnedQueueSeed(settings);
  const seed =
    pinnedSeed ??
    (forceNewSeed
      ? rollQueueSeed()
      : base?.seed?.toString().trim() || modelDefaults.seed?.toString().trim() || rollQueueSeed());

  const merged: WorkflowParamValues = {
    seed,
    ...(settings.enabled
      ? {
          width:
            lockedWidth ||
            settings.width?.toString().trim() ||
            base?.width?.toString().trim() ||
            modelDefaults.width?.toString().trim(),
          height:
            lockedHeight ||
            settings.height?.toString().trim() ||
            base?.height?.toString().trim() ||
            modelDefaults.height?.toString().trim(),
          cfg:
            settings.cfg?.toString().trim() ||
            base?.cfg?.toString().trim() ||
            modelDefaults.cfg?.toString().trim(),
          steps:
            settings.steps?.toString().trim() ||
            base?.steps?.toString().trim() ||
            modelDefaults.steps?.toString().trim(),
        }
      : {
          ...modelDefaults,
          ...base,
          seed,
        }),
  };

  if (lockExact) {
    if (lockedWidth) {
      merged.width = lockedWidth;
    }
    if (lockedHeight) {
      merged.height = lockedHeight;
    }
    merged.lockLatentSize = base?.lockLatentSize ?? 'true';
  }

  if (base?.preserveInputAspect != null && String(base.preserveInputAspect).trim() !== '') {
    merged.preserveInputAspect = base.preserveInputAspect;
  }

  // Video frame count / fps aren't part of the manual override UI — always
  // forward from base (queueParamsBase) regardless of settings.enabled.
  if (base?.videoFrames != null && base.videoFrames.toString().trim() !== '') {
    merged.videoFrames = base.videoFrames;
  }
  if (base?.videoFps != null && base.videoFps.toString().trim() !== '') {
    merged.videoFps = base.videoFps;
  }

  for (const key of Object.keys(merged) as Array<keyof WorkflowParamValues>) {
    const value = merged[key];
    if (value == null || value.toString().trim() === '') {
      delete merged[key];
    }
  }

  if (model) {
    const comfySettings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings(), {
      activeOnly: true,
    });
    const selectedWorkflowId = getSelectedWorkflowFileId();
    const workflowFile = selectedWorkflowId ? findComfyWorkflowFile(selectedWorkflowId) : undefined;
    const workflowCustomTokens = workflowFile?.customTokens ?? [];
    const customTokens = mergeCustomWorkflowTokens(
      comfySettings.customTokens,
      workflowCustomTokens
    );
    const loaderMapOptions = {
      checkpointMap: shared.modelCheckpointMap,
      vaeMap: shared.modelVaeMap,
      customTokens,
      workflowCustomTokens,
      workflow,
      precisionTier: resolveLoaderPrecisionTier({ workflow, model }),
    };
    const aligned = realignLoaderFilenamesToWorkflowPrecision(
      merged,
      model,
      workflow,
      loaderMapOptions
    );
    const loaders = resolveLoaderFilenamesForModel(model, loaderMapOptions);
    if (loaders.checkpoint) {
      aligned.checkpointFilename = loaders.checkpoint;
    }
    if (loaders.unet) {
      aligned.unetFilename = loaders.unet;
    }
    if (loaders.vae) {
      aligned.vaeFilename = loaders.vae;
    }
    Object.assign(merged, aligned);

    const upscaleModel =
      resolveUpscaleModelFilename(model, {
        upscaleMap: shared.modelUpscaleMap,
        customTokens,
        availableUpscaleModels:
          typeof window !== 'undefined'
            ? (readCachedComfyObjectInfoModels()?.upscaleModels ?? null)
            : null,
      }) || SUGGESTED_MODEL_UPSCALE_MAP.default;
    if (upscaleModel) {
      merged.upscaleModelFilename = upscaleModel;
    }

    const refinerCheckpoint = resolveRefinerFilenameForModel(model, {
      refinerMap: shared.modelRefinerMap,
      customTokens,
    });
    if (refinerCheckpoint) {
      merged.refinerCheckpointFilename = refinerCheckpoint;
    }

    const controlNetModel = resolveControlNetModelFilename(model, {
      controlNetMap: shared.modelControlNetMap,
      customTokens,
    });
    if (controlNetModel) {
      merged.controlNetModelFilename = controlNetModel;
    }

    // Session-level IP-Adapter reference — primary + optional multi-ref stack.
    if (shared.ipAdapterImageFilename?.trim()) {
      merged.ipAdapterImageFilename = shared.ipAdapterImageFilename.trim();
    }
    const ipAdapterStack = (shared.ipAdapterImageFilenames ?? [])
      .map(name => name?.trim())
      .filter(Boolean) as string[];
    if (ipAdapterStack.length > 0) {
      merged.ipAdapterImageFilenames = ipAdapterStack;
      if (!merged.ipAdapterImageFilename) {
        merged.ipAdapterImageFilename = ipAdapterStack[0];
      }
    } else if (merged.ipAdapterImageFilename) {
      merged.ipAdapterImageFilenames = [merged.ipAdapterImageFilename];
    }
    if (shared.ipAdapterStrength != null) {
      merged.ipAdapterStrength = shared.ipAdapterStrength;
    }
    if (shared.ipAdapterModelFilename?.trim()) {
      merged.ipAdapterModelFilename = shared.ipAdapterModelFilename.trim();
    }
    if (shared.identityKind) {
      merged.identityKind = normalizeComposeIdentityKind(shared.identityKind);
    }

    // Job-pinned face from queueParamsBase wins over session shared (Look Outfit plate, etc.).
    if (base?.ipAdapterImageFilename?.trim()) {
      const pinned = base.ipAdapterImageFilename.trim();
      merged.ipAdapterImageFilename = pinned;
      const pinnedStack = (base.ipAdapterImageFilenames ?? [])
        .map(name => name?.trim())
        .filter(Boolean) as string[];
      merged.ipAdapterImageFilenames = pinnedStack.length > 0 ? pinnedStack : [pinned];
      if (base.ipAdapterStrength != null) {
        merged.ipAdapterStrength = base.ipAdapterStrength;
      }
    }

    const resolvedFilenames = (() => {
      const fromArg = (inputImageFilenames ?? []).map(entry => entry?.trim() ?? '').filter(Boolean);
      const fromBase = (base?.inputImageFilenames ?? [])
        .map(entry => entry?.trim() ?? '')
        .filter(Boolean);
      const list = (fromArg.length > 0 ? fromArg : fromBase).slice(0, 4);
      const primary = inputImageFilename?.trim() || base?.inputImageFilename?.trim() || list[0];
      if (!primary && list.length === 0) {
        return [] as string[];
      }
      if (list.length === 0 && primary) {
        return [primary];
      }
      if (primary && list[0] !== primary) {
        list[0] = primary;
      }
      return list;
    })();
    if (resolvedFilenames.length > 0) {
      merged.inputImageFilename = resolvedFilenames[0];
      merged.inputImageFilenames = resolvedFilenames;
    }

    const resolvedMaskImage = maskImageFilename?.trim() || base?.maskImageFilename?.trim();
    if (resolvedMaskImage) {
      merged.maskImageFilename = resolvedMaskImage;
    }

    const resolvedControlImage = controlImageFilename?.trim() || base?.controlImageFilename?.trim();
    const controlStack = (() => {
      const fromArg = (controlImageFilenames ?? [])
        .map(entry => entry?.trim() ?? '')
        .filter(Boolean);
      const fromBase = (base?.controlImageFilenames ?? [])
        .map(entry => entry?.trim() ?? '')
        .filter(Boolean);
      const list = (fromArg.length > 0 ? fromArg : fromBase).slice(0, 4);
      if (list.length === 0 && resolvedControlImage) {
        return [resolvedControlImage];
      }
      if (resolvedControlImage && list[0] !== resolvedControlImage) {
        list[0] = resolvedControlImage;
      }
      return list;
    })();
    if (controlStack.length > 0) {
      merged.controlImageFilename = controlStack[0];
      merged.controlImageFilenames = controlStack;
    }

    const hasInputImage = Boolean(merged.inputImageFilename);
    const hasMaskImage = Boolean(merged.maskImageFilename);

    // Figure pixels beat sidebar / re-edit handoff W×H — wrong latent AR stretches
    // refs and compounds “thinning” when gallery outputs feed the next Compose pass.
    if (
      figurePixelSize &&
      figurePixelSize.width > 0 &&
      figurePixelSize.height > 0 &&
      hasInputImage &&
      (toolUsesComposeFigureLatent(tool) || lockExact)
    ) {
      const latent =
        lockExact && lockedWidth && lockedHeight
          ? { width: Number(lockedWidth), height: Number(lockedHeight) }
          : resolveComposeOutputLatentSize(
              figurePixelSize.width,
              figurePixelSize.height,
              model,
              orientation,
              sizeTier
            );
      merged.width = String(latent.width);
      merged.height = String(latent.height);
    }

    const userDenoiseOverride = resolveUserSamplerDenoiseOverride(
      samplerOverrides ?? shared.modelSamplerOverrides
    );
    const denoise = resolveQueueDenoise(model, {
      tool,
      hasInputImage,
      hasMaskImage,
      userDenoiseOverride,
      handoffDenoise: base?.denoise,
      editDenoiseStrength: shared.editDenoiseStrength,
      turboEditStrength: normalizeTurboEditStrength(shared.turboEditStrength),
    });
    if (denoise != null) {
      merged.denoise = denoise;
    }
    // Distilled Klein Compose/Refine: CFG 1 + soft denoise ≈ photo passthrough.
    const kleinEditCfg = resolveKleinEditCfg(model, {
      tool,
      hasInputImage,
      hasMaskImage,
      currentCfg: Number(merged.cfg),
    });
    if (kleinEditCfg != null) {
      merged.cfg = kleinEditCfg;
    }

    // Rapid AIO T2I stays on native square — extreme ARs worsen screen-door.
    // Lightning / vanilla 2512 keep the user's aspect chips as-is.
    if (isQwenRapidAioModel(model) && !hasInputImage) {
      const rapidTier = sizeTier === 'max' ? 'medium' : sizeTier;
      const square = resolveModelResolutionParams(model, 'square', rapidTier);
      if (square.width != null) {
        merged.width = square.width;
      }
      if (square.height != null) {
        merged.height = square.height;
      }
    }

    if (lockExact) {
      return ensureDistilledSamplerParams(merged, model, presetTier);
    }

    return ensureDistilledSamplerParams(
      ensureLightningNativeResolutionParams(
        merged,
        model,
        isQwenRapidAioModel(model) && !hasInputImage ? 'square' : orientation,
        isQwenRapidAioModel(model) && !hasInputImage && sizeTier === 'max' ? 'medium' : sizeTier,
        {
          preserveInputAspect: preserveInputAspect ?? hasInputImage,
        }
      ),
      model,
      presetTier
    );
  }

  return merged;
}
