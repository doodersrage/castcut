import {
  DEFAULT_CFG_TOKEN,
  DEFAULT_DENOISE_TOKEN,
  DEFAULT_FLUX_BASE_SHIFT_TOKEN,
  DEFAULT_FLUX_MAX_SHIFT_TOKEN,
  DEFAULT_HEIGHT_TOKEN,
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
  DEFAULT_WIDTH_TOKEN,
} from './comfyui-config';
import { getComfyModelDefinition, normalizeComfyModel, type ComfyImageModel } from './comfy-models';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import { defaultLoaderPrecisionTier, qwenDualClipFilename } from './model-loader-precision';
import type { QueueQualityProfile } from './queue-quality-profile';
import { fluxKleinDualClipFilename } from './workflow-scaffold-flux';

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

export function galleryRefineDenoiseForProfile(
  profile: Extract<QueueQualityProfile, 'final' | 'max'> | undefined,
  prompt?: string,
  mode: GalleryRefineMode = 'refine'
): number {
  const key = profile === 'max' ? 'max' : 'final';
  if (mode === 'soft') {
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
  mode: GalleryRefineMode = 'refine'
): number {
  const base = galleryRefineDenoiseForProfile(profile, entry.prompt, mode);
  if (mode !== 'soft') {
    return base;
  }
  return Math.min(base, softSecondPassDenoiseCap(entry.model));
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
  const clipName = fluxKleinDualClipFilename(model);
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
        type: 'flux2',
      },
      _meta: { title: 'Castcut — CLIP (FLUX.2 Klein)' },
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
      class_type: 'ModelSamplingFlux',
      inputs: {
        model: ['1', 0],
        max_shift: DEFAULT_FLUX_MAX_SHIFT_TOKEN,
        base_shift: DEFAULT_FLUX_BASE_SHIFT_TOKEN,
        width: DEFAULT_WIDTH_TOKEN,
        height: DEFAULT_HEIGHT_TOKEN,
      },
      _meta: { title: 'Castcut — ModelSamplingFlux' },
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
  const definition = getComfyModelDefinition(normalized);
  if (definition.category === 'qwen') {
    // Rapid AIO is a single-file checkpoint — do not use UNET+CLIP+VAE refine.
    if (isQwenRapidAioModel(normalized)) {
      return buildCheckpointGalleryRefineWorkflow({ useAuraFlow: true });
    }
    return buildQwenGalleryRefineWorkflow();
  }
  if (definition.category === 'flux') {
    return buildCheckpointGalleryRefineWorkflow({ useAuraFlow: true });
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
  queueParams?: Pick<
    WorkflowParamValues,
    'seed' | 'width' | 'height' | 'cfg' | 'steps' | 'samplerName' | 'scheduler'
  >;
}): Record<string, string> {
  const mode = input.mode ?? 'refine';
  const denoise =
    mode === 'soft'
      ? galleryRefineDenoiseForEntry(
          { prompt: input.prompt, model: input.model },
          input.profile,
          'soft'
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
