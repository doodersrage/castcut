import { isQwenLightningModel, patchModelSamplingInWorkflow } from './model-sampling-patch';
import { ensureFluxGuidanceInWorkflow } from './flux-guidance-patch';
import { isCastcutProtectedSampler, shouldSkipGlobalSamplerPatch } from './workflow-enrich-markers';
import {
  prepareLightningWorkflowForQueue,
  prepareBooguTurboWorkflowForQueue,
  prepareQwenEditReferenceImagesForQueue,
  disconnectQwenEditReferenceImagesForTxt2Img,
  pruneUnresolvedQwenEditFigureLoaders,
  neutralizeNonLightningLoras,
  resolveLightningBf16Loaders,
} from './workflow-lightning-queue';
import {
  isBooguTurboModel,
  isEditCapableModel,
  isFlux1FamilyModel,
  isQwenRapidAioModel,
  resolveDistilledQueueDenoise,
} from './model-denoise-defaults';
import { buildLightningLoraFilenameMap, loraFilenameImpliesLightning } from './workflow-lora-patch';
import {
  normalizeLoraLibrary,
  applyLoraStackToWorkflow,
  type LoraLibraryEntry,
} from './lora-stack';
import {
  classifyPromptEncodeBinding,
  isPromptEncodeNode,
  resolvePromptEncodeTextField,
} from './workflow-prompt-encode';
import {
  forceResolveLoaderPlaceholders,
  patchControlNetInWorkflow,
  patchImageResizeNodesInWorkflow,
  patchLoadImageMaskNodesInWorkflow,
  patchLoadImageNodesInWorkflow,
  patchLoaderNodesInWorkflow,
  patchUpscaleModelNodesInWorkflow,
  patchWorkflowDirectParams,
  replaceUpscaleModelTokenInJson,
} from './workflow-direct-patch';
import { normalizeInputImageFilenames } from './workflow-load-image-bindings';
import type { ModelLoaderFilenames } from './model-checkpoint-map';
import { matchInventoryFilenameNearMiss } from './loader-map-inventory-sync';
import { isVideoCheckpointMapKey, pickVideoCheckpointFromInventory } from './video-checkpoint-pick';
import { ensureLtxClipLoaderForQueue } from './video-i2v-scaffold';
import { stripComfyUiOnlyNodes } from './workflow-node-type-audit';
import {
  normalizeComfyApiWorkflow,
  parseWorkflowJson,
  findUnresolvedLoaderPlaceholders,
  listWorkflowNodeIds,
  countPlaceholders,
  detectWorkflowPlaceholders,
  normalizeCustomWorkflowTokens,
  resolveCustomWorkflowTokens,
  detectCustomWorkflowPlaceholders,
} from './workflow-json-parse';

export const DEFAULT_POSITIVE_TOKEN = '{{POSITIVE}}';
export const DEFAULT_NEGATIVE_TOKEN = '{{NEGATIVE}}';
export const DEFAULT_SEED_TOKEN = '{{SEED}}';
export const DEFAULT_WIDTH_TOKEN = '{{WIDTH}}';
export const DEFAULT_HEIGHT_TOKEN = '{{HEIGHT}}';
export const DEFAULT_CFG_TOKEN = '{{CFG}}';
export const DEFAULT_STEPS_TOKEN = '{{STEPS}}';
export const DEFAULT_SAMPLER_TOKEN = '{{SAMPLER}}';
export const DEFAULT_SCHEDULER_TOKEN = '{{SCHEDULER}}';
export const DEFAULT_SHIFT_TOKEN = '{{SHIFT}}';
export const DEFAULT_FLUX_MAX_SHIFT_TOKEN = '{{FLUX_MAX_SHIFT}}';
export const DEFAULT_FLUX_BASE_SHIFT_TOKEN = '{{FLUX_BASE_SHIFT}}';
export const DEFAULT_DENOISE_TOKEN = '{{DENOISE}}';
export const DEFAULT_INPUT_IMAGE_TOKEN = '{{INPUT_IMAGE}}';
export const DEFAULT_INPUT_IMAGE_2_TOKEN = '{{INPUT_IMAGE_2}}';
export const DEFAULT_INPUT_IMAGE_3_TOKEN = '{{INPUT_IMAGE_3}}';
export const DEFAULT_INPUT_IMAGE_4_TOKEN = '{{INPUT_IMAGE_4}}';
export const DEFAULT_MASK_IMAGE_TOKEN = '{{MASK_IMAGE}}';
/** Video (WAN / Hunyuan Video) init-image placeholder — mirrors {{INPUT_IMAGE}} for I2V graphs. */
export const DEFAULT_INIT_IMAGE_TOKEN = '{{INIT_IMAGE}}';
/** Video frame count / length placeholder (e.g. EmptyHunyuanLatentVideo `length`). */
export const DEFAULT_VIDEO_FRAMES_TOKEN = '{{VIDEO_FRAMES}}';
/** Video output frame rate placeholder (e.g. SaveAnimatedWEBP `fps`). */
export const DEFAULT_VIDEO_FPS_TOKEN = '{{VIDEO_FPS}}';

import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_REFINER_TOKEN,
  loaderFilenameCustomTokens,
  pickBooguVaeFromInventory,
  realignLoaderFilenamesToWorkflowPrecision,
  resolveLoaderFilenamesForModel,
  resolveRefinerFilenameForModel,
  type ModelCheckpointMap,
  type ModelRefinerMap,
  type ModelUnetMap,
  type ModelVaeMap,
} from './model-checkpoint-map';
import { maybeRewriteRapidAioWorkflowLoaders } from './workflow-rapid-aio-checkpoint';
import { resolveLoaderPrecisionTier, type LoaderPrecisionTier } from './model-loader-precision';
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  ensureLightningNativeResolutionParams,
  resolveModelResolutionParams,
} from './model-resolution-defaults';
import {
  resolveModelSamplerParams,
  ensureDistilledSamplerParams,
  resolveUserSamplerDenoiseOverride,
  isLightningModelId,
  ksamplerSafeScheduler,
  shouldNeutralizeStyleLorasAtQueue,
  type ModelSamplerPresetTier,
} from './model-sampler-defaults';
import {
  normalizeQueueQualityProfile,
  resolveEffectiveSamplerPreset,
  type QueueQualityProfile,
} from './queue-quality-profile';
import { loadSettingsCache } from './settings-cache';
import {
  DEFAULT_UPSCALE_MODEL_TOKEN,
  resolveUpscaleModelFilename,
  SUGGESTED_MODEL_UPSCALE_MAP,
  type ModelUpscaleMap,
} from './model-upscale-map';
import {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
} from './ipadapter-workflow-patch';

export {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_UPSCALE_MODEL_TOKEN,
  DEFAULT_REFINER_TOKEN,
};
export {
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
};

export type WorkflowParamValues = {
  seed?: string | number;
  width?: string | number;
  height?: string | number;
  cfg?: string | number;
  steps?: string | number;
  samplerName?: string | number;
  scheduler?: string | number;
  samplingShift?: string | number;
  fluxMaxShift?: string | number;
  fluxBaseShift?: string | number;
  checkpointFilename?: string;
  unetFilename?: string;
  vaeFilename?: string;
  upscaleModelFilename?: string;
  refinerCheckpointFilename?: string;
  denoise?: string | number;
  inputImageFilename?: string;
  /** Additional reference images for multi-image edit (Figure 1–4). Index 0 mirrors `inputImageFilename`. */
  inputImageFilenames?: string[];
  maskImageFilename?: string;
  controlNetModelFilename?: string;
  controlImageFilename?: string;
  /** Extra control images for stacked ControlNetApply (index 0 mirrors controlImageFilename). */
  controlImageFilenames?: string[];
  /** ControlNet preprocessor mode (canny/pose/depth/…) when auto-inserting a chain. */
  controlNetMode?: string;
  /** Optional per-slot ControlNetApply strengths (index 0 = primary). */
  controlNetStrengths?: Array<number | string>;
  /** Optional per-slot preprocessor modes when stacking ControlNets. */
  controlNetModes?: string[];
  /**
   * When true, auto-inserted ControlNet chains skip OpenPose/Canny/etc. and feed
   * the control image raw (Day/Story filled mannequin pose guides).
   */
  controlNetSkipPreprocessor?: boolean | string;
  /** {{IPADAPTER_IMAGE}} — filename of the identity/style reference image on a LoadImage node. */
  ipAdapterImageFilename?: string;
  /** Extra IP-Adapter refs for stacked apply chains (index 0 mirrors ipAdapterImageFilename). */
  ipAdapterImageFilenames?: string[];
  /** {{IPADAPTER_STRENGTH}} — 0–1 weight patched onto IPAdapter-family nodes. */
  ipAdapterStrength?: string | number;
  /** {{IPADAPTER_MODEL}} — optional ipadapter_file filename override. */
  ipAdapterModelFilename?: string;
  /**
   * Compose identity lock backend: IP-Adapter (default) or InstantID / PuLID / auto.
   * When instantid|pulid|auto, queue prefers insertIdentityChainIfMissing.
   */
  identityKind?: 'ipadapter' | 'instantid' | 'pulid' | 'auto';
  /** Video (WAN / Hunyuan Video) frame count / length — feeds {{VIDEO_FRAMES}}. */
  videoFrames?: string | number;
  /** Video output frame rate — feeds {{VIDEO_FPS}}. */
  videoFps?: string | number;
  /** Skip Lightning native ladder upsnap — use exact queue width/height (Fitting draft thumbs). */
  lockLatentSize?: boolean | string;
  /**
   * When false, keep explicit W×H instead of snapping img2img refs to the Lightning
   * compose ladder (Fitting draft thumbs). Defaults to true when an input image is set.
   */
  preserveInputAspect?: boolean | string;
};

export function isLockLatentSizeParams(
  params?: Pick<WorkflowParamValues, 'lockLatentSize'>
): boolean {
  return params?.lockLatentSize === true || String(params?.lockLatentSize ?? '').trim() === 'true';
}

export function resolvePreserveInputAspectParam(
  params: Pick<WorkflowParamValues, 'preserveInputAspect'> | undefined,
  fallback: boolean
): boolean {
  const raw = params?.preserveInputAspect;
  if (raw === false || String(raw ?? '').trim() === 'false') {
    return false;
  }
  if (raw === true || String(raw ?? '').trim() === 'true') {
    return true;
  }
  return fallback;
}

export type CustomWorkflowToken = {
  token: string;
  value: string;
};

export type ComfyUiRuntimeConfig = {
  apiUrl?: string;
  workflowJson?: string;
  /** Server-side workflow file path from COMFYUI_WORKFLOW_DIR / COMFYUI_WORKFLOW_PATHS. */
  workflowFileId?: string;
  positiveToken?: string;
  negativeToken?: string;
  queueParams?: WorkflowParamValues;
  customTokens?: CustomWorkflowToken[];
  /**
   * Tokens from the selected workflow library file only. Beat Settings tokens for
   * the same key, and beat modelCheckpointMap for CHECKPOINT/UNET/VAE.
   */
  workflowCustomTokens?: CustomWorkflowToken[];
  /** When true (default), upgrade Klein compose refs to Flux2Klein Enhancer nodes when installed. */
  kleinEnhancerEnabled?: boolean;
  /** Identity Feature Transfer Final preset (HARD/MID/SOFT lock). */
  kleinEnhancerIdentityPreset?: import('./klein-enhancer-workflow-patch').KleinEnhancerIdentityPreset;
  kleinEnhancerTextEnabled?: boolean;
  kleinEnhancerColorAnchorEnabled?: boolean;
  kleinEnhancerColorAnchorStrength?: number;
  /** When false, skip direct EmptyLatentImage / loader patching (placeholder injection still runs). */
  directWorkflowPatching?: boolean;
  /** When true, overwrite hardcoded loader filenames with the target model at queue time. */
  syncWorkflowLoadersToModel?: boolean;
  /** When true (default), auto-bind missing placeholders before injection at queue time. */
  workflowQueueOptimize?: boolean;
  /** When true (default), insert model-sampling patch nodes when missing for FLUX/SD3 workflows. */
  workflowGraphEnrich?: boolean;
  /** When true (default), insert SDXL refiner pass on Final/Max when a refiner map is set. */
  workflowSdxlRefinerEnrich?: boolean;
  /** When true (default), chain Lanczos polish after neural UpscaleModel on Max. */
  workflowNeuralUpscalePolish?: boolean;
  /** When true (default), add a subtle ImageSharpen after upscale on Max. */
  workflowSharpenAfterUpscale?: boolean;
  /**
   * When true (default), Draft queues rewrite SaveImage to a WebP-capable custom
   * node when ComfyUI has one installed; Final/Max stay PNG.
   */
  compactDraftSaves?: boolean;
  /** Model id used for queue-time workflow optimize / graph enrich heuristics. */
  queueTargetModel?: string;
  /** Effective queue quality profile for this request (sampler, resolution, upscale). */
  queueQualityProfile?: import('./queue-quality-profile').QueueQualityProfile;
  /** Client-side checkpoint map forwarded for server-side loader resolution. */
  modelCheckpointMap?: ModelCheckpointMap;
  /** Client-side VAE map forwarded for server-side loader resolution. */
  modelVaeMap?: ModelVaeMap;
  /** Client-side SDXL refiner map forwarded for server-side loader resolution. */
  modelRefinerMap?: ModelRefinerMap;
  /** Client-side upscale model map forwarded for server-side loader resolution. */
  modelUpscaleMap?: ModelUpscaleMap;
  /** Hash from last library optimize — skips redundant queue-time optimize when unchanged. */
  workflowOptimizedHash?: string;
  /** Model id from last library optimize — required with hash for full early-exit. */
  workflowOptimizedModel?: string;
  /** Quality profile from last library optimize — required with hash for full early-exit. */
  workflowOptimizedProfile?: import('./queue-quality-profile').QueueQualityProfile;
  /** When Use system workflows is on: whether queue used a library pack or built-in scaffold. */
  systemWorkflowSource?: 'pack' | 'scaffold';
  /** Display label for the pack filename or "Built-in scaffold". */
  systemWorkflowLabel?: string;
  /**
   * LoRA library forwarded from Settings — carries strengths/enabled/order that
   * {{LORA_*}} custom tokens alone cannot express for queue-time stacking.
   */
  loraLibrary?: LoraLibraryEntry[];
  /** Multi-slot regional edit — bound at inject / direct-patch time. */
  regionalSlots?: import('./regional-prompt-slots').RegionalPromptSlot[];
  /** Sidebar KSampler overrides forwarded for server-side inject (incl. denoise). */
  modelSamplerOverrides?: import('./model-sampler-defaults').ModelSamplerOverrideFields;
  /**
   * Preferred ComfyUI pool host from SharedToolSettings. When set and the host
   * is in COMFYUI_POOL and healthy-ish, pool routing prefers it.
   */
  preferredComfyHost?: string;
  /** When true (default), skip busy pool hosts and rotate to the next least-loaded server. */
  comfyPoolLoadBalance?: boolean;
  /** Queue depth (pending + running) above which a pool host is treated as too busy. */
  comfyPoolBusyThreshold?: number;
  /** Extra ComfyUI pool members from Settings (merged with COMFYUI_POOL). */
  comfyPoolUrls?: string[];
};

export type WorkflowPlaceholderTokens = {
  positive: string;
  negative: string;
  seed: string;
  width: string;
  height: string;
  cfg: string;
  steps: string;
  sampler: string;
  scheduler: string;
  shift: string;
  fluxMaxShift: string;
  fluxBaseShift: string;
  denoise: string;
  inputImage: string;
  maskImage: string;
  /** Video init-image placeholder — same resolved value as inputImage, distinct token. */
  initImage: string;
  videoFrames: string;
  videoFps: string;
};

export type ResolvedComfyUiConfig = {
  apiUrl: string;
  workflow: Record<string, unknown> | null;
  placeholderTokens: WorkflowPlaceholderTokens;
  legacyPositiveNodeId?: string;
  legacyNegativeNodeId?: string;
  workflowSource: 'client' | 'env' | 'none';
};

export type WorkflowInjectionResult = {
  workflow: Record<string, unknown>;
  positiveReplacements: number;
  negativeReplacements: number;
  paramReplacements: Partial<Record<keyof WorkflowParamValues, number>>;
  customReplacements?: Record<string, number>;
};

export function resolvePlaceholderTokens(
  runtime?: ComfyUiRuntimeConfig
): WorkflowPlaceholderTokens {
  return {
    positive:
      runtime?.positiveToken?.trim() ||
      process.env.COMFYUI_POSITIVE_TOKEN?.trim() ||
      DEFAULT_POSITIVE_TOKEN,
    negative:
      runtime?.negativeToken?.trim() ||
      process.env.COMFYUI_NEGATIVE_TOKEN?.trim() ||
      DEFAULT_NEGATIVE_TOKEN,
    seed: process.env.COMFYUI_SEED_TOKEN?.trim() || DEFAULT_SEED_TOKEN,
    width: process.env.COMFYUI_WIDTH_TOKEN?.trim() || DEFAULT_WIDTH_TOKEN,
    height: process.env.COMFYUI_HEIGHT_TOKEN?.trim() || DEFAULT_HEIGHT_TOKEN,
    cfg: process.env.COMFYUI_CFG_TOKEN?.trim() || DEFAULT_CFG_TOKEN,
    steps: process.env.COMFYUI_STEPS_TOKEN?.trim() || DEFAULT_STEPS_TOKEN,
    sampler: process.env.COMFYUI_SAMPLER_TOKEN?.trim() || DEFAULT_SAMPLER_TOKEN,
    scheduler: process.env.COMFYUI_SCHEDULER_TOKEN?.trim() || DEFAULT_SCHEDULER_TOKEN,
    shift: process.env.COMFYUI_SHIFT_TOKEN?.trim() || DEFAULT_SHIFT_TOKEN,
    fluxMaxShift: process.env.COMFYUI_FLUX_MAX_SHIFT_TOKEN?.trim() || DEFAULT_FLUX_MAX_SHIFT_TOKEN,
    fluxBaseShift:
      process.env.COMFYUI_FLUX_BASE_SHIFT_TOKEN?.trim() || DEFAULT_FLUX_BASE_SHIFT_TOKEN,
    denoise: process.env.COMFYUI_DENOISE_TOKEN?.trim() || DEFAULT_DENOISE_TOKEN,
    inputImage: process.env.COMFYUI_INPUT_IMAGE_TOKEN?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    maskImage: process.env.COMFYUI_MASK_IMAGE_TOKEN?.trim() || DEFAULT_MASK_IMAGE_TOKEN,
    initImage: process.env.COMFYUI_INIT_IMAGE_TOKEN?.trim() || DEFAULT_INIT_IMAGE_TOKEN,
    videoFrames: process.env.COMFYUI_VIDEO_FRAMES_TOKEN?.trim() || DEFAULT_VIDEO_FRAMES_TOKEN,
    videoFps: process.env.COMFYUI_VIDEO_FPS_TOKEN?.trim() || DEFAULT_VIDEO_FPS_TOKEN,
  };
}

export function resolveQueueParams(
  runtime?: ComfyUiRuntimeConfig,
  override?: WorkflowParamValues,
  options?: { model?: string; preserveInputAspect?: boolean }
): WorkflowParamValues {
  const merged = {
    ...(runtime?.queueParams ?? {}),
    ...(override ?? {}),
  };

  const model = options?.model?.trim() || runtime?.queueTargetModel?.trim();
  const orientation = DEFAULT_RESOLUTION_ORIENTATION;
  const sizeTier = DEFAULT_RESOLUTION_SIZE_TIER;
  const presetTier = resolveEffectiveSamplerPreset('base', runtime?.queueQualityProfile, { model });
  const modelSampler = model ? resolveModelSamplerParams(model, presetTier) : undefined;
  const modelResolution = model
    ? resolveModelResolutionParams(model, orientation, sizeTier)
    : undefined;

  const result: WorkflowParamValues = {
    seed:
      merged.seed?.toString().trim() ||
      modelSampler?.seed?.toString().trim() ||
      String(Math.floor(Math.random() * 2 ** 32)),
    width: merged.width?.toString().trim() || modelResolution?.width?.toString() || '1024',
    height: merged.height?.toString().trim() || modelResolution?.height?.toString() || '1024',
    cfg:
      merged.cfg?.toString().trim() || (modelSampler?.cfg != null ? String(modelSampler.cfg) : '7'),
    steps:
      merged.steps?.toString().trim() ||
      (modelSampler?.steps != null ? String(modelSampler.steps) : '20'),
    samplerName:
      merged.samplerName?.toString().trim() || modelSampler?.samplerName?.toString() || 'euler',
    scheduler:
      merged.scheduler?.toString().trim() || modelSampler?.scheduler?.toString() || 'normal',
  };

  if (merged.samplingShift != null && merged.samplingShift.toString().trim() !== '') {
    result.samplingShift = merged.samplingShift;
  }
  if (merged.fluxMaxShift != null && merged.fluxMaxShift.toString().trim() !== '') {
    result.fluxMaxShift = merged.fluxMaxShift;
  }
  if (merged.fluxBaseShift != null && merged.fluxBaseShift.toString().trim() !== '') {
    result.fluxBaseShift = merged.fluxBaseShift;
  }
  if (merged.denoise != null && merged.denoise.toString().trim() !== '') {
    result.denoise = merged.denoise;
  }
  if (merged.inputImageFilename?.trim()) {
    result.inputImageFilename = merged.inputImageFilename.trim();
  }
  if (Array.isArray(merged.inputImageFilenames) && merged.inputImageFilenames.length > 0) {
    const filenames = merged.inputImageFilenames
      .map(entry => entry?.trim() ?? '')
      .filter(Boolean)
      .slice(0, 4);
    if (filenames.length > 0) {
      result.inputImageFilenames = filenames;
      if (!result.inputImageFilename) {
        result.inputImageFilename = filenames[0];
      }
    }
  }
  if (merged.maskImageFilename?.trim()) {
    result.maskImageFilename = merged.maskImageFilename.trim();
  }
  if (merged.checkpointFilename?.trim()) {
    result.checkpointFilename = merged.checkpointFilename.trim();
  }
  if (merged.unetFilename?.trim()) {
    result.unetFilename = merged.unetFilename.trim();
  }
  if (merged.vaeFilename?.trim()) {
    result.vaeFilename = merged.vaeFilename.trim();
  }
  if (merged.upscaleModelFilename?.trim()) {
    result.upscaleModelFilename = merged.upscaleModelFilename.trim();
  }
  if (merged.refinerCheckpointFilename?.trim()) {
    result.refinerCheckpointFilename = merged.refinerCheckpointFilename.trim();
  }
  if (merged.videoFrames != null && merged.videoFrames.toString().trim() !== '') {
    result.videoFrames = merged.videoFrames;
  }
  if (merged.videoFps != null && merged.videoFps.toString().trim() !== '') {
    result.videoFps = merged.videoFps;
  }
  if (isLockLatentSizeParams(merged)) {
    result.lockLatentSize = merged.lockLatentSize;
    if (merged.width?.toString().trim()) {
      result.width = merged.width.toString().trim();
    }
    if (merged.height?.toString().trim()) {
      result.height = merged.height.toString().trim();
    }
  }

  if (model) {
    const hasInputImage = Boolean(
      result.inputImageFilename?.toString().trim() ||
      result.inputImageFilenames?.some(name => Boolean(name?.toString().trim()))
    );
    const lockExact = isLockLatentSizeParams(merged) || isLockLatentSizeParams(result);
    if (!lockExact) {
      const preserveAspect = resolvePreserveInputAspectParam(
        merged,
        options?.preserveInputAspect ?? hasInputImage
      );
      // Img2img with an explicit preserveInputAspect=false (Fitting draft thumbs):
      // keep the client W×H. Otherwise run Lightning native alignment.
      if (preserveAspect || !hasInputImage) {
        const aligned = ensureLightningNativeResolutionParams(
          result,
          model,
          orientation,
          sizeTier,
          {
            // Compose/Refine/img2img: never rewrite client figure AR back to native
            // square — that horizontally squashes portrait selfies into 1328².
            preserveInputAspect: preserveAspect,
          }
        );
        if (aligned.width != null) {
          result.width = aligned.width.toString();
        }
        if (aligned.height != null) {
          result.height = aligned.height.toString();
        }
      }
    }
    const samplerAligned = ensureDistilledSamplerParams(result, model, presetTier);
    if (samplerAligned.steps != null) {
      result.steps = samplerAligned.steps.toString();
    }
    if (samplerAligned.cfg != null) {
      result.cfg = samplerAligned.cfg.toString();
    }
    if (samplerAligned.samplerName != null) {
      result.samplerName = samplerAligned.samplerName.toString();
    }
    if (samplerAligned.scheduler != null) {
      result.scheduler = samplerAligned.scheduler.toString();
    }
  }

  return result;
}

export function ensureQueueLoaderParams(
  params: WorkflowParamValues,
  model?: string,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    vaeMap?: ModelVaeMap;
    unetMap?: ModelUnetMap;
    customTokens?: CustomWorkflowToken[];
    workflowCustomTokens?: CustomWorkflowToken[];
    precisionTier?: LoaderPrecisionTier;
    workflow?: Record<string, unknown>;
  }
): WorkflowParamValues {
  if (!model?.trim()) {
    return params;
  }

  const loaders = resolveLoaderFilenamesForModel(model, options);
  const next = { ...params };
  const workflowTokens = options?.workflowCustomTokens ?? [];
  const hasWorkflowCheckpoint = workflowTokens.some(
    entry => entry.token.trim() === DEFAULT_CHECKPOINT_TOKEN && entry.value.trim()
  );
  const hasWorkflowUnet = workflowTokens.some(
    entry => entry.token.trim() === DEFAULT_UNET_TOKEN && entry.value.trim()
  );
  const hasWorkflowVae = workflowTokens.some(
    entry => entry.token.trim() === DEFAULT_VAE_TOKEN && entry.value.trim()
  );

  if ((hasWorkflowCheckpoint || !next.checkpointFilename?.trim()) && loaders.checkpoint) {
    next.checkpointFilename = loaders.checkpoint;
  }
  if ((hasWorkflowUnet || !next.unetFilename?.trim()) && loaders.unet) {
    next.unetFilename = loaders.unet;
  }
  if ((hasWorkflowVae || !next.vaeFilename?.trim()) && loaders.vae) {
    next.vaeFilename = loaders.vae;
  }

  if (isQwenLightningModel(model)) {
    const bf16 = resolveLightningBf16Loaders(model, {
      checkpoint: next.checkpointFilename?.toString(),
      unet: next.unetFilename?.toString(),
      vae: next.vaeFilename?.toString(),
      dualClip: loaders.dualClip,
    });
    if (bf16.unet) {
      next.unetFilename = bf16.unet;
    }
    if (bf16.checkpoint) {
      next.checkpointFilename = bf16.checkpoint;
    }
    if (bf16.vae) {
      next.vaeFilename = bf16.vae;
    }
  }

  return next;
}

function constrainQueueCheckpointToInventory(
  filename: string | undefined,
  model: string | undefined,
  inventory: string[] | null | undefined
): string | undefined {
  const trimmed = filename?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!inventory?.length) {
    return trimmed;
  }
  const near = matchInventoryFilenameNearMiss(trimmed, inventory);
  if (near) {
    return near;
  }
  if (model && isVideoCheckpointMapKey(model)) {
    return pickVideoCheckpointFromInventory(model, inventory) ?? trimmed;
  }
  return trimmed;
}

export function resolveQueueInjectionContext(input: {
  runtime?: ComfyUiRuntimeConfig;
  override?: WorkflowParamValues;
  model?: string;
  workflow?: Record<string, unknown>;
  precisionTier?: LoaderPrecisionTier;
  availableCheckpoints?: string[] | null;
  availableUnets?: string[] | null;
  availableVaes?: string[] | null;
  availableUpscaleModels?: string[] | null;
}): {
  params: WorkflowParamValues;
  loaders: ModelLoaderFilenames;
  customTokens: CustomWorkflowToken[];
} {
  const baseCustomTokens = resolveCustomWorkflowTokens(input.runtime);
  const workflowCustomTokens = normalizeCustomWorkflowTokens(input.runtime?.workflowCustomTokens);
  const model = input.model?.trim() || input.runtime?.queueTargetModel?.trim();
  const precisionTier = resolveLoaderPrecisionTier({
    workflow: input.workflow,
    explicit: input.precisionTier,
    model,
  });
  const loaderInventory = [
    ...new Set([...(input.availableUnets ?? []), ...(input.availableCheckpoints ?? [])]),
  ];
  const loaderMapOptions = {
    customTokens: baseCustomTokens,
    workflowCustomTokens,
    checkpointMap: input.runtime?.modelCheckpointMap,
    vaeMap: input.runtime?.modelVaeMap,
    precisionTier,
    workflow: input.workflow,
    availableCheckpoints: input.availableCheckpoints,
    availableUnets: input.availableUnets,
    availableVaes: input.availableVaes,
  };
  const mergedParams = realignLoaderFilenamesToWorkflowPrecision(
    resolveQueueParams(input.runtime, input.override, { model }),
    model ?? '',
    input.workflow,
    loaderMapOptions
  );
  let params = ensureQueueLoaderParams(mergedParams, model, loaderMapOptions);

  const inferred = model
    ? resolveLoaderFilenamesForModel(model, loaderMapOptions)
    : ({} as ModelLoaderFilenames);

  const loaders: ModelLoaderFilenames = {
    checkpoint: constrainQueueCheckpointToInventory(
      params.checkpointFilename?.trim() || inferred.checkpoint,
      model,
      loaderInventory
    ),
    unet: params.unetFilename?.trim() || inferred.unet,
    vae: params.vaeFilename?.trim() || inferred.vae,
    dualClip: inferred.dualClip,
  };

  if (isQwenLightningModel(model)) {
    Object.assign(loaders, resolveLightningBf16Loaders(model, loaders));
    if (loaders.unet) {
      params.unetFilename = loaders.unet;
    }
    if (loaders.checkpoint) {
      params.checkpointFilename = loaders.checkpoint;
    }
    if (loaders.vae) {
      params.vaeFilename = loaders.vae;
    }
  }

  params = { ...params };
  if (loaders.checkpoint) {
    params.checkpointFilename = loaders.checkpoint;
  }
  if (!params.unetFilename?.trim() && loaders.unet) {
    params.unetFilename = loaders.unet;
  }
  if (!params.vaeFilename?.trim() && loaders.vae) {
    params.vaeFilename = loaders.vae;
  }

  if (model?.toLowerCase().startsWith('boogu-image') && input.availableVaes?.length) {
    const booguVae = pickBooguVaeFromInventory(input.availableVaes, { model });
    loaders.vae = booguVae;
    params.vaeFilename = booguVae;
  }

  // Always resolve an upscale filename so {{UPSCALE_MODEL}} cannot leak.
  // Inventory constrains the pick when known; otherwise use the system default.
  {
    const preferredUpscale = params.upscaleModelFilename?.trim();
    const upscale =
      (model
        ? resolveUpscaleModelFilename(model, {
            upscaleMap: preferredUpscale
              ? {
                  ...(input.runtime?.modelUpscaleMap ?? {}),
                  [model]: preferredUpscale,
                }
              : input.runtime?.modelUpscaleMap,
            customTokens: baseCustomTokens,
            availableUpscaleModels: input.availableUpscaleModels,
          })
        : undefined) ||
      preferredUpscale ||
      SUGGESTED_MODEL_UPSCALE_MAP.default;
    if (upscale) {
      params.upscaleModelFilename = upscale;
    }
  }
  if (model && !params.refinerCheckpointFilename?.trim()) {
    const refiner = resolveRefinerFilenameForModel(model, {
      refinerMap: input.runtime?.modelRefinerMap,
      customTokens: baseCustomTokens,
    });
    if (refiner) {
      params.refinerCheckpointFilename = refiner;
    }
  }

  const loaderMerged =
    mergeLoaderTokensIntoCustomTokens(params, baseCustomTokens) ?? baseCustomTokens;
  // Per-workflow token overrides always win (e.g. {{LORA_LIGHTNING}} on the library file).
  const customTokenByKey = new Map<string, CustomWorkflowToken>();
  for (const entry of [...loaderMerged, ...workflowCustomTokens]) {
    customTokenByKey.set(entry.token, entry);
  }
  // Stale workflow {{CHECKPOINT}} values (suggested T2V stems) must not beat
  // inventory-constrained loaders when ComfyUI cannot load that file.
  if (loaders.checkpoint && loaderInventory.length > 0) {
    const checkpointToken = customTokenByKey.get(DEFAULT_CHECKPOINT_TOKEN);
    const tokenValue = checkpointToken?.value?.trim();
    if (tokenValue && !matchInventoryFilenameNearMiss(tokenValue, loaderInventory)) {
      customTokenByKey.set(DEFAULT_CHECKPOINT_TOKEN, {
        token: DEFAULT_CHECKPOINT_TOKEN,
        value: loaders.checkpoint,
      });
    }
  }
  const customTokens = [...customTokenByKey.values()];

  return { params, loaders, customTokens };
}

// Workflow JSON parsing, shape-normalization, and placeholder-detection
// helpers live in workflow-json-parse.ts; re-exported here unchanged so
// existing external imports from '@/lib/comfyui-config' keep working.
export {
  normalizeComfyApiWorkflow,
  parseWorkflowJson,
  findUnresolvedLoaderPlaceholders,
  listWorkflowNodeIds,
  countPlaceholders,
  detectWorkflowPlaceholders,
  normalizeCustomWorkflowTokens,
  resolveCustomWorkflowTokens,
  detectCustomWorkflowPlaceholders,
};

function replaceTokenInValue(
  value: unknown,
  token: string,
  replacement: string,
  seen: WeakSet<object> = new WeakSet()
): [unknown, number] {
  if (!token) {
    return [value, 0];
  }

  if (typeof value === 'string') {
    if (!value.includes(token)) {
      return [value, 0];
    }
    return [value.split(token).join(replacement), countPlaceholders(value, token)];
  }

  if (Array.isArray(value)) {
    // Link tuples and nested inputs can form object cycles after graph rewires;
    // without a seen-set this recurses until "Maximum call stack size exceeded".
    if (seen.has(value)) {
      return [value, 0];
    }
    seen.add(value);
    let total = 0;
    const next = value.map(entry => {
      const [replaced, count] = replaceTokenInValue(entry, token, replacement, seen);
      total += count;
      return replaced;
    });
    return [next, total];
  }

  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return [value, 0];
    }
    seen.add(value);
    let total = 0;
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const [replaced, count] = replaceTokenInValue(entry, token, replacement, seen);
      next[key] = replaced;
      total += count;
    }
    return [next, total];
  }

  return [value, 0];
}

function injectParamToken(
  workflow: Record<string, unknown>,
  token: string,
  value: string
): [Record<string, unknown>, number] {
  const [next, count] = replaceTokenInValue(workflow, token, value);
  return [next as Record<string, unknown>, count];
}

export function injectWorkflowPlaceholders(
  workflow: Record<string, unknown>,
  input: {
    positive: string;
    negative?: string;
    params?: WorkflowParamValues;
    customTokens?: CustomWorkflowToken[];
  },
  tokens: WorkflowPlaceholderTokens
): WorkflowInjectionResult {
  // replaceTokenInValue builds a new tree — no defensive clone needed here.
  let current = workflow;
  const paramReplacements: Partial<Record<keyof WorkflowParamValues, number>> = {};
  const customReplacements: Record<string, number> = {};

  const [withPositive, positiveReplacements] = replaceTokenInValue(
    current,
    tokens.positive,
    input.positive
  );
  current = withPositive as Record<string, unknown>;

  let negativeReplacements = 0;
  if (input.negative?.trim()) {
    const [withNegative, count] = replaceTokenInValue(
      current,
      tokens.negative,
      input.negative.trim()
    );
    current = withNegative as Record<string, unknown>;
    negativeReplacements = count;
  }

  if (input.params) {
    const paramEntries: Array<[keyof WorkflowParamValues, string, string]> = [
      ['seed', tokens.seed, input.params.seed?.toString() ?? ''],
      ['width', tokens.width, input.params.width?.toString() ?? ''],
      ['height', tokens.height, input.params.height?.toString() ?? ''],
      ['cfg', tokens.cfg, input.params.cfg?.toString() ?? ''],
      ['steps', tokens.steps, input.params.steps?.toString() ?? ''],
      ['samplerName', tokens.sampler, input.params.samplerName?.toString() ?? ''],
      [
        'scheduler',
        tokens.scheduler,
        ksamplerSafeScheduler(input.params.scheduler?.toString() ?? ''),
      ],
      ['samplingShift', tokens.shift, input.params.samplingShift?.toString() ?? ''],
      ['fluxMaxShift', tokens.fluxMaxShift, input.params.fluxMaxShift?.toString() ?? ''],
      ['fluxBaseShift', tokens.fluxBaseShift, input.params.fluxBaseShift?.toString() ?? ''],
      ['denoise', tokens.denoise, input.params.denoise?.toString() ?? ''],
      ['inputImageFilename', tokens.inputImage, input.params.inputImageFilename?.toString() ?? ''],
      ['maskImageFilename', tokens.maskImage, input.params.maskImageFilename?.toString() ?? ''],
      // {{INIT_IMAGE}} mirrors the same resolved input image for video I2V graphs.
      [
        'inputImageFilename',
        tokens.initImage ?? DEFAULT_INIT_IMAGE_TOKEN,
        input.params.inputImageFilename?.toString() ?? '',
      ],
      [
        'videoFrames',
        tokens.videoFrames ?? DEFAULT_VIDEO_FRAMES_TOKEN,
        input.params.videoFrames?.toString() ?? '',
      ],
      [
        'videoFps',
        tokens.videoFps ?? DEFAULT_VIDEO_FPS_TOKEN,
        input.params.videoFps?.toString() ?? '',
      ],
    ];

    for (const [key, token, value] of paramEntries) {
      if (!value) {
        continue;
      }
      const [next, count] = injectParamToken(current, token, value);
      current = next;
      if (count > 0) {
        paramReplacements[key] = (paramReplacements[key] ?? 0) + count;
      }
    }
  }

  for (const entry of normalizeCustomWorkflowTokens(input.customTokens)) {
    const [next, count] = injectParamToken(current, entry.token, entry.value);
    current = next;
    if (count > 0) {
      customReplacements[entry.token] = count;
    }
  }

  return {
    workflow: current,
    positiveReplacements,
    negativeReplacements,
    paramReplacements,
    customReplacements: Object.keys(customReplacements).length > 0 ? customReplacements : undefined,
  };
}

function isSamplerLikeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const lower = classType.toLowerCase();
  if (lower.includes('modelsampling') || lower.includes('ltxvscheduler')) {
    return false;
  }
  if (
    lower.includes('ksampler') ||
    lower.includes('samplercustom') ||
    lower.includes('guider') ||
    lower.includes('basicscheduler')
  ) {
    return true;
  }
  return 'seed' in inputs && ('steps' in inputs || 'cfg' in inputs);
}

export function patchSamplerParamsInWorkflow(
  workflow: Record<string, unknown>,
  params: WorkflowParamValues,
  model?: string,
  options?: { force?: boolean; mutateInPlace?: boolean }
): {
  workflow: Record<string, unknown>;
  patched: Partial<Record<keyof WorkflowParamValues, number>>;
} {
  const next = options?.mutateInPlace ? workflow : structuredClone(workflow);
  const patched: Partial<Record<keyof WorkflowParamValues, number>> = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      _meta?: { title?: string };
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (!isSamplerLikeNode(record.class_type ?? '', inputs)) {
      continue;
    }

    if (isCastcutProtectedSampler(record)) {
      continue;
    }

    if (!options?.force && shouldSkipGlobalSamplerPatch(record)) {
      continue;
    }

    if (params.seed != null && params.seed.toString().trim() !== '' && 'seed' in inputs) {
      inputs.seed = Number(params.seed);
      patched.seed = (patched.seed ?? 0) + 1;
    }
    if (params.steps != null && params.steps.toString().trim() !== '' && 'steps' in inputs) {
      inputs.steps = Number(params.steps);
      patched.steps = (patched.steps ?? 0) + 1;
    }
    if (params.cfg != null && params.cfg.toString().trim() !== '' && 'cfg' in inputs) {
      // FLUX.1: sidebar CFG is FluxGuidance — keep KSampler at 1.
      if (isFlux1FamilyModel(model)) {
        if (inputs.cfg !== 1) {
          inputs.cfg = 1;
          patched.cfg = (patched.cfg ?? 0) + 1;
        }
      } else {
        inputs.cfg = Number(params.cfg);
        patched.cfg = (patched.cfg ?? 0) + 1;
      }
    } else if (isFlux1FamilyModel(model) && 'cfg' in inputs && inputs.cfg !== 1) {
      inputs.cfg = 1;
      patched.cfg = (patched.cfg ?? 0) + 1;
    }
    if (
      params.samplerName != null &&
      params.samplerName.toString().trim() !== '' &&
      'sampler_name' in inputs
    ) {
      inputs.sampler_name = params.samplerName.toString().trim();
      patched.samplerName = (patched.samplerName ?? 0) + 1;
    }
    if ('scheduler' in inputs) {
      const requested =
        params.scheduler != null && params.scheduler.toString().trim() !== ''
          ? params.scheduler.toString().trim()
          : typeof inputs.scheduler === 'string'
            ? inputs.scheduler
            : '';
      const safe = ksamplerSafeScheduler(requested);
      const writingParams = params.scheduler != null && params.scheduler.toString().trim() !== '';
      if (safe && (writingParams || safe !== requested)) {
        inputs.scheduler = safe;
        patched.scheduler = (patched.scheduler ?? 0) + 1;
      }
    }
    if ('denoise' in inputs) {
      const current = inputs.denoise;
      const isPlaceholder =
        typeof current === 'string' &&
        (current.trim() === DEFAULT_DENOISE_TOKEN || /^\{\{DENOISE\}\}$/.test(current.trim()));
      const resolvedDenoise =
        params.denoise != null && params.denoise.toString().trim() !== ''
          ? Number(params.denoise)
          : isPlaceholder
            ? 1
            : null;
      if (resolvedDenoise != null && (isPlaceholder || params.denoise != null)) {
        inputs.denoise = resolvedDenoise;
        patched.denoise = (patched.denoise ?? 0) + 1;
      }
    }
  }

  return { workflow: next, patched };
}

const ALTERNATE_POSITIVE_TOKENS = ['{{PROMPT}}', '{{prompt}}', '{{PROMPT_POS}}'];
const ALTERNATE_NEGATIVE_TOKENS = ['{{NEG_PROMPT}}', '{{neg_prompt}}', '{{NEGATIVE_PROMPT}}'];

function setWorkflowNodeText(
  workflow: Record<string, unknown>,
  nodeId: string,
  text: string
): boolean {
  const node = workflow[nodeId];
  if (!node || typeof node !== 'object') {
    return false;
  }

  const record = node as { class_type?: string; inputs?: Record<string, unknown> };
  if (!record.inputs) {
    return false;
  }

  const field = resolvePromptEncodeTextField(record.inputs);
  if (!field) {
    return false;
  }

  record.inputs = { ...record.inputs, [field]: text };
  return true;
}

function classifyClipPromptBinding(
  classType: string,
  title: string
): 'positive' | 'negative' | 'unknown' {
  if (isPromptEncodeNode(classType)) {
    return classifyPromptEncodeBinding(classType, title);
  }

  const classLower = classType.toLowerCase();
  if (!classLower.includes('cliptextencode') && !classLower.includes('textencode')) {
    return 'unknown';
  }

  const titleLower = title.toLowerCase();
  if (titleLower.includes('negative') || titleLower.includes(' neg')) {
    return 'negative';
  }
  if (
    titleLower.includes('positive') ||
    titleLower.includes(' pos') ||
    titleLower.includes('prompt')
  ) {
    return 'positive';
  }

  return 'positive';
}

export function patchClipPromptNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: { positive: string; negative?: string }
): {
  workflow: Record<string, unknown>;
  positivePatched: number;
  negativePatched: number;
} {
  const next = structuredClone(workflow);
  let positivePatched = 0;
  let negativePatched = 0;

  type ClipCandidate = {
    nodeId: string;
    binding: 'positive' | 'negative' | 'unknown';
  };

  const candidates: ClipCandidate[] = [];
  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      _meta?: { title?: string };
      inputs?: Record<string, unknown>;
    };
    if (!record.inputs) {
      continue;
    }
    const promptField = resolvePromptEncodeTextField(record.inputs);
    if (!promptField) {
      continue;
    }
    const binding = classifyClipPromptBinding(record.class_type ?? '', record._meta?.title ?? '');
    if (binding === 'unknown') {
      continue;
    }
    candidates.push({ nodeId, binding });
  }

  for (const candidate of candidates) {
    if (candidate.binding === 'positive' && positivePatched === 0) {
      if (setWorkflowNodeText(next, candidate.nodeId, input.positive)) {
        positivePatched += 1;
      }
      continue;
    }
    if (candidate.binding === 'negative' && negativePatched === 0 && input.negative?.trim()) {
      if (setWorkflowNodeText(next, candidate.nodeId, input.negative.trim())) {
        negativePatched += 1;
      }
    }
  }

  if (positivePatched === 0) {
    for (const candidate of candidates) {
      if (candidate.binding !== 'negative') {
        if (setWorkflowNodeText(next, candidate.nodeId, input.positive)) {
          positivePatched += 1;
          break;
        }
      }
    }
  }

  return { workflow: next, positivePatched, negativePatched };
}

function tryAlternatePromptTokens(
  workflow: Record<string, unknown>,
  input: { positive: string; negative?: string },
  tokens: WorkflowPlaceholderTokens,
  current: WorkflowInjectionResult
): WorkflowInjectionResult {
  let result = current;

  if (result.positiveReplacements === 0) {
    for (const alt of ALTERNATE_POSITIVE_TOKENS) {
      if (alt === tokens.positive) {
        continue;
      }
      const [withAlt, count] = replaceTokenInValue(result.workflow, alt, input.positive);
      if (count > 0) {
        result = {
          ...result,
          workflow: withAlt as Record<string, unknown>,
          positiveReplacements: count,
        };
        break;
      }
    }
  }

  if (result.negativeReplacements === 0 && input.negative?.trim()) {
    for (const alt of ALTERNATE_NEGATIVE_TOKENS) {
      if (alt === tokens.negative) {
        continue;
      }
      const [withAlt, count] = replaceTokenInValue(result.workflow, alt, input.negative.trim());
      if (count > 0) {
        result = {
          ...result,
          workflow: withAlt as Record<string, unknown>,
          negativeReplacements: count,
        };
        break;
      }
    }
  }

  return result;
}

function mergeLoaderTokensIntoCustomTokens(
  params: WorkflowParamValues | undefined,
  customTokens?: CustomWorkflowToken[]
): CustomWorkflowToken[] | undefined {
  const fromParams = loaderFilenameCustomTokens({
    checkpoint: params?.checkpointFilename?.trim(),
    unet: params?.unetFilename?.trim(),
    vae: params?.vaeFilename?.trim(),
  });
  if (params?.refinerCheckpointFilename?.trim()) {
    fromParams.push({
      token: DEFAULT_REFINER_TOKEN,
      value: params.refinerCheckpointFilename.trim(),
    });
  }
  if (params?.upscaleModelFilename?.trim()) {
    fromParams.push({
      token: DEFAULT_UPSCALE_MODEL_TOKEN,
      value: params.upscaleModelFilename.trim(),
    });
  } else if (SUGGESTED_MODEL_UPSCALE_MAP.default) {
    // System default — ensure {{UPSCALE_MODEL}} is never left unresolved.
    fromParams.push({
      token: DEFAULT_UPSCALE_MODEL_TOKEN,
      value: SUGGESTED_MODEL_UPSCALE_MAP.default,
    });
  }

  const multiImageTokens = [
    DEFAULT_INPUT_IMAGE_TOKEN,
    DEFAULT_INPUT_IMAGE_2_TOKEN,
    DEFAULT_INPUT_IMAGE_3_TOKEN,
    DEFAULT_INPUT_IMAGE_4_TOKEN,
  ] as const;
  const filenames = normalizeInputImageFilenames(
    params?.inputImageFilename,
    params?.inputImageFilenames
  );
  for (let i = 0; i < multiImageTokens.length; i += 1) {
    const value = filenames[i]?.trim();
    if (value) {
      fromParams.push({ token: multiImageTokens[i], value });
    }
  }

  if (fromParams.length === 0) {
    return customTokens;
  }
  const normalized = normalizeCustomWorkflowTokens(customTokens);
  const byToken = new Map(normalized.map(entry => [entry.token, entry]));
  for (const entry of fromParams) {
    byToken.set(entry.token, entry);
  }
  return [...byToken.values()];
}

export function injectPromptsWithFallbacks(
  workflow: Record<string, unknown>,
  input: {
    positive: string;
    negative?: string;
    params?: WorkflowParamValues;
    customTokens?: CustomWorkflowToken[];
  },
  tokens: WorkflowPlaceholderTokens,
  options?: {
    legacyPositiveNodeId?: string;
    legacyNegativeNodeId?: string;
    directWorkflowPatching?: boolean;
    syncWorkflowLoadersToModel?: boolean;
    loaders?: ModelLoaderFilenames;
    model?: string;
    availableCheckpoints?: string[] | null;
    availableUnets?: string[] | null;
    availableVaes?: string[] | null;
    availableClips?: string[] | null;
    availableLoras?: string[] | null;
    qualityProfile?: QueueQualityProfile;
    samplerPresetTier?: ModelSamplerPresetTier;
    /** Active LoRA stack (strengths/enabled/order) — patched at queue time (incl. Lightning). */
    loraLibrary?: LoraLibraryEntry[];
    /** ComfyUI object_info node class names — gates the optional CLIPVisionLoader on IP-Adapter insert. */
    availableNodeTypes?: Iterable<string> | null;
    /** Multi-slot regional edit prompts/masks. */
    regionalSlots?: import('./regional-prompt-slots').RegionalPromptSlot[];
    kleinEnhancerEnabled?: boolean;
    kleinEnhancerIdentityPreset?: import('./klein-enhancer-workflow-patch').KleinEnhancerIdentityPreset;
    kleinEnhancerTextEnabled?: boolean;
    kleinEnhancerColorAnchorEnabled?: boolean;
    kleinEnhancerColorAnchorStrength?: number;
    samplerOverrides?: import('./model-sampler-defaults').ModelSamplerOverrideFields;
  }
): WorkflowInjectionResult {
  const promptInput = isBooguTurboModel(options?.model) ? { ...input, negative: undefined } : input;
  const loaderMerged = mergeLoaderTokensIntoCustomTokens(
    promptInput.params,
    promptInput.customTokens
  );
  // Fill {{LORA_LIGHTNING}} from workflow tokens / LoRA library / ComfyUI inventory
  // before string injection so unresolved placeholders cannot survive into preflight.
  const lightningMap = buildLightningLoraFilenameMap(
    loaderMerged ?? [],
    options?.model,
    options?.availableLoras ?? undefined
  );
  const customTokenByKey = new Map<string, CustomWorkflowToken>();
  for (const entry of loaderMerged ?? []) {
    customTokenByKey.set(entry.token, entry);
  }
  for (const [token, value] of Object.entries(lightningMap)) {
    if (token.trim() && value.trim()) {
      customTokenByKey.set(token, { token, value });
    }
  }
  // Lightning graphs must not resolve style/catalog {{LORA_*}} tokens — they cause
  // banding / melt even when neutralize later zeros strengths. Keep only Lightning.
  const isLightningModel = isQwenLightningModel(options?.model);
  const mergedCustomTokens = [...customTokenByKey.values()].filter(entry => {
    if (!isLightningModel) {
      return true;
    }
    const token = entry.token.trim();
    if (!/^\{\{LORA_/i.test(token)) {
      return true;
    }
    if (/LIGHTNING|LIGHTX2V/i.test(token)) {
      return true;
    }
    return loraFilenameImpliesLightning(entry.value ?? '');
  });
  let injected = injectWorkflowPlaceholders(
    workflow,
    { ...promptInput, customTokens: mergedCustomTokens },
    tokens
  );
  injected = tryAlternatePromptTokens(
    injected.workflow,
    { positive: promptInput.positive, negative: promptInput.negative },
    tokens,
    injected
  );

  // Placeholder inject returns a private tree — mutate sampler/sampling in place.
  const fluxGuidance = ensureFluxGuidanceInWorkflow(
    injected.workflow,
    options?.model,
    input.params
  );
  const samplerPatch = patchSamplerParamsInWorkflow(
    fluxGuidance.workflow,
    input.params ?? {},
    options?.model,
    { mutateInPlace: true }
  );
  const modelSamplingPatch = patchModelSamplingInWorkflow(
    samplerPatch.workflow,
    input.params ?? {},
    options?.model,
    { mutateInPlace: true }
  );
  let nextWorkflow = modelSamplingPatch.workflow;
  let directPatchCounts: Partial<Record<string, number>> = {};

  const loaders: ModelLoaderFilenames = {
    ...(options?.loaders ?? {}),
  };
  if (input.params?.checkpointFilename?.trim()) {
    loaders.checkpoint = input.params.checkpointFilename.trim();
  }
  if (input.params?.unetFilename?.trim()) {
    loaders.unet = input.params.unetFilename.trim();
  }
  if (input.params?.vaeFilename?.trim()) {
    loaders.vae = input.params.vaeFilename.trim();
  }
  if (!loaders.dualClip && options?.loaders?.dualClip) {
    loaders.dualClip = options.loaders.dualClip;
  }

  // Rapid AIO: convert sticky UNET scaffolds/packs to CheckpointLoader before
  // placeholder resolution so {{UNET}} cannot leak to ComfyUI.
  {
    const rapid = maybeRewriteRapidAioWorkflowLoaders(
      nextWorkflow,
      options?.model,
      loaders.checkpoint
    );
    nextWorkflow = rapid.workflow;
  }

  const isLightning = isQwenLightningModel(options?.model);

  const queueLightningMap = buildLightningLoraFilenameMap(
    mergedCustomTokens ?? [],
    options?.model,
    options?.availableLoras ?? undefined
  );

  if (isLightning) {
    // Native Lightning graphs: do not rewrite concrete loaders / latent sizes.
    // Only fill unresolved placeholders and attach queue input images.
    nextWorkflow = forceResolveLoaderPlaceholders(nextWorkflow, loaders, {
      upscaleModelFilename: input.params?.upscaleModelFilename,
    });
    const figureFilenames = normalizeInputImageFilenames(
      input.params?.inputImageFilename,
      input.params?.inputImageFilenames
    );
    // Bind Figure 1–N by title/index. A single filename must not blanket-stamp
    // every LoadImage on a multi-slot Edit pack.
    if (figureFilenames.some(Boolean)) {
      nextWorkflow = patchLoadImageNodesInWorkflow(
        nextWorkflow,
        figureFilenames[0],
        figureFilenames
      ).workflow;
    }
    nextWorkflow = patchLoadImageMaskNodesInWorkflow(
      nextWorkflow,
      input.params?.maskImageFilename
    ).workflow;
  } else if (options?.directWorkflowPatching !== false) {
    const directPatch = patchWorkflowDirectParams(nextWorkflow, {
      params: input.params,
      loaders,
      upscaleModelFilename: input.params?.upscaleModelFilename,
      controlNetModelFilename: input.params?.controlNetModelFilename,
      controlImageFilename: input.params?.controlImageFilename,
      controlImageFilenames: input.params?.controlImageFilenames,
      ipAdapterImageFilename: input.params?.ipAdapterImageFilename,
      ipAdapterImageFilenames: input.params?.ipAdapterImageFilenames,
      ipAdapterStrength: input.params?.ipAdapterStrength,
      ipAdapterModelFilename: input.params?.ipAdapterModelFilename,
      availableNodeTypes: options?.availableNodeTypes,
      identityKind: input.params?.identityKind,
      customTokens: mergedCustomTokens,
      syncWorkflowLoadersToModel: options?.syncWorkflowLoadersToModel,
      model: options?.model,
      availableCheckpoints: options?.availableCheckpoints,
      availableUnets: options?.availableUnets,
      availableVaes: options?.availableVaes,
      availableClips: options?.availableClips,
      loraLibrary: options?.loraLibrary,
      prompt: input.positive,
      regionalSlots: options?.regionalSlots,
      kleinEnhancerEnabled: options?.kleinEnhancerEnabled,
      kleinEnhancerIdentityPreset: options?.kleinEnhancerIdentityPreset,
      kleinEnhancerTextEnabled: options?.kleinEnhancerTextEnabled,
      kleinEnhancerColorAnchorEnabled: options?.kleinEnhancerColorAnchorEnabled,
      kleinEnhancerColorAnchorStrength: options?.kleinEnhancerColorAnchorStrength,
    });
    if (directPatch.error) {
      throw new Error(directPatch.error);
    }
    nextWorkflow = directPatch.workflow;
    directPatchCounts = directPatch.patched;
    if (directPatch.patched.videoScaffoldFallback) {
      const rebound = injectWorkflowPlaceholders(
        nextWorkflow,
        {
          positive: promptInput.positive,
          negative: promptInput.negative,
          params: input.params,
          customTokens: mergedCustomTokens,
        },
        tokens
      );
      nextWorkflow = rebound.workflow;
      nextWorkflow = patchSamplerParamsInWorkflow(
        nextWorkflow,
        input.params ?? {},
        options?.model,
        { mutateInPlace: true }
      ).workflow;
    }
  } else if (loaders.checkpoint || loaders.unet || loaders.vae) {
    const loaderPatch = patchLoaderNodesInWorkflow(nextWorkflow, loaders, {
      availableCheckpoints: options?.availableCheckpoints,
    });
    nextWorkflow = loaderPatch.workflow;
    directPatchCounts = {
      ...directPatchCounts,
      ...Object.fromEntries(
        Object.entries(loaderPatch.patched).filter(([, count]) => (count ?? 0) > 0)
      ),
    };
  }

  // Lightning inject skips patchWorkflowDirectParams — still snap pack ImageScale /
  // ResizeImage nodes to queue W×H so preprocess sizes don't fight EmptyLatent.
  // Run before prepareLightning so encode-path "ref → latent size" scales added
  // afterward are not clobbered.
  if (isLightning && input.params?.width != null && input.params?.height != null) {
    const hasInputImage = Boolean(
      input.params.inputImageFilename?.toString().trim() ||
      input.params.inputImageFilenames?.some(name => Boolean(name?.toString().trim()))
    );
    const resizePatch = patchImageResizeNodesInWorkflow(nextWorkflow, input.params, {
      encodeReferencesOnly: hasInputImage,
    });
    nextWorkflow = resizePatch.workflow;
    directPatchCounts = {
      ...directPatchCounts,
      ...Object.fromEntries(
        Object.entries(resizePatch.patched).filter(([, count]) => (count ?? 0) > 0)
      ),
    };
  }

  nextWorkflow = prepareLightningWorkflowForQueue(nextWorkflow, options?.model, queueLightningMap, {
    params: input.params,
    loaders,
    syncLoadersToModel: isLightning ? false : options?.syncWorkflowLoadersToModel,
  });

  nextWorkflow = prepareBooguTurboWorkflowForQueue(nextWorkflow, options?.model);

  if (shouldNeutralizeStyleLorasAtQueue(options?.model)) {
    nextWorkflow = neutralizeNonLightningLoras(
      nextWorkflow,
      options?.model,
      queueLightningMap
    ).workflow;
  }

  // Lightning prep zeros baked-in pack style LoRAs. Re-apply the session/Settings
  // stack afterward so sidebar picks still load (on neutralized anchors or after
  // the Lightning node when the graph has no style loaders). Includes Edit-2511
  // Lightning — Lightning LoRA stays first; selected style LoRAs chain after it.
  if (isLightning) {
    const loraStackPatch = applyLoraStackToWorkflow(nextWorkflow, options?.loraLibrary, {
      prompt: input.positive,
    });
    nextWorkflow = loraStackPatch.workflow;
    directPatchCounts = {
      ...directPatchCounts,
      ...Object.fromEntries(
        Object.entries(loraStackPatch.patched).filter(([, count]) => (count ?? 0) > 0)
      ),
    };

    // Lightning skips patchWorkflowDirectParams — still splice ControlNet when a
    // control image is queued (Story/Day pose guides). Soft no-op when the graph
    // has no sampler cond links or ControlNetApply is unavailable.
    const hasControlImage = Boolean(
      input.params?.controlImageFilename?.toString().trim() ||
      input.params?.controlImageFilenames?.some(name => Boolean(name?.toString().trim()))
    );
    if (hasControlImage) {
      const controlPatch = patchControlNetInWorkflow(nextWorkflow, {
        controlNetModelFilename: input.params?.controlNetModelFilename,
        controlImageFilename: input.params?.controlImageFilename,
        controlImageFilenames: input.params?.controlImageFilenames,
        availableNodeTypes: options?.availableNodeTypes,
        controlNetMode: input.params?.controlNetMode,
        controlNetModes: input.params?.controlNetModes,
        controlNetStrengths: input.params?.controlNetStrengths,
        skipPreprocessor:
          input.params?.controlNetSkipPreprocessor === true ||
          String(input.params?.controlNetSkipPreprocessor ?? '').trim() === 'true',
      });
      nextWorkflow = controlPatch.workflow;
      directPatchCounts = {
        ...directPatchCounts,
        ...Object.fromEntries(
          Object.entries(controlPatch.patched).filter(([, count]) => (count ?? 0) > 0)
        ),
      };
    }
  }

  // Non-Lightning edit packs/scaffolds still need Figure→encode wiring.
  if (
    options?.model &&
    !isQwenLightningModel(options.model) &&
    (isEditCapableModel(options.model) || /edit/i.test(options.model))
  ) {
    nextWorkflow = prepareQwenEditReferenceImagesForQueue(
      nextWorkflow,
      options.model,
      input.params
    );
  }

  const distilledModelId = options?.model;
  if (
    distilledModelId &&
    (isLightningModelId(distilledModelId) || isQwenRapidAioModel(distilledModelId))
  ) {
    const distilledTier = resolveEffectiveSamplerPreset(
      options?.samplerPresetTier,
      options?.qualityProfile != null
        ? normalizeQueueQualityProfile(options.qualityProfile)
        : undefined,
      { model: distilledModelId }
    );
    const distilledSampler = ensureDistilledSamplerParams(
      input.params ?? {},
      distilledModelId,
      distilledTier
    );
    const userDenoiseOverride = resolveUserSamplerDenoiseOverride(
      options?.samplerOverrides ?? loadSettingsCache().shared.modelSamplerOverrides
    );
    const resolvedDenoise = resolveDistilledQueueDenoise(distilledModelId, {
      hasInputImage: Boolean(
        input.params?.inputImageFilename?.toString().trim() ||
        input.params?.inputImageFilenames?.some(name => Boolean(name?.toString().trim()))
      ),
      hasMaskImage: Boolean(input.params?.maskImageFilename?.toString().trim()),
      paramsDenoise: input.params?.denoise ?? distilledSampler.denoise,
      userDenoiseOverride,
    });
    if (resolvedDenoise != null) {
      distilledSampler.denoise = resolvedDenoise;
    }
    nextWorkflow = patchSamplerParamsInWorkflow(nextWorkflow, distilledSampler, distilledModelId, {
      force: true,
      mutateInPlace: true,
    }).workflow;
  }

  injected = {
    ...injected,
    workflow: nextWorkflow,
    paramReplacements: {
      ...injected.paramReplacements,
      ...Object.fromEntries(
        Object.entries(samplerPatch.patched).filter(([, count]) => (count ?? 0) > 0)
      ),
      ...Object.fromEntries(
        Object.entries(modelSamplingPatch.patched).filter(([, count]) => (count ?? 0) > 0)
      ),
      ...Object.fromEntries(
        Object.entries(directPatchCounts).filter(([, count]) => (count ?? 0) > 0)
      ),
    },
  };

  if (
    injected.positiveReplacements === 0 &&
    options?.legacyPositiveNodeId &&
    setWorkflowNodeText(injected.workflow, options.legacyPositiveNodeId, input.positive)
  ) {
    injected = { ...injected, positiveReplacements: 1 };
  }

  if (
    injected.negativeReplacements === 0 &&
    input.negative?.trim() &&
    options?.legacyNegativeNodeId &&
    setWorkflowNodeText(injected.workflow, options.legacyNegativeNodeId, input.negative.trim())
  ) {
    injected = { ...injected, negativeReplacements: 1 };
  }

  if (
    injected.positiveReplacements === 0 ||
    (input.negative?.trim() && injected.negativeReplacements === 0)
  ) {
    const clipPatch = patchClipPromptNodesInWorkflow(injected.workflow, {
      positive: input.positive,
      negative: input.negative,
    });
    injected = {
      ...injected,
      workflow: clipPatch.workflow,
      positiveReplacements:
        injected.positiveReplacements > 0
          ? injected.positiveReplacements
          : clipPatch.positivePatched,
      negativeReplacements:
        injected.negativeReplacements > 0
          ? injected.negativeReplacements
          : clipPatch.negativePatched,
    };
  }

  if (loaders.checkpoint || loaders.unet || loaders.vae) {
    injected = {
      ...injected,
      workflow: forceResolveLoaderPlaceholders(injected.workflow, loaders, {
        upscaleModelFilename: input.params?.upscaleModelFilename,
      }),
    };
  }

  // Final safety: never let {{UPSCALE_MODEL}} reach ComfyUI.
  const upscaleFallback =
    input.params?.upscaleModelFilename?.trim() ||
    SUGGESTED_MODEL_UPSCALE_MAP.default ||
    '4x-UltraSharp.pth';
  injected = {
    ...injected,
    workflow: replaceUpscaleModelTokenInJson(
      patchUpscaleModelNodesInWorkflow(injected.workflow, upscaleFallback).workflow,
      upscaleFallback
    ),
  };

  const ltxClip = ensureLtxClipLoaderForQueue(injected.workflow, {
    model: options?.model,
    checkpointFilename: loaders.checkpoint ?? input.params?.checkpointFilename?.toString(),
    availableClips: options?.availableClips,
  });
  if (ltxClip.error) {
    throw new Error(ltxClip.error);
  }
  injected = { ...injected, workflow: ltxClip.workflow };

  const hasInputImage = Boolean(
    input.params?.inputImageFilename?.toString().trim() ||
    input.params?.inputImageFilenames?.some(name => Boolean(name?.toString().trim()))
  );
  if (!hasInputImage) {
    const disconnected = disconnectQwenEditReferenceImagesForTxt2Img(injected.workflow, {
      hasInputImage: false,
    });
    injected = {
      ...injected,
      workflow: pruneUnresolvedQwenEditFigureLoaders(disconnected.workflow).workflow,
    };
  }

  injected = { ...injected, workflow: stripComfyUiOnlyNodes(injected.workflow) };

  return injected;
}

export function validateWorkflowJson(
  raw: string,
  tokens: Pick<WorkflowPlaceholderTokens, 'positive' | 'negative'> = {
    positive: DEFAULT_POSITIVE_TOKEN,
    negative: DEFAULT_NEGATIVE_TOKEN,
  }
): {
  ok: boolean;
  error?: string;
  nodeIds?: string[];
  placeholders?: ReturnType<typeof detectWorkflowPlaceholders>;
} {
  const workflow = parseWorkflowJson(raw);
  if (!workflow) {
    return { ok: false, error: 'Workflow must be a JSON object.' };
  }

  const nodeIds = listWorkflowNodeIds(workflow);
  if (nodeIds.length === 0) {
    return {
      ok: false,
      error: 'No numeric node IDs found (expected ComfyUI API format).',
    };
  }

  const placeholders = detectWorkflowPlaceholders(raw, tokens);
  if (placeholders.positive === 0) {
    return {
      ok: false,
      error: `Workflow must include at least one ${tokens.positive} placeholder.`,
      nodeIds,
      placeholders,
    };
  }

  return { ok: true, nodeIds, placeholders };
}

export function stripEmptyComfyUiRuntime(
  runtime?: ComfyUiRuntimeConfig
): ComfyUiRuntimeConfig | undefined {
  if (!runtime) {
    return undefined;
  }

  const result: ComfyUiRuntimeConfig = {};

  const apiUrl = runtime.apiUrl?.trim();
  if (apiUrl) {
    result.apiUrl = apiUrl;
  }

  const preferredComfyHost = runtime.preferredComfyHost?.trim();
  if (preferredComfyHost) {
    result.preferredComfyHost = preferredComfyHost;
  }

  if (runtime.comfyPoolLoadBalance === false) {
    result.comfyPoolLoadBalance = false;
  }

  if (
    typeof runtime.comfyPoolBusyThreshold === 'number' &&
    Number.isFinite(runtime.comfyPoolBusyThreshold) &&
    runtime.comfyPoolBusyThreshold >= 0
  ) {
    result.comfyPoolBusyThreshold = runtime.comfyPoolBusyThreshold;
  }

  if (Array.isArray(runtime.comfyPoolUrls) && runtime.comfyPoolUrls.length > 0) {
    result.comfyPoolUrls = runtime.comfyPoolUrls.map(url => url.trim()).filter(Boolean);
  }

  const workflowJson = runtime.workflowJson?.trim();
  if (workflowJson) {
    result.workflowJson = workflowJson;
  }

  const workflowFileId = runtime.workflowFileId?.trim();
  if (workflowFileId) {
    result.workflowFileId = workflowFileId;
  }

  const positiveToken = runtime.positiveToken?.trim();
  if (positiveToken) {
    result.positiveToken = positiveToken;
  }

  const negativeToken = runtime.negativeToken?.trim();
  if (negativeToken) {
    result.negativeToken = negativeToken;
  }

  const queueTargetModel = runtime.queueTargetModel?.trim();
  if (queueTargetModel) {
    result.queueTargetModel = queueTargetModel;
  }

  if (runtime.directWorkflowPatching === false) {
    result.directWorkflowPatching = false;
  }
  if (runtime.syncWorkflowLoadersToModel === true) {
    result.syncWorkflowLoadersToModel = true;
  }
  if (runtime.workflowQueueOptimize === false) {
    result.workflowQueueOptimize = false;
  }
  if (runtime.workflowGraphEnrich === false) {
    result.workflowGraphEnrich = false;
  }
  if (runtime.workflowSdxlRefinerEnrich === false) {
    result.workflowSdxlRefinerEnrich = false;
  }
  if (runtime.workflowNeuralUpscalePolish === false) {
    result.workflowNeuralUpscalePolish = false;
  }
  // Sharpen is opt-in — persist both true and false so server enrich matches Settings.
  if (runtime.workflowSharpenAfterUpscale === true) {
    result.workflowSharpenAfterUpscale = true;
  } else if (runtime.workflowSharpenAfterUpscale === false) {
    result.workflowSharpenAfterUpscale = false;
  }
  if (runtime.compactDraftSaves === false) {
    result.compactDraftSaves = false;
  }

  if (runtime.queueQualityProfile) {
    result.queueQualityProfile = runtime.queueQualityProfile;
  }

  if (runtime.modelCheckpointMap && Object.keys(runtime.modelCheckpointMap).length > 0) {
    result.modelCheckpointMap = runtime.modelCheckpointMap;
  }
  if (runtime.modelVaeMap && Object.keys(runtime.modelVaeMap).length > 0) {
    result.modelVaeMap = runtime.modelVaeMap;
  }
  if (runtime.modelRefinerMap && Object.keys(runtime.modelRefinerMap).length > 0) {
    result.modelRefinerMap = runtime.modelRefinerMap;
  }
  if (runtime.modelUpscaleMap && Object.keys(runtime.modelUpscaleMap).length > 0) {
    result.modelUpscaleMap = runtime.modelUpscaleMap;
  }

  const workflowOptimizedHash = runtime.workflowOptimizedHash?.trim();
  if (workflowOptimizedHash) {
    result.workflowOptimizedHash = workflowOptimizedHash;
  }
  const workflowOptimizedModel = runtime.workflowOptimizedModel?.trim();
  if (workflowOptimizedModel) {
    result.workflowOptimizedModel = workflowOptimizedModel;
  }
  if (runtime.workflowOptimizedProfile) {
    result.workflowOptimizedProfile = runtime.workflowOptimizedProfile;
  }
  if (runtime.systemWorkflowSource === 'pack' || runtime.systemWorkflowSource === 'scaffold') {
    result.systemWorkflowSource = runtime.systemWorkflowSource;
  }
  const systemWorkflowLabel = runtime.systemWorkflowLabel?.trim();
  if (systemWorkflowLabel) {
    result.systemWorkflowLabel = systemWorkflowLabel;
  }

  if (runtime.queueParams) {
    const params = { ...runtime.queueParams };
    const hasParams = Object.values(params).some(
      value => value != null && value.toString().trim() !== ''
    );
    if (hasParams) {
      result.queueParams = params;
    }
  }

  const customTokens = normalizeCustomWorkflowTokens(runtime.customTokens);
  if (customTokens.length > 0) {
    result.customTokens = customTokens;
  }

  const workflowCustomTokens = normalizeCustomWorkflowTokens(runtime.workflowCustomTokens);
  if (workflowCustomTokens.length > 0) {
    result.workflowCustomTokens = workflowCustomTokens;
  }

  const loraLibrary = normalizeLoraLibrary(runtime.loraLibrary).filter(entry =>
    entry.tokenValue?.trim()
  );
  if (loraLibrary.length > 0) {
    result.loraLibrary = loraLibrary;
  }

  if (Object.keys(result).length === 0) {
    return undefined;
  }

  return result;
}

export const WORKFLOW_PARAM_TOKEN_HELP = [
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_WIDTH_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
  DEFAULT_CFG_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
  DEFAULT_MASK_IMAGE_TOKEN,
  DEFAULT_INIT_IMAGE_TOKEN,
  DEFAULT_VIDEO_FRAMES_TOKEN,
  DEFAULT_VIDEO_FPS_TOKEN,
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  DEFAULT_UPSCALE_MODEL_TOKEN,
  DEFAULT_REFINER_TOKEN,
  DEFAULT_IPADAPTER_IMAGE_TOKEN,
  DEFAULT_IPADAPTER_STRENGTH_TOKEN,
  DEFAULT_IPADAPTER_MODEL_TOKEN,
] as const;

export function resolveWorkflowGraphEnrichOptions(runtime?: ComfyUiRuntimeConfig): {
  enrichGraph: boolean;
  enrichSdxlRefiner: boolean;
  enrichNeuralPolish: boolean;
  enrichSharpen: boolean;
} {
  const enrichGraph = runtime?.workflowGraphEnrich !== false;
  const isMax = normalizeQueueQualityProfile(runtime?.queueQualityProfile) === 'max';
  return {
    enrichGraph,
    enrichSdxlRefiner: enrichGraph && runtime?.workflowSdxlRefinerEnrich !== false,
    enrichNeuralPolish: enrichGraph && (isMax || runtime?.workflowNeuralUpscalePolish !== false),
    // Max quality enables sharpen unless the user explicitly turned it off.
    enrichSharpen:
      enrichGraph &&
      (isMax
        ? runtime?.workflowSharpenAfterUpscale !== false
        : runtime?.workflowSharpenAfterUpscale === true),
  };
}
