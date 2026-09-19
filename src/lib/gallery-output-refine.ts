import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_NEGATIVE_TOKEN,
  DEFAULT_POSITIVE_TOKEN,
  DEFAULT_SAMPLER_TOKEN,
  DEFAULT_SCHEDULER_TOKEN,
  DEFAULT_SEED_TOKEN,
  DEFAULT_SHIFT_TOKEN,
  DEFAULT_STEPS_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
  resolvePlaceholderTokens,
} from './comfyui-config';
import { getComfyModelDefinition, normalizeComfyModel, type ComfyImageModel } from './comfy-models';
import {
  isFlux1FamilyModel,
  isFluxKleinModel,
  isQwenEditModel,
  isQwenRapidAioModel,
} from './model-denoise-defaults';
import { defaultLoaderPrecisionTier, qwenDualClipFilename } from './model-loader-precision';
import { suggestedVaeFilenameForModel } from './model-checkpoint-map';
import type { QueueQualityProfile } from './queue-quality-profile';
import { fluxImg2imgScaffold, fluxKleinEditScaffold } from './workflow-scaffold-flux';
import { qwenEditComposeScaffold } from './workflow-scaffold-qwen';

/** Classic FLUX.1 DualCLIP defaults — soft-bound from Comfy inventory at queue time. */
const FLUX1_REFINE_CLIP_L = 'clip_l.safetensors';
const FLUX1_REFINE_CLIP_T5 = 't5xxl_fp16.safetensors';

export const GALLERY_REFINE_DENOISE: Record<'final' | 'max', number> = {
  final: 0.22,
  max: 0.26,
};

export const GALLERY_REFINE_PORTRAIT_DENOISE: Record<'final' | 'max', number> = {
  final: 0.18,
  max: 0.22,
};

/** Gentler img2img — prefer this for “add detail / clean soft issues” without rewriting the shot. */
export const GALLERY_SOFT_PASS_DENOISE: Record<'final' | 'max', number> = {
  final: 0.12,
  max: 0.15,
};

export const GALLERY_SOFT_PASS_PORTRAIT_DENOISE: Record<'final' | 'max', number> = {
  final: 0.1,
  max: 0.12,
};

/**
 * Skin-refine soft pass — stronger than generic soft pass so pores/matte skin
 * actually read; still below full refine so pose/wardrobe stay locked.
 */
export const GALLERY_SKIN_PASS_DENOISE: Record<'final' | 'max', number> = {
  final: 0.38,
  max: 0.45,
};

export const GALLERY_SKIN_PASS_PORTRAIT_DENOISE: Record<'final' | 'max', number> = {
  final: 0.34,
  max: 0.4,
};

export type GalleryRefineMode = 'refine' | 'soft';

const PORTRAIT_REFINE_PATTERN =
  /\b(portrait|face|skin|headshot|close-?up|selfie|beauty|model\s+face)\b/i;

export function isPortraitRefinePrompt(prompt: string | undefined): boolean {
  return PORTRAIT_REFINE_PATTERN.test(prompt?.trim() ?? '');
}

/**
 * Cap soft-pass denoise by model family so CFG-1 / anatomy-sensitive stacks
 * stay conservative.
 */
export function softSecondPassDenoiseCap(model?: string): number {
  const id = String(model ?? '').toLowerCase();
  if (/lightning|schnell|turbo|distill|rapid-aio-(sfw|nsfw)/.test(id)) {
    return 0.08;
  }
  if (/qwen/.test(id)) {
    return 0.12;
  }
  if (/klein.*distill|distilled/.test(id)) {
    return 0.11;
  }
  if (/^flux|klein/.test(id)) {
    return 0.15;
  }
  if (/sdxl|sd3|stable-diffusion/.test(id)) {
    return 0.14;
  }
  return 0.13;
}

/** Higher cap for dedicated skin refine — generic soft-pass caps were a visual no-op. */
export function softSkinPassDenoiseCap(model?: string): number {
  const id = String(model ?? '').toLowerCase();
  if (/lightning|schnell|turbo|distill|rapid-aio-(sfw|nsfw)/.test(id)) {
    return 0.22;
  }
  if (/qwen/.test(id)) {
    return 0.35;
  }
  if (/klein.*distill|distilled/.test(id)) {
    return 0.32;
  }
  if (/^flux|klein/.test(id)) {
    return 0.48;
  }
  if (/sdxl|sd3|stable-diffusion/.test(id)) {
    return 0.4;
  }
  return 0.38;
}

export function galleryRefineDenoiseForProfile(
  profile: Extract<QueueQualityProfile, 'final' | 'max'> | undefined,
  prompt?: string,
  mode: GalleryRefineMode = 'refine',
  options?: { skinPass?: boolean }
): number {
  const key = profile === 'max' ? 'max' : 'final';
  if (mode === 'soft') {
    if (options?.skinPass) {
      const table = isPortraitRefinePrompt(prompt)
        ? GALLERY_SKIN_PASS_PORTRAIT_DENOISE
        : GALLERY_SKIN_PASS_DENOISE;
      return table[key];
    }
    const table = isPortraitRefinePrompt(prompt)
      ? GALLERY_SOFT_PASS_PORTRAIT_DENOISE
      : GALLERY_SOFT_PASS_DENOISE;
    return table[key];
  }
  const table = isPortraitRefinePrompt(prompt)
    ? GALLERY_REFINE_PORTRAIT_DENOISE
    : GALLERY_REFINE_DENOISE;
  return table[key];
}

export function galleryRefineDenoiseForEntry(
  entry: { prompt?: string; model?: string },
  profile: Extract<QueueQualityProfile, 'final' | 'max'> | undefined,
  mode: GalleryRefineMode = 'refine',
  options?: { skinPass?: boolean }
): number {
  // Instruction-edit stacks need denoise 1. Soft VAEEncode denoise on Klein gets
  // rewritten to EmptyFlux2Latent at queue time — denoise 0.38 on empty noise
  // decodes as a solid brown mush field.
  if (isQwenEditModel(entry.model ?? '') || isFluxKleinModel(entry.model ?? '')) {
    return 1;
  }
  const base = galleryRefineDenoiseForProfile(profile, entry.prompt, mode, options);
  if (mode !== 'soft') {
    return base;
  }
  const cap = options?.skinPass
    ? softSkinPassDenoiseCap(entry.model)
    : softSecondPassDenoiseCap(entry.model);
  return Math.min(base, cap);
}

type WorkflowNode = {
  class_type: string;
  inputs: Record<string, unknown>;
  _meta?: { title: string };
};

const PORTRAIT_REFINE_NEGATIVE_EXTRA =
  'plastic skin, waxy skin, airbrushed, doll-like, oversharpened, blurry eyes';

export function appendPortraitRefineNegative(
  negativePrompt: string | undefined,
  prompt: string | undefined
): string | undefined {
  if (!isPortraitRefinePrompt(prompt)) {
    return negativePrompt?.trim() || undefined;
  }
  const base = negativePrompt?.trim() ?? '';
  if (base.toLowerCase().includes('plastic skin')) {
    return base || undefined;
  }
  return base ? `${base}, ${PORTRAIT_REFINE_NEGATIVE_EXTRA}` : PORTRAIT_REFINE_NEGATIVE_EXTRA;
}

function buildCheckpointGalleryRefineWorkflow(options?: {
  useAuraFlow?: boolean;
}): Record<string, WorkflowNode> {
  const modelNodeId = '1';
  const loadImageId = '2';
  const vaeEncodeId = '3';
  const positiveId = '4';
  const negativeId = '5';
  const samplingId = '6';
  const samplerId = '7';
  const decodeId = '8';
  const saveId = '9';

  const workflow: Record<string, WorkflowNode> = {
    [modelNodeId]: {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Castcut — checkpoint' },
    },
    [loadImageId]: {
      class_type: 'LoadImage',
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: 'Castcut — gallery output' },
    },
    [vaeEncodeId]: {
      class_type: 'VAEEncode',
      inputs: {
        pixels: [loadImageId, 0],
        vae: [modelNodeId, 2],
      },
      _meta: { title: 'Castcut — encode input' },
    },
    [positiveId]: {
      class_type: 'CLIPTextEncode',
      inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: [modelNodeId, 1] },
      _meta: { title: 'Castcut — positive' },
    },
    [negativeId]: {
      class_type: 'CLIPTextEncode',
      inputs: { text: DEFAULT_NEGATIVE_TOKEN, clip: [modelNodeId, 1] },
      _meta: { title: 'Castcut — negative' },
    },
  };

  const samplerModelRef: [string, number] = options?.useAuraFlow
    ? (() => {
        workflow[samplingId] = {
          class_type: 'ModelSamplingAuraFlow',
          inputs: { model: [modelNodeId, 0], shift: DEFAULT_SHIFT_TOKEN },
          _meta: { title: 'Castcut — sampling' },
        };
        return [samplingId, 0] as [string, number];
      })()
    : [modelNodeId, 0];

  workflow[samplerId] = {
    class_type: 'KSampler',
    inputs: {
      seed: DEFAULT_SEED_TOKEN,
      steps: DEFAULT_STEPS_TOKEN,
      cfg: DEFAULT_CFG_TOKEN,
      sampler_name: DEFAULT_SAMPLER_TOKEN,
      scheduler: DEFAULT_SCHEDULER_TOKEN,
      denoise: DEFAULT_DENOISE_TOKEN,
      model: samplerModelRef,
      positive: [positiveId, 0],
      negative: [negativeId, 0],
      latent_image: [vaeEncodeId, 0],
    },
    _meta: { title: 'Castcut — refine sampler' },
  };
  workflow[decodeId] = {
    class_type: 'VAEDecode',
    inputs: { samples: [samplerId, 0], vae: [modelNodeId, 2] },
    _meta: { title: 'Castcut — decode' },
  };
  workflow[saveId] = {
    class_type: 'SaveImage',
    inputs: {
      filename_prefix: 'Castcut-refine',
      images: [decodeId, 0],
    },
    _meta: { title: 'Castcut — save' },
  };

  return workflow;
}

/** Klein uses UNET + CLIPLoader (flux2) + VAE + ModelSamplingFlux — not CheckpointLoaderSimple. */
function buildFluxKleinGalleryRefineWorkflow(model: string): Record<string, WorkflowNode> {
  // Soft VAEEncode img2img is rewritten to EmptyFlux2 at queue time; pairing that
  // with soft denoise yields solid brown mush. Use the official ReferenceLatent
  // edit scaffold (denoise 1) — same pattern as Qwen Edit gallery refine.
  const tokens = resolvePlaceholderTokens();
  const scaffold = fluxKleinEditScaffold(tokens, model) as Record<string, WorkflowNode>;
  for (const node of Object.values(scaffold)) {
    if (node?.class_type === 'SaveImage' && node.inputs) {
      node.inputs.filename_prefix = 'Castcut-refine';
    }
  }
  return scaffold;
}

/**
 * FLUX.1 / UltraReal img2img refine — reuse the production fluxImg2imgScaffold.
 * Hand-rolled DualCLIP graphs drifted from sampler/guidance wiring and surfaced
 * Comfy errors like "too many values to unpack (expected 4)" on Flux forward.
 */
function buildFlux1GalleryRefineWorkflow(model: string): Record<string, WorkflowNode> {
  const tokens = resolvePlaceholderTokens();
  const scaffold = fluxImg2imgScaffold(tokens, model) as Record<string, WorkflowNode>;
  // Prefer concrete ae VAE so sticky Rapid/Qwen VAEs cannot leak into soft refine.
  const vaeName = suggestedVaeFilenameForModel(model) || 'ae.safetensors';
  for (const node of Object.values(scaffold)) {
    if (node?.class_type === 'VAELoader' && node.inputs) {
      node.inputs.vae_name = vaeName;
    }
    if (node?.class_type === 'DualCLIPLoader' && node.inputs) {
      if (!String(node.inputs.clip_name1 ?? '').trim()) {
        node.inputs.clip_name1 = FLUX1_REFINE_CLIP_L;
      }
      if (!String(node.inputs.clip_name2 ?? '').trim()) {
        node.inputs.clip_name2 = FLUX1_REFINE_CLIP_T5;
      }
      node.inputs.type = 'flux';
    }
    if (node?.class_type === 'SaveImage' && node.inputs) {
      node.inputs.filename_prefix = 'Castcut-refine';
    }
  }
  return scaffold;
}

/**
 * Qwen Edit skin/soft refine — use the Compose Edit scaffold (separate pos/neg
 * TextEncode + EmptySD3 + ReferenceLatent path). The classic VAEEncode img2img
 * scaffold shares one encode for pos+neg; at denoise 1 / CFG that collapses
 * to unconditioned noise and decodes as olive garbage.
 */
function buildQwenEditGalleryRefineWorkflow(model: string): Record<string, WorkflowNode> {
  const tokens = resolvePlaceholderTokens();
  const scaffold = qwenEditComposeScaffold(tokens, model) as Record<string, WorkflowNode>;
  for (const node of Object.values(scaffold)) {
    if (node?.class_type === 'SaveImage' && node.inputs) {
      node.inputs.filename_prefix = 'Castcut-refine';
    }
  }
  return scaffold;
}

function buildQwenGalleryRefineWorkflow(): Record<string, WorkflowNode> {
  const tier = defaultLoaderPrecisionTier();
  const clipName = qwenDualClipFilename(tier);

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: 'default' },
      _meta: { title: 'Castcut — UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: clipName,
        type: 'qwen_image',
      },
      _meta: { title: 'Castcut — CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: DEFAULT_VAE_TOKEN },
      _meta: { title: 'Castcut — VAE' },
    },
    '4': {
      class_type: 'LoadImage',
      inputs: { image: DEFAULT_INPUT_IMAGE_TOKEN },
      _meta: { title: 'Castcut — gallery output' },
    },
    '5': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['4', 0], vae: ['3', 0] },
      _meta: { title: 'Castcut — encode input' },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: DEFAULT_POSITIVE_TOKEN, clip: ['2', 0] },
      _meta: { title: 'Castcut — positive' },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: DEFAULT_NEGATIVE_TOKEN, clip: ['2', 0] },
      _meta: { title: 'Castcut — negative' },
    },
    '8': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: DEFAULT_SHIFT_TOKEN },
      _meta: { title: 'Castcut — sampling' },
    },
    '9': {
      class_type: 'KSampler',
      inputs: {
        seed: DEFAULT_SEED_TOKEN,
        steps: DEFAULT_STEPS_TOKEN,
        cfg: DEFAULT_CFG_TOKEN,
        sampler_name: DEFAULT_SAMPLER_TOKEN,
        scheduler: DEFAULT_SCHEDULER_TOKEN,
        denoise: DEFAULT_DENOISE_TOKEN,
        model: ['8', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
      _meta: { title: 'Castcut — refine sampler' },
    },
    '10': {
      class_type: 'VAEDecode',
      inputs: { samples: ['9', 0], vae: ['3', 0] },
      _meta: { title: 'Castcut — decode' },
    },
    '11': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'Castcut-refine',
        images: ['10', 0],
      },
      _meta: { title: 'Castcut — save' },
    },
  };
}

export function buildGalleryRefineWorkflow(
  model: ComfyImageModel | string = 'qwen-image-2512'
): Record<string, WorkflowNode> {
  const normalized = normalizeComfyModel(model);
  if (/^flux-2-klein/i.test(String(normalized))) {
    return buildFluxKleinGalleryRefineWorkflow(String(normalized));
  }
  // UltraReal / flux-dev / Schnell — UNET-only weights; CheckpointLoader leaves CLIP=None.
  if (isFlux1FamilyModel(normalized)) {
    return buildFlux1GalleryRefineWorkflow(String(normalized));
  }
  // Edit models need TextEncodeQwenImageEdit(Plus) — never plain CLIPTextEncode.
  if (isQwenEditModel(normalized)) {
    return buildQwenEditGalleryRefineWorkflow(String(normalized));
  }
  const definition = getComfyModelDefinition(normalized);
  if (definition.category === 'qwen') {
    // Rapid AIO is a single-file checkpoint — do not use UNET+CLIP+VAE refine.
    if (isQwenRapidAioModel(normalized)) {
      return buildCheckpointGalleryRefineWorkflow({ useAuraFlow: true });
    }
    return buildQwenGalleryRefineWorkflow();
  }
  if (definition.category === 'flux') {
    // Remaining flux (e.g. flux2) — still prefer DualCLIP UNET path over checkpoint.
    return buildFlux1GalleryRefineWorkflow(String(normalized));
  }
  return buildCheckpointGalleryRefineWorkflow();
}

import type { WorkflowParamValues } from './comfyui-config';

export function galleryRefineQueueParams(input: {
  inputImageFilename: string;
  profile?: Extract<QueueQualityProfile, 'final' | 'max'>;
  prompt?: string;
  model?: string;
  mode?: GalleryRefineMode;
  /** Dedicated skin refine — higher denoise than generic soft pass. */
  skinPass?: boolean;
  queueParams?: Pick<
    WorkflowParamValues,
    'seed' | 'width' | 'height' | 'cfg' | 'steps' | 'samplerName' | 'scheduler'
  >;
}): Record<string, string> {
  const mode = input.mode ?? 'refine';
  const skinPass = input.skinPass === true;
  const denoise =
    mode === 'soft'
      ? galleryRefineDenoiseForEntry(
          { prompt: input.prompt, model: input.model },
          input.profile,
          'soft',
          { skinPass }
        )
      : galleryRefineDenoiseForProfile(input.profile, input.prompt, mode);
  const params: Record<string, string> = {
    inputImageFilename: input.inputImageFilename,
    denoise: String(denoise),
  };

  const source = input.queueParams;
  if (source?.seed != null && String(source.seed).trim()) {
    params.seed = String(source.seed).trim();
  }
  if (source?.width != null && String(source.width).trim()) {
    params.width = String(source.width).trim();
  }
  if (source?.height != null && String(source.height).trim()) {
    params.height = String(source.height).trim();
  }
  if (source?.cfg != null && String(source.cfg).trim()) {
    params.cfg = String(source.cfg).trim();
  }
  if (source?.steps != null && String(source.steps).trim()) {
    params.steps = String(source.steps).trim();
  }
  if (source?.samplerName != null && String(source.samplerName).trim()) {
    params.sampler = String(source.samplerName).trim();
  }
  if (source?.scheduler != null && String(source.scheduler).trim()) {
    params.scheduler = String(source.scheduler).trim();
  }

  return params;
}
