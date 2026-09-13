import type { ComfyImageModel } from './comfy-models/client';
import type { ComfyAssetKind } from './comfy-asset-kinds';

export type ComfyCatalogAsset = {
  id: string;
  label: string;
  kind: ComfyAssetKind;
  /** Relative filename under the kind’s models folder (may include subdirs). */
  filename: string;
  /** Hugging Face (or allowlisted) resolve URL — omit for docs-only rows. */
  url?: string;
  sha256?: string;
  bytes?: number;
  /** App model ids that expect this weight. */
  modelIds: Array<ComfyImageModel | string>;
  notes?: string;
  /** Hint that Install needs HF_TOKEN (gated BFL packs, etc.). */
  requiresHfToken?: boolean;
};

/** Hosts allowed for curated downloads (no client-supplied URLs). */
export const COMFY_ASSET_DOWNLOAD_HOSTS = [
  'huggingface.co',
  'hf.co',
  'cdn-lfs.huggingface.co',
  'cdn-lfs-us-1.huggingface.co',
  'cdn-lfs-eu-1.huggingface.co',
  'cdn.hf.co',
  'cas-server.xethub.hf.co',
] as const;

export function isAllowlistedAssetUrl(urlString: string): boolean {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:') {
      return false;
    }
    const host = url.hostname.toLowerCase();
    if (host === 'civitai.com' || host.endsWith('.civitai.com')) {
      return /^\/api\/download\/models\/\d+\/?$/.test(url.pathname);
    }
    if (
      COMFY_ASSET_DOWNLOAD_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))
    ) {
      return true;
    }
    // HF Xet / CloudFront bridges: us.aws.cdn.hf.co, eu-west-*.cdn.hf.co, …
    if (host.endsWith('.hf.co') || host.endsWith('.huggingface.co')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const QWEN_T2I_MODELS = [
  'qwen-image-2512',
  'qwen-image-2512-lightning-4',
  'qwen-image-2512-lightning-8',
  'qwen-image-2.0',
] as const;

const QWEN_EDIT_MODELS = [
  'qwen-image-edit-2511',
  'qwen-image-edit-2511-lightning-4',
  'qwen-image-edit-2511-lightning-8',
  'qwen-image-edit-2509',
  'qwen-rapid-aio-edit',
] as const;

const QWEN_SHARED_MODELS = [...QWEN_T2I_MODELS, ...QWEN_EDIT_MODELS] as const;

const KLEIN_MODELS = [
  'flux-2-klein',
  'flux-2-klein-4b-distilled',
  'flux-2-klein-9b',
  'flux-2-klein-9b-distilled',
] as const;

const WAN_MODELS = ['wan-video', 'wan-video-rapid-aio', 'wan-video-lightning-4'] as const;

export const NATIVE_VIDEO_MODEL_IDS = [...WAN_MODELS, 'hunyuan-video', 'ltx-video'] as const;

export const NATIVE_AUDIO_MODEL_IDS = ['stable-audio'] as const;

export const NATIVE_MESH_MODEL_IDS = ['hunyuan-3d'] as const;

const Z_IMAGE_MODELS = ['z-image', 'z-image-turbo'] as const;

const BOOGU_EDIT_MODELS = ['boogu-image-edit', 'boogu-image-edit-turbo'] as const;

const BOOGU_IMAGE_MODELS = ['boogu-image', 'boogu-image-turbo'] as const;

const BOOGU_ALL_MODELS = [...BOOGU_IMAGE_MODELS, ...BOOGU_EDIT_MODELS] as const;

/**
 * Curated weights tied to suggested loader maps / supported workflows.
 * Entries without `url` are docs-only (show expected filename, no Install).
 */
export const COMFY_ASSET_CATALOG: ComfyCatalogAsset[] = [
  // ── SDXL ──────────────────────────────────────────────────────────
  {
    id: 'sdxl-base',
    label: 'SDXL base 1.0',
    kind: 'checkpoint',
    filename: 'sd_xl_base_1.0.safetensors',
    url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors',
    bytes: 6938078334,
    modelIds: ['sdxl'],
  },
  {
    id: 'sdxl-refiner',
    label: 'SDXL refiner 1.0',
    kind: 'refiner',
    filename: 'sd_xl_refiner_1.0.safetensors',
    url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-refiner-1.0/resolve/main/sd_xl_refiner_1.0.safetensors',
    modelIds: ['sdxl'],
  },
  {
    id: 'sdxl-vae',
    label: 'SDXL VAE',
    kind: 'vae',
    filename: 'sdxl_vae.safetensors',
    url: 'https://huggingface.co/stabilityai/sdxl-vae/resolve/main/sdxl_vae.safetensors',
    bytes: 334641164,
    modelIds: ['sdxl'],
  },

  // ── Upscale ───────────────────────────────────────────────────────
  {
    id: 'ultrasharp-4x',
    label: '4x UltraSharp (upscale)',
    kind: 'upscale',
    filename: '4x-UltraSharp.pth',
    url: 'https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth',
    bytes: 66961958,
    sha256: 'a5812231fc936b42af08a5edba784195495d303d5b3248c24489ef0c4021fe01',
    modelIds: ['default', 'sdxl', 'flux-dev', ...KLEIN_MODELS],
  },
  {
    id: 'nmkd-siax-4x',
    label: '4x NMKD Siax (upscale)',
    kind: 'upscale',
    filename: '4x_NMKD-Siax_200k.pth',
    url: 'https://huggingface.co/gemasai/4x_NMKD-Siax_200k/resolve/main/4x_NMKD-Siax_200k.pth',
    bytes: 66957746,
    modelIds: [...QWEN_SHARED_MODELS, 'default'],
    notes: 'Preferred neural upscaler for Qwen / people stacks.',
  },

  // ── Qwen Image (T2I) ──────────────────────────────────────────────
  {
    id: 'qwen-image-2512-bf16',
    label: 'Qwen Image 2512 (bf16 UNET)',
    kind: 'unet',
    filename: 'qwen_image_2512_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_bf16.safetensors',
    bytes: 40861031488,
    modelIds: [...QWEN_T2I_MODELS],
  },
  {
    id: 'qwen-image-2512-fp8',
    label: 'Qwen Image 2512 (fp8 UNET)',
    kind: 'unet',
    filename: 'qwen_image_2512_fp8_e4m3fn.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_2512_fp8_e4m3fn.safetensors',
    bytes: 20430679144,
    modelIds: [...QWEN_T2I_MODELS],
    notes: 'Lower-VRAM alternative to bf16.',
  },
  {
    id: 'qwen-image-vae',
    label: 'Qwen Image VAE',
    kind: 'vae',
    filename: 'qwen_image_vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors',
    bytes: 253806246,
    sha256: 'a70580f0213e67967ee9c95f05bb400e8fb08307e017a924bf3441223e023d1f',
    modelIds: [...QWEN_SHARED_MODELS],
  },
  {
    id: 'qwen-2.5-vl-7b-fp8',
    label: 'Qwen 2.5-VL 7B text encoder (fp8)',
    kind: 'clip',
    filename: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
    bytes: 9384670680,
    modelIds: [...QWEN_SHARED_MODELS],
    notes: 'Recommended CLIP for most Qwen installs (models/text_encoders).',
  },
  {
    id: 'qwen-2.5-vl-7b-bf16',
    label: 'Qwen 2.5-VL 7B text encoder (bf16)',
    kind: 'clip',
    filename: 'qwen_2.5_vl_7b.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b.safetensors',
    bytes: 16584415576,
    modelIds: [...QWEN_SHARED_MODELS],
    notes: 'Full-precision text encoder — large; prefer fp8 unless you need max fidelity.',
  },
  {
    id: 'qwen-lightning-4',
    label: 'Qwen Image Lightning 4-step LoRA',
    kind: 'lora',
    filename: 'Qwen-Image-Lightning-4steps-V2.0.safetensors',
    url: 'https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-4steps-V2.0.safetensors',
    bytes: 1698951104,
    modelIds: ['qwen-image-2512-lightning-4'],
  },
  {
    id: 'qwen-lightning-8',
    label: 'Qwen Image Lightning 8-step LoRA',
    kind: 'lora',
    filename: 'Qwen-Image-Lightning-8steps-V2.0.safetensors',
    url: 'https://huggingface.co/lightx2v/Qwen-Image-Lightning/resolve/main/Qwen-Image-Lightning-8steps-V2.0.safetensors',
    bytes: 1698951104,
    modelIds: ['qwen-image-2512-lightning-8'],
  },

  // ── Z-Image (Base + Turbo) ────────────────────────────────────────
  {
    id: 'z-image-base-bf16',
    label: 'Z-Image Base (bf16 UNET)',
    kind: 'unet',
    filename: 'z_image_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/z_image/resolve/main/split_files/diffusion_models/z_image_bf16.safetensors',
    bytes: 12300000000,
    modelIds: ['z-image'],
    notes: 'Comfy-Org Z-Image Base — ~30–50 steps, cfg 3–5.',
  },
  {
    id: 'z-image-turbo-bf16',
    label: 'Z-Image Turbo (bf16 UNET)',
    kind: 'unet',
    filename: 'z_image_turbo_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/diffusion_models/z_image_turbo_bf16.safetensors',
    bytes: 12300000000,
    modelIds: ['z-image-turbo'],
    notes: 'Distilled turbo stack — 6–8 steps, cfg 1.',
  },
  {
    id: 'z-image-qwen3-4b-clip',
    label: 'Z-Image Qwen 3 4B text encoder',
    kind: 'clip',
    filename: 'qwen_3_4b.safetensors',
    url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
    bytes: 8044982048,
    modelIds: [...Z_IMAGE_MODELS],
    notes: 'CLIPLoader type lumina2 — shared by Z-Image Base and Turbo.',
  },
  {
    id: 'z-image-ae-vae',
    label: 'Z-Image / FLUX AE VAE',
    kind: 'vae',
    filename: 'ae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/vae/ae.safetensors',
    bytes: 335304388,
    modelIds: [...Z_IMAGE_MODELS],
    notes: 'Same Flux.1 AE VAE used by Z-Image workflows (models/vae).',
  },

  // ── Boogu Image (T2I) ─────────────────────────────────────────────
  {
    id: 'boogu-base-bf16',
    label: 'Boogu Image Base (bf16 UNET)',
    kind: 'unet',
    filename: 'boogu_image_base_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_base_bf16.safetensors',
    bytes: 20600000000,
    modelIds: ['boogu-image'],
    notes: 'Full bf16 T2I base — ~25–50 steps, cfg ~4.',
  },
  {
    id: 'boogu-base-fp8',
    label: 'Boogu Image Base (fp8 UNET)',
    kind: 'unet',
    filename: 'boogu_image_base_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_base_fp8_scaled.safetensors',
    bytes: 10300000000,
    modelIds: ['boogu-image'],
    notes: 'VRAM-friendly fp8 base weights.',
  },
  {
    id: 'boogu-turbo-bf16',
    label: 'Boogu Image Turbo (bf16 UNET)',
    kind: 'unet',
    filename: 'boogu_image_turbo_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_turbo_bf16.safetensors',
    bytes: 20600000000,
    modelIds: ['boogu-image-turbo'],
    notes: 'Distilled T2I turbo UNET — 4 steps, cfg 1; no LoRA required.',
  },
  {
    id: 'boogu-turbo-fp8',
    label: 'Boogu Image Turbo (fp8 UNET)',
    kind: 'unet',
    filename: 'boogu_image_turbo_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_turbo_fp8_scaled.safetensors',
    bytes: 10300000000,
    modelIds: ['boogu-image-turbo'],
    notes: 'VRAM-friendly fp8 turbo UNET.',
  },
  {
    id: 'boogu-turbo-lora',
    label: 'Boogu Image Turbo LoRA (rank 128)',
    kind: 'lora',
    filename: 'boogu_image_turbo_lora_rank_128_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/loras/boogu_image_turbo_lora_rank_128_bf16.safetensors',
    bytes: 268435456,
    modelIds: ['boogu-image-turbo'],
    notes:
      'Optional — distilled delta between Boogu base and turbo; use on base/edit to approximate turbo speeds, not required for native Boogu Turbo UNET.',
  },

  // ── Boogu Image Edit ──────────────────────────────────────────────
  {
    id: 'boogu-edit-bf16',
    label: 'Boogu Image Edit (bf16 UNET)',
    kind: 'unet',
    filename: 'boogu_image_edit_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_edit_bf16.safetensors',
    bytes: 20600000000,
    modelIds: ['boogu-image-edit'],
    notes: 'Full bf16 edit weights — ~25–50 steps, cfg ~5.',
  },
  {
    id: 'boogu-edit-fp8',
    label: 'Boogu Image Edit (fp8 UNET)',
    kind: 'unet',
    filename: 'boogu_image_edit_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_edit_fp8_scaled.safetensors',
    bytes: 10300000000,
    modelIds: ['boogu-image-edit'],
    notes: 'VRAM-friendly fp8 — official Comfy docs default.',
  },
  {
    id: 'boogu-edit-turbo-bf16',
    label: 'Boogu Image Edit Turbo (bf16 UNET)',
    kind: 'unet',
    filename: 'boogu_image_edit_turbo_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/diffusion_models/boogu_image_edit_turbo_bf16.safetensors',
    bytes: 20600000000,
    modelIds: ['boogu-image-edit-turbo'],
    notes: 'Distilled edit turbo — 4 steps, cfg 1.',
  },
  {
    id: 'boogu-qwen3vl-clip',
    label: 'Boogu Qwen3-VL 8B text encoder',
    kind: 'clip',
    filename: 'qwen3vl_8b_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/text_encoders/qwen3vl_8b_fp8_scaled.safetensors',
    bytes: 9000000000,
    modelIds: [...BOOGU_ALL_MODELS],
    notes: 'CLIPLoader type boogu — shared by Boogu T2I and Edit stacks.',
  },
  {
    id: 'boogu-flux-vae',
    label: 'Boogu Flux VAE (bf16)',
    kind: 'vae',
    filename: 'flux1_vae_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Boogu-Image/resolve/main/vae/flux1_vae_bf16.safetensors',
    bytes: 335304388,
    modelIds: [...BOOGU_ALL_MODELS],
    notes: 'Comfy-Org repack (preferred). ae.safetensors from Z-Image/FLUX also works.',
  },

  // ── Qwen Image Edit ───────────────────────────────────────────────
  {
    id: 'qwen-image-edit-2511-bf16',
    label: 'Qwen Image Edit 2511 (bf16 UNET)',
    kind: 'unet',
    filename: 'qwen_image_edit_2511_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors',
    bytes: 40861031560,
    modelIds: [
      'qwen-image-edit-2511',
      'qwen-image-edit-2511-lightning-4',
      'qwen-image-edit-2511-lightning-8',
      'qwen-rapid-aio-edit',
    ],
  },
  {
    id: 'qwen-image-edit-2509-bf16',
    label: 'Qwen Image Edit 2509 (bf16 UNET)',
    kind: 'unet',
    filename: 'qwen_image_edit_2509_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Qwen-Image-Edit_ComfyUI/resolve/main/split_files/diffusion_models/qwen_image_edit_2509_bf16.safetensors',
    bytes: 40861031488,
    modelIds: ['qwen-image-edit-2509'],
  },
  {
    id: 'qwen-edit-lightning-4',
    label: 'Qwen Edit 2511 Lightning 4-step LoRA',
    kind: 'lora',
    filename: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
    url: 'https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
    bytes: 849608296,
    modelIds: ['qwen-image-edit-2511-lightning-4'],
  },
  {
    id: 'qwen-edit-lightning-8',
    label: 'Qwen Edit 2511 Lightning 8-step LoRA',
    kind: 'lora',
    filename: 'Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
    url: 'https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors',
    bytes: 849608296,
    modelIds: ['qwen-image-edit-2511-lightning-8'],
  },

  // ── Qwen Rapid AIO (Phr00t checkpoint merges) ─────────────────────
  {
    id: 'qwen-rapid-aio-edit-checkpoint',
    label: 'Qwen Rapid AIO Edit (v21 checkpoint)',
    kind: 'checkpoint',
    filename: 'Qwen-Rapid-AIO-v21.safetensors',
    url: 'https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO/resolve/main/v21/Qwen-Rapid-AIO-v21.safetensors',
    bytes: 28400000000,
    modelIds: ['qwen-rapid-aio-edit'],
    notes: 'Phr00t community merge — place under models/checkpoints/.',
  },
  {
    id: 'qwen-rapid-aio-sfw-checkpoint',
    label: 'Qwen Rapid AIO SFW (v23 checkpoint)',
    kind: 'checkpoint',
    filename: 'Qwen-Rapid-AIO-SFW-v23.safetensors',
    url: 'https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO/resolve/main/v23/Qwen-Rapid-AIO-SFW-v23.safetensors',
    bytes: 28400000000,
    modelIds: ['qwen-rapid-aio-sfw'],
    notes: 'Phr00t SFW dual-purpose T2I/edit merge.',
  },
  {
    id: 'qwen-rapid-aio-nsfw-checkpoint',
    label: 'Qwen Rapid AIO NSFW (v23 checkpoint)',
    kind: 'checkpoint',
    filename: 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
    url: 'https://huggingface.co/Phr00t/Qwen-Image-Edit-Rapid-AIO/resolve/main/v23/Qwen-Rapid-AIO-NSFW-v23.safetensors',
    bytes: 28400000000,
    modelIds: ['qwen-rapid-aio-nsfw'],
    notes: 'Phr00t NSFW dual-purpose T2I/edit merge — default Adult generator draft recipe target.',
  },

  // ── FLUX.1 ────────────────────────────────────────────────────────
  {
    id: 'flux1-dev-unet',
    label: 'FLUX.1-dev UNET (fp8)',
    kind: 'unet',
    filename: 'flux1-dev-fp8.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev-fp8.safetensors',
    bytes: 17246524772,
    modelIds: ['flux-dev'],
    notes: 'Public Comfy-Org fp8 pack. Full bf16 flux1-dev.safetensors is also on this repo.',
  },
  {
    id: 'flux1-dev-unet-bf16',
    label: 'FLUX.1-dev UNET (bf16)',
    kind: 'unet',
    filename: 'flux1-dev.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux1-dev/resolve/main/flux1-dev.safetensors',
    bytes: 23802932552,
    modelIds: ['flux-dev'],
  },
  {
    id: 'flux1-ae',
    label: 'FLUX.1 AE VAE',
    kind: 'vae',
    filename: 'ae.safetensors',
    modelIds: ['flux-ultrareal-v4'],
    notes:
      'UltraReal Fine-Tune v4 only in Castcut. Gated on black-forest-labs/FLUX.1-dev — place manually or download with HF_TOKEN after accepting the license.',
    requiresHfToken: true,
  },
  {
    id: 'flux-clip-l',
    label: 'FLUX CLIP-L text encoder',
    kind: 'clip',
    filename: 'clip_l.safetensors',
    url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors',
    bytes: 246144152,
    modelIds: ['flux-dev', 'hunyuan-video'],
    notes: 'Also DualCLIP clip_l for Hunyuan Video.',
  },
  {
    id: 'flux-t5xxl-fp8',
    label: 'FLUX T5-XXL text encoder (fp8 scaled)',
    kind: 'clip',
    filename: 't5xxl_fp8_e4m3fn_scaled.safetensors',
    url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors',
    bytes: 5157348688,
    modelIds: ['flux-dev'],
    notes: 'DualCLIPLoader clip_name2 for FLUX.1-dev.',
  },

  // ── FLUX.2 / Klein ────────────────────────────────────────────────
  {
    id: 'flux2-vae',
    label: 'FLUX.2 VAE',
    kind: 'vae',
    filename: 'flux2-vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors',
    bytes: 336213556,
    modelIds: [...KLEIN_MODELS],
  },
  {
    id: 'flux2-klein-4b',
    label: 'FLUX.2 Klein 4B distilled UNET',
    kind: 'unet',
    filename: 'flux-2-klein-4b.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors',
    bytes: 7751105712,
    modelIds: ['flux-2-klein-4b-distilled', 'flux-2-klein'],
  },
  {
    id: 'flux2-klein-base-4b',
    label: 'FLUX.2 Klein 4B Base UNET',
    kind: 'unet',
    filename: 'flux-2-klein-base-4b.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/diffusion_models/flux-2-klein-base-4b.safetensors',
    bytes: 7751105712,
    modelIds: ['flux-2-klein'],
  },
  {
    id: 'flux2-klein-qwen3-4b',
    label: 'Klein Qwen3-4B text encoder',
    kind: 'clip',
    filename: 'qwen_3_4b.safetensors',
    url: 'https://huggingface.co/Comfy-Org/flux2-klein/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
    bytes: 8044982048,
    modelIds: ['flux-2-klein', 'flux-2-klein-4b-distilled'],
  },
  {
    id: 'flux2-klein-9b',
    label: 'FLUX.2 Klein 9B UNET',
    kind: 'unet',
    filename: 'flux-2-klein-9b.safetensors',
    modelIds: ['flux-2-klein-9b', 'flux-2-klein-9b-distilled'],
    notes: 'Often gated / third-party — place under diffusion_models when you have a pack.',
    requiresHfToken: true,
  },
  {
    id: 'flux2-klein-qwen3-8b',
    label: 'Klein Qwen3-8B text encoder (fp8mixed)',
    kind: 'clip',
    filename: 'qwen_3_8b_fp8mixed.safetensors',
    modelIds: ['flux-2-klein-9b', 'flux-2-klein-9b-distilled'],
    notes: 'Expected DualCLIP for Klein 9B — place under text_encoders.',
  },

  // ── WAN video ─────────────────────────────────────────────────────
  {
    id: 'wan-video-rapid-aio',
    label: 'WAN 2.2 I2V Rapid AIO SFW (Phr00t v10)',
    kind: 'checkpoint',
    filename: 'wan2.2-i2v-rapid-aio-v10.safetensors',
    url: 'https://huggingface.co/Phr00t/WAN2.2-14B-Rapid-AllInOne/resolve/main/v10/wan2.2-i2v-rapid-aio-v10.safetensors',
    bytes: 23387046451,
    modelIds: [...WAN_MODELS],
    notes:
      'Preferred Castcut video checkpoint — model + CLIP + VAE in one file. CFG 1, 4–10 steps. Put this in checkpoints/, not diffusion_models/.',
  },
  {
    id: 'wan-video-rapid-aio-nsfw',
    label: 'WAN 2.2 I2V Rapid AIO NSFW (Phr00t v10)',
    kind: 'checkpoint',
    filename: 'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
    url: 'https://huggingface.co/Phr00t/WAN2.2-14B-Rapid-AllInOne/resolve/main/v10/wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
    bytes: 23387046339,
    modelIds: [...WAN_MODELS],
    notes: 'NSFW twin of Rapid AIO v10. Same Install folder (checkpoints/).',
  },
  {
    id: 'wan-video-lightning-low-noise',
    label: 'WAN 2.2 Lightning 4-step T2V low-noise LoRA',
    kind: 'lora',
    filename: 'Wan2.2-Lightning-low_noise_model.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors',
    bytes: 1226977424,
    modelIds: ['wan-video-lightning-4', 'wan-video'],
    notes:
      'Comfy-Org LightX2V 4-step low-noise LoRA, saved as the filename WAN Lightning scaffolds look up.',
  },
  {
    id: 'wan-video-lightning-high-noise',
    label: 'WAN 2.2 Lightning 4-step T2V high-noise LoRA',
    kind: 'lora',
    filename: 'Wan2.2-Lightning-high_noise_model.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors',
    bytes: 1226977424,
    modelIds: ['wan-video-lightning-4', 'wan-video'],
    notes: 'Pair with the low-noise 4-step LoRA on dual-noise WAN Lightning graphs.',
  },
  {
    id: 'wan-video-lightning-i2v-low-noise',
    label: 'WAN 2.2 Lightning 4-step I2V low-noise LoRA',
    kind: 'lora',
    filename: 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors',
    bytes: 1226977424,
    modelIds: ['wan-video-lightning-4', 'wan-video'],
    notes:
      'Use when Lightning clips start from a still (I2V). Map as {{LORA_LIGHTNING}} if needed.',
  },
  {
    id: 'wan-video-lightning-i2v-high-noise',
    label: 'WAN 2.2 Lightning 4-step I2V high-noise LoRA',
    kind: 'lora',
    filename: 'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/loras/wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors',
    bytes: 1226977424,
    modelIds: ['wan-video-lightning-4', 'wan-video'],
    notes: 'Pair with the I2V low-noise 4-step LoRA when the init frame is set.',
  },
  {
    id: 'wan-video-14b',
    label: 'WAN 2.2 T2V 14B high-noise',
    kind: 'unet',
    filename: 'wan2.2_t2v_high_noise_14B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_high_noise_14B_fp16.safetensors',
    bytes: 28577095592,
    modelIds: ['wan-video'],
    notes: 'Official split T2V stack — skip if you are using Rapid AIO.',
  },
  {
    id: 'wan-video-14b-low',
    label: 'WAN 2.2 T2V 14B low-noise',
    kind: 'unet',
    filename: 'wan2.2_t2v_low_noise_14B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/diffusion_models/wan2.2_t2v_low_noise_14B_fp16.safetensors',
    bytes: 28577095592,
    modelIds: ['wan-video'],
    notes: 'Pair with high-noise for dual-noise WAN T2V scaffolds.',
  },
  {
    id: 'wan-video-i2v-14b',
    label: 'WAN 2.2 I2V 14B high-noise',
    kind: 'unet',
    filename: 'wan2.2_i2v_high_noise_14B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_high_noise_14B_fp16.safetensors',
    bytes: 28577914792,
    modelIds: ['wan-video'],
    notes: 'Official split I2V stack — skip if you are using Rapid AIO.',
  },
  {
    id: 'wan-video-i2v-14b-low',
    label: 'WAN 2.2 I2V 14B low-noise',
    kind: 'unet',
    filename: 'wan2.2_i2v_low_noise_14B_fp16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_Repackaged/resolve/main/split_files/diffusion_models/wan2.2_i2v_low_noise_14B_fp16.safetensors',
    bytes: 28577914792,
    modelIds: ['wan-video'],
    notes: 'Pair with I2V high-noise for official dual-noise clip generation.',
  },
  {
    id: 'wan-video-vae',
    label: 'WAN 2.2 VAE',
    kind: 'vae',
    filename: 'wan2.2_vae.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/vae/wan2.2_vae.safetensors',
    bytes: 1409400960,
    modelIds: ['wan-video'],
    notes: 'Required for official WAN split graphs. Rapid AIO already includes a VAE.',
  },
  {
    id: 'wan-umt5-fp8',
    label: 'WAN UMT5-XXL text encoder (fp8)',
    kind: 'clip',
    filename: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/Wan_2.2_ComfyUI_repackaged/resolve/main/split_files/text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
    bytes: 6735906897,
    modelIds: ['wan-video'],
    notes: 'Required for official WAN split graphs. Rapid AIO already includes CLIP.',
  },

  // ── Hunyuan Video ─────────────────────────────────────────────────
  {
    id: 'hunyuan-video',
    label: 'Hunyuan Video T2V 720p',
    kind: 'unet',
    filename: 'hunyuan_video_t2v_720p_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/diffusion_models/hunyuan_video_t2v_720p_bf16.safetensors',
    bytes: 25642131432,
    modelIds: ['hunyuan-video'],
  },
  {
    id: 'hunyuan-video-i2v',
    label: 'Hunyuan Video I2V 720p',
    kind: 'unet',
    filename: 'hunyuan_video_image_to_video_720p_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/diffusion_models/hunyuan_video_image_to_video_720p_bf16.safetensors',
    bytes: 25622078672,
    modelIds: ['hunyuan-video'],
    notes: 'Use for still → clip. T2V UNET stays the text-only path.',
  },
  {
    id: 'hunyuan-video-vae',
    label: 'Hunyuan Video VAE',
    kind: 'vae',
    filename: 'hunyuan_video_vae_bf16.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/vae/hunyuan_video_vae_bf16.safetensors',
    bytes: 492984198,
    modelIds: ['hunyuan-video'],
  },
  {
    id: 'hunyuan-video-llava',
    label: 'Hunyuan Video LLaVA-Llama3 (fp8)',
    kind: 'clip',
    filename: 'llava_llama3_fp8_scaled.safetensors',
    url: 'https://huggingface.co/Comfy-Org/HunyuanVideo_repackaged/resolve/main/split_files/text_encoders/llava_llama3_fp8_scaled.safetensors',
    bytes: 9091392483,
    modelIds: ['hunyuan-video'],
    notes: 'DualCLIP clip_name2 — pair with clip_l.safetensors.',
  },

  // ── LTX Video ─────────────────────────────────────────────────────
  {
    id: 'ltx-video-2b-098-distilled',
    label: 'LTX Video 2B 0.9.8 distilled',
    kind: 'checkpoint',
    filename: 'ltxv-2b-0.9.8-distilled.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-2b-0.9.8-distilled.safetensors',
    bytes: 6340744492,
    modelIds: ['ltx-video'],
    notes:
      'Current light-VRAM LTX checkpoint (VAE baked in). Pair with t5xxl_fp16 in text_encoders.',
  },
  {
    id: 'ltx-video-2b-098-distilled-fp8',
    label: 'LTX Video 2B 0.9.8 distilled fp8',
    kind: 'checkpoint',
    filename: 'ltxv-2b-0.9.8-distilled-fp8.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-2b-0.9.8-distilled-fp8.safetensors',
    bytes: 4461695684,
    modelIds: ['ltx-video'],
    notes: 'Quantized 2B distilled — smallest current LTX Install.',
  },
  {
    id: 'ltx-video-13b-098-distilled-fp8',
    label: 'LTX Video 13B 0.9.8 distilled fp8',
    kind: 'checkpoint',
    filename: 'ltxv-13b-0.9.8-distilled-fp8.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-13b-0.9.8-distilled-fp8.safetensors',
    bytes: 15694280140,
    modelIds: ['ltx-video'],
    notes: 'Higher quality than 2B; fp8 fits more VRAM budgets than full 13B.',
  },
  {
    id: 'ltx-video-13b-098-distilled',
    label: 'LTX Video 13B 0.9.8 distilled',
    kind: 'checkpoint',
    filename: 'ltxv-13b-0.9.8-distilled.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-13b-0.9.8-distilled.safetensors',
    bytes: 28579183564,
    modelIds: ['ltx-video'],
    notes: 'Full 13B distilled (~27 GB). Prefer fp8 unless you have the VRAM.',
  },
  {
    id: 'ltx-video',
    label: 'LTX Video 2B v0.9 (legacy)',
    kind: 'checkpoint',
    filename: 'ltx-video-2b-v0.9.safetensors',
    url: 'https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltx-video-2b-v0.9.safetensors',
    bytes: 9370442108,
    modelIds: ['ltx-video'],
    notes: 'Original native ComfyUI checkpoint. Prefer 0.9.8 distilled when installing fresh.',
  },
  {
    id: 'ltx-video-t5xxl',
    label: 'T5-XXL fp16 (LTX text encoder)',
    kind: 'clip',
    filename: 't5xxl_fp16.safetensors',
    url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors',
    bytes: 9787841024,
    modelIds: ['ltx-video'],
    notes: 'Required companion for LTX checkpoints — place under text_encoders.',
  },

  // ── Stable Audio ──────────────────────────────────────────────────
  {
    id: 'stable-audio-open',
    label: 'Stable Audio Open 1.0',
    kind: 'checkpoint',
    filename: 'stable-audio-open-1.0.safetensors',
    url: 'https://huggingface.co/Comfy-Org/stable-audio-open-1.0_repackaged/resolve/main/stable-audio-open-1.0.safetensors',
    bytes: 4853889016,
    sha256: '7b20458a071231aaf32613b6fbc7945f28f34dbba4f295bb49bad56f5f66b57e',
    modelIds: [...NATIVE_AUDIO_MODEL_IDS],
    notes:
      'Official Comfy-Org checkpoint for native text-to-audio. Put this in checkpoints/. Pair with t5-base in text_encoders when the graph uses a separate CLIPLoader.',
  },
  {
    id: 'stable-audio-t5-base',
    label: 'T5-Base text encoder (Stable Audio)',
    kind: 'clip',
    filename: 't5-base.safetensors',
    url: 'https://huggingface.co/google-t5/t5-base/resolve/main/model.safetensors',
    bytes: 891646390,
    modelIds: [...NATIVE_AUDIO_MODEL_IDS],
    notes:
      'Required companion for official Stable Audio Open templates — place under text_encoders.',
  },

  // ── Hunyuan 3D ────────────────────────────────────────────────────
  {
    id: 'hunyuan3d-dit-v2',
    label: 'Hunyuan3D 2.0 DiT (single view)',
    kind: 'checkpoint',
    filename: 'hunyuan3d-dit-v2.safetensors',
    url: 'https://huggingface.co/Comfy-Org/hunyuan3D_2.0_repackaged/resolve/main/split_files/hunyuan3d-dit-v2_fp16.safetensors',
    bytes: 4928151562,
    modelIds: [...NATIVE_MESH_MODEL_IDS],
    notes:
      'Native Comfy image→mesh checkpoint (Image Only Checkpoint Loader). Saved under checkpoints/ with the filename official templates look up.',
  },
  {
    id: 'hunyuan3d-dit-v2-mv',
    label: 'Hunyuan3D 2.0 DiT multi-view',
    kind: 'checkpoint',
    filename: 'hunyuan3d-dit-v2-mv.safetensors',
    url: 'https://huggingface.co/Comfy-Org/hunyuan3D_2.0_repackaged/resolve/main/split_files/hunyuan3d-dit-v2-mv_fp16.safetensors',
    bytes: 4928151562,
    modelIds: [...NATIVE_MESH_MODEL_IDS],
    notes: 'Use when the pack graph takes front/left/back/right stills. Same checkpoints/ folder.',
  },
  {
    id: 'hunyuan3d-dit-v2-mv-turbo',
    label: 'Hunyuan3D 2.0 DiT multi-view turbo',
    kind: 'checkpoint',
    filename: 'hunyuan3d-dit-v2-mv-turbo.safetensors',
    url: 'https://huggingface.co/Comfy-Org/hunyuan3D_2.0_repackaged/resolve/main/split_files/hunyuan3d-dit-v2-mv-turbo_fp16.safetensors',
    bytes: 4930777530,
    modelIds: [...NATIVE_MESH_MODEL_IDS],
    notes: 'Faster distilled MV twin — CFG 1 with a Flux guidance node on official turbo graphs.',
  },

  // ── ControlNet ────────────────────────────────────────────────────
  {
    id: 'controlnet-sd15-canny',
    label: 'ControlNet SD1.5 Canny (fp16)',
    kind: 'controlnet',
    filename: 'control_v11p_sd15_canny_fp16.safetensors',
    url: 'https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11p_sd15_canny_fp16.safetensors',
    bytes: 722601100,
    modelIds: ['default', 'sdxl'],
  },
  {
    id: 'controlnet-sd15-openpose',
    label: 'ControlNet SD1.5 OpenPose (fp16)',
    kind: 'controlnet',
    filename: 'control_v11p_sd15_openpose_fp16.safetensors',
    url: 'https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11p_sd15_openpose_fp16.safetensors',
    bytes: 722601100,
    modelIds: ['default', 'sdxl'],
  },
  {
    id: 'controlnet-sd15-depth',
    label: 'ControlNet SD1.5 Depth (fp16)',
    kind: 'controlnet',
    filename: 'control_v11f1p_sd15_depth_fp16.safetensors',
    url: 'https://huggingface.co/comfyanonymous/ControlNet-v1-1_fp16_safetensors/resolve/main/control_v11f1p_sd15_depth_fp16.safetensors',
    bytes: 722601100,
    modelIds: ['default', 'sdxl'],
  },
  {
    id: 'controlnet-union-sdxl',
    label: 'ControlNet Union SDXL',
    kind: 'controlnet',
    filename: 'controlnet-union-sdxl-1.0.safetensors',
    url: 'https://huggingface.co/xinsir/controlnet-union-sdxl-1.0/resolve/main/diffusion_pytorch_model.safetensors',
    bytes: 2512030408,
    modelIds: ['sdxl'],
    notes: 'Saved as controlnet-union-sdxl-1.0.safetensors under models/controlnet.',
  },
];

export function getCatalogAsset(id: string): ComfyCatalogAsset | undefined {
  return COMFY_ASSET_CATALOG.find(entry => entry.id === id);
}

export function catalogAssetsForModel(modelId: string): ComfyCatalogAsset[] {
  const needle = modelId.trim();
  if (!needle) {
    return [];
  }
  // Exact id only — prefix match would pull wan-video 14B splits onto
  // wan-video-rapid-aio / wan-video-lightning-4.
  return COMFY_ASSET_CATALOG.filter(entry =>
    entry.modelIds.some(id => String(id) === needle || String(id) === 'default')
  );
}

export function assetIsDownloadable(asset: ComfyCatalogAsset): boolean {
  return Boolean(asset.url && isAllowlistedAssetUrl(asset.url));
}

export function catalogAssetsByKind(
  kind: ComfyAssetKind,
  catalog: readonly ComfyCatalogAsset[] = COMFY_ASSET_CATALOG
): ComfyCatalogAsset[] {
  return catalog.filter(entry => entry.kind === kind);
}
