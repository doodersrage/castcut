/** Client-safe asset kind metadata (no Node fs/path). */

export type ComfyAssetKind =
  | 'checkpoint'
  | 'unet'
  | 'vae'
  | 'lora'
  | 'upscale'
  | 'refiner'
  | 'clip'
  | 'controlnet'
  | 'facerestore'
  | 'latentupscale'
  | 'clipvision'
  | 'backgroundremoval';

export const COMFY_ASSET_KIND_LABELS: Record<ComfyAssetKind, string> = {
  checkpoint: 'Checkpoint',
  refiner: 'Refiner',
  unet: 'UNET / diffusion',
  vae: 'VAE',
  clip: 'Text encoder / CLIP',
  lora: 'LoRA',
  upscale: 'Upscale',
  controlnet: 'ControlNet',
  facerestore: 'Face restore',
  latentupscale: 'Latent upscale',
  clipvision: 'Image encoder',
  backgroundremoval: 'Background removal',
};

export const COMFY_ASSET_KIND_ORDER: ComfyAssetKind[] = [
  'checkpoint',
  'refiner',
  'unet',
  'vae',
  'clip',
  'lora',
  'upscale',
  'controlnet',
  'facerestore',
  'latentupscale',
  'clipvision',
  'backgroundremoval',
];
