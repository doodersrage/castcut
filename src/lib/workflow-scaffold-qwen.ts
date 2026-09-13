/**
 * Qwen Image model-family workflow scaffolds: plain T2I (checkpoint and
 * UNET variants), Lightning-distilled, and the three Qwen Edit paths
 * (compose, lightning-edit, img2img). Extracted from workflow-scaffold.ts,
 * which re-exports these and imports back the ones it dispatches to
 * from buildWorkflowScaffoldForModel / editScaffold / videoScaffold.
 */

import {
  DEFAULT_INPUT_IMAGE_TOKEN,
  DEFAULT_INPUT_IMAGE_2_TOKEN,
  DEFAULT_INPUT_IMAGE_3_TOKEN,
  DEFAULT_INPUT_IMAGE_4_TOKEN,
  type WorkflowPlaceholderTokens,
} from './comfyui-config';
import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models';
import { isQwenLightningModel } from './model-sampling-patch';
import { DEFAULT_CHECKPOINT_TOKEN } from './model-checkpoint-map';
import { qwenLoaderFilenames } from './workflow-scaffold';

export function qwenScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  const loaders = qwenLoaderFilenames();
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'qwen_image',
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

/**
 * Phr00t Rapid AIO (and other Load Checkpoint Qwen merges): single-file checkpoint
 * — no separate UNET / CLIP / VAE loaders.
 */
export function qwenCheckpointScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: DEFAULT_CHECKPOINT_TOKEN },
      _meta: { title: 'Load Checkpoint' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
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
      inputs: { samples: ['8', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export const LIGHTNING_LORA_TOKEN = '{{LORA_LIGHTNING}}';

export function qwenLightningScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  const loaders = qwenLoaderFilenames();
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'qwen_image',
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
      class_type: 'EmptySD3LatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '7': {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['1', 0],
        lora_name: LIGHTNING_LORA_TOKEN,
        strength_model: 1,
      },
      _meta: { title: 'Lightning LoRA' },
    },
    '11': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['7', 0], shift: tokens.shift },
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
        model: ['11', 0],
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

export function resolveQwenEditEncoderClass(model: ComfyImageModel | string): string {
  const def = getComfyModelDefinition(model);
  if (def?.comfyNode === 'TextEncodeQwenImageEdit') {
    return 'TextEncodeQwenImageEdit';
  }
  return 'TextEncodeQwenImageEditPlus';
}

export function usesQwenCheckpointLoader(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  return model.startsWith('qwen-rapid-aio') || def?.comfyNode === 'Load Checkpoint';
}

export function buildQwenEditEncoderInputs(
  encodeClass: string,
  tokens: WorkflowPlaceholderTokens,
  clipRef: [string, number],
  vaeRef: [string, number],
  imageRef: [string, number]
): Record<string, unknown> {
  if (encodeClass === 'TextEncodeQwenImageEdit') {
    return {
      prompt: tokens.positive,
      clip: clipRef,
      vae: vaeRef,
      image: imageRef,
    };
  }
  return {
    prompt: tokens.positive,
    clip: clipRef,
    vae: vaeRef,
    image1: imageRef,
  };
}

export function qwenEditLightningScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string
): Record<string, unknown> {
  const encodeClass = resolveQwenEditEncoderClass(model);
  const loaders = qwenLoaderFilenames();

  // Encode image1–4 stay disconnected for pure T2I (Generate). Figure LoadImages
  // are present with INPUT_IMAGE tokens for Compose/Refine soft-bind; queue
  // ensureQwenEditReferenceImagesForImg2Img wires encode slots when files exist,
  // and disconnectQwenEdit strips unused LoadImages for txt2img.
  const positiveEncode = {
    prompt: tokens.positive,
    clip: ['2', 0] as [string, number],
    vae: ['3', 0] as [string, number],
  };
  const negativeEncode = {
    prompt: tokens.negative,
    clip: ['2', 0] as [string, number],
    vae: ['3', 0] as [string, number],
  };

  const figureTokens = [
    tokens.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    DEFAULT_INPUT_IMAGE_2_TOKEN,
    DEFAULT_INPUT_IMAGE_3_TOKEN,
    DEFAULT_INPUT_IMAGE_4_TOKEN,
  ];

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'qwen_image',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: encodeClass,
      inputs: positiveEncode,
      _meta: { title: 'Qwen Edit Encode (+)' },
    },
    '5': {
      class_type: encodeClass,
      inputs: negativeEncode,
      _meta: { title: 'Qwen Edit Encode (−)' },
    },
    '6': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '7': {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['1', 0],
        lora_name: LIGHTNING_LORA_TOKEN,
        strength_model: 1,
      },
      _meta: { title: 'Lightning LoRA' },
    },
    '11': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['7', 0], shift: tokens.shift },
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
        model: ['11', 0],
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
    '900': {
      class_type: 'LoadImage',
      inputs: { image: figureTokens[0] },
      _meta: { title: 'Figure 1' },
    },
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
  };
}

/** Vanilla Qwen Edit Compose: EmptySD3Latent + ReferenceLatent at queue time (no Lightning LoRA). */
export function qwenEditComposeScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string
): Record<string, unknown> {
  const encodeClass = resolveQwenEditEncoderClass(model);
  const loaders = qwenLoaderFilenames();
  const positiveEncode = {
    prompt: tokens.positive,
    clip: ['2', 0] as [string, number],
  };
  const negativeEncode = {
    prompt: tokens.negative,
    clip: ['2', 0] as [string, number],
  };
  const figureTokens = [
    tokens.inputImage?.trim() || DEFAULT_INPUT_IMAGE_TOKEN,
    DEFAULT_INPUT_IMAGE_2_TOKEN,
    DEFAULT_INPUT_IMAGE_3_TOKEN,
    DEFAULT_INPUT_IMAGE_4_TOKEN,
  ];

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'qwen_image',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: encodeClass,
      inputs: positiveEncode,
      _meta: { title: 'Qwen Edit Encode (+)' },
    },
    '5': {
      class_type: encodeClass,
      inputs: negativeEncode,
      _meta: { title: 'Qwen Edit Encode (−)' },
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
    '900': {
      class_type: 'LoadImage',
      inputs: { image: figureTokens[0] },
      _meta: { title: 'Figure 1' },
    },
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
  };
}

export function qwenEditImg2imgScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string
): Record<string, unknown> {
  // Lightning edit uses EmptyLatent + denoise 1; refs go through TextEncode*.
  if (isQwenLightningModel(model)) {
    return qwenEditLightningScaffold(tokens, model);
  }
  const encodeClass = resolveQwenEditEncoderClass(model);

  if (usesQwenCheckpointLoader(model)) {
    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: '{{CHECKPOINT}}' },
        _meta: { title: 'Load Checkpoint' },
      },
      '900': {
        class_type: 'LoadImage',
        inputs: { image: tokens.inputImage },
        _meta: { title: 'Input Image' },
      },
      '901': {
        class_type: 'VAEEncode',
        inputs: { pixels: ['900', 0], vae: ['1', 2] },
        _meta: { title: 'VAE Encode Input' },
      },
      '4': {
        class_type: encodeClass,
        inputs: buildQwenEditEncoderInputs(encodeClass, tokens, ['1', 1], ['1', 2], ['900', 0]),
        _meta: { title: 'Qwen Edit Encode (+)' },
      },
      '5': {
        class_type: encodeClass,
        inputs: {
          ...buildQwenEditEncoderInputs(encodeClass, tokens, ['1', 1], ['1', 2], ['900', 0]),
          prompt: tokens.negative,
        },
        _meta: { title: 'Qwen Edit Encode (−)' },
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
          latent_image: ['901', 0],
        },
        _meta: { title: 'KSampler' },
      },
      '9': {
        class_type: 'VAEDecode',
        inputs: { samples: ['8', 0], vae: ['1', 2] },
        _meta: { title: 'VAE Decode' },
      },
      '10': {
        class_type: 'SaveImage',
        inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
        _meta: { title: 'Save Image' },
      },
    };
  }

  const loaders = qwenLoaderFilenames();
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipName,
        type: 'qwen_image',
      },
      _meta: { title: 'Load CLIP' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Input Image' },
    },
    '901': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['900', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Encode Input' },
    },
    '4': {
      class_type: encodeClass,
      inputs: buildQwenEditEncoderInputs(encodeClass, tokens, ['2', 0], ['3', 0], ['900', 0]),
      _meta: { title: 'Qwen Edit Encode' },
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
        negative: ['4', 0],
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
