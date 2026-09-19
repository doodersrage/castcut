import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from './comfy-models/client';
import type { WorkflowParamValues } from './comfyui-config';
import { snapLatentSize } from './browser-image-dimensions';
import { isQwenLightningModel } from './model-sampling-patch';

export type ResolutionOrientation =
  | 'portrait'
  | 'landscape'
  | 'square'
  | 'portrait-34'
  | 'landscape-43'
  | 'portrait-23'
  | 'landscape-32';
export type ResolutionSizeTier = 'small' | 'medium' | 'max';

export const DEFAULT_RESOLUTION_ORIENTATION: ResolutionOrientation = 'square';
export const DEFAULT_RESOLUTION_SIZE_TIER: ResolutionSizeTier = 'medium';

export const RESOLUTION_ORIENTATION_OPTIONS: {
  id: ResolutionOrientation;
  label: string;
  description: string;
}[] = [
  {
    id: 'square',
    label: '1:1',
    description: 'Official Qwen 1328² / balanced framing.',
  },
  {
    id: 'portrait',
    label: '9:16',
    description: 'Tall poster framing (928×1664 on Qwen).',
  },
  {
    id: 'landscape',
    label: '16:9',
    description: 'Wide cinematic framing (1664×928 on Qwen).',
  },
  {
    id: 'portrait-34',
    label: '3:4',
    description: 'Classic portrait (1104×1472 on Qwen).',
  },
  {
    id: 'landscape-43',
    label: '4:3',
    description: 'Classic landscape (1472×1104 on Qwen).',
  },
  {
    id: 'portrait-23',
    label: '2:3',
    description: 'Photo portrait (1056×1584 on Qwen).',
  },
  {
    id: 'landscape-32',
    label: '3:2',
    description: 'Photo landscape (1584×1056 on Qwen).',
  },
];

/** Core chips always shown; extra official Qwen ARs shown for Qwen models. */
export const RESOLUTION_ORIENTATION_CORE: ResolutionOrientation[] = [
  'square',
  'portrait',
  'landscape',
];

export const RESOLUTION_ORIENTATION_QWEN_EXTRA: ResolutionOrientation[] = [
  'portrait-34',
  'landscape-43',
  'portrait-23',
  'landscape-32',
];

/**
 * Safer Lightning ARs — skip extreme 9:16 / 16:9 (soft/mosaic even with correct LoRA).
 * Includes classic photo ratios (3:4, 4:3, 2:3, 3:2) plus native square.
 */
export const RESOLUTION_ORIENTATION_LIGHTNING_SAFE: ResolutionOrientation[] = [
  'square',
  'portrait-34',
  'landscape-43',
  'portrait-23',
  'landscape-32',
];

/** Classic photo ARs offered alongside 1:1 / 9:16 / 16:9 for still-image models. */
export const RESOLUTION_ORIENTATION_CLASSIC_EXTRA = RESOLUTION_ORIENTATION_QWEN_EXTRA;

export function resolutionOrientationsForModel(
  model: ComfyImageModel | string
): ResolutionOrientation[] {
  // Rapid AIO SFW/NSFW is most stable at square — keep that as the only T2I option.
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(String(model))) {
    return ['square'];
  }

  // Distilled Lightning: square + classic photo ARs (no extreme 9:16 / 16:9).
  if (isQwenLightningModel(model)) {
    return [...RESOLUTION_ORIENTATION_LIGHTNING_SAFE];
  }

  const category = COMFY_MODEL_IDS.has(model)
    ? getComfyModelDefinition(model).category
    : 'other-dit';
  // Video / audio / mesh keep the compact three-chip set.
  if (category === 'video' || category === 'audio' || category === 'mesh') {
    return RESOLUTION_ORIENTATION_CORE;
  }
  // Still-image families: core + classic photo ratios (Qwen also keeps 9:16 / 16:9).
  return [...RESOLUTION_ORIENTATION_CORE, ...RESOLUTION_ORIENTATION_CLASSIC_EXTRA];
}

/** Size tiers offered in the sidebar for a model (matches what queue will use). */
export function resolutionSizeTiersForModel(model: ComfyImageModel | string): ResolutionSizeTier[] {
  // Rapid AIO caps Max→medium at queue time; square medium===max (1328) anyway.
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(String(model))) {
    return ['small', 'medium'];
  }
  return ['small', 'medium', 'max'];
}

export const RESOLUTION_SIZE_TIER_OPTIONS: {
  id: ResolutionSizeTier;
  label: string;
  description: string;
}[] = [
  {
    id: 'small',
    label: 'Small',
    description: 'Fast drafts and lower VRAM.',
  },
  {
    id: 'medium',
    label: 'Medium',
    description: 'Native/optimal size — best detail without artifacts.',
  },
  {
    id: 'max',
    label: 'Max',
    description: 'Largest safe size for this model (more VRAM).',
  },
];

export type ModelResolutionPreset = {
  width: number;
  height: number;
};

type OrientationPresets = Record<ResolutionSizeTier, ModelResolutionPreset>;
type CategoryResolutionPresets = {
  square: OrientationPresets;
  portrait: OrientationPresets;
  landscape: OrientationPresets;
} & Partial<
  Record<'portrait-34' | 'landscape-43' | 'portrait-23' | 'landscape-32', OrientationPresets>
>;

/** Official Qwen-Image-2512 aspect sizes (ComfyUI native template). */
const QWEN_OFFICIAL_ARS = {
  square: {
    small: { width: 1024, height: 1024 },
    medium: { width: 1328, height: 1328 },
    max: { width: 1328, height: 1328 },
  },
  portrait: {
    small: { width: 768, height: 1344 },
    medium: { width: 928, height: 1664 },
    max: { width: 928, height: 1664 },
  },
  landscape: {
    small: { width: 1344, height: 768 },
    medium: { width: 1664, height: 928 },
    max: { width: 1664, height: 928 },
  },
  'portrait-34': {
    small: { width: 896, height: 1152 },
    medium: { width: 1104, height: 1472 },
    max: { width: 1104, height: 1472 },
  },
  'landscape-43': {
    small: { width: 1152, height: 896 },
    medium: { width: 1472, height: 1104 },
    max: { width: 1472, height: 1104 },
  },
  'portrait-23': {
    small: { width: 832, height: 1216 },
    medium: { width: 1056, height: 1584 },
    max: { width: 1056, height: 1584 },
  },
  'landscape-32': {
    small: { width: 1216, height: 832 },
    medium: { width: 1584, height: 1056 },
    max: { width: 1584, height: 1056 },
  },
} as const satisfies CategoryResolutionPresets;

/**
 * Distilled Lightning is much less stable on extreme 9:16 / 16:9 latents
 * (928×1664). Prefer native 1328² + classic photo ARs (3:4 / 4:3 / 2:3 / 3:2).
 * Soft/mosaic artifacts otherwise show up even with the correct Lightning LoRA.
 */
const QWEN_LIGHTNING_ARS = {
  square: QWEN_OFFICIAL_ARS.square,
  // Legacy portrait/landscape chips map to safe 3:4 / 4:3 (not extreme 9:16).
  portrait: QWEN_OFFICIAL_ARS['portrait-34'],
  landscape: QWEN_OFFICIAL_ARS['landscape-43'],
  'portrait-34': QWEN_OFFICIAL_ARS['portrait-34'],
  'landscape-43': QWEN_OFFICIAL_ARS['landscape-43'],
  'portrait-23': QWEN_OFFICIAL_ARS['portrait-23'],
  'landscape-32': QWEN_OFFICIAL_ARS['landscape-32'],
} as const satisfies CategoryResolutionPresets;

/** Classic photo ARs for SDXL-class native ~1024 canvases (8× friendly). */
const SDXL_CLASSIC_EXTRA_ARS = {
  'portrait-34': {
    small: { width: 768, height: 1024 },
    medium: { width: 896, height: 1152 },
    max: { width: 896, height: 1152 },
  },
  'landscape-43': {
    small: { width: 1024, height: 768 },
    medium: { width: 1152, height: 896 },
    max: { width: 1152, height: 896 },
  },
  'portrait-23': {
    small: { width: 768, height: 1152 },
    medium: { width: 832, height: 1216 },
    max: { width: 896, height: 1344 },
  },
  'landscape-32': {
    small: { width: 1152, height: 768 },
    medium: { width: 1216, height: 832 },
    max: { width: 1344, height: 896 },
  },
} as const;

/** Classic photo ARs for SD1.5-class ~512 canvases. */
const SD15_CLASSIC_EXTRA_ARS = {
  'portrait-34': {
    small: { width: 448, height: 576 },
    medium: { width: 512, height: 704 },
    max: { width: 576, height: 768 },
  },
  'landscape-43': {
    small: { width: 576, height: 448 },
    medium: { width: 704, height: 512 },
    max: { width: 768, height: 576 },
  },
  'portrait-23': {
    small: { width: 448, height: 640 },
    medium: { width: 512, height: 768 },
    max: { width: 576, height: 832 },
  },
  'landscape-32': {
    small: { width: 640, height: 448 },
    medium: { width: 768, height: 512 },
    max: { width: 832, height: 576 },
  },
} as const;

const CATEGORY_RESOLUTION_PRESETS: Record<ComfyModelCategory, CategoryResolutionPresets> = {
  'stable-diffusion': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 512, height: 512 },
      max: { width: 640, height: 640 },
    },
    portrait: {
      small: { width: 448, height: 576 },
      medium: { width: 512, height: 704 },
      max: { width: 576, height: 768 },
    },
    landscape: {
      small: { width: 576, height: 448 },
      medium: { width: 704, height: 512 },
      max: { width: 768, height: 576 },
    },
    ...SD15_CLASSIC_EXTRA_ARS,
  },
  sdxl: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 832, height: 1216 },
      max: { width: 896, height: 1344 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1216, height: 832 },
      max: { width: 1344, height: 896 },
    },
    ...SDXL_CLASSIC_EXTRA_ARS,
  },
  sd3: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
    ...SDXL_CLASSIC_EXTRA_ARS,
  },
  flux: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1280, height: 1280 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1536 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1536, height: 1024 },
    },
    ...SDXL_CLASSIC_EXTRA_ARS,
  },
  qwen: QWEN_OFFICIAL_ARS,
  hunyuan: {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1280, height: 1280 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
    ...SDXL_CLASSIC_EXTRA_ARS,
  },
  'other-dit': {
    square: {
      small: { width: 768, height: 768 },
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      small: { width: 768, height: 1024 },
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      small: { width: 1024, height: 768 },
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
    ...SDXL_CLASSIC_EXTRA_ARS,
  },
  'instruct-edit': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      small: { width: 512, height: 704 },
      medium: { width: 768, height: 1024 },
      max: { width: 832, height: 1152 },
    },
    landscape: {
      small: { width: 704, height: 512 },
      medium: { width: 1024, height: 768 },
      max: { width: 1152, height: 832 },
    },
    ...SDXL_CLASSIC_EXTRA_ARS,
  },
  video: {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      small: { width: 512, height: 768 },
      medium: { width: 768, height: 1024 },
      max: { width: 832, height: 1152 },
    },
    landscape: {
      small: { width: 768, height: 512 },
      medium: { width: 1024, height: 768 },
      max: { width: 1152, height: 832 },
    },
  },
  // Placeholder pixel sizes for queue UI explain; audio/mesh use seconds/resolution tokens instead.
  audio: {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      small: { width: 512, height: 768 },
      medium: { width: 768, height: 1024 },
      max: { width: 832, height: 1152 },
    },
    landscape: {
      small: { width: 768, height: 512 },
      medium: { width: 1024, height: 768 },
      max: { width: 1152, height: 832 },
    },
  },
  mesh: {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      small: { width: 512, height: 768 },
      medium: { width: 768, height: 1024 },
      max: { width: 832, height: 1152 },
    },
    landscape: {
      small: { width: 768, height: 512 },
      medium: { width: 1024, height: 768 },
      max: { width: 1152, height: 832 },
    },
  },
};

type ModelResolutionPresetMap = Partial<
  Record<
    ComfyImageModel,
    Partial<
      Record<ResolutionOrientation, Partial<Record<ResolutionSizeTier, ModelResolutionPreset>>>
    >
  >
>;

const MODEL_RESOLUTION_PRESETS: ModelResolutionPresetMap = {
  'flux-schnell': {
    square: {
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      max: { width: 896, height: 1152 },
    },
    landscape: {
      max: { width: 1152, height: 896 },
    },
  },
  'boogu-image-turbo': {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1024, height: 1024 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 896, height: 1152 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1152, height: 896 },
    },
  },
  'flux-2-klein': {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  'flux-2-klein-4b-distilled': {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1152, height: 1152 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1152, height: 1536 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1536, height: 1152 },
    },
  },
  'flux-2-klein-9b': {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1280, height: 1280 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  'flux-2-klein-9b-distilled': {
    square: {
      medium: { width: 1024, height: 1024 },
      max: { width: 1280, height: 1280 },
    },
    portrait: {
      medium: { width: 896, height: 1152 },
      max: { width: 1024, height: 1280 },
    },
    landscape: {
      medium: { width: 1152, height: 896 },
      max: { width: 1280, height: 1024 },
    },
  },
  // UltraReal: bump native canvas so people detail comes from sampling, not soft VAE mush.
  'flux-ultrareal-v4': {
    square: {
      small: { width: 896, height: 896 },
      medium: { width: 1152, height: 1152 },
      max: { width: 1408, height: 1408 },
    },
    portrait: {
      small: { width: 832, height: 1088 },
      medium: { width: 1024, height: 1280 },
      max: { width: 1152, height: 1536 },
    },
    landscape: {
      small: { width: 1088, height: 832 },
      medium: { width: 1280, height: 1024 },
      max: { width: 1536, height: 1152 },
    },
    'portrait-34': {
      small: { width: 832, height: 1088 },
      medium: { width: 960, height: 1280 },
      max: { width: 1088, height: 1472 },
    },
    'landscape-43': {
      small: { width: 1088, height: 832 },
      medium: { width: 1280, height: 960 },
      max: { width: 1472, height: 1088 },
    },
    'portrait-23': {
      small: { width: 768, height: 1152 },
      medium: { width: 896, height: 1344 },
      max: { width: 1024, height: 1536 },
    },
    'landscape-32': {
      small: { width: 1152, height: 768 },
      medium: { width: 1344, height: 896 },
      max: { width: 1536, height: 1024 },
    },
  },
  'qwen-image-2512': QWEN_OFFICIAL_ARS,
  'qwen-image-2512-lightning-4': QWEN_LIGHTNING_ARS,
  'qwen-image-2512-lightning-8': QWEN_LIGHTNING_ARS,
  'qwen-image-edit-2511-lightning-4': QWEN_LIGHTNING_ARS,
  'qwen-image-edit-2511-lightning-8': QWEN_LIGHTNING_ARS,
  'qwen-rapid-aio-edit': QWEN_OFFICIAL_ARS,
  'qwen-rapid-aio-edit-nsfw': {
    square: QWEN_OFFICIAL_ARS.square,
  },
  'qwen-rapid-aio-sfw': {
    square: QWEN_OFFICIAL_ARS.square,
  },
  'qwen-rapid-aio-nsfw': {
    square: QWEN_OFFICIAL_ARS.square,
  },
  'qwen-image-2.0': {
    square: QWEN_OFFICIAL_ARS.square,
  },
  'sd15-instruct-pix2pix': {
    square: {
      max: { width: 512, height: 512 },
    },
  },
  'sdxl-instruct-pix2pix': {
    square: {
      max: { width: 1024, height: 1024 },
    },
  },
  'wan-video': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 640, height: 640 },
      max: { width: 768, height: 768 },
    },
    landscape: {
      small: { width: 640, height: 368 },
      medium: { width: 832, height: 480 },
      max: { width: 1024, height: 576 },
    },
    portrait: {
      small: { width: 368, height: 640 },
      medium: { width: 480, height: 832 },
      max: { width: 576, height: 1024 },
    },
  },
  'wan-video-rapid-aio': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 640, height: 640 },
      max: { width: 768, height: 768 },
    },
    landscape: {
      small: { width: 640, height: 368 },
      medium: { width: 832, height: 480 },
      max: { width: 1024, height: 576 },
    },
    portrait: {
      small: { width: 368, height: 640 },
      medium: { width: 480, height: 832 },
      max: { width: 576, height: 1024 },
    },
  },
  'wan-video-lightning-4': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 640, height: 640 },
      max: { width: 768, height: 768 },
    },
    landscape: {
      small: { width: 640, height: 368 },
      medium: { width: 832, height: 480 },
      max: { width: 1024, height: 576 },
    },
    portrait: {
      small: { width: 368, height: 640 },
      medium: { width: 480, height: 832 },
      max: { width: 576, height: 1024 },
    },
  },
  'hunyuan-video': {
    square: {
      small: { width: 544, height: 544 },
      medium: { width: 720, height: 720 },
      max: { width: 960, height: 960 },
    },
    landscape: {
      small: { width: 768, height: 432 },
      medium: { width: 1280, height: 720 },
      max: { width: 1280, height: 720 },
    },
    portrait: {
      small: { width: 432, height: 768 },
      medium: { width: 720, height: 1280 },
      max: { width: 720, height: 1280 },
    },
  },
  'hunyuan-video-1.5': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 720, height: 720 },
      max: { width: 848, height: 848 },
    },
    landscape: {
      small: { width: 768, height: 432 },
      medium: { width: 848, height: 480 },
      max: { width: 1280, height: 720 },
    },
    portrait: {
      small: { width: 432, height: 768 },
      medium: { width: 480, height: 848 },
      max: { width: 720, height: 1280 },
    },
  },
  'ltx-video': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 768, height: 768 },
    },
    landscape: {
      small: { width: 768, height: 512 },
      medium: { width: 768, height: 512 },
      max: { width: 1280, height: 720 },
    },
    portrait: {
      small: { width: 512, height: 768 },
      medium: { width: 512, height: 768 },
      max: { width: 720, height: 1280 },
    },
  },
  'ltx-video-2': {
    square: {
      small: { width: 512, height: 512 },
      medium: { width: 768, height: 768 },
      max: { width: 1024, height: 1024 },
    },
    landscape: {
      small: { width: 768, height: 512 },
      medium: { width: 1280, height: 720 },
      max: { width: 1920, height: 1080 },
    },
    portrait: {
      small: { width: 512, height: 768 },
      medium: { width: 720, height: 1280 },
      max: { width: 1080, height: 1920 },
    },
  },
};

export function normalizeResolutionOrientation(value: unknown): ResolutionOrientation {
  if (
    value === 'portrait' ||
    value === 'landscape' ||
    value === 'square' ||
    value === 'portrait-34' ||
    value === 'landscape-43' ||
    value === 'portrait-23' ||
    value === 'landscape-32'
  ) {
    return value;
  }
  return DEFAULT_RESOLUTION_ORIENTATION;
}

function fallbackResolutionOrientation(
  orientation: ResolutionOrientation
): 'square' | 'portrait' | 'landscape' {
  if (orientation === 'portrait-34' || orientation === 'portrait-23') {
    return 'portrait';
  }
  if (orientation === 'landscape-43' || orientation === 'landscape-32') {
    return 'landscape';
  }
  if (orientation === 'portrait' || orientation === 'landscape' || orientation === 'square') {
    return orientation;
  }
  return 'square';
}

export function normalizeResolutionSizeTier(value: unknown): ResolutionSizeTier {
  if (value === 'small' || value === 'medium' || value === 'max') {
    return value;
  }
  return DEFAULT_RESOLUTION_SIZE_TIER;
}

/**
 * Map a still's width×height onto this model's orientation/tier chips.
 * Exact preset match wins; otherwise nearest among the model's offered ARs × tiers.
 */
export function inferResolutionOrientationAndTier(
  model: ComfyImageModel | string,
  width: number,
  height: number
): { orientation: ResolutionOrientation; sizeTier: ResolutionSizeTier } | undefined {
  const w = Math.round(Number(width));
  const h = Math.round(Number(height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return undefined;
  }

  const orientations = resolutionOrientationsForModel(model);
  const tiers = resolutionSizeTiersForModel(model);
  const stillAspect = w / h;
  const stillArea = w * h;
  let best:
    { orientation: ResolutionOrientation; sizeTier: ResolutionSizeTier; score: number } | undefined;

  for (const orientation of orientations) {
    for (const sizeTier of tiers) {
      const preset = getModelResolutionPreset(model, orientation, sizeTier);
      if (preset.width === w && preset.height === h) {
        return { orientation, sizeTier };
      }
      const aspectDiff = Math.abs(preset.width / preset.height - stillAspect);
      const presetArea = preset.width * preset.height;
      const areaDiff = Math.abs(presetArea - stillArea) / Math.max(presetArea, stillArea);
      const score = aspectDiff * 2 + areaDiff;
      if (!best || score < best.score) {
        best = { orientation, sizeTier, score };
      }
    }
  }

  return best ? { orientation: best.orientation, sizeTier: best.sizeTier } : undefined;
}

export function getModelResolutionPreset(
  model: ComfyImageModel | string = DEFAULT_COMFY_MODEL,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER
): ModelResolutionPreset {
  const normalized = COMFY_MODEL_IDS.has(model) ? model : DEFAULT_COMFY_MODEL;
  const normalizedOrientation = normalizeResolutionOrientation(orientation);
  const normalizedTier = normalizeResolutionSizeTier(tier);
  const fallbackOrientation = fallbackResolutionOrientation(normalizedOrientation);

  const modelPresets = MODEL_RESOLUTION_PRESETS[normalized as ComfyImageModel];
  const modelOverride =
    modelPresets?.[normalizedOrientation]?.[normalizedTier] ??
    modelPresets?.[fallbackOrientation]?.[normalizedTier];
  if (modelOverride) {
    return modelOverride;
  }

  const definition = getComfyModelDefinition(normalized);
  const categoryPresets =
    CATEGORY_RESOLUTION_PRESETS[definition.category] ?? CATEGORY_RESOLUTION_PRESETS['other-dit'];
  return (
    categoryPresets[normalizedOrientation]?.[normalizedTier] ??
    categoryPresets[fallbackOrientation][normalizedTier]
  );
}

export function modelResolutionPresetToParams(preset: ModelResolutionPreset): WorkflowParamValues {
  return {
    width: preset.width,
    height: preset.height,
  };
}

export function resolveModelResolutionParams(
  model?: ComfyImageModel | string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER
): WorkflowParamValues {
  if (!model) {
    return {};
  }
  return modelResolutionPresetToParams(getModelResolutionPreset(model, orientation, tier));
}

/** Official Qwen medium sizes for param experiments (width+height pairs). */
export function qwenOfficialMediumSizeLadder(): Array<{ width: number; height: number }> {
  return [
    QWEN_OFFICIAL_ARS.square.medium,
    QWEN_OFFICIAL_ARS.portrait.medium,
    QWEN_OFFICIAL_ARS.landscape.medium,
    QWEN_OFFICIAL_ARS['portrait-34'].medium,
    QWEN_OFFICIAL_ARS['landscape-43'].medium,
    QWEN_OFFICIAL_ARS['portrait-23'].medium,
    QWEN_OFFICIAL_ARS['landscape-32'].medium,
  ];
}

/** Lightning-safe medium sizes (no extreme 9:16 / 16:9 official portrait/landscape). */
export function qwenLightningMediumSizeLadder(): Array<{ width: number; height: number }> {
  return [
    QWEN_LIGHTNING_ARS.square.medium,
    QWEN_LIGHTNING_ARS.portrait.medium,
    QWEN_LIGHTNING_ARS.landscape.medium,
    QWEN_LIGHTNING_ARS['portrait-34'].medium,
    QWEN_LIGHTNING_ARS['landscape-43'].medium,
    QWEN_LIGHTNING_ARS['portrait-23'].medium,
    QWEN_LIGHTNING_ARS['landscape-32'].medium,
  ];
}

/**
 * CFG-1 Compose/Refine (Lightning + Klein Distilled): snap figure pixels to the
 * model's native preset ladder instead of a 16-multiple of the upload. Raw
 * selfie sizes (682×1024) make Distilled recompose people into the canvas;
 * native 896×1152 + center-crop fills the frame.
 */
function isKleinDistilledComposeModel(model: string): boolean {
  return model === 'flux-2-klein-4b-distilled' || model === 'flux-2-klein-9b-distilled';
}

function usesCfg1NativeComposeLadder(model: string): boolean {
  return isQwenLightningModel(model) || isKleinDistilledComposeModel(model);
}

/** Compose / Refine / inpaint tools that should match EmptyLatent to figure pixels. */
export function toolUsesComposeFigureLatent(tool?: string): boolean {
  return tool === 'compose' || tool === 'refine' || tool === 'inpaint' || tool === 'outpaint';
}

/** AR chips used when snapping Compose figures to a tier ladder. */
const COMPOSE_LATENT_ORIENTATIONS: ResolutionOrientation[] = [
  'square',
  'portrait',
  'landscape',
  'portrait-34',
  'landscape-43',
  'portrait-23',
  'landscape-32',
];

/** Max |log aspect delta| to treat sidebar orientation chip as matching the figure. */
const COMPOSE_SIDEBAR_ASPECT_MATCH_LOG = 0.035;

function composeLatentSizeLadderForTier(
  model: string,
  tier: ResolutionSizeTier
): Array<{ width: number; height: number }> {
  return COMPOSE_LATENT_ORIENTATIONS.map(orientation =>
    getModelResolutionPreset(model, orientation, tier)
  );
}

export function lightningSafeComposeLatentSizeForTier(
  width: number,
  height: number,
  model: string,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER
): { width: number; height: number } {
  const fallback = getModelResolutionPreset(model, 'square', tier);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: fallback.width, height: fallback.height };
  }

  const candidates = composeLatentSizeLadderForTier(model, tier);
  const ratio = width / height;
  let best = candidates[0] ?? fallback;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateRatio = candidate.width / candidate.height;
    const score = Math.abs(Math.log(ratio / candidateRatio));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return { width: best.width, height: best.height };
}

/**
 * Compose/Refine output latent: prefer sidebar orientation+tier when aspect matches
 * the figure (full selected resolution). Otherwise snap figure AR to the nearest
 * preset on the same tier — refs are center-cropped, never stretched.
 */
export function resolveComposeOutputLatentSize(
  figureWidth: number,
  figureHeight: number,
  model: string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER
): { width: number; height: number } {
  const selected = getModelResolutionPreset(model, orientation, tier);
  if (
    !Number.isFinite(figureWidth) ||
    !Number.isFinite(figureHeight) ||
    figureWidth <= 0 ||
    figureHeight <= 0
  ) {
    return { width: selected.width, height: selected.height };
  }

  const figureRatio = figureWidth / figureHeight;
  const selectedRatio = selected.width / selected.height;
  if (Math.abs(Math.log(figureRatio / selectedRatio)) <= COMPOSE_SIDEBAR_ASPECT_MATCH_LOG) {
    return { width: selected.width, height: selected.height };
  }

  if (usesCfg1NativeComposeLadder(model)) {
    return lightningSafeComposeLatentSizeForTier(figureWidth, figureHeight, model, tier);
  }
  return snapLatentSize(figureWidth, figureHeight);
}

/** Map probed figure pixels to queue EmptyLatent W×H (native CFG-1 ladder or 16-multiple snap). */
export function resolveComposeFigureLatentSize(
  figureWidth: number,
  figureHeight: number,
  model: string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER
): { width: number; height: number } {
  return resolveComposeOutputLatentSize(figureWidth, figureHeight, model, orientation, tier);
}

export function lightningSafeComposeLatentSize(
  width: number,
  height: number,
  model: string = 'qwen-image-edit-2511-lightning-8'
): { width: number; height: number } {
  const fallback = getModelResolutionPreset(model, 'square', 'medium');
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: fallback.width, height: fallback.height };
  }

  const candidates = isQwenLightningModel(model)
    ? qwenLightningMediumSizeLadder()
    : qwenOfficialMediumSizeLadder();
  const ratio = width / height;
  let best = candidates[0] ?? fallback;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const candidateRatio = candidate.width / candidate.height;
    const score = Math.abs(Math.log(ratio / candidateRatio));
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return { width: best.width, height: best.height };
}

/**
 * Klein Distilled Compose/Refine: rewrite leftover selfie pixels (688×1024) onto
 * the native Klein ladder. Do not use the Qwen Lightning ladder — those sizes
 * are 1328²-class and fight EmptyFlux2Latent + ReferenceLatent.
 */
function ensureKleinDistilledNativeResolutionParams(
  params: WorkflowParamValues,
  model: string,
  orientation: ResolutionOrientation,
  tier: ResolutionSizeTier,
  options?: { preserveInputAspect?: boolean }
): WorkflowParamValues {
  const native = getModelResolutionPreset(model, orientation, tier);
  const width = Number(params.width);
  const height = Number(params.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...params, width: native.width, height: native.height };
  }

  if (options?.preserveInputAspect) {
    const safe = lightningSafeComposeLatentSizeForTier(width, height, model, tier);
    if (width === safe.width && height === safe.height) {
      return params;
    }
    return { ...params, width: safe.width, height: safe.height };
  }

  if (width === native.width && height === native.height) {
    return params;
  }
  return { ...params, width: native.width, height: native.height };
}

/** Bump undersized / extreme-AR Lightning queues to a stable native preset. */
export function ensureLightningNativeResolutionParams(
  params: WorkflowParamValues,
  model: string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER,
  options?: {
    /**
     * Compose/Refine/img2img — keep the reference image aspect. Forcing native
     * square (or rewriting AR) against a non-square figure causes garbled edits.
     * Always snaps to the nearest Lightning-safe ladder preset so CFG-1 does not mosaic.
     */
    preserveInputAspect?: boolean;
  }
): WorkflowParamValues {
  if (isKleinDistilledComposeModel(model)) {
    return ensureKleinDistilledNativeResolutionParams(params, model, orientation, tier, options);
  }
  if (!isQwenLightningModel(model)) {
    return params;
  }

  const native = getModelResolutionPreset(model, orientation, tier);
  const width = Number(params.width);
  const height = Number(params.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { ...params, width: native.width, height: native.height };
  }

  // Edit with a reference image: always snap to the nearest Lightning-safe
  // ladder size (same AR family). Soft-KEEP of near-native non-ladder sizes
  // (1024×1536, 1280², …) mosaics CFG-1 Edit Lightning Compose.
  if (options?.preserveInputAspect) {
    const safe = lightningSafeComposeLatentSize(width, height, model);
    if (width === safe.width && height === safe.height) {
      return params;
    }
    return { ...params, width: safe.width, height: safe.height };
  }

  if (tier === 'small') {
    return params;
  }

  // Pure T2I Lightning is most stable at native square — overwrite leftover
  // portrait/landscape dims when the caller already chose square orientation.
  if (orientation === 'square' && (width !== native.width || height !== native.height)) {
    return { ...params, width: native.width, height: native.height };
  }

  const currentPixels = width * height;
  const nativePixels = native.width * native.height;
  if (currentPixels < nativePixels * 0.85) {
    return { ...params, width: native.width, height: native.height };
  }

  // Rewrite ultra-tall/wide Lightning latents (e.g. leftover 928×1664) to the
  // Lightning-safe ~3:4 / 4:3 / square presets.
  const ratio = width / height;
  if (ratio < 0.62 || ratio > 1.62) {
    return { ...params, width: native.width, height: native.height };
  }

  return params;
}

export function formatModelResolutionHint(
  model: ComfyImageModel | string,
  orientation: ResolutionOrientation = DEFAULT_RESOLUTION_ORIENTATION,
  tier: ResolutionSizeTier = DEFAULT_RESOLUTION_SIZE_TIER
): string {
  const preset = getModelResolutionPreset(model, orientation, tier);
  const orientationLabel =
    RESOLUTION_ORIENTATION_OPTIONS.find(option => option.id === orientation)?.label ?? orientation;
  const tierLabel = RESOLUTION_SIZE_TIER_OPTIONS.find(option => option.id === tier)?.label ?? tier;
  return `${orientationLabel} · ${tierLabel} · ${preset.width}×${preset.height}`;
}
