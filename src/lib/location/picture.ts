/**
 * "Make its picture" (M8 T3): a location's picture rendered from its words — the empty place, no
 * people — on Qwen-Image 2.1 Turbo, as a finished graph (the queue sends it as it is). Kept, it is
 * the location's photo, which shots set there send as their room (cast/places.ts).
 *
 * Live (2026-10-28, Turbo, 1472×1104): the Harbour café and Rocky cove beach locations each came
 * out as described and empty, first seed. Pure.
 */
import {
  QWEN_IMAGE_21_FILES,
  QWEN_IMAGE_21_TURBO_SIGMAS,
  QWEN_IMAGE_21_TURBO_UNET,
} from '../engine/qwen-image-21-renderer';
import type { LocationRecord } from './records';

/** The model the Gallery files the render under. */
export const LOCATION_PICTURE_MODEL = 'qwen-image-2.1-edit-turbo-8';
export const LOCATION_PICTURE_NEGATIVE = 'people, person, woman, man, crowd, figure';

export function locationPicturePrompt(location: Pick<LocationRecord, 'name' | 'look' | 'setting'>) {
  const where = location.setting === 'EXT' ? 'outdoors' : 'indoors';
  const look = location.look.trim().replace(/[.\s]+$/, '');
  return `A wide photograph of ${location.name}, ${where}${look ? `: ${look}` : ''}. Empty — no people anywhere. Eye-level, natural light, sharp, realistic.`;
}

/** The finished graph: Qwen-Image 2.1 Turbo, text only, a landscape frame. */
export function locationPictureGraph(
  location: Pick<LocationRecord, 'name' | 'look' | 'setting'>,
  seed: number
): Record<string, { class_type: string; inputs: Record<string, unknown> }> {
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: QWEN_IMAGE_21_TURBO_UNET, weight_dtype: 'default' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: QWEN_IMAGE_21_FILES.clip, type: 'qwen_image', device: 'default' },
    },
    '3': { class_type: 'VAELoader', inputs: { vae_name: QWEN_IMAGE_21_FILES.vae } },
    '4': {
      class_type: 'QwenImage21Cache',
      inputs: { model: ['1', 0], device: 'auto', dtype: 'default' },
    },
    '5': {
      class_type: 'TextEncodeQwenImage21',
      inputs: {
        clip: ['2', 0],
        vae: ['3', 0],
        prompt: locationPicturePrompt(location),
        negative_prompt: LOCATION_PICTURE_NEGATIVE,
        resolution: 1280,
      },
    },
    '6': { class_type: 'EmptyLatentImage', inputs: { width: 1472, height: 1104, batch_size: 1 } },
    '7': { class_type: 'RandomNoise', inputs: { noise_seed: Math.floor(Math.abs(seed)) } },
    '8': { class_type: 'BasicGuider', inputs: { model: ['4', 0], conditioning: ['5', 0] } },
    '9': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'er_sde' } },
    '10': {
      class_type: 'ManualSigmas',
      inputs: { sigmas: QWEN_IMAGE_21_TURBO_SIGMAS.map(value => value.toFixed(6)).join(', ') },
    },
    '11': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['7', 0],
        guider: ['8', 0],
        sampler: ['9', 0],
        sigmas: ['10', 0],
        latent_image: ['6', 0],
      },
    },
    '12': { class_type: 'VAEDecode', inputs: { samples: ['11', 0], vae: ['3', 0] } },
    '13': {
      class_type: 'SaveImage',
      inputs: { images: ['12', 0], filename_prefix: 'Castcut/location' },
    },
  };
}
