/**
 * Z-Image and BooguImage (Nunchaku) model-family workflow scaffolds,
 * extracted from workflow-scaffold.ts to keep that file from growing
 * without bound.
 */
import {
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
  type WorkflowPlaceholderTokens,
} from './comfyui-config';
import { DEFAULT_UNET_TOKEN } from './model-checkpoint-map';

export function zImageScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: 'default' },
      _meta: { title: 'Load Z-Image UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_3_4b.safetensors',
        type: 'lumina2',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: 'ae.safetensors' },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '6': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '7': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: tokens.shift },
      _meta: { title: 'ModelSamplingAuraFlow' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['7', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['6', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

/** Z-Image Refine / Compose / Image→Prompt: Figure 1 img2img via VAEEncode. */
export function zImageImg2imgScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  const inputToken = tokens.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN;

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: 'default' },
      _meta: { title: 'Load Z-Image UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_3_4b.safetensors',
        type: 'lumina2',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: 'ae.safetensors' },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '7': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: tokens.shift },
      _meta: { title: 'ModelSamplingAuraFlow' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: inputToken },
      _meta: { title: 'Input Image' },
    },
    '901': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['900', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Encode input' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['7', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['901', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

function booguLoaderFilenames(): {
  unetToken: string;
  clipName: string;
  vaeName: string;
} {
  return {
    unetToken: DEFAULT_UNET_TOKEN,
    clipName: 'qwen3vl_8b_fp8_scaled.safetensors',
    vaeName: 'flux1_vae_bf16.safetensors',
  };
}

export function booguImageScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  const loaders = booguLoaderFilenames();
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load Boogu UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'boogu',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '6': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '7': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: tokens.shift },
      _meta: { title: 'ModelSamplingAuraFlow' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['7', 0],
        positive: ['4', 0],
        negative: ['5', 0],
        latent_image: ['6', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function booguImageTurboScaffold(
  tokens: WorkflowPlaceholderTokens
): Record<string, unknown> {
  const loaders = booguLoaderFilenames();
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load Boogu Turbo UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'boogu',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '6': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['4', 0],
        negative: ['12', 0],
        latent_image: ['6', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '12': {
      class_type: 'ConditioningZeroOut',
      inputs: { conditioning: ['4', 0] },
      _meta: { title: 'Boogu Turbo — zero negative' },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function booguEditScaffold(
  tokens: WorkflowPlaceholderTokens,
  options?: { compose?: boolean; turbo?: boolean }
): Record<string, unknown> {
  const loaders = booguLoaderFilenames();
  const turbo = options?.turbo === true;
  const compose = options?.compose === true;
  const figureTokens = [
    tokens.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    DEFAULT_INPUT_IMAGE_2_TOKEN,
    DEFAULT_INPUT_IMAGE_3_TOKEN,
    DEFAULT_INPUT_IMAGE_4_TOKEN,
  ];

  const encodeInputs: Record<string, unknown> = {
    prompt: tokens.positive,
    negative_prompt: turbo ? '' : tokens.negative,
    clip: ['2', 0],
    vae: ['3', 0],
    // Soft-wire Figure 1 so exported scaffolds are runnable without queue prep.
    'images.image_1': ['900', 0],
  };
  if (compose) {
    encodeInputs['images.image_2'] = ['901', 0];
    encodeInputs['images.image_3'] = ['902', 0];
    encodeInputs['images.image_4'] = ['903', 0];
  }

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: turbo ? 'Load Boogu Edit Turbo UNET' : 'Load Boogu UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'boogu',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'TextEncodeBooguEdit',
      inputs: encodeInputs,
      _meta: { title: 'Boogu Edit Encode' },
    },
    '6': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    ...(turbo
      ? {}
      : {
          '7': {
            class_type: 'ModelSamplingAuraFlow',
            inputs: { model: ['1', 0], shift: tokens.shift },
            _meta: { title: 'ModelSamplingAuraFlow' },
          },
        }),
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: turbo ? ['1', 0] : ['7', 0],
        positive: ['4', 0],
        negative: ['4', 1],
        latent_image: ['6', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: { samples: ['8', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: figureTokens[0] },
      _meta: { title: 'Figure 1' },
    },
    ...(compose
      ? {
          '901': {
            class_type: 'LoadImage',
            inputs: { image: figureTokens[1] },
            _meta: { title: 'Figure 2' },
          },
          '902': {
            class_type: 'LoadImage',
            inputs: { image: figureTokens[2] },
            _meta: { title: 'Figure 3' },
          },
          '903': {
            class_type: 'LoadImage',
            inputs: { image: figureTokens[3] },
            _meta: { title: 'Figure 4' },
          },
        }
      : {}),
  };
}
