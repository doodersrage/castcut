import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from './comfy-models/client';
import type { WorkflowParamValues } from './comfyui-config';
import { isQwenRapidAioModel, isWanRapidAioModel } from './model-denoise-defaults';
import { isWanLightningModel } from './model-sampling-patch';

export function isLightningModelId(model: string): boolean {
  const id = model.trim();
  if (!id) {
    return false;
  }
  // Native turbo ids: CFG-1 style-LoRA neutralization only — not Lightning LoRA slots.
  if (id === 'z-image-turbo' || id === 'boogu-image-turbo' || id === 'boogu-image-edit-turbo') {
    return true;
  }
  if (COMFY_MODEL_IDS.has(id)) {
    // Qwen + WAN Lightning distilled ids.
    return id.includes('lightning-');
  }
  return /lightning-(4|8)\b/.test(id);
}

/** CFG-1 distilled stacks — sidebar/catalog style LoRAs cause melt and banding. */
export function shouldNeutralizeStyleLorasAtQueue(model?: string | null): boolean {
  const id = String(model ?? '').trim();
  if (!id) {
    return false;
  }
  if (id === 'flux-schnell') {
    return true;
  }
  return isLightningModelId(id);
}

export type ModelSamplerPresetTier = 'base' | 'optimized' | 'maxCompatible' | 'max';

export const DEFAULT_MODEL_SAMPLER_PRESET_TIER: ModelSamplerPresetTier = 'base';

export const MODEL_SAMPLER_PRESET_OPTIONS: {
  id: ModelSamplerPresetTier;
  label: string;
  description: string;
}[] = [
  {
    id: 'base',
    label: 'Base',
    description: 'Balanced speed and quality — good for drafts and iteration.',
  },
  {
    id: 'optimized',
    label: 'Optimized',
    description: 'Higher step count and tuned CFG for final renders.',
  },
  {
    id: 'maxCompatible',
    label: 'Max compatible',
    description:
      "Best quality within each model's recommended sampler, scheduler, and step limits.",
  },
  {
    id: 'max',
    label: 'Max quality',
    description: 'Highest step count — may exceed some distilled or Flux comfort ranges.',
  },
];

export type ModelSamplerDefaults = {
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  fixedSeed?: number;
};

type CategorySamplerPresets = Record<
  ModelSamplerPresetTier,
  Pick<ModelSamplerDefaults, 'steps' | 'cfg' | 'samplerName' | 'scheduler'>
>;

const CATEGORY_SAMPLER_PRESETS: Record<ComfyModelCategory, CategorySamplerPresets> = {
  'stable-diffusion': {
    base: { steps: 25, cfg: 7, samplerName: 'euler_ancestral', scheduler: 'normal' },
    optimized: { steps: 32, cfg: 7.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 36, cfg: 7.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 40, cfg: 7.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  sdxl: {
    base: { steps: 30, cfg: 6.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    optimized: { steps: 36, cfg: 6, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 40, cfg: 6, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 45, cfg: 6, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  sd3: {
    base: { steps: 28, cfg: 4.5, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 36, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 38, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 45, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  flux: {
    base: { steps: 20, cfg: 3.5, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 28, cfg: 3.5, samplerName: 'euler', scheduler: 'simple' },
    maxCompatible: { steps: 28, cfg: 3.5, samplerName: 'euler', scheduler: 'simple' },
    max: { steps: 35, cfg: 3.5, samplerName: 'euler', scheduler: 'simple' },
  },
  qwen: {
    base: { steps: 28, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 30, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
    maxCompatible: { steps: 35, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
    max: { steps: 40, cfg: 3, samplerName: 'euler', scheduler: 'simple' },
  },
  hunyuan: {
    base: { steps: 30, cfg: 6, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 40, cfg: 5.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 40, cfg: 5.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 50, cfg: 5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'other-dit': {
    base: { steps: 28, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 36, cfg: 4.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 38, cfg: 4.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 45, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'instruct-edit': {
    base: { steps: 20, cfg: 7.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    optimized: { steps: 28, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 28, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 35, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  video: {
    base: { steps: 30, cfg: 6, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 40, cfg: 5.5, samplerName: 'euler', scheduler: 'normal' },
    maxCompatible: { steps: 40, cfg: 5.5, samplerName: 'euler', scheduler: 'normal' },
    max: { steps: 50, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
  },
  audio: {
    base: { steps: 50, cfg: 7, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 80, cfg: 7, samplerName: 'euler', scheduler: 'normal' },
    maxCompatible: { steps: 100, cfg: 7, samplerName: 'euler', scheduler: 'normal' },
    max: { steps: 150, cfg: 7, samplerName: 'euler', scheduler: 'normal' },
  },
  mesh: {
    base: { steps: 30, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 40, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
    maxCompatible: { steps: 50, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
    max: { steps: 60, cfg: 5, samplerName: 'euler', scheduler: 'normal' },
  },
};

type ModelSamplerPresetMap = Partial<
  Record<ComfyImageModel, Record<ModelSamplerPresetTier, ModelSamplerDefaults>>
>;

const FLUX_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'euler',
  scheduler: 'simple',
};

/** Civitai UltraReal Fine-Tune v4 — author rec: DPM++ 2M, beta, CFG 3, 30–50 steps. */
const ULTRAREAL_FLUX_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'dpmpp_2m',
  scheduler: 'beta',
};

const QWEN_LIGHTNING_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler' | 'cfg'> = {
  cfg: 1,
  samplerName: 'euler',
  scheduler: 'simple',
};

const Z_IMAGE_TURBO_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler' | 'cfg'> = {
  cfg: 1,
  samplerName: 'res_multistep',
  scheduler: 'sgm_uniform',
};

const Z_IMAGE_BASE_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'res_multistep',
  scheduler: 'sgm_uniform',
};

const BOOGU_BASE_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'res_multistep',
  scheduler: 'sgm_uniform',
};

/** Official Boogu Turbo: euler / sgm_uniform / 4 steps / CFG 1 — not Base res_multistep. */
const BOOGU_TURBO_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler' | 'cfg'> = {
  cfg: 1,
  samplerName: 'euler',
  scheduler: 'sgm_uniform',
};

const WAN_LIGHTNING_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler' | 'cfg'> = {
  cfg: 1,
  samplerName: 'uni_pc',
  scheduler: 'simple',
};

/** Phr00t WAN Rapid AIO — author recommends euler_a / beta at CFG 1. */
const WAN_RAPID_AIO_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'euler_ancestral',
  scheduler: 'beta',
};

const QWEN_2512_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'euler',
  // Official Qwen-Image-2512 ComfyUI templates prefer beta over simple for vanilla T2I.
  scheduler: 'beta',
};

const QWEN_RAPID_AIO_EDIT_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'euler_ancestral',
  scheduler: 'beta',
};

const QWEN_RAPID_AIO_SFW_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'euler',
  scheduler: 'beta',
};

const QWEN_RAPID_AIO_NSFW_SAMPLER: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'> = {
  samplerName: 'euler_ancestral',
  scheduler: 'sgm_uniform',
};

function rapidAioPresets(
  sampler: Pick<ModelSamplerDefaults, 'samplerName' | 'scheduler'>
): Record<ModelSamplerPresetTier, ModelSamplerDefaults> {
  // Max adds two steps + sgm_uniform — sampling-side anti-moiré before blur polish.
  return {
    base: { steps: 4, cfg: 1, ...sampler },
    optimized: { steps: 6, cfg: 1, ...sampler },
    maxCompatible: { steps: 8, cfg: 1, ...sampler },
    max: {
      steps: 10,
      cfg: 1,
      samplerName: sampler.samplerName,
      scheduler: 'sgm_uniform',
    },
  };
}

/** BFL locks distilled Klein to exactly 4 steps + guidance 1.0 (step-distilled). */
const FLUX_KLEIN_DISTILLED: ModelSamplerDefaults = {
  steps: 4,
  cfg: 1,
  samplerName: 'euler',
  scheduler: 'simple',
};

function kleinBaseSamplerPresets(): Record<ModelSamplerPresetTier, ModelSamplerDefaults> {
  // Authentic Klein skin workflows land near CFG 4 with plastic negatives.
  // Official Base range is 3.5–5; 4.0 helps skin LoRAs bite without frying.
  const base: ModelSamplerDefaults = {
    steps: 24,
    cfg: 4,
    samplerName: 'euler',
    scheduler: 'simple',
  };
  return {
    base,
    optimized: { ...base },
    maxCompatible: {
      steps: 24,
      cfg: 4,
      samplerName: 'res_2s',
      scheduler: 'simple',
    },
    max: {
      steps: 28,
      cfg: 4,
      samplerName: 'res_2s',
      scheduler: 'simple',
    },
  };
}

function kleinDistilledSamplerPresets(): Record<ModelSamplerPresetTier, ModelSamplerDefaults> {
  // Quality tiers must not change steps/CFG — distillation is step-locked.
  return {
    base: { ...FLUX_KLEIN_DISTILLED },
    optimized: { ...FLUX_KLEIN_DISTILLED },
    maxCompatible: { ...FLUX_KLEIN_DISTILLED },
    max: { ...FLUX_KLEIN_DISTILLED },
  };
}

export function isKleinDistilledModel(model: ComfyImageModel | string): boolean {
  return model === 'flux-2-klein-4b-distilled' || model === 'flux-2-klein-9b-distilled';
}

export function isKleinBaseModel(model: ComfyImageModel | string): boolean {
  return model === 'flux-2-klein' || model === 'flux-2-klein-9b';
}

function fixedSamplerPresets(
  preset: ModelSamplerDefaults,
  maxCompatible?: ModelSamplerDefaults
): Record<ModelSamplerPresetTier, ModelSamplerDefaults> {
  const compatible = maxCompatible ?? preset;
  return {
    base: preset,
    optimized: preset,
    maxCompatible: compatible,
    max: preset,
  };
}

const MODEL_SAMPLER_PRESETS: ModelSamplerPresetMap = {
  'flux-schnell': fixedSamplerPresets({ steps: 4, cfg: 1, ...FLUX_SAMPLER }),
  'z-image-turbo': fixedSamplerPresets({ steps: 8, ...Z_IMAGE_TURBO_SAMPLER }),
  'z-image': {
    base: { steps: 30, cfg: 4, ...Z_IMAGE_BASE_SAMPLER },
    optimized: { steps: 40, cfg: 4, ...Z_IMAGE_BASE_SAMPLER },
    maxCompatible: { steps: 45, cfg: 3.5, ...Z_IMAGE_BASE_SAMPLER },
    max: { steps: 50, cfg: 3.5, ...Z_IMAGE_BASE_SAMPLER },
  },
  'boogu-image': {
    base: { steps: 25, cfg: 4, ...BOOGU_BASE_SAMPLER },
    optimized: { steps: 35, cfg: 4, ...BOOGU_BASE_SAMPLER },
    maxCompatible: { steps: 45, cfg: 3.5, ...BOOGU_BASE_SAMPLER },
    max: { steps: 50, cfg: 3.5, ...BOOGU_BASE_SAMPLER },
  },
  'boogu-image-turbo': fixedSamplerPresets({ steps: 4, ...BOOGU_TURBO_SAMPLER }),
  'boogu-image-edit': {
    base: { steps: 25, cfg: 5, ...BOOGU_BASE_SAMPLER },
    optimized: { steps: 35, cfg: 5, ...BOOGU_BASE_SAMPLER },
    maxCompatible: { steps: 45, cfg: 4.5, ...BOOGU_BASE_SAMPLER },
    max: { steps: 50, cfg: 4, ...BOOGU_BASE_SAMPLER },
  },
  'boogu-image-edit-turbo': fixedSamplerPresets({ steps: 4, ...BOOGU_TURBO_SAMPLER }),
  'flux-2-klein': kleinBaseSamplerPresets(),
  'flux-2-klein-4b-distilled': kleinDistilledSamplerPresets(),
  'flux-2-klein-9b': kleinBaseSamplerPresets(),
  'flux-2-klein-9b-distilled': kleinDistilledSamplerPresets(),
  'flux-dev': {
    base: { steps: 20, cfg: 3.5, ...FLUX_SAMPLER },
    optimized: { steps: 28, cfg: 3.5, ...FLUX_SAMPLER },
    maxCompatible: { steps: 28, cfg: 3.5, ...FLUX_SAMPLER },
    max: { steps: 35, cfg: 3.5, ...FLUX_SAMPLER },
  },
  'flux-ultrareal-v4': {
    // Sidebar CFG → FluxGuidance (KSampler.cfg forced to 1). 2.5 reduces glossy overbake vs 3.
    base: { steps: 30, cfg: 2.5, ...ULTRAREAL_FLUX_SAMPLER },
    optimized: { steps: 40, cfg: 2.5, ...ULTRAREAL_FLUX_SAMPLER },
    maxCompatible: { steps: 45, cfg: 2.5, ...ULTRAREAL_FLUX_SAMPLER },
    max: { steps: 50, cfg: 2.5, ...ULTRAREAL_FLUX_SAMPLER },
  },
  flux2: {
    base: { steps: 20, cfg: 3.5, ...FLUX_SAMPLER },
    optimized: { steps: 28, cfg: 3.5, ...FLUX_SAMPLER },
    maxCompatible: { steps: 28, cfg: 3.5, ...FLUX_SAMPLER },
    max: { steps: 35, cfg: 3.5, ...FLUX_SAMPLER },
  },
  'qwen-image-2512': {
    // Official template climbs toward 50/CFG4; we stay a notch under CFG4 so
    // Final/Max don't push chroma into oversaturation (Lightning is CFG-1).
    base: { steps: 20, cfg: 2.5, ...QWEN_2512_SAMPLER },
    optimized: { steps: 30, cfg: 3.2, ...QWEN_2512_SAMPLER },
    maxCompatible: { steps: 40, cfg: 3.5, ...QWEN_2512_SAMPLER },
    max: { steps: 50, cfg: 3.5, ...QWEN_2512_SAMPLER },
  },
  'qwen-image-2512-lightning-4': fixedSamplerPresets({
    steps: 4,
    ...QWEN_LIGHTNING_SAMPLER,
  }),
  'qwen-image-2512-lightning-8': fixedSamplerPresets({
    steps: 8,
    ...QWEN_LIGHTNING_SAMPLER,
  }),
  // Full Edit-2511 — Compose Final/Max; more steps than Lightning 8 mush.
  'qwen-image-edit-2511': {
    base: { steps: 28, cfg: 2.5, ...QWEN_2512_SAMPLER },
    optimized: { steps: 30, cfg: 3.2, ...QWEN_2512_SAMPLER },
    maxCompatible: { steps: 40, cfg: 3.5, ...QWEN_2512_SAMPLER },
    max: { steps: 50, cfg: 3.5, ...QWEN_2512_SAMPLER },
  },
  'qwen-image-edit-2511-lightning-4': fixedSamplerPresets({
    steps: 4,
    ...QWEN_LIGHTNING_SAMPLER,
  }),
  'qwen-image-edit-2511-lightning-8': fixedSamplerPresets({
    steps: 8,
    ...QWEN_LIGHTNING_SAMPLER,
  }),
  'qwen-rapid-aio-edit': rapidAioPresets(QWEN_RAPID_AIO_EDIT_SAMPLER),
  'qwen-rapid-aio-sfw': rapidAioPresets(QWEN_RAPID_AIO_SFW_SAMPLER),
  'qwen-rapid-aio-nsfw': rapidAioPresets(QWEN_RAPID_AIO_NSFW_SAMPLER),
  'qwen-image-2.0': {
    base: { steps: 35, cfg: 4, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 45, cfg: 3.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 45, cfg: 3.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 55, cfg: 3.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'sd3-medium': {
    base: { steps: 28, cfg: 4.5, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 34, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 36, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 42, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'sd3.5-large': {
    base: { steps: 30, cfg: 4.5, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 38, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 40, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 45, cfg: 4, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'stable-cascade-b': {
    base: { steps: 20, cfg: 4, samplerName: 'euler', scheduler: 'normal' },
    optimized: { steps: 26, cfg: 3.8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 28, cfg: 3.8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 32, cfg: 3.8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'sd15-instruct-pix2pix': {
    base: { steps: 20, cfg: 7.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    optimized: { steps: 28, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 28, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 35, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  'sdxl-instruct-pix2pix': {
    base: { steps: 20, cfg: 7.5, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    optimized: { steps: 28, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    maxCompatible: { steps: 28, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
    max: { steps: 35, cfg: 8, samplerName: 'dpmpp_2m', scheduler: 'karras' },
  },
  // Video family presets — beat the generic category euler/normal defaults.
  'wan-video': {
    base: { steps: 20, cfg: 6, samplerName: 'uni_pc', scheduler: 'simple' },
    optimized: { steps: 30, cfg: 6, samplerName: 'uni_pc', scheduler: 'simple' },
    maxCompatible: { steps: 30, cfg: 5.5, samplerName: 'uni_pc', scheduler: 'simple' },
    max: { steps: 40, cfg: 5, samplerName: 'uni_pc', scheduler: 'simple' },
  },
  'wan-video-rapid-aio': rapidAioPresets(WAN_RAPID_AIO_SAMPLER),
  'wan-video-lightning-4': fixedSamplerPresets({
    steps: 4,
    ...WAN_LIGHTNING_SAMPLER,
  }),
  'hunyuan-video': {
    base: { steps: 20, cfg: 6, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 30, cfg: 6, samplerName: 'euler', scheduler: 'simple' },
    maxCompatible: { steps: 30, cfg: 5.5, samplerName: 'dpmpp_2m', scheduler: 'simple' },
    max: { steps: 40, cfg: 5, samplerName: 'dpmpp_2m', scheduler: 'simple' },
  },
  'hunyuan-video-1.5': {
    base: { steps: 20, cfg: 6, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 30, cfg: 6, samplerName: 'euler', scheduler: 'simple' },
    maxCompatible: { steps: 30, cfg: 5.5, samplerName: 'dpmpp_2m', scheduler: 'simple' },
    max: { steps: 40, cfg: 5, samplerName: 'dpmpp_2m', scheduler: 'simple' },
  },
  'ltx-video': {
    base: { steps: 20, cfg: 3, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 30, cfg: 3, samplerName: 'euler', scheduler: 'simple' },
    maxCompatible: { steps: 30, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
    max: { steps: 40, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
  },
  'ltx-video-2': {
    base: { steps: 20, cfg: 3, samplerName: 'euler', scheduler: 'simple' },
    optimized: { steps: 28, cfg: 3, samplerName: 'euler', scheduler: 'simple' },
    maxCompatible: { steps: 30, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
    max: { steps: 40, cfg: 2.5, samplerName: 'euler', scheduler: 'simple' },
  },
};

/** `ltxv` belongs on LTXVScheduler — KSampler only accepts simple/karras/normal/…. */
export function ksamplerSafeScheduler(scheduler: string | undefined): string {
  const trimmed = scheduler?.trim() ?? '';
  if (/^ltxv?$/i.test(trimmed)) {
    return 'simple';
  }
  return trimmed;
}

export function normalizeModelSamplerPresetTier(value: unknown): ModelSamplerPresetTier {
  if (value === 'maxCompatible' || value === 'max-compatible' || value === 'max_compatible') {
    return 'maxCompatible';
  }
  if (value === 'max') {
    return 'max';
  }
  if (value === 'optimized') {
    return 'optimized';
  }
  return 'base';
}

export function getModelSamplerDefaults(
  model: ComfyImageModel | string = DEFAULT_COMFY_MODEL,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): ModelSamplerDefaults {
  const normalized = COMFY_MODEL_IDS.has(model) ? model : DEFAULT_COMFY_MODEL;
  const presetTier = normalizeModelSamplerPresetTier(tier);
  const modelPresets = MODEL_SAMPLER_PRESETS[normalized as ComfyImageModel];
  if (modelPresets?.[presetTier]) {
    return modelPresets[presetTier];
  }

  const definition = getComfyModelDefinition(normalized);
  const categoryPresets =
    CATEGORY_SAMPLER_PRESETS[definition.category] ?? CATEGORY_SAMPLER_PRESETS['other-dit'];
  return categoryPresets[presetTier];
}

export function modelSamplerDefaultsToParams(defaults: ModelSamplerDefaults): WorkflowParamValues {
  return {
    steps: defaults.steps,
    cfg: defaults.cfg,
    samplerName: defaults.samplerName,
    scheduler: defaults.scheduler,
    ...(defaults.fixedSeed != null ? { seed: defaults.fixedSeed } : {}),
  };
}

export function resolveModelSamplerParams(
  model?: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): WorkflowParamValues {
  if (!model) {
    return {};
  }
  return modelSamplerDefaultsToParams(getModelSamplerDefaults(model, tier));
}

/**
 * Lightning LoRAs require their baked CFG/steps. Overrides (Advanced queue,
 * stale runtime, handoff) with CFG > 1 cause plastic/smooth skin; wrong step
 * counts overcook into grain.
 */
export function ensureLightningSamplerParams(
  params: WorkflowParamValues,
  model: string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): WorkflowParamValues {
  if (!isLightningModelId(model)) {
    return params;
  }
  const lightning = resolveModelSamplerParams(model, tier);
  return {
    ...params,
    ...(lightning.steps != null ? { steps: lightning.steps } : {}),
    ...(lightning.cfg != null ? { cfg: lightning.cfg } : {}),
    ...(lightning.samplerName != null ? { samplerName: lightning.samplerName } : {}),
    ...(lightning.scheduler != null ? { scheduler: lightning.scheduler } : {}),
  };
}

const RAPID_AIO_TIER_ORDER: ModelSamplerPresetTier[] = [
  'base',
  'optimized',
  'maxCompatible',
  'max',
];

/**
 * Prefer an exact Rapid step-count match over the caller tier so Max (10) /
 * maxCompatible (8) survive inject/server paths that still pass "base".
 */
function resolveRapidAioForceTier(
  model: string,
  params: WorkflowParamValues,
  requested: ModelSamplerPresetTier
): ModelSamplerPresetTier {
  const requestedTier = normalizeModelSamplerPresetTier(requested);
  const currentSteps = Number(params.steps);
  if (!Number.isFinite(currentSteps)) {
    return requestedTier;
  }

  let matched: ModelSamplerPresetTier | undefined;
  for (const candidate of RAPID_AIO_TIER_ORDER) {
    const preset = resolveModelSamplerParams(model, candidate);
    if (preset.steps === currentSteps) {
      matched = candidate;
    }
  }
  if (!matched) {
    return requestedTier;
  }
  return RAPID_AIO_TIER_ORDER.indexOf(matched) >= RAPID_AIO_TIER_ORDER.indexOf(requestedTier)
    ? matched
    : requestedTier;
}

/**
 * Rapid AIO is CFG-1 distilled (Lightning baked in). Force sampler defaults so
 * Advanced/stale CFG>1 cannot plasticize output — same idea as Lightning.
 * Never downgrades a higher Rapid tier already present in params (e.g. Max 10).
 */
export function ensureRapidAioSamplerParams(
  params: WorkflowParamValues,
  model: string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): WorkflowParamValues {
  if (!isQwenRapidAioModel(model) && !isWanRapidAioModel(model)) {
    return params;
  }
  const forceTier = resolveRapidAioForceTier(model, params, tier);
  const rapid = resolveModelSamplerParams(model, forceTier);
  return {
    ...params,
    ...(rapid.steps != null ? { steps: rapid.steps } : {}),
    ...(rapid.cfg != null ? { cfg: rapid.cfg } : {}),
    ...(rapid.samplerName != null ? { samplerName: rapid.samplerName } : {}),
    ...(rapid.scheduler != null ? { scheduler: rapid.scheduler } : {}),
  };
}

/** Force CFG-1 distilled sampler stacks (Lightning + Rapid AIO). */
export function ensureDistilledSamplerParams(
  params: WorkflowParamValues,
  model: string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): WorkflowParamValues {
  return ensureRapidAioSamplerParams(
    ensureLightningSamplerParams(params, model, tier),
    model,
    tier
  );
}

export type ModelSamplerOverrideFields = Partial<
  Pick<WorkflowParamValues, 'steps' | 'cfg' | 'denoise' | 'samplerName' | 'scheduler'>
>;

export function pickModelSamplerOverrideFields(
  overrides?: ModelSamplerOverrideFields | null
): ModelSamplerOverrideFields {
  if (!overrides) {
    return {};
  }
  const picked: ModelSamplerOverrideFields = {};
  for (const key of ['steps', 'cfg', 'denoise', 'samplerName', 'scheduler'] as const) {
    const value = overrides[key];
    if (value == null || value.toString().trim() === '') {
      continue;
    }
    picked[key] = value.toString().trim();
  }
  return picked;
}

export function hasModelSamplerOverrides(overrides?: ModelSamplerOverrideFields | null): boolean {
  return Object.keys(pickModelSamplerOverrideFields(overrides)).length > 0;
}

/** Sidebar KSampler denoise override — honored even on Lightning / Rapid stacks. */
export function resolveUserSamplerDenoiseOverride(
  overrides?: ModelSamplerOverrideFields | null
): string | undefined {
  const denoise = pickModelSamplerOverrideFields(overrides).denoise;
  if (denoise == null) {
    return undefined;
  }
  const trimmed = denoise.toString().trim();
  return trimmed === '' ? undefined : trimmed;
}

export function formatModelSamplerHint(
  model: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): string {
  const defaults = getModelSamplerDefaults(model, tier);
  const presetLabel =
    MODEL_SAMPLER_PRESET_OPTIONS.find(option => option.id === tier)?.label ?? tier;
  const seedLabel = defaults.fixedSeed != null ? `seed ${defaults.fixedSeed}` : 'random seed';
  return `${presetLabel} · ${defaults.samplerName} · ${defaults.scheduler} · steps ${defaults.steps} · cfg ${defaults.cfg} · ${seedLabel}`;
}

export function formatTurboEditSamplerHint(model: ComfyImageModel | string): string | null {
  const id = String(model ?? '').trim();
  if (id === 'z-image-turbo') {
    return 'Z-Image Turbo img2img is 8-step CFG 1 — high denoise jumps identity. Use Gentle / Balanced / Strong on Refine, Image → Prompt, or Compose (default Balanced ≈ 0.36). Sidebar denoise override still wins.';
  }
  if (id === 'boogu-image-edit-turbo') {
    return 'Boogu Edit Turbo stays at denoise 1. Write a short instruction and use Gentle / Balanced / Strong — long scene essays rewrite the whole frame on 4 steps.';
  }
  if (isKleinDistilledModel(id)) {
    return 'Klein Distilled edits stay at denoise 1 (ReferenceLatent, 4-step CFG 1). Use Gentle / Balanced / Strong on Refine, Image → Prompt, or Compose — long scene essays and T2I anatomy suffixes rewrite the frame.';
  }
  return null;
}

export function formatKleinSamplerPeopleHint(
  model: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): string | null {
  if (isKleinDistilledModel(model)) {
    if (tier === 'base') {
      return 'Base is fastest but can distort people, hands, and complex poses. Use Optimized for figures; keep poses simple — Distilled still invents limbs often. Switch to Klein Base or UltraReal for hard anatomy.';
    }
    return 'Distilled stays CFG-1 / 4-step — prefer simple single-subject poses; Anatomy Guard Strict helps but cannot fix every mutant. Persistent extra limbs → Klein 9B Base or UltraReal.';
  }

  if (isKleinBaseModel(model)) {
    if (tier === 'base') {
      return 'Use a Base workflow/checkpoint — distilled step counts (4 steps, CFG ~1) will warp Base output.';
    }
    return null;
  }

  return null;
}

/** WAN Lightning uses short CFG-1 artifact cues; full WAN uses higher step counts. */
export function formatWanVideoSamplerHint(
  model: ComfyImageModel | string,
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): string | null {
  if (isWanLightningModel(model)) {
    return 'Lightning is optimized for 4-step / CFG 1: short temporal negatives, simple single-subject motion. Keep prompts uncluttered — switch to WAN Video for busy multi-person shots.';
  }

  if (isWanRapidAioModel(model)) {
    if (tier === 'base') {
      return 'Phr00t Rapid AIO is CFG-1 distilled — switch to Optimized (6 steps) for better motion coherence; Max raises steps further.';
    }
    return 'Rapid AIO stays CFG 1 (accelerators baked in). Prefer simple single-subject motion; use full WAN Video for busy multi-person shots.';
  }

  const def = getComfyModelDefinition(model);
  if (def?.category === 'video' && /wan/i.test(String(model))) {
    if (tier === 'base') {
      return 'For people or busy motion, switch to Optimized (more steps) — Base can invent limbs or props across frames.';
    }
    return null;
  }

  return null;
}

/** @deprecated Use formatKleinSamplerPeopleHint */
export function formatKleinDistilledPeopleHint(
  tier: ModelSamplerPresetTier = DEFAULT_MODEL_SAMPLER_PRESET_TIER
): string | null {
  return formatKleinSamplerPeopleHint('flux-2-klein-9b-distilled', tier);
}
