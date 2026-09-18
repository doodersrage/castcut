import { isQwenLightningModel } from './model-sampling-patch';
import { shouldNeutralizeStyleLorasAtQueue } from './model-sampler-defaults';
import type { WorkflowParamValues } from './comfyui-config';
import { COMFY_MODEL_IDS, getComfyModelDefinition, type ComfyImageModel } from './comfy-models';
import { isFlux1FamilyModel, isFluxKleinModel } from './model-denoise-defaults';
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  filenameLooksLikeCheckpointOnly,
  isVaeFilenameIncompatibleWithModel,
  type ModelLoaderFilenames,
} from './model-checkpoint-map';
import { precisionHintFromFilename, qwenUnetFamiliesCompatible } from './model-loader-precision';
import { DEFAULT_CONTROL_IMAGE_TOKEN } from './model-controlnet-map';
import { DEFAULT_UPSCALE_MODEL_TOKEN, SUGGESTED_MODEL_UPSCALE_MAP } from './model-upscale-map';
import {
  buildLoraFilenameMapFromCustomTokens,
  buildLightningLoraFilenameMap,
  patchLoraNodesInWorkflow,
} from './workflow-lora-patch';
import { applyLoraStackToWorkflow, type LoraLibraryEntry } from './lora-stack';
import {
  insertIpAdapterChainIfMissing,
  insertIpAdapterStack,
  patchIpAdapterTokensInWorkflow,
} from './ipadapter-workflow-patch';
import { insertControlNetChainIfMissing, insertControlNetStack } from './controlnet-workflow-patch';
import { insertIdentityChainIfMissing } from './identity-workflow-patch';
import { type RegionalPromptSegment } from './regional-prompt-builder';
import { applyRegionalEditToWorkflow } from './workflow-regional-patch';
import { normalizeRegionalPromptSlots, type RegionalPromptSlot } from './regional-prompt-slots';
import {
  countFigureLoadImageSlots,
  inferLoadImageBinding,
  normalizeInputImageFilenames,
} from './workflow-load-image-bindings';
import { ensureKleinReferenceLatentWiringInWorkflow } from './workflow-img2img-patch';
import {
  ensureKleinEnhancerPackWiringInWorkflow,
  kleinEnhancerPackAvailable,
  type KleinEnhancerIdentityPreset,
} from './klein-enhancer-workflow-patch';
import { ensureFluxGuidanceInWorkflow } from './flux-guidance-patch';
import { isVideoCheckpointMapKey } from './video-checkpoint-pick';
import {
  buildBuiltInVideoI2vWorkflow,
  resolveInstalledVideoWeight,
  resolveVideoSplitCompanions,
  rewriteCheckpointLoadersToVideoSplit,
  videoWeightIsUnetOnly,
  ensureLtxClipLoaderForQueue,
  isLtxVideoModel,
  pickLtxTextEncoderFilename,
} from './video-i2v-scaffold';

export const IMAGE_SCALE_BY_NODE_TYPE = 'ImageScaleBy';

const QWEN_EDIT_ENCODE_TYPES = new Set([
  'TextEncodeQwenImageEdit',
  'TextEncodeQwenImageEditPlus',
  'TextEncodeBooguEdit',
]);
const QWEN_EDIT_IMAGE_INPUT_KEYS = ['image', 'image1', 'image2', 'image3', 'image4'] as const;

function workflowNodeLinkId(value: unknown): string | null {
  return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : null;
}

/** ImageScale / ResizeImage nodes on encode or ReferenceLatent ref paths. */
function collectQwenEditEncodeResizeNodeIds(workflow: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();

  const addScaleChainFromLoader = (startId: string | null) => {
    let cursor = startId;
    while (cursor) {
      const linked = workflow[cursor] as
        { class_type?: string; inputs?: Record<string, unknown> } | undefined;
      if (!linked?.inputs) {
        break;
      }
      if (linked.class_type === 'LoadImage' || linked.class_type === 'LoadImageOutput') {
        break;
      }
      if (linked.class_type === 'ImageScale' || linked.class_type === 'ResizeImage') {
        ids.add(cursor);
      }
      cursor = workflowNodeLinkId(linked.inputs.image);
    }
  };

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as { class_type?: string; inputs?: Record<string, unknown> };
    if (!record.inputs) {
      continue;
    }
    if (QWEN_EDIT_ENCODE_TYPES.has(record.class_type ?? '')) {
      for (const key of QWEN_EDIT_IMAGE_INPUT_KEYS) {
        if (!(key in record.inputs)) {
          continue;
        }
        addScaleChainFromLoader(workflowNodeLinkId(record.inputs[key]));
      }
    }
    if (record.class_type === 'VAEEncode') {
      addScaleChainFromLoader(workflowNodeLinkId(record.inputs.pixels));
    }
  }
  return ids;
}

export type WorkflowDirectPatchCounts = {
  width?: number;
  height?: number;
  crop?: number;
  checkpoint?: number;
  unet?: number;
  vae?: number;
  dualClip?: number;
  upscaleModel?: number;
  inputImage?: number;
  maskImage?: number;
  lora?: number;
  loraStack?: number;
  emptySd3Latent?: number;
  unetWeightDtype?: number;
  controlNet?: number;
  controlImage?: number;
  /** Nodes spliced in by insertControlNetChainIfMissing when the workflow had none. */
  controlNetInserted?: number;
  ipAdapterImage?: number;
  ipAdapterStrength?: number;
  ipAdapterModel?: number;
  /** Nodes spliced in by insertIpAdapterChainIfMissing when the workflow had none. */
  ipAdapterInserted?: number;
  /** InstantID/PuLID nodes spliced when IP-Adapter Plus is absent. */
  identityInserted?: number;
  /** {{REGION_*}} placeholders resolved from custom tokens. */
  regionalTokens?: number;
  /** Regional/attention nodes bound from multi-slot regional edit. */
  regionalNodes?: number;
  /** WAN/Hunyuan Video I2V node spliced in to wire an uploaded init image into the sampler chain. */
  videoImageToVideoWired?: number;
  /** Selected graph could not I2V-wire; replaced with the built-in WAN/Hunyuan/LTX scaffold. */
  videoScaffoldFallback?: number;
  /** CheckpointLoaderSimple rewritten to UNET + CLIP + VAE for diffusion_models video weights. */
  videoSplitLoaders?: number;
  /** LTX CLIPLoader type ltxv spliced because the checkpoint CLIP output is None. */
  ltxClipLoader?: number;
  /** Klein ReferenceLatent instruction-edit wiring when figures are queued. */
  img2imgLatentWired?: number;
  referenceLatentWired?: number;
  kleinEnhancerWired?: number;
  kleinTextEnhancerWired?: number;
  kleinColorAnchorWired?: number;
  fluxGuidance?: number;
};

const VIDEO_I2V_WIRE_ERROR =
  'Init image was set for a video model, but I2V could not be wired even with the built-in WAN/Hunyuan/LTX scaffold. Import a pack with WanImageToVideo, HunyuanImageToVideo, HunyuanVideo15ImageToVideo, or LTXVImgToVideo, or clear the init image for text-to-video.';

function videoI2vWireError(detail: string): string {
  return `${VIDEO_I2V_WIRE_ERROR} (${detail})`;
}

const INPUT_IMAGE_TYPES = new Set(['LoadImage', 'LoadImageOutput']);
const MASK_IMAGE_TYPES = new Set(['LoadImageMask']);

const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);

const UNET_LOADER_TYPES = new Set(['UNETLoader', 'UnetLoaderGGUF']);

const VAE_LOADER_TYPES = new Set(['VAELoader']);

const DUAL_CLIP_LOADER_TYPES = new Set(['DualCLIPLoader']);
const CLIP_LOADER_TYPES = new Set(['CLIPLoader']);

const DEPRECATED_QWEN_CLIP_FILENAMES: Record<string, string> = {
  'qwen_2.5_vl_7b_bf16.safetensors': 'qwen_2.5_vl_7b.safetensors',
};

const CONTROLNET_LOADER_TYPES = new Set(['ControlNetLoader', 'DiffControlNetLoader']);

const UPSCALE_MODEL_LOADER_TYPES = new Set(['UpscaleModel', 'UpscaleModelLoader']);

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

function shouldPatchStringField(
  current: unknown,
  nextValue: string | undefined
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (typeof current === 'string') {
    if (isUnresolvedWorkflowPlaceholder(current)) {
      return true;
    }
    return current.trim() !== nextValue.trim();
  }
  return current == null || current === '';
}

function loaderFilenameMissingFromInventory(current: string, inventory?: string[] | null): boolean {
  if (!inventory?.length) {
    return false;
  }
  const trimmed = current.trim();
  if (!trimmed || isUnresolvedWorkflowPlaceholder(trimmed)) {
    return false;
  }
  const lower = trimmed.toLowerCase();
  return !inventory.some(entry => {
    const e = entry.trim();
    return e === trimmed || e.toLowerCase() === lower;
  });
}

/** Loader filenames: only fill placeholders/empty fields — never clobber a chosen checkpoint/UNET/VAE. */
function shouldPatchLoaderFilenameField(
  current: unknown,
  nextValue: string | undefined,
  syncLoadersToModel?: boolean,
  availableInventory?: string[] | null
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (syncLoadersToModel) {
    return shouldPatchStringField(current, nextValue);
  }
  if (typeof current === 'string') {
    if (isUnresolvedWorkflowPlaceholder(current)) {
      return true;
    }
    // Concrete names that ComfyUI does not have installed will fail at queue —
    // rewrite them to the resolved inventory-backed loader.
    if (loaderFilenameMissingFromInventory(current, availableInventory)) {
      return true;
    }
    return false;
  }
  return current == null || current === '';
}

/** Overwrite concrete loader filenames when queue resolved a different precision tier. */
function shouldAlignLoaderPrecision(current: unknown, nextValue: string | undefined): boolean {
  if (!nextValue?.trim() || typeof current !== 'string') {
    return false;
  }
  if (isUnresolvedWorkflowPlaceholder(current)) {
    return false;
  }
  const currentTier = precisionHintFromFilename(current.trim());
  const nextTier = precisionHintFromFilename(nextValue.trim());
  if (!currentTier || !nextTier || currentTier === nextTier) {
    return false;
  }
  // Never downgrade concrete bf16/fp16 weights to fp8 at queue time.
  if (currentTier === 'bf16' && nextTier === 'fp8') {
    return false;
  }
  // Never swap Qwen T2I ↔ Edit UNETs under the guise of fp8→bf16 alignment —
  // that produces crystalline/shattered artifacts.
  if (!qwenUnetFamiliesCompatible(current.trim(), nextValue.trim())) {
    return false;
  }
  return true;
}

/** fp8 weight_dtype on bf16 UNET causes grain/grid — clear dtype when filename is bf16-tier. */
function alignUnetWeightDtypeToFilename(
  inputs: Record<string, unknown>,
  filename: string
): boolean {
  if (!('weight_dtype' in inputs)) {
    return false;
  }
  const tier = precisionHintFromFilename(filename);
  if (tier !== 'bf16') {
    return false;
  }
  const dtype = inputs.weight_dtype;
  if (typeof dtype !== 'string' || !/fp8|e4m3fn/i.test(dtype)) {
    return false;
  }
  inputs.weight_dtype = 'default';
  return true;
}

function shouldPatchClipFilename(
  current: unknown,
  nextValue: string | undefined,
  syncLoadersToModel?: boolean
): nextValue is string {
  const trimmedNext = nextValue?.trim();
  if (!trimmedNext) {
    return false;
  }
  if (shouldPatchLoaderFilenameField(current, nextValue, syncLoadersToModel)) {
    return true;
  }
  if (typeof current === 'string') {
    const deprecated = DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()];
    if (deprecated && deprecated === trimmedNext) {
      return true;
    }
  }
  return false;
}

function shouldPatchNumericField(
  current: unknown,
  nextValue: string | number | undefined
): nextValue is string | number {
  if (nextValue == null || nextValue.toString().trim() === '') {
    return false;
  }
  if (isUnresolvedWorkflowPlaceholder(current)) {
    return true;
  }
  if (typeof current === 'number') {
    return Number(current) !== Number(nextValue);
  }
  if (typeof current === 'string' && /^\d+$/.test(current.trim())) {
    return Number(current) !== Number(nextValue);
  }
  return current == null || current === '';
}

export function isLatentSizeNode(classType: string, inputs: Record<string, unknown>): boolean {
  const classLower = classType.toLowerCase();
  if (!('width' in inputs) || !('height' in inputs)) {
    return false;
  }
  return (
    classLower.includes('emptylatent') ||
    classLower.includes('latentimage') ||
    (classLower.includes('empty') && classLower.includes('latent'))
  );
}

/**
 * Match empty-latent channel family to the model:
 * - Qwen / SD3 / FLUX.1 → EmptySD3LatentImage (16-ch)
 * - FLUX.2 Klein / flux2 → EmptyFlux2LatentImage
 * EmptyLatentImage is 4-ch SDXL and melts Flux.1 decode into plastic/warped output.
 */
export function normalizeEmptyLatentForModel(
  workflow: Record<string, unknown>,
  model?: string
): { workflow: Record<string, unknown>; converted: number } {
  if (!model?.trim()) {
    return { workflow, converted: 0 };
  }

  const category = COMFY_MODEL_IDS.has(model)
    ? getComfyModelDefinition(model as ComfyImageModel).category
    : /qwen/i.test(model)
      ? 'qwen'
      : /sd3/i.test(model)
        ? 'sd3'
        : /flux/i.test(model)
          ? 'flux'
          : null;

  const targetClass =
    isFluxKleinModel(model) || model === 'flux2'
      ? 'EmptyFlux2LatentImage'
      : category === 'qwen' ||
          category === 'sd3' ||
          isFlux1FamilyModel(model) ||
          (category === 'flux' && !isFluxKleinModel(model) && model !== 'flux2')
        ? 'EmptySD3LatentImage'
        : null;

  if (!targetClass) {
    return { workflow, converted: 0 };
  }

  const next = structuredClone(workflow);
  let converted = 0;
  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as { class_type?: string };
    const classType = record.class_type ?? '';
    if (
      classType === 'EmptyLatentImage' ||
      classType === 'EmptyFluxLatentImage' ||
      classType === 'EmptyFlux2LatentImage' ||
      classType === 'EmptySD3LatentImage'
    ) {
      if (classType !== targetClass) {
        record.class_type = targetClass;
        converted += 1;
      }
    }
  }

  return converted > 0 ? { workflow: next, converted } : { workflow, converted: 0 };
}

export function patchLatentSizeInWorkflow(
  workflow: Record<string, unknown>,
  params: Pick<WorkflowParamValues, 'width' | 'height'>
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs || !isLatentSizeNode(record.class_type ?? '', inputs)) {
      continue;
    }

    if (shouldPatchNumericField(inputs.width, params.width)) {
      inputs.width = Number(params.width);
      patched.width = (patched.width ?? 0) + 1;
    }
    if (shouldPatchNumericField(inputs.height, params.height)) {
      inputs.height = Number(params.height);
      patched.height = (patched.height ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

export function patchLoaderNodesInWorkflow(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames,
  options?: {
    syncLoadersToModel?: boolean;
    alignClipPrecision?: boolean;
    availableCheckpoints?: string[] | null;
    availableUnets?: string[] | null;
    model?: string;
  }
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const syncLoadersToModel = options?.syncLoadersToModel === true;
  const alignClipPrecision = options?.alignClipPrecision !== false;
  const checkpointInventory = options?.availableCheckpoints;
  const unetInventory = options?.availableUnets;
  const checkpointOrUnetInventory =
    checkpointInventory || unetInventory
      ? [...new Set([...(checkpointInventory ?? []), ...(unetInventory ?? [])])]
      : undefined;
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (
      loaders.checkpoint &&
      CHECKPOINT_LOADER_TYPES.has(classType) &&
      'ckpt_name' in inputs &&
      (shouldPatchLoaderFilenameField(
        inputs.ckpt_name,
        loaders.checkpoint,
        syncLoadersToModel,
        checkpointOrUnetInventory
      ) ||
        shouldAlignLoaderPrecision(inputs.ckpt_name, loaders.checkpoint))
    ) {
      inputs.ckpt_name = loaders.checkpoint;
      patched.checkpoint = (patched.checkpoint ?? 0) + 1;
    }

    if (
      loaders.unet &&
      !filenameLooksLikeCheckpointOnly(loaders.unet) &&
      UNET_LOADER_TYPES.has(classType) &&
      'unet_name' in inputs
    ) {
      const shouldPatch =
        shouldPatchLoaderFilenameField(
          inputs.unet_name,
          loaders.unet,
          syncLoadersToModel,
          unetInventory
        ) ||
        shouldAlignLoaderPrecision(inputs.unet_name, loaders.unet) ||
        (typeof inputs.unet_name === 'string' && filenameLooksLikeCheckpointOnly(inputs.unet_name));
      if (shouldPatch) {
        inputs.unet_name = loaders.unet;
        patched.unet = (patched.unet ?? 0) + 1;
        if (alignUnetWeightDtypeToFilename(inputs, loaders.unet)) {
          patched.unetWeightDtype = (patched.unetWeightDtype ?? 0) + 1;
        }
      } else if (
        typeof inputs.unet_name === 'string' &&
        !isUnresolvedWorkflowPlaceholder(inputs.unet_name) &&
        alignUnetWeightDtypeToFilename(inputs, inputs.unet_name)
      ) {
        // Filename already matches — still clear stale fp8 dtype on bf16 UNET.
        patched.unetWeightDtype = (patched.unetWeightDtype ?? 0) + 1;
      }
    } else if (
      loaders.unet &&
      UNET_LOADER_TYPES.has(classType) &&
      'unet_name' in inputs &&
      typeof inputs.unet_name === 'string' &&
      !isUnresolvedWorkflowPlaceholder(inputs.unet_name) &&
      alignUnetWeightDtypeToFilename(inputs, inputs.unet_name)
    ) {
      patched.unetWeightDtype = (patched.unetWeightDtype ?? 0) + 1;
    }

    if (
      loaders.vae &&
      VAE_LOADER_TYPES.has(classType) &&
      'vae_name' in inputs &&
      (shouldPatchLoaderFilenameField(inputs.vae_name, loaders.vae, syncLoadersToModel) ||
        (options?.model &&
          typeof inputs.vae_name === 'string' &&
          isVaeFilenameIncompatibleWithModel(options.model, inputs.vae_name)))
    ) {
      inputs.vae_name = loaders.vae;
      patched.vae = (patched.vae ?? 0) + 1;
    }

    if (
      loaders.dualClip &&
      DUAL_CLIP_LOADER_TYPES.has(classType) &&
      // Flux.1 DualCLIP uses clip_l + t5xxl — never stamp both slots with one Qwen-style dualClip.
      !isFlux1FamilyModel(options?.model)
    ) {
      for (const field of ['clip_name1', 'clip_name2'] as const) {
        if (
          field in inputs &&
          (shouldPatchClipFilename(inputs[field], loaders.dualClip, syncLoadersToModel) ||
            (alignClipPrecision && shouldAlignLoaderPrecision(inputs[field], loaders.dualClip)))
        ) {
          inputs[field] = loaders.dualClip;
          patched.dualClip = (patched.dualClip ?? 0) + 1;
        }
      }
    }

    if (
      loaders.dualClip &&
      CLIP_LOADER_TYPES.has(classType) &&
      'clip_name' in inputs &&
      (shouldPatchClipFilename(inputs.clip_name, loaders.dualClip, syncLoadersToModel) ||
        (alignClipPrecision && shouldAlignLoaderPrecision(inputs.clip_name, loaders.dualClip)))
    ) {
      inputs.clip_name = loaders.dualClip;
      patched.dualClip = (patched.dualClip ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

export function patchControlNetNodesInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    controlNetModelFilename?: string;
    controlImageFilename?: string;
  }
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (
      CONTROLNET_LOADER_TYPES.has(classType) &&
      'control_net_name' in inputs &&
      shouldPatchLoaderFilenameField(inputs.control_net_name, input.controlNetModelFilename)
    ) {
      inputs.control_net_name = input.controlNetModelFilename;
      patched.controlNet = (patched.controlNet ?? 0) + 1;
    }

    if (
      INPUT_IMAGE_TYPES.has(classType) &&
      'image' in inputs &&
      shouldPatchStringField(inputs.image, input.controlImageFilename)
    ) {
      const current = typeof inputs.image === 'string' ? inputs.image : '';
      if (
        current.includes(DEFAULT_CONTROL_IMAGE_TOKEN) ||
        isUnresolvedWorkflowPlaceholder(current)
      ) {
        inputs.image = input.controlImageFilename;
        patched.controlImage = (patched.controlImage ?? 0) + 1;
      }
    }
  }

  return { workflow: next, patched };
}

/**
 * Insert a ControlNet chain when a control image is set but the graph has none,
 * then patch loader/image tokens (IP-Adapter parity).
 */
export function patchControlNetInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    controlNetModelFilename?: string;
    controlImageFilename?: string;
    /** Extra control images for stacked ControlNetApply chains. */
    controlImageFilenames?: string[];
    availableNodeTypes?: Iterable<string> | null;
    controlNetMode?: string;
    controlNetModes?: string[];
    controlNetStrengths?: Array<number | string>;
    /** Skip preprocessors (OpenPose/Canny/…) — feed control image raw. */
    skipPreprocessor?: boolean;
  }
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const stackEntries = (() => {
    const strengths = input.controlNetStrengths ?? [];
    const modes = input.controlNetModes ?? [];
    const parseStrength = (value: number | string | undefined): number | undefined => {
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
      }
      return undefined;
    };
    const fromArray = (input.controlImageFilenames ?? [])
      .map(name => name?.trim())
      .filter(Boolean) as string[];
    if (fromArray.length > 0) {
      return fromArray.map((controlImageFilename, index) => ({
        controlImageFilename,
        controlNetModelFilename: index === 0 ? input.controlNetModelFilename : undefined,
        controlNetMode: modes[index] || input.controlNetMode,
        strength: parseStrength(strengths[index]),
        skipPreprocessor: input.skipPreprocessor,
      }));
    }
    const primary = input.controlImageFilename?.trim();
    return primary
      ? [
          {
            controlImageFilename: primary,
            controlNetModelFilename: input.controlNetModelFilename,
            controlNetMode: modes[0] || input.controlNetMode,
            strength: parseStrength(strengths[0]),
            skipPreprocessor: input.skipPreprocessor,
          },
        ]
      : [];
  })();

  const insertResult =
    stackEntries.length > 1
      ? insertControlNetStack(workflow, stackEntries, {
          availableNodeTypes: input.availableNodeTypes,
        })
      : (() => {
          const single = insertControlNetChainIfMissing(workflow, {
            controlImageFilename: stackEntries[0]?.controlImageFilename,
            availableNodeTypes: input.availableNodeTypes,
            controlNetMode: input.controlNetMode,
            skipPreprocessor: stackEntries[0]?.skipPreprocessor ?? input.skipPreprocessor,
            strength: stackEntries[0]?.strength,
          });
          return {
            workflow: single.workflow,
            insertedCount: single.inserted ? 1 : 0,
            insertedNodeIds: single.insertedNodeIds,
          };
        })();

  const nodePatch = patchControlNetNodesInWorkflow(insertResult.workflow, {
    controlNetModelFilename: input.controlNetModelFilename,
    controlImageFilename: stackEntries[0]?.controlImageFilename ?? input.controlImageFilename,
  });
  const patched: WorkflowDirectPatchCounts = { ...nodePatch.patched };
  if (insertResult.insertedCount > 0) {
    patched.controlNetInserted = insertResult.insertedNodeIds.length;
  }
  return { workflow: nodePatch.workflow, patched };
}

/**
 * Portable IP-Adapter tokens ({{IPADAPTER_IMAGE}}/{{IPADAPTER_STRENGTH}}/{{IPADAPTER_MODEL}}).
 * First inserts a minimal IP-Adapter chain when the session has a reference
 * image but the workflow has neither IPAdapter nodes nor tokens, then runs the
 * usual token patch pass so the inserted (and any pre-wired) tokens resolve.
 */
export function patchIpAdapterInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    ipAdapterImageFilename?: string;
    /** Extra identity/style refs for stacked IP-Adapter apply chains. */
    ipAdapterImageFilenames?: string[];
    ipAdapterStrength?: number | string;
    ipAdapterModelFilename?: string;
    availableNodeTypes?: Iterable<string> | null;
    /**
     * When instantid|pulid|auto, prefer InstantID/PuLID insert over IP-Adapter.
     * ipadapter (default) keeps IP-Adapter-first with InstantID/PuLID fallback.
     */
    identityKind?: 'ipadapter' | 'instantid' | 'pulid' | 'auto';
  }
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const stackEntries = (() => {
    const fromArray = (input.ipAdapterImageFilenames ?? [])
      .map(name => name?.trim())
      .filter(Boolean) as string[];
    if (fromArray.length > 0) {
      return fromArray.map((imageFilename, index) => ({
        imageFilename,
        strength:
          index === 0 && input.ipAdapterStrength != null
            ? Number(input.ipAdapterStrength)
            : undefined,
        modelFilename: index === 0 ? input.ipAdapterModelFilename : undefined,
      }));
    }
    const primary = input.ipAdapterImageFilename?.trim();
    return primary
      ? [
          {
            imageFilename: primary,
            strength: input.ipAdapterStrength != null ? Number(input.ipAdapterStrength) : undefined,
            modelFilename: input.ipAdapterModelFilename,
          },
        ]
      : [];
  })();

  const preferIdentityChain =
    input.identityKind === 'instantid' ||
    input.identityKind === 'pulid' ||
    input.identityKind === 'auto';

  let nextWorkflow = workflow;
  const patched: WorkflowDirectPatchCounts = {};

  if (preferIdentityChain && stackEntries[0]?.imageFilename?.trim()) {
    const identity = insertIdentityChainIfMissing(nextWorkflow, {
      imageFilename: stackEntries[0].imageFilename,
      kind:
        input.identityKind === 'instantid' || input.identityKind === 'pulid'
          ? input.identityKind
          : 'auto',
      availableNodeTypes: input.availableNodeTypes,
    });
    if (identity.inserted) {
      nextWorkflow = identity.workflow;
      patched.identityInserted = identity.insertedNodeIds.length;
    }
    // Remaining multi-refs (e.g. Klein Compose Figures 2–4) still use IP-Adapter.
    if (stackEntries.length > 1) {
      const rest = insertIpAdapterStack(nextWorkflow, stackEntries.slice(1), {
        availableNodeTypes: input.availableNodeTypes,
      });
      nextWorkflow = rest.workflow;
      if (rest.insertedCount > 0) {
        patched.ipAdapterInserted = (patched.ipAdapterInserted ?? 0) + rest.insertedNodeIds.length;
      }
    }
  } else {
    const insertResult =
      stackEntries.length > 1
        ? insertIpAdapterStack(workflow, stackEntries, {
            availableNodeTypes: input.availableNodeTypes,
          })
        : (() => {
            const single = insertIpAdapterChainIfMissing(workflow, {
              imageFilename: stackEntries[0]?.imageFilename,
              availableNodeTypes: input.availableNodeTypes,
            });
            return {
              workflow: single.workflow,
              insertedCount: single.inserted ? 1 : 0,
              insertedNodeIds: single.insertedNodeIds,
            };
          })();

    nextWorkflow = insertResult.workflow;
    if (insertResult.insertedCount > 0) {
      patched.ipAdapterInserted = insertResult.insertedNodeIds.length;
    }

    // If IP-Adapter Plus isn't available, fall back to InstantID/PuLID when installed.
    if (insertResult.insertedCount === 0 && stackEntries[0]?.imageFilename?.trim()) {
      const identity = insertIdentityChainIfMissing(nextWorkflow, {
        imageFilename: stackEntries[0].imageFilename,
        availableNodeTypes: input.availableNodeTypes,
      });
      if (identity.inserted) {
        nextWorkflow = identity.workflow;
        patched.identityInserted = identity.insertedNodeIds.length;
      }
    }
  }

  const result = patchIpAdapterTokensInWorkflow(nextWorkflow, {
    imageFilename: stackEntries[0]?.imageFilename ?? input.ipAdapterImageFilename,
    strength: input.ipAdapterStrength,
    modelFilename: input.ipAdapterModelFilename,
  });
  if (result.patched.image) {
    patched.ipAdapterImage = result.patched.image;
  }
  if (result.patched.strength) {
    patched.ipAdapterStrength = result.patched.strength;
  }
  if (result.patched.model) {
    patched.ipAdapterModel = result.patched.model;
  }
  return { workflow: result.workflow, patched };
}

export function patchUpscaleModelNodesInWorkflow(
  workflow: Record<string, unknown>,
  upscaleModelFilename?: string
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const resolved =
    upscaleModelFilename?.trim() || SUGGESTED_MODEL_UPSCALE_MAP.default || '4x-UltraSharp.pth';
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs || !UPSCALE_MODEL_LOADER_TYPES.has(classType) || !('model_name' in inputs)) {
      continue;
    }

    if (shouldPatchLoaderFilenameField(inputs.model_name, resolved)) {
      inputs.model_name = resolved;
      patched.upscaleModel = (patched.upscaleModel ?? 0) + 1;
    }
  }

  return {
    workflow: replaceUpscaleModelTokenInJson(next, resolved),
    patched,
  };
}

/** Last-resort JSON replace so {{UPSCALE_MODEL}} cannot leak into ComfyUI. */
export function replaceUpscaleModelTokenInJson(
  workflow: Record<string, unknown>,
  upscaleModelFilename?: string
): Record<string, unknown> {
  const resolved =
    upscaleModelFilename?.trim() || SUGGESTED_MODEL_UPSCALE_MAP.default || '4x-UltraSharp.pth';
  const json = JSON.stringify(workflow);
  if (!json.includes(DEFAULT_UPSCALE_MODEL_TOKEN)) {
    return workflow;
  }
  return JSON.parse(json.split(DEFAULT_UPSCALE_MODEL_TOKEN).join(resolved)) as Record<
    string,
    unknown
  >;
}

function patchImageLoaderNodesInWorkflow(
  workflow: Record<string, unknown>,
  classTypes: Set<string>,
  filename: string | undefined,
  countKey: 'inputImage' | 'maskImage'
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  if (!filename?.trim()) {
    return { workflow: next, patched };
  }

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs || !classTypes.has(classType) || !('image' in inputs)) {
      continue;
    }

    if (shouldPatchStringField(inputs.image, filename)) {
      inputs.image = filename.trim();
      patched[countKey] = (patched[countKey] ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

export function patchLoadImageNodesInWorkflow(
  workflow: Record<string, unknown>,
  inputImageFilename?: string,
  inputImageFilenames?: string[]
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const filenames = normalizeInputImageFilenames(inputImageFilename, inputImageFilenames);

  if (filenames.length === 0) {
    return { workflow: structuredClone(workflow), patched: {} };
  }

  // Single-image path: keep legacy blanket patch only when the graph has one
  // figure LoadImage. Multi-slot Edit packs must not stamp Figure 1 onto 2–4.
  const figureSlotCount = countFigureLoadImageSlots(
    workflow as Record<string, { class_type?: string; _meta?: { title?: string } }>
  );
  if (filenames.length === 1 && figureSlotCount <= 1) {
    return patchImageLoaderNodesInWorkflow(workflow, INPUT_IMAGE_TYPES, filenames[0], 'inputImage');
  }

  const next = structuredClone(workflow) as Record<
    string,
    {
      class_type?: string;
      inputs?: Record<string, unknown>;
      _meta?: { title?: string };
    }
  >;
  const patched: WorkflowDirectPatchCounts = {};
  const loadImageEntries = Object.entries(next).filter(([, node]) =>
    INPUT_IMAGE_TYPES.has(node?.class_type ?? '')
  );
  const loadImageCount = loadImageEntries.length;
  let loadImageIndex = 0;

  for (const [, node] of loadImageEntries) {
    const classType = node?.class_type ?? '';
    const title = node?._meta?.title ?? '';
    const inputs = node?.inputs;
    const kind = inferLoadImageBinding(classType, title, {
      loadImageIndex,
      loadImageCount,
    });
    loadImageIndex += 1;
    if (!inputs || !('image' in inputs)) {
      continue;
    }

    const figure =
      kind === 'inputImage'
        ? 0
        : kind === 'inputImage2'
          ? 1
          : kind === 'inputImage3'
            ? 2
            : kind === 'inputImage4'
              ? 3
              : -1;
    if (figure < 0) {
      continue;
    }
    const filename = filenames[figure];
    if (!filename?.trim()) {
      continue;
    }
    if (shouldPatchStringField(inputs.image, filename)) {
      inputs.image = filename.trim();
      patched.inputImage = (patched.inputImage ?? 0) + 1;
    }
  }

  return { workflow: next, patched };
}

export function patchLoadImageMaskNodesInWorkflow(
  workflow: Record<string, unknown>,
  maskImageFilename?: string
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  return patchImageLoaderNodesInWorkflow(
    workflow,
    MASK_IMAGE_TYPES,
    maskImageFilename,
    'maskImage'
  );
}

function coerceLoaderFieldValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

/** Last-resort pass: overwrite unresolved loader placeholders on every loader node. */
export function forceResolveLoaderPlaceholders(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames,
  options?: { upscaleModelFilename?: string }
): Record<string, unknown> {
  const next = structuredClone(workflow) as Record<string, unknown>;
  const upscaleName =
    options?.upscaleModelFilename?.trim() ||
    SUGGESTED_MODEL_UPSCALE_MAP.default ||
    '4x-UltraSharp.pth';

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }

    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (loaders.checkpoint && CHECKPOINT_LOADER_TYPES.has(classType) && 'ckpt_name' in inputs) {
      const current = coerceLoaderFieldValue(inputs.ckpt_name);
      if (
        current == null ||
        current.trim() === '' ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_CHECKPOINT_TOKEN
      ) {
        inputs.ckpt_name = loaders.checkpoint;
      }
    }

    if (loaders.unet && UNET_LOADER_TYPES.has(classType) && 'unet_name' in inputs) {
      const current = coerceLoaderFieldValue(inputs.unet_name);
      if (
        current == null ||
        current.trim() === '' ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_UNET_TOKEN
      ) {
        inputs.unet_name = loaders.unet;
      }
    }

    if (loaders.vae && VAE_LOADER_TYPES.has(classType) && 'vae_name' in inputs) {
      const current = coerceLoaderFieldValue(inputs.vae_name);
      if (
        current == null ||
        current.trim() === '' ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_VAE_TOKEN
      ) {
        inputs.vae_name = loaders.vae;
      }
    }

    if (UPSCALE_MODEL_LOADER_TYPES.has(classType) && 'model_name' in inputs) {
      const current = coerceLoaderFieldValue(inputs.model_name);
      if (
        current == null ||
        current.trim() === '' ||
        isUnresolvedWorkflowPlaceholder(current) ||
        current === DEFAULT_UPSCALE_MODEL_TOKEN
      ) {
        inputs.model_name = upscaleName;
      }
    }

    if (loaders.dualClip && DUAL_CLIP_LOADER_TYPES.has(classType)) {
      for (const field of ['clip_name1', 'clip_name2'] as const) {
        if (!(field in inputs)) {
          continue;
        }
        const current = coerceLoaderFieldValue(inputs[field]);
        const shouldPatch =
          current == null ||
          current.trim() === '' ||
          isUnresolvedWorkflowPlaceholder(current) ||
          (typeof current === 'string' &&
            DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()] === loaders.dualClip);
        if (shouldPatch) {
          inputs[field] = loaders.dualClip;
        }
      }
    }

    if (loaders.dualClip && CLIP_LOADER_TYPES.has(classType) && 'clip_name' in inputs) {
      const current = coerceLoaderFieldValue(inputs.clip_name);
      const shouldPatch =
        current == null ||
        current.trim() === '' ||
        isUnresolvedWorkflowPlaceholder(current) ||
        (typeof current === 'string' &&
          DEPRECATED_QWEN_CLIP_FILENAMES[current.trim()] === loaders.dualClip);
      if (shouldPatch) {
        inputs.clip_name = loaders.dualClip;
      }
    }

    for (const [field, value] of Object.entries(inputs)) {
      if (typeof value !== 'string' || !isUnresolvedWorkflowPlaceholder(value)) {
        continue;
      }
      if (value.includes(DEFAULT_UNET_TOKEN) && loaders.unet && UNET_LOADER_TYPES.has(classType)) {
        inputs[field] = loaders.unet;
      } else if (
        value.includes(DEFAULT_VAE_TOKEN) &&
        loaders.vae &&
        VAE_LOADER_TYPES.has(classType)
      ) {
        inputs[field] = loaders.vae;
      } else if (
        value.includes(DEFAULT_CHECKPOINT_TOKEN) &&
        loaders.checkpoint &&
        CHECKPOINT_LOADER_TYPES.has(classType)
      ) {
        inputs[field] = loaders.checkpoint;
      } else if (
        value.includes(DEFAULT_UPSCALE_MODEL_TOKEN) &&
        UPSCALE_MODEL_LOADER_TYPES.has(classType)
      ) {
        inputs[field] = upscaleName;
      }
    }
  }

  return replaceUpscaleModelTokenInJson(
    replaceLoaderPlaceholderTokensInJson(next, loaders),
    upscaleName
  );
}

function replaceLoaderPlaceholderTokensInJson(
  workflow: Record<string, unknown>,
  loaders: ModelLoaderFilenames
): Record<string, unknown> {
  if (!loaders.checkpoint && !loaders.unet && !loaders.vae) {
    return workflow;
  }

  let json = JSON.stringify(workflow);
  if (loaders.unet) {
    json = json.split(DEFAULT_UNET_TOKEN).join(loaders.unet);
  }
  if (loaders.vae) {
    json = json.split(DEFAULT_VAE_TOKEN).join(loaders.vae);
  }
  if (loaders.checkpoint) {
    json = json.split(DEFAULT_CHECKPOINT_TOKEN).join(loaders.checkpoint);
  }

  return JSON.parse(json) as Record<string, unknown>;
}

export function patchImageResizeNodesInWorkflow(
  workflow: Record<string, unknown>,
  params: Pick<WorkflowParamValues, 'width' | 'height'>,
  options?: { encodeReferencesOnly?: boolean }
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};
  const resizeTypes = new Set(['ImageScale', 'ResizeImage']);
  const encodeOnlyIds = options?.encodeReferencesOnly
    ? collectQwenEditEncodeResizeNodeIds(next)
    : null;

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    if (encodeOnlyIds && !encodeOnlyIds.has(nodeId)) {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const inputs = record.inputs;
    if (!inputs || !resizeTypes.has(record.class_type ?? '')) {
      continue;
    }

    if (shouldPatchNumericField(inputs.width, params.width)) {
      inputs.width = Number(params.width);
      patched.width = (patched.width ?? 0) + 1;
    }
    if (shouldPatchNumericField(inputs.height, params.height)) {
      inputs.height = Number(params.height);
      patched.height = (patched.height ?? 0) + 1;
    }
    // Absolute ImageScale without crop stretches refs to latent W×H — center-crop instead.
    if (record.class_type === 'ImageScale') {
      inputs.upscale_method = inputs.upscale_method ?? 'lanczos';
      if (inputs.crop !== 'center') {
        inputs.crop = 'center';
        patched.crop = (patched.crop ?? 0) + 1;
      }
    }
  }

  return { workflow: next, patched };
}

/** Empty-latent nodes used as the "no init image" latent source in WAN/Hunyuan T2V starter graphs. */
const VIDEO_LATENT_NODE_TYPES = new Set([
  'EmptyHunyuanLatentVideo',
  'EmptyLTXVLatentVideo',
  'EmptyMochiLatentVideo',
  'EmptyCosmosLatentVideo',
]);

/** Built-in ComfyUI I2V conditioning nodes — presence means the graph is already wired. */
const VIDEO_IMAGE_TO_VIDEO_NODE_TYPES = new Set([
  'WanImageToVideo',
  'WanCameraImageToVideo',
  'HunyuanImageToVideo',
  'HunyuanVideo15ImageToVideo',
  'LTXVImgToVideo',
]);

function asNodeRecord(
  node: unknown
): { class_type?: string; _meta?: { title?: string }; inputs?: Record<string, unknown> } | null {
  if (!node || typeof node !== 'object') {
    return null;
  }
  return node as {
    class_type?: string;
    _meta?: { title?: string };
    inputs?: Record<string, unknown>;
  };
}

function isNodeOutputRef(value: unknown): value is [string, number] {
  return Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'number';
}

function findFirstNodeIdByClassTypes(
  workflow: Record<string, unknown>,
  classTypes: Set<string>
): string | null {
  for (const [nodeId, node] of Object.entries(workflow)) {
    const record = asNodeRecord(node);
    if (record?.class_type && classTypes.has(record.class_type)) {
      return nodeId;
    }
  }
  return null;
}

function collectReferencedNodeIds(workflow: Record<string, unknown>): Set<string> {
  const referenced = new Set<string>();
  for (const node of Object.values(workflow)) {
    const record = asNodeRecord(node);
    if (!record?.inputs) {
      continue;
    }
    for (const value of Object.values(record.inputs)) {
      if (isNodeOutputRef(value)) {
        referenced.add(value[0]);
      }
    }
  }
  return referenced;
}

/** Prefer a LoadImage node titled "init" (our own scaffolds); fall back to any unwired LoadImage. */
function findInitImageLoadNodeId(workflow: Record<string, unknown>): string | null {
  const referenced = collectReferencedNodeIds(workflow);
  let orphanCandidate: string | null = null;

  for (const [nodeId, node] of Object.entries(workflow)) {
    const record = asNodeRecord(node);
    if (record?.class_type !== 'LoadImage' || !record.inputs) {
      continue;
    }
    const title = record._meta?.title?.toLowerCase() ?? '';
    if (title.includes('init')) {
      return nodeId;
    }
    if (!referenced.has(nodeId) && orphanCandidate === null) {
      orphanCandidate = nodeId;
    }
  }

  return orphanCandidate;
}

function resolveNumericLikeField(value: unknown, fallback: number): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && !isUnresolvedWorkflowPlaceholder(value)) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

/**
 * When a video (WAN / Hunyuan Video) model is queued with an init image, splice a built-in
 * WanImageToVideo / HunyuanImageToVideo node between the text encoders and the sampler so the
 * uploaded LoadImage frame actually drives I2V conditioning (VAE-encoded start_image → latent).
 * No-op for T2V (no image) or graphs that already wire their own I2V node.
 */
export function patchVideoImageToVideoWiringInWorkflow(
  workflow: Record<string, unknown>,
  input: {
    model?: string;
    inputImageFilename?: string;
    params?: Pick<WorkflowParamValues, 'width' | 'height' | 'videoFrames'>;
  }
): {
  workflow: Record<string, unknown>;
  patched: WorkflowDirectPatchCounts;
  /** Set when a video model has an init image but I2V wiring failed. */
  error?: string;
} {
  const next = structuredClone(workflow);
  const patched: WorkflowDirectPatchCounts = {};

  if (!input.inputImageFilename?.trim() || !input.model?.trim()) {
    return { workflow: next, patched };
  }

  const def = COMFY_MODEL_IDS.has(input.model)
    ? getComfyModelDefinition(input.model as ComfyImageModel)
    : null;
  if (def?.category !== 'video') {
    return { workflow: next, patched };
  }

  if (findFirstNodeIdByClassTypes(next, VIDEO_IMAGE_TO_VIDEO_NODE_TYPES)) {
    // Already has a native I2V node — respect the user's custom wiring.
    return { workflow: next, patched };
  }

  const isLtx = /ltx/i.test(input.model);

  const loadImageId = findInitImageLoadNodeId(next);
  const latentNodeId = findFirstNodeIdByClassTypes(next, VIDEO_LATENT_NODE_TYPES);
  if (!loadImageId && !latentNodeId) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError('missing LoadImage init node and Empty*LatentVideo'),
    };
  }
  if (!loadImageId) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError('missing LoadImage titled Init Image (or an unused LoadImage)'),
    };
  }
  if (!latentNodeId) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError('missing EmptyHunyuanLatentVideo / EmptyLTXVLatentVideo'),
    };
  }

  const latentInputs = asNodeRecord(next[latentNodeId])?.inputs ?? {};

  let samplerId: string | null = null;
  let samplerInputs: Record<string, unknown> | null = null;
  // Prefer sampler whose latent_image points at the empty video latent.
  for (const [nodeId, node] of Object.entries(next)) {
    const record = asNodeRecord(node);
    if (!record?.inputs) {
      continue;
    }
    const latentRef = record.inputs.latent_image;
    if (isNodeOutputRef(latentRef) && latentRef[0] === latentNodeId) {
      samplerId = nodeId;
      samplerInputs = record.inputs;
      break;
    }
  }
  // Fallback: any sampler-like node with latent_image + positive conditioning.
  if (!samplerId || !samplerInputs) {
    for (const [nodeId, node] of Object.entries(next)) {
      const record = asNodeRecord(node);
      if (!record?.inputs || !isNodeOutputRef(record.inputs.latent_image)) {
        continue;
      }
      const classType = (record.class_type ?? '').toLowerCase();
      const looksLikeSampler =
        classType.includes('ksampler') ||
        classType.includes('samplercustom') ||
        ('seed' in record.inputs && ('steps' in record.inputs || 'cfg' in record.inputs));
      if (!looksLikeSampler || !isNodeOutputRef(record.inputs.positive)) {
        continue;
      }
      samplerId = nodeId;
      samplerInputs = record.inputs;
      break;
    }
  }
  if (!samplerId || !samplerInputs) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError('no KSampler (or sampler-like node) with latent_image + positive'),
    };
  }

  const positiveRef = samplerInputs.positive;
  if (!isNodeOutputRef(positiveRef)) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError('sampler positive conditioning is not a node link'),
    };
  }
  const negativeRef = isNodeOutputRef(samplerInputs.negative) ? samplerInputs.negative : null;

  let vaeRef: [string, number] | null = null;
  for (const node of Object.values(next)) {
    const record = asNodeRecord(node);
    if (record?.class_type === 'VAEDecode' && isNodeOutputRef(record.inputs?.vae)) {
      vaeRef = record.inputs!.vae as [string, number];
      break;
    }
  }
  if (!vaeRef) {
    for (const [nodeId, node] of Object.entries(next)) {
      const record = asNodeRecord(node);
      if (
        record?.class_type &&
        (CHECKPOINT_LOADER_TYPES.has(record.class_type) || VAE_LOADER_TYPES.has(record.class_type))
      ) {
        // CheckpointLoaderSimple: MODEL/CLIP/VAE → output index 2; VAELoader → 0.
        vaeRef = [nodeId, VAE_LOADER_TYPES.has(record.class_type) ? 0 : 2];
        break;
      }
    }
  }
  if (!vaeRef) {
    return {
      workflow: next,
      patched,
      error: videoI2vWireError('no VAE link from VAEDecode / CheckpointLoader / VAELoader'),
    };
  }

  const isHunyuan15 = /hunyuan-video-1\.5|hunyuanvideo1\.5/i.test(input.model);
  const isHunyuan = /hunyuan/i.test(input.model);
  const width = resolveNumericLikeField(latentInputs.width, Number(input.params?.width) || 832);
  const height = resolveNumericLikeField(latentInputs.height, Number(input.params?.height) || 480);
  const length = resolveNumericLikeField(
    latentInputs.length,
    Number(input.params?.videoFrames) || (isHunyuan15 ? 33 : isHunyuan ? 53 : isLtx ? 97 : 81)
  );
  const batchSize = resolveNumericLikeField(latentInputs.batch_size, 1);

  const newNodeId = nextAvailableWorkflowNodeId(next);
  const startImageRef: [string, number] = [loadImageId, 0];

  if (isLtx) {
    next[newNodeId] = {
      class_type: 'LTXVImgToVideo',
      inputs: {
        positive: positiveRef,
        negative: negativeRef ?? positiveRef,
        vae: vaeRef,
        image: startImageRef,
        width,
        height,
        length,
        batch_size: batchSize,
        strength: 1,
      },
      _meta: { title: 'LTX Image → Video (auto-wired I2V)' },
    };
    samplerInputs.positive = [newNodeId, 0];
    samplerInputs.negative = [newNodeId, 1];
    samplerInputs.latent_image = [newNodeId, 2];
  } else if (isHunyuan15) {
    next[newNodeId] = {
      class_type: 'HunyuanVideo15ImageToVideo',
      inputs: {
        positive: positiveRef,
        negative: negativeRef ?? positiveRef,
        vae: vaeRef,
        width,
        height,
        length,
        batch_size: batchSize,
        start_image: startImageRef,
      },
      _meta: { title: 'Hunyuan Video 1.5 Image → Video (auto-wired I2V)' },
    };
    samplerInputs.positive = [newNodeId, 0];
    samplerInputs.negative = [newNodeId, 1];
    samplerInputs.latent_image = [newNodeId, 2];
  } else if (isHunyuan) {
    next[newNodeId] = {
      class_type: 'HunyuanImageToVideo',
      inputs: {
        positive: positiveRef,
        vae: vaeRef,
        width,
        height,
        length,
        batch_size: batchSize,
        guidance_type: 'v1 (concat)',
        start_image: startImageRef,
      },
      _meta: { title: 'Hunyuan Image → Video (auto-wired I2V)' },
    };
    samplerInputs.positive = [newNodeId, 0];
    samplerInputs.latent_image = [newNodeId, 1];
  } else {
    next[newNodeId] = {
      class_type: 'WanImageToVideo',
      inputs: {
        positive: positiveRef,
        negative: negativeRef ?? positiveRef,
        vae: vaeRef,
        width,
        height,
        length,
        batch_size: batchSize,
        start_image: startImageRef,
      },
      _meta: { title: 'Wan Image → Video (auto-wired I2V)' },
    };
    samplerInputs.positive = [newNodeId, 0];
    if (negativeRef) {
      samplerInputs.negative = [newNodeId, 1];
    }
    samplerInputs.latent_image = [newNodeId, 2];
  }

  patched.videoImageToVideoWired = 1;
  return { workflow: next, patched };
}

function nextAvailableWorkflowNodeId(workflow: Record<string, unknown>): string {
  let max = 0;
  for (const key of Object.keys(workflow)) {
    if (/^\d+$/.test(key)) {
      max = Math.max(max, Number(key));
    }
  }
  return String(max + 1);
}

function regionalSegmentsFromCustomTokens(
  customTokens?: Array<{ token: string; value: string }>
): RegionalPromptSegment[] {
  if (!customTokens?.length) {
    return [];
  }
  const map: Record<string, string> = {
    '{{REGION_SUBJECT}}': 'subject',
    '{{REGION_BACKGROUND}}': 'background',
    '{{REGION_FOREGROUND}}': 'foreground',
    '{{REGION_LIGHTING}}': 'lighting',
  };
  const segments: RegionalPromptSegment[] = [];
  for (const entry of customTokens) {
    const regionId = map[entry.token.trim()];
    if (regionId && entry.value.trim()) {
      segments.push({ regionId, prompt: entry.value.trim() });
    }
  }
  return segments;
}

function parseBuiltInVideoScaffold(model: string): Record<string, unknown> | null {
  try {
    return buildBuiltInVideoI2vWorkflow(model);
  } catch {
    return null;
  }
}

/**
 * When a video model is queued with an init frame but the selected graph cannot
 * accept I2V (typical: a still-image workflow), swap in the built-in WAN /
 * Hunyuan / LTX scaffold so last-frame continue still queues.
 */
function resolveWorkflowForVideoI2v(input: {
  workflow: Record<string, unknown>;
  model?: string;
  inputImageFilename?: string;
  params?: Pick<WorkflowParamValues, 'width' | 'height' | 'videoFrames'>;
}): { workflow: Record<string, unknown>; usedScaffold: boolean } {
  const probe = patchVideoImageToVideoWiringInWorkflow(input.workflow, {
    model: input.model,
    inputImageFilename: input.inputImageFilename,
    params: input.params,
  });
  if (!probe.error) {
    return { workflow: input.workflow, usedScaffold: false };
  }
  const model = input.model?.trim();
  if (!model) {
    return { workflow: input.workflow, usedScaffold: false };
  }
  const scaffold = parseBuiltInVideoScaffold(model);
  if (!scaffold) {
    return { workflow: input.workflow, usedScaffold: false };
  }
  return { workflow: scaffold, usedScaffold: true };
}

export function patchWorkflowDirectParams(
  workflow: Record<string, unknown>,
  input: {
    params?: WorkflowParamValues;
    loaders?: ModelLoaderFilenames;
    upscaleModelFilename?: string;
    controlNetModelFilename?: string;
    controlImageFilename?: string;
    controlImageFilenames?: string[];
    ipAdapterImageFilename?: string;
    ipAdapterImageFilenames?: string[];
    ipAdapterStrength?: number | string;
    ipAdapterModelFilename?: string;
    /** ComfyUI object_info node class names — gates the optional CLIPVisionLoader when inserting an IP-Adapter chain. */
    availableNodeTypes?: Iterable<string> | null;
    identityKind?: 'ipadapter' | 'instantid' | 'pulid' | 'auto';
    customTokens?: Array<{ token: string; value: string }>;
    syncWorkflowLoadersToModel?: boolean;
    model?: string;
    availableCheckpoints?: string[] | null;
    availableUnets?: string[] | null;
    availableVaes?: string[] | null;
    availableClips?: string[] | null;
    /** Active LoRA stack — strengths patched onto LoraLoader nodes, extras chained in. */
    loraLibrary?: LoraLibraryEntry[];
    /** Positive prompt — kept for call-site compat; keyword LoRA matching removed. */
    prompt?: string;
    /** Multi-slot regional edit (masks + prompts). */
    regionalSlots?: RegionalPromptSlot[];
    /** Flux2 Klein Enhancer pack (Multi ReferenceLatent + Identity Feature Transfer Final). */
    kleinEnhancerEnabled?: boolean;
    kleinEnhancerIdentityPreset?: KleinEnhancerIdentityPreset;
    kleinEnhancerTextEnabled?: boolean;
    kleinEnhancerColorAnchorEnabled?: boolean;
    kleinEnhancerColorAnchorStrength?: number;
  }
): {
  workflow: Record<string, unknown>;
  patched: WorkflowDirectPatchCounts;
  error?: string;
} {
  const videoI2vGraph = resolveWorkflowForVideoI2v({
    workflow,
    model: input.model,
    inputImageFilename: input.params?.inputImageFilename,
    params: input.params,
  });
  const videoWeightPool = [...(input.availableCheckpoints ?? []), ...(input.availableUnets ?? [])];
  const resolvedVideoWeight =
    input.model && isVideoCheckpointMapKey(input.model) && videoWeightPool.length > 0
      ? resolveInstalledVideoWeight(
          input.model,
          input.loaders?.checkpoint?.trim() || input.loaders?.unet?.trim(),
          videoWeightPool
        )
      : undefined;
  const unetOnly = videoWeightIsUnetOnly(
    resolvedVideoWeight,
    input.availableCheckpoints,
    input.availableUnets
  );
  const loaders = {
    ...(input.loaders ?? {}),
    ...(resolvedVideoWeight && !unetOnly ? { checkpoint: resolvedVideoWeight } : {}),
    ...(resolvedVideoWeight && unetOnly ? { unet: resolvedVideoWeight } : {}),
  };
  const latentType = normalizeEmptyLatentForModel(videoI2vGraph.workflow, input.model);
  const latentPatch = patchLatentSizeInWorkflow(latentType.workflow, input.params ?? {});
  let videoGraph = latentPatch.workflow;
  let videoSplitConverted = 0;
  if (unetOnly && resolvedVideoWeight) {
    const split = resolveVideoSplitCompanions({
      model: input.model,
      unet: resolvedVideoWeight,
      availableClips: input.availableClips,
      availableVaes: input.availableVaes,
    });
    if (split.error || !split.companions) {
      return {
        workflow: videoGraph,
        patched: {},
        error: split.error,
      };
    }
    const rewritten = rewriteCheckpointLoadersToVideoSplit(videoGraph, split.companions);
    videoGraph = rewritten.workflow;
    videoSplitConverted = rewritten.converted;
    if (split.companions.vae) {
      loaders.vae = split.companions.vae;
    }
    if (split.companions.clip.class_type === 'CLIPLoader') {
      loaders.dualClip = split.companions.clip.inputs.clip_name;
    } else if (split.companions.clip.class_type === 'DualCLIPLoader') {
      loaders.dualClip = split.companions.clip.inputs.clip_name1;
    }
  }
  if (!unetOnly) {
    const ltxClip = pickLtxTextEncoderFilename(input.availableClips);
    if (
      ltxClip &&
      (isLtxVideoModel(input.model) || /ltx/i.test(resolvedVideoWeight ?? loaders.checkpoint ?? ''))
    ) {
      loaders.dualClip = ltxClip;
    }
  }
  const loaderPatch = patchLoaderNodesInWorkflow(videoGraph, loaders, {
    syncLoadersToModel: input.syncWorkflowLoadersToModel,
    // LightX2V official keeps fp8_scaled CLIP with bf16 UNET — don't "upgrade" CLIP.
    alignClipPrecision: !isQwenLightningModel(input.model),
    availableCheckpoints: input.availableCheckpoints,
    availableUnets: input.availableUnets,
    model: input.model,
  });
  const loraFilenames = {
    ...buildLoraFilenameMapFromCustomTokens(input.customTokens ?? []),
    ...buildLightningLoraFilenameMap(input.customTokens ?? [], input.model),
  };
  const loraPatch = patchLoraNodesInWorkflow(loaderPatch.workflow, loraFilenames);
  const loraStackPatch = shouldNeutralizeStyleLorasAtQueue(input.model)
    ? { workflow: loraPatch.workflow, patched: {} as WorkflowDirectPatchCounts }
    : applyLoraStackToWorkflow(loraPatch.workflow, input.loraLibrary, {
        prompt: input.prompt,
      });
  const kleinFigures = normalizeInputImageFilenames(
    input.params?.inputImageFilename,
    input.params?.inputImageFilenames
  );
  const kleinIdentityLockRequested = Boolean(
    String(input.ipAdapterImageFilename ?? '').trim() ||
    String(
      input.ipAdapterImageFilenames?.[0] ?? input.params?.ipAdapterImageFilenames?.[0] ?? ''
    ).trim()
  );
  // Only strip IP-Adapter / InstantID when Identity Feature Transfer Final will replace it.
  const willUseKleinEnhancerIdentity =
    input.kleinEnhancerEnabled !== false &&
    isFluxKleinModel(input.model) &&
    kleinFigures.length > 0 &&
    kleinIdentityLockRequested &&
    kleinEnhancerPackAvailable(input.availableNodeTypes);

  const controlPatch = patchControlNetInWorkflow(loraStackPatch.workflow, {
    controlNetModelFilename: input.controlNetModelFilename,
    controlImageFilename: input.controlImageFilename,
    controlImageFilenames: input.controlImageFilenames ?? input.params?.controlImageFilenames,
    availableNodeTypes: input.availableNodeTypes,
    controlNetMode: input.params?.controlNetMode,
    controlNetModes: input.params?.controlNetModes,
    controlNetStrengths: input.params?.controlNetStrengths,
    skipPreprocessor:
      input.params?.controlNetSkipPreprocessor === true ||
      String(input.params?.controlNetSkipPreprocessor ?? '').trim() === 'true',
  });
  const ipAdapterPatch = patchIpAdapterInWorkflow(controlPatch.workflow, {
    ipAdapterImageFilename: willUseKleinEnhancerIdentity ? undefined : input.ipAdapterImageFilename,
    ipAdapterImageFilenames: willUseKleinEnhancerIdentity
      ? undefined
      : (input.ipAdapterImageFilenames ?? input.params?.ipAdapterImageFilenames),
    ipAdapterStrength: willUseKleinEnhancerIdentity ? undefined : input.ipAdapterStrength,
    ipAdapterModelFilename: willUseKleinEnhancerIdentity ? undefined : input.ipAdapterModelFilename,
    availableNodeTypes: input.availableNodeTypes,
    identityKind: willUseKleinEnhancerIdentity
      ? 'ipadapter'
      : (input.params?.identityKind ?? input.identityKind),
  });
  const upscalePatch = patchUpscaleModelNodesInWorkflow(
    ipAdapterPatch.workflow,
    input.upscaleModelFilename
  );
  const imagePatch = patchLoadImageNodesInWorkflow(
    upscalePatch.workflow,
    input.params?.inputImageFilename,
    input.params?.inputImageFilenames
  );
  const maskPatch = patchLoadImageMaskNodesInWorkflow(
    imagePatch.workflow,
    input.params?.maskImageFilename
  );
  const resizePatch = patchImageResizeNodesInWorkflow(maskPatch.workflow, input.params ?? {}, {
    encodeReferencesOnly: Boolean(input.params?.inputImageFilename?.toString().trim()),
  });
  const regionalSegments = regionalSegmentsFromCustomTokens(input.customTokens);
  const regionalSlots: RegionalPromptSlot[] =
    input.regionalSlots && input.regionalSlots.length > 0
      ? normalizeRegionalPromptSlots(input.regionalSlots)
      : regionalSegments.map(segment => ({
          id: segment.regionId,
          label: segment.regionId,
          prompt: segment.prompt,
          strength: 1,
        }));
  const regionalEdit = applyRegionalEditToWorkflow(resizePatch.workflow, regionalSlots, {
    availableNodeTypes: input.availableNodeTypes,
  });
  const videoWirePatch = patchVideoImageToVideoWiringInWorkflow(regionalEdit.workflow, {
    model: input.model,
    inputImageFilename: input.params?.inputImageFilename,
    params: input.params,
  });
  const kleinRefWire = ensureKleinReferenceLatentWiringInWorkflow(videoWirePatch.workflow, {
    model: input.model,
    inputImageFilename: input.params?.inputImageFilename,
    inputImageFilenames: input.params?.inputImageFilenames,
    width: input.params?.width,
    height: input.params?.height,
  });
  const kleinEnhancerWire = ensureKleinEnhancerPackWiringInWorkflow(kleinRefWire.workflow, {
    model: input.model,
    inputImageFilename: input.params?.inputImageFilename,
    inputImageFilenames: input.params?.inputImageFilenames,
    availableNodeTypes: input.availableNodeTypes,
    enabled: input.kleinEnhancerEnabled,
    identityPreset: input.kleinEnhancerIdentityPreset,
    identityLockEnabled: kleinIdentityLockRequested,
    identityLockStrength:
      input.ipAdapterStrength != null ? Number(input.ipAdapterStrength) : undefined,
    steps: input.params?.steps,
    textEnhancerEnabled: input.kleinEnhancerTextEnabled,
    colorAnchorEnabled: input.kleinEnhancerColorAnchorEnabled,
    colorAnchorStrength: input.kleinEnhancerColorAnchorStrength,
  });
  const fluxGuidance = ensureFluxGuidanceInWorkflow(
    kleinEnhancerWire.workflow,
    input.model,
    input.params
  );
  const ltxClip = ensureLtxClipLoaderForQueue(fluxGuidance.workflow, {
    model: input.model,
    checkpointFilename: resolvedVideoWeight ?? loaders.checkpoint,
    availableClips: input.availableClips,
  });
  if (ltxClip.error) {
    return {
      workflow: ltxClip.workflow,
      patched: {},
      error: ltxClip.error,
    };
  }

  return {
    workflow: ltxClip.workflow,
    patched: {
      ...(latentType.converted > 0 ? { emptySd3Latent: latentType.converted } : {}),
      ...latentPatch.patched,
      ...loaderPatch.patched,
      ...loraPatch.patched,
      ...loraStackPatch.patched,
      ...controlPatch.patched,
      ...ipAdapterPatch.patched,
      ...upscalePatch.patched,
      ...imagePatch.patched,
      ...maskPatch.patched,
      ...resizePatch.patched,
      ...(regionalEdit.patchedTokens > 0 ? { regionalTokens: regionalEdit.patchedTokens } : {}),
      ...(regionalEdit.patchedNodes > 0 ? { regionalNodes: regionalEdit.patchedNodes } : {}),
      ...videoWirePatch.patched,
      ...(videoI2vGraph.usedScaffold ? { videoScaffoldFallback: 1 } : {}),
      ...(videoSplitConverted > 0 ? { videoSplitLoaders: videoSplitConverted } : {}),
      ...(ltxClip.attached > 0 || ltxClip.rewired > 0
        ? { ltxClipLoader: ltxClip.attached || ltxClip.rewired }
        : {}),
      ...(kleinRefWire.wired
        ? {
            referenceLatentWired: kleinRefWire.insertedNodeIds.length || 1,
            img2imgLatentWired: 1,
          }
        : {}),
      ...(kleinEnhancerWire.wired
        ? {
            ...(kleinEnhancerWire.usedEnhancer
              ? {
                  kleinEnhancerWired: kleinEnhancerWire.insertedNodeIds.length || 1,
                }
              : {}),
            ...(kleinEnhancerWire.usedTextEnhancer ? { kleinTextEnhancerWired: 1 } : {}),
            ...(kleinEnhancerWire.usedColorAnchor ? { kleinColorAnchorWired: 1 } : {}),
          }
        : {}),
      ...(fluxGuidance.inserted > 0 || fluxGuidance.guidancePatched > 0
        ? {
            fluxGuidance: fluxGuidance.inserted + fluxGuidance.guidancePatched,
          }
        : {}),
    },
    error: videoWirePatch.error,
  };
}
