/**
 * SD3, InstructPix2Pix, OmniGen2, Pixart, Lumina2, SDXL, Hunyuan Image,
 * HiDream, generic-fallback, video, audio and mesh workflow scaffolds,
 * extracted from workflow-scaffold.ts to keep that file from growing
 * without bound. buildWorkflowScaffoldForModel (still in
 * workflow-scaffold.ts) dispatches to these by model category.
 */
import { type WorkflowPlaceholderTokens } from './comfyui-config';
import { type ComfyImageModel } from './comfy-models';
import { isWanLightningModel } from './model-sampling-patch';
import { LIGHTNING_LORA_TOKEN } from './workflow-scaffold-qwen';
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  suggestedVaeFilenameForModel,
} from './model-checkpoint-map';

export function isAuraFlowModel(model?: ComfyImageModel | string): boolean {
  return String(model ?? '').trim() === 'auraflow' || /auraflow/i.test(String(model ?? ''));
}

export function isHiDreamModel(model?: ComfyImageModel | string): boolean {
  return /^hidream(-o1)?$/i.test(String(model ?? '').trim());
}

export function isOmniGen2Model(model?: ComfyImageModel | string): boolean {
  return String(model ?? '').trim() === 'omnigen2';
}

export function isPixartModel(model?: ComfyImageModel | string): boolean {
  return /^pixart-(alpha|sigma)$/i.test(String(model ?? '').trim());
}

export function isInstructPix2pixModel(model?: ComfyImageModel | string): boolean {
  return /instruct-pix2pix/i.test(String(model ?? '').trim());
}

export function sd3Scaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string
): Record<string, unknown> {
  const useAuraFlow = isAuraFlowModel(model);
  const vaeName =
    suggestedVaeFilenameForModel(String(model ?? 'sd3-medium')) ?? 'sd3_vae.safetensors';

  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: 'default' },
      _meta: { title: 'Load SD3 UNET' },
    },
    '2': {
      class_type: 'TripleCLIPLoader',
      inputs: {
        clip_name1: 'clip_g.safetensors',
        clip_name2: 'clip_l.safetensors',
        clip_name3: 't5xxl_fp16.safetensors',
      },
      _meta: { title: 'Triple CLIP (SD3)' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: useAuraFlow ? 'ModelSamplingAuraFlow' : 'ModelSamplingSD3',
      inputs: useAuraFlow
        ? { model: ['1', 0], shift: tokens.shift }
        : { model: ['1', 0], shift: tokens.shift },
      _meta: { title: useAuraFlow ? 'ModelSamplingAuraFlow' : 'ModelSamplingSD3' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty SD3 Latent' },
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
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
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
      inputs: { images: ['9', 0], filename_prefix: 'Castcut-sd3' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function instructPix2pixScaffold(
  tokens: WorkflowPlaceholderTokens
): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: DEFAULT_CHECKPOINT_TOKEN },
      _meta: { title: 'Load InstructPix2Pix Checkpoint' },
    },
    '901': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Source Image' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Instruction Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['901', 0], vae: ['1', 2] },
      _meta: { title: 'Encode Source' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'Castcut-ip2p' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function omnigen2Scaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: 'default' },
      _meta: { title: 'Load OmniGen2 UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: 't5xxl_fp16.safetensors', type: 'stable_diffusion' },
      _meta: { title: 'CLIPLoader (OmniGen2)' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: 'ae.safetensors' },
      _meta: { title: 'Load VAE' },
    },
    '901': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Reference Image 1' },
    },
    '902': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Reference Image 2' },
    },
    '4': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: tokens.shift },
      _meta: { title: 'ModelSamplingAuraFlow' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Instruction Prompt' },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
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
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
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
      inputs: { images: ['9', 0], filename_prefix: 'Castcut-omnigen2' },
      _meta: { title: 'Save Image' },
    },
    '11': {
      class_type: 'Note',
      inputs: {
        text: 'OmniGen2 starter — wire pack-accurate OmniGen2 encode / reference nodes when available. Ref images use {{INPUT_IMAGE}} slots.',
      },
      _meta: { title: 'OmniGen2 scaffold note' },
    },
  };
}

export function pixartScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: DEFAULT_CHECKPOINT_TOKEN },
      _meta: { title: 'Load PixArt Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'Castcut-pixart' },
      _meta: { title: 'Save Image' },
    },
    '8': {
      class_type: 'Note',
      inputs: {
        text: 'PixArt starter — import pack-accurate PixArt DiT graph (T5 + transformer loaders) when available.',
      },
      _meta: { title: 'PixArt scaffold note' },
    },
  };
}

export function lumina2Scaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: DEFAULT_UNET_TOKEN, weight_dtype: 'default' },
      _meta: { title: 'Load Lumina2 UNET' },
    },
    '2': {
      class_type: 'CLIPLoader',
      inputs: { clip_name: 'gemma_2_2b_it.safetensors', type: 'lumina2' },
      _meta: { title: 'CLIPLoader (Lumina2)' },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: 'ae.safetensors' },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: ['1', 0], shift: tokens.shift },
      _meta: { title: 'ModelSamplingAuraFlow' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
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
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
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
      inputs: { images: ['9', 0], filename_prefix: 'Castcut-lumina2' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function sdxlScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load SDXL Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function hunyuanImageScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string = 'hunyuan-dit'
): Record<string, unknown> {
  const isImage21 = /image-?2\.?1|image21/i.test(String(model));
  const widthNum = Number(tokens.width);
  const heightNum = Number(tokens.height);
  const baseWidth = Number.isFinite(widthNum) && widthNum > 0 ? widthNum : 1024;
  const baseHeight = Number.isFinite(heightNum) && heightNum > 0 ? heightNum : 1024;
  const latentWidth = isImage21 ? baseWidth : Math.max(1024, baseWidth);
  const latentHeight = isImage21 ? baseHeight : Math.max(1024, baseHeight);

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Hunyuan Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: latentWidth, height: latentHeight, batch_size: 1 },
      _meta: { title: 'Empty Latent (Hunyuan T2I)' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'Castcut-hunyuan' },
      _meta: { title: 'Save Image' },
    },
    '8': {
      class_type: 'Note',
      inputs: {
        text: isImage21
          ? 'Hunyuan Image 2.1 starter — import your pack-accurate graph when available; map {{CHECKPOINT}} under Settings.'
          : 'Hunyuan DiT starter — replace with HyDiT / pack nodes if your Comfy install uses custom loaders.',
      },
      _meta: { title: 'Hunyuan scaffold note' },
    },
  };
}

export function genericScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { images: ['6', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function hidreamScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string
): Record<string, unknown> {
  const isO1 = String(model ?? '').trim() === 'hidream-o1';
  const graph = hunyuanImageScaffold(tokens, model);
  return {
    ...graph,
    '8': {
      class_type: 'Note',
      inputs: {
        text: isO1
          ? 'HiDream-O1 starter — reasoning T2I; import pack-accurate HiDream-O1 graph when available. Map {{CHECKPOINT}} / {{UNET}} under Settings.'
          : 'HiDream starter — replace with pack-accurate HiDream loader stack when available.',
      },
      _meta: { title: 'HiDream scaffold note' },
    },
  };
}

type VideoLatentClass =
  | 'EmptyHunyuanLatentVideo'
  | 'EmptyHunyuanVideo15Latent'
  | 'EmptyLTXVLatentVideo'
  | 'EmptyMochiLatentVideo';

export function resolveVideoLatentClass(model: ComfyImageModel | string): VideoLatentClass {
  if (model === 'ltx-video' || /ltx/i.test(String(model))) {
    return 'EmptyLTXVLatentVideo';
  }
  if (/mochi/i.test(String(model))) {
    return 'EmptyMochiLatentVideo';
  }
  if (/hunyuan-video-1\.5|hunyuanvideo1\.5/i.test(String(model))) {
    return 'EmptyHunyuanVideo15Latent';
  }
  // WAN and classic Hunyuan both commonly use EmptyHunyuanLatentVideo in stock Comfy graphs.
  return 'EmptyHunyuanLatentVideo';
}

/**
 * Starter T2V graph for video models. Node "900" (LoadImage, title "Init Image")
 * is recognized by queue-time `patchVideoImageToVideoWiringInWorkflow` for WAN/Hunyuan I2V.
 * LTX scaffolds use EmptyLTXVLatentVideo; I2V auto-splice wires LTXVImgToVideo at queue time.
 * WAN Lightning adds LoraLoaderModelOnly ({{LORA_LIGHTNING}}) between checkpoint and KSampler.
 */
export function videoScaffold(
  tokens: WorkflowPlaceholderTokens,
  model: ComfyImageModel | string = 'wan-video'
): Record<string, unknown> {
  const latentClass = resolveVideoLatentClass(model);
  const useLightning = isWanLightningModel(model);
  const isLtx = latentClass === 'EmptyLTXVLatentVideo';
  const isHunyuan15 = latentClass === 'EmptyHunyuanVideo15Latent';
  const clipRef: [string, number] = isLtx ? ['10', 0] : ['1', 1];
  const i2vHint = isLtx
    ? 'Init Image (optional — auto-wired into LTXVImgToVideo at queue time)'
    : isHunyuan15
      ? 'Init Image (optional — auto-wired into HunyuanVideo15ImageToVideo at queue time)'
      : 'Init Image (optional — auto-wired into WanImageToVideo/HunyuanImageToVideo at queue time)';

  const graph: Record<string, unknown> = {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: clipRef },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: clipRef },
      _meta: { title: 'Negative Prompt' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: tokens.initImage },
      _meta: { title: i2vHint },
    },
    '4': {
      class_type: latentClass,
      inputs: {
        width: tokens.width,
        height: tokens.height,
        length: tokens.videoFrames,
        batch_size: 1,
      },
      _meta: { title: 'Empty Video Latent' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: useLightning ? ['8', 0] : ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveAnimatedWEBP',
      inputs: {
        images: ['6', 0],
        filename_prefix: 'Castcut',
        fps: tokens.videoFps,
        lossless: false,
        quality: 90,
        method: 'default',
      },
      _meta: { title: 'Save Video (WEBP)' },
    },
  };

  if (useLightning) {
    graph['8'] = {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['1', 0],
        lora_name: LIGHTNING_LORA_TOKEN,
        strength_model: 1,
      },
      _meta: { title: 'Lightning LoRA' },
    };
  }

  if (isLtx) {
    graph['10'] = {
      class_type: 'CLIPLoader',
      inputs: { clip_name: 't5xxl_fp16.safetensors', type: 'ltxv' },
      _meta: { title: 'LTX CLIP (T5-XXL)' },
    };
  }

  return graph;
}

/** Starter graph for Stable Audio–style packs — replace with pack JSON when available. */
export function audioScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Audio Checkpoint' },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: 64, height: 64, batch_size: 1 },
      _meta: { title: 'Latent placeholder (swap for audio latent)' },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: 1,
      },
      _meta: { title: 'KSampler' },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '7': {
      class_type: 'SaveAudio',
      inputs: { audio: ['6', 0], filename_prefix: 'audio/ComfyUI' },
      _meta: { title: 'Save Audio (requires audio custom nodes)' },
    },
    '8': {
      class_type: 'Note',
      inputs: {
        text: 'Duration hint token: {{AUDIO_SECONDS}} seconds. Replace this graph with your Stable Audio pack when ready.',
      },
      _meta: { title: 'Audio seconds note' },
    },
  };
}

/** Starter graph for Hunyuan3D–style image→mesh — replace with pack JSON when available. */
export function meshScaffold(tokens: WorkflowPlaceholderTokens): Record<string, unknown> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: '{{CHECKPOINT}}' },
      _meta: { title: 'Load Mesh Checkpoint' },
    },
    '2': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Reference Image' },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['1', 1] },
      _meta: { title: 'Positive Prompt' },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['1', 1] },
      _meta: { title: 'Negative Prompt' },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: tokens.width,
        height: tokens.height,
        batch_size: 1,
      },
      _meta: { title: 'Latent (resolution hint)' },
    },
    '6': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0],
        positive: ['3', 0],
        negative: ['4', 0],
        latent_image: ['5', 0],
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: 1,
      },
      _meta: { title: 'KSampler' },
    },
    '7': {
      class_type: 'VAEDecode',
      inputs: { samples: ['6', 0], vae: ['1', 2] },
      _meta: { title: 'VAE Decode' },
    },
    '8': {
      class_type: 'SaveImage',
      inputs: { images: ['7', 0], filename_prefix: 'mesh/ComfyUI' },
      _meta: { title: 'Save preview (swap for mesh export node)' },
    },
    '9': {
      class_type: 'Note',
      inputs: {
        text: 'Mesh resolution hint: {{MESH_RESOLUTION}}. Wire Hunyuan3D / mesh export nodes from your pack; LoadImage receives {{INPUT_IMAGE}}.',
      },
      _meta: { title: 'Mesh resolution note' },
    },
  };
}
