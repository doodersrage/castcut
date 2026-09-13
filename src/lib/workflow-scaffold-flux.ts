/**
 * FLUX model-family workflow scaffolds, extracted from workflow-scaffold.ts
 * to keep that file from growing without bound. Klein and classic FLUX.1
 * share loader/text-encoder wiring here; txt2img, inpaint, img2img and the
 * Klein instruction-edit variants are all built from the same primitives.
 */
import { type WorkflowPlaceholderTokens } from './comfyui-config';
import { type ComfyImageModel } from './comfy-models';
import { isFluxKleinModel } from './model-denoise-defaults';
import {
  DEFAULT_UNET_TOKEN,
  resolveLoaderFilenamesForModel,
  suggestedVaeFilenameForModel,
} from './model-checkpoint-map';

const DEFAULT_FLUX_CLIP_L = 'clip_l.safetensors';
const DEFAULT_FLUX_CLIP_T5 = 't5xxl_fp16.safetensors';

/**
 * True when `model` is the 9B (as opposed to 4B) FLUX.2 Klein text-encoder
 * variant. Single source of truth for this check — see the callers listed
 * on fluxKleinDualClipFilename below.
 */
export function isFluxKlein9BVariant(model?: ComfyImageModel | string): boolean {
  return /9b/i.test(String(model ?? ''));
}

/**
 * Default Klein dual-clip text encoder filename for `model`. Also used by
 * gallery-output-refine.ts (re-exported there), system-workflow-runtime.ts,
 * and system-workflow-pack-loaders.ts (which each need the 9B/4B split for
 * their own inventory-matching logic via isFluxKlein9BVariant above) — keep
 * the 9B/4B decision centralized here rather than re-testing model strings.
 */
export function fluxKleinDualClipFilename(model?: ComfyImageModel | string): string {
  if (!model) {
    return 'qwen_3_4b.safetensors';
  }
  const loaders = resolveLoaderFilenamesForModel(String(model));
  if (loaders.dualClip?.trim()) {
    return loaders.dualClip.trim();
  }
  if (isFluxKlein9BVariant(model)) {
    return 'qwen_3_8b_fp8mixed.safetensors';
  }
  return 'qwen_3_4b.safetensors';
}

function fluxVaeFilename(model?: ComfyImageModel | string): string {
  if (model) {
    const suggested = suggestedVaeFilenameForModel(model);
    if (suggested) {
      return suggested;
    }
  }
  // Unknown FLUX id — prefer FLUX.2 VAE over guessing ae (Klein/FLUX.2 family).
  return 'flux2-vae.safetensors';
}

function fluxDiffusionLoaders(model?: ComfyImageModel | string): {
  unetToken: string;
  clipL: string;
  clipT5: string;
  vaeName: string;
} {
  if (isFluxKleinModel(model)) {
    const dual = fluxKleinDualClipFilename(model);
    return {
      unetToken: DEFAULT_UNET_TOKEN,
      clipL: dual,
      clipT5: dual,
      vaeName: fluxVaeFilename(model),
    };
  }
  return {
    unetToken: DEFAULT_UNET_TOKEN,
    clipL: DEFAULT_FLUX_CLIP_L,
    clipT5: DEFAULT_FLUX_CLIP_T5,
    vaeName: fluxVaeFilename(model),
  };
}

/** Klein: CLIPLoader type flux2. Classic FLUX: DualCLIP clip_l + t5xxl type flux. */
function fluxTextEncoderNode(
  model: ComfyImageModel | string | undefined,
  loaders: ReturnType<typeof fluxDiffusionLoaders>
): Record<string, unknown> {
  if (isFluxKleinModel(model)) {
    return {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: loaders.clipL,
        type: 'flux2',
      },
      _meta: { title: 'CLIPLoader (FLUX.2 Klein)' },
    };
  }
  return {
    class_type: 'DualCLIPLoader',
    inputs: {
      clip_name1: loaders.clipL,
      clip_name2: loaders.clipT5,
      type: 'flux',
    },
    _meta: { title: 'DualCLIPLoader' },
  };
}

function fluxScaffoldUsesGuidance(model?: ComfyImageModel | string): boolean {
  return !isFluxKleinModel(model) && model !== 'flux2';
}

export function fluxScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  const useGuidance = fluxScaffoldUsesGuidance(model);
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': fluxTextEncoderNode(model, loaders),
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'ModelSamplingFlux',
      inputs: {
        model: ['1', 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: 'ModelSamplingFlux' },
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
    ...(useGuidance
      ? {
          '11': {
            class_type: 'FluxGuidance',
            inputs: {
              conditioning: ['5', 0],
              // Sidebar CFG maps here for FLUX.1 — KSampler.cfg stays 1.
              guidance: tokens.cfg,
            },
            _meta: { title: 'FluxGuidance' },
          },
        }
      : {}),
    '7': {
      class_type:
        isFluxKleinModel(model) || model === 'flux2'
          ? 'EmptyFlux2LatentImage'
          : 'EmptySD3LatentImage',
      inputs: { width: tokens.width, height: tokens.height, batch_size: 1 },
      _meta: { title: 'Empty Latent' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: useGuidance ? 1 : tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['4', 0],
        positive: useGuidance ? ['11', 0] : ['5', 0],
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
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}

export function fluxInpaintScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': fluxTextEncoderNode(model, loaders),
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'ModelSamplingFlux',
      inputs: {
        model: ['1', 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: 'ModelSamplingFlux' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Input Image' },
    },
    '902': {
      class_type: 'LoadImageMask',
      inputs: { image: tokens.maskImage },
      _meta: { title: 'Inpaint Mask' },
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
    '11': {
      class_type: 'FluxGuidance',
      inputs: {
        conditioning: ['5', 0],
        guidance: tokens.cfg,
      },
      _meta: { title: 'FluxGuidance' },
    },
    '903': {
      class_type: 'InpaintModelConditioning',
      inputs: {
        positive: ['11', 0],
        negative: ['6', 0],
        vae: ['3', 0],
        pixels: ['900', 0],
        mask: ['902', 0],
      },
      _meta: { title: 'Inpaint Conditioning' },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: 1,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['4', 0],
        positive: ['903', 0],
        negative: ['903', 1],
        latent_image: ['903', 2],
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

export function fluxImg2imgScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  const useGuidance = fluxScaffoldUsesGuidance(model);
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': fluxTextEncoderNode(model, loaders),
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'ModelSamplingFlux',
      inputs: {
        model: ['1', 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: 'ModelSamplingFlux' },
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
    ...(useGuidance
      ? {
          '11': {
            class_type: 'FluxGuidance',
            inputs: {
              conditioning: ['5', 0],
              guidance: tokens.cfg,
            },
            _meta: { title: 'FluxGuidance' },
          },
        }
      : {}),
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed: tokens.seed,
        steps: tokens.steps,
        cfg: useGuidance ? 1 : tokens.cfg,
        sampler_name: tokens.sampler,
        scheduler: tokens.scheduler,
        denoise: tokens.denoise,
        model: ['4', 0],
        positive: useGuidance ? ['11', 0] : ['5', 0],
        negative: ['6', 0],
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

/**
 * Official FLUX.2 Klein instruction edit: EmptyFlux2Latent + denoise 1, with
 * Figure 1 attached via ReferenceLatent on positive conditioning.
 */
export function fluxKleinEditScaffold(
  tokens: WorkflowPlaceholderTokens,
  model?: ComfyImageModel | string
): Record<string, unknown> {
  const loaders = fluxDiffusionLoaders(model);
  return {
    '1': {
      class_type: 'UNETLoader',
      inputs: { unet_name: loaders.unetToken, weight_dtype: 'default' },
      _meta: { title: 'Load UNET' },
    },
    '2': fluxTextEncoderNode(model, loaders),
    '3': {
      class_type: 'VAELoader',
      inputs: { vae_name: loaders.vaeName },
      _meta: { title: 'Load VAE' },
    },
    '4': {
      class_type: 'ModelSamplingFlux',
      inputs: {
        model: ['1', 0],
        max_shift: tokens.fluxMaxShift,
        base_shift: tokens.fluxBaseShift,
        width: tokens.width,
        height: tokens.height,
      },
      _meta: { title: 'ModelSamplingFlux' },
    },
    '900': {
      class_type: 'LoadImage',
      inputs: { image: tokens.inputImage },
      _meta: { title: 'Input Image' },
    },
    '901': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['900', 0], vae: ['3', 0] },
      _meta: { title: 'VAE Encode Figure 1' },
    },
    '5': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.positive, clip: ['2', 0] },
      _meta: { title: 'Positive Prompt' },
    },
    '902': {
      class_type: 'ReferenceLatent',
      inputs: {
        conditioning: ['5', 0],
        latent: ['901', 0],
      },
      _meta: { title: 'Reference Latent 1' },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: tokens.negative, clip: ['2', 0] },
      _meta: { title: 'Negative Prompt' },
    },
    '7': {
      class_type: 'EmptyFlux2LatentImage',
      inputs: {
        width: tokens.width,
        height: tokens.height,
        batch_size: 1,
      },
      _meta: { title: 'Empty Flux 2 Latent' },
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
        positive: ['902', 0],
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
      inputs: { images: ['9', 0], filename_prefix: 'Castcut' },
      _meta: { title: 'Save Image' },
    },
  };
}
