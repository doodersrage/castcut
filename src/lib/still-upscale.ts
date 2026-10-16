/**
 * "Upscale": a finished still restored and enlarged for a poster, a print or a wallpaper —
 * SeedVR2 (the same one-step restore Sharpen & smooth uses on clips), colour matched to the
 * original. Client-safe: the size plan and the graph.
 */

import { CLIP_FINISH_MODELS } from './clip-finish';

export const STILL_UPSCALE_SAVE_NODE = '40';

/** Target long side by choice; a still already that big is returned as is. */
export const STILL_UPSCALE_TARGETS = { '2x': 0, '4k': 3840 } as const;
export type StillUpscaleTarget = keyof typeof STILL_UPSCALE_TARGETS;

/** Output size: 2× (capped at 4096 on the long side) or 3840 long side; even sides. */
export function stillUpscaleSize(
  width: number,
  height: number,
  target: StillUpscaleTarget
): { width: number; height: number } | null {
  const long = Math.max(width, height, 1);
  const goal = target === '4k' ? STILL_UPSCALE_TARGETS['4k'] : Math.min(4096, long * 2);
  if (goal <= long) return null;
  const scale = goal / long;
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export function buildStillUpscaleGraph(input: {
  image: string;
  width: number;
  height: number;
  seed: number;
  prefix: string;
}): Record<string, unknown> {
  const tiled = { tile_size: 512, overlap: 128, temporal_size: 64, temporal_overlap: 8 };
  return {
    '1': { class_type: 'LoadImage', inputs: { image: input.image } },
    '10': {
      class_type: 'UNETLoader',
      inputs: { unet_name: CLIP_FINISH_MODELS.seedvr, weight_dtype: 'default' },
    },
    '11': { class_type: 'VAELoader', inputs: { vae_name: CLIP_FINISH_MODELS.seedvrVae } },
    '12': {
      class_type: 'ResizeImageMaskNode',
      inputs: {
        input: ['1', 0],
        resize_type: 'scale dimensions',
        'resize_type.width': input.width,
        'resize_type.height': input.height,
        'resize_type.crop': 'disabled',
        scale_method: 'lanczos',
      },
    },
    '13': { class_type: 'SeedVR2Preprocess', inputs: { resized_images: ['12', 0] } },
    '14': {
      class_type: 'VAEEncodeTiled',
      inputs: { pixels: ['13', 0], vae: ['11', 0], ...tiled },
    },
    '16': {
      class_type: 'SeedVR2Conditioning',
      inputs: { model: ['10', 0], vae_conditioning: ['14', 0] },
    },
    '17': {
      class_type: 'KSampler',
      inputs: {
        model: ['10', 0],
        positive: ['16', 0],
        negative: ['16', 1],
        latent_image: ['14', 0],
        seed: input.seed,
        steps: 1,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    '19': {
      class_type: 'VAEDecodeTiled',
      inputs: { samples: ['17', 0], vae: ['11', 0], ...tiled },
    },
    '20': {
      class_type: 'SeedVR2PostProcessing',
      inputs: {
        images: ['19', 0],
        original_resized_images: ['12', 0],
        color_correction_method: 'lab',
      },
    },
    [STILL_UPSCALE_SAVE_NODE]: {
      class_type: 'SaveImage',
      inputs: { images: ['20', 0], filename_prefix: input.prefix },
    },
  };
}
