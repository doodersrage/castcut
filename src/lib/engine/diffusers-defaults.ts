import { SUGGESTED_MODEL_CHECKPOINT_MAP } from '../model/checkpoint-map';

/** Preferred Diffusers default when no inventory/map entry exists (Qwen-first). */
export const DIFFUSERS_DEFAULT_MODEL = 'qwen_image_2512_fp8_e4m3fn.safetensors';
export const DIFFUSERS_DEFAULT_MODEL_BF16 = 'qwen_image_2512_bf16.safetensors';

const CHECKPOINT_FILE = /\.(safetensors|ckpt|pt|bin)$/i;

/**
 * Map a Studio model id onto a local weight filename for Diffusers.
 * Prefers the user's modelCheckpointMap, then suggested UNETs — never SDXL for Flux/Qwen aliases.
 */
export function resolveDiffusersModelHint(
  model?: string | null,
  checkpointMap?: Partial<Record<string, string>> | null
): string {
  const trimmed = model?.trim();
  if (!trimmed) {
    return DIFFUSERS_DEFAULT_MODEL;
  }
  if (CHECKPOINT_FILE.test(trimmed) || trimmed.includes('/')) {
    return trimmed;
  }
  const fromUserMap = checkpointMap?.[trimmed]?.trim();
  if (fromUserMap) {
    return fromUserMap;
  }
  const mapped = SUGGESTED_MODEL_CHECKPOINT_MAP[trimmed]?.trim();
  if (mapped) {
    return mapped;
  }
  return trimmed;
}

/**
 * Map a Diffusers inventory asset onto a Studio model id so workflow auto-select
 * and loader maps (UNET/VAE) keep working for Flux / Qwen.
 */
export function resolveStudioModelForDiffusersAsset(assetId: string, family?: string): string {
  const id = assetId.trim();
  const lower = id.toLowerCase();
  const fam = (family ?? '').toLowerCase();

  const isFlux = fam === 'flux' || /flux|klein/.test(lower);
  const isQwen = fam === 'qwen' || /qwen/.test(lower);

  if (isFlux) {
    if (/klein.*9b.*distill|distill.*klein.*9b|flux-2-klein-9b(?!.*base)/.test(lower)) {
      return 'flux-2-klein-9b-distilled';
    }
    if (/klein.*9b|9b.*klein/.test(lower)) {
      return 'flux-2-klein-9b';
    }
    if (/klein.*4b.*distill|distill.*klein.*4b|flux-2-klein-4b/.test(lower)) {
      return 'flux-2-klein-4b-distilled';
    }
    if (/klein/.test(lower)) {
      return 'flux-2-klein';
    }
    if (/schnell/.test(lower)) {
      return 'flux-schnell';
    }
    if (/ultrareal|ultra[_-]?real|danrisi/.test(lower)) {
      return 'flux-ultrareal-v4';
    }
    if (/flux.?2/.test(lower)) {
      return 'flux2';
    }
    return 'flux-dev';
  }

  if (isQwen) {
    if (/edit/.test(lower)) {
      if (/lightning.*8|8.?step/.test(lower)) {
        return 'qwen-image-edit-2511-lightning-8';
      }
      if (/lightning|4.?step/.test(lower)) {
        return 'qwen-image-edit-2511-lightning-4';
      }
      return 'qwen-image-edit-2511';
    }
    if (/rapid|aio/.test(lower)) {
      if (/nsfw/.test(lower)) {
        return 'qwen-rapid-aio-nsfw';
      }
      return 'qwen-rapid-aio-sfw';
    }
    if (/lightning.*8|8.?step/.test(lower)) {
      return 'qwen-image-2512-lightning-8';
    }
    if (/lightning|4.?step/.test(lower)) {
      return 'qwen-image-2512-lightning-4';
    }
    return 'qwen-image-2512';
  }

  // SDXL / other single-file: keep filename as the model id.
  return id;
}

export type DiffusersWorkshopCropMode = 'auto' | 'always' | 'never';

/** Studio setting → engine `workshop_crop` body field (`null` = auto-detect). */
export function workshopCropToApi(mode: DiffusersWorkshopCropMode | undefined): boolean | null {
  if (mode === 'always') {
    return true;
  }
  if (mode === 'never') {
    return false;
  }
  return null;
}
