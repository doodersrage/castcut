import { isQwenLightningModel } from './model-sampling-patch';

export type LoaderPrecisionTier = 'fp8' | 'bf16';

const LOADER_STRING_FIELDS = [
  'unet_name',
  'ckpt_name',
  'vae_name',
  'clip_name',
  'clip_name1',
  'clip_name2',
  'model_name',
] as const;

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

export function precisionHintFromFilename(filename: string): LoaderPrecisionTier | undefined {
  const lower = filename.toLowerCase();
  if (/fp8|e4m3fn|fp8_scaled/.test(lower)) {
    return 'fp8';
  }
  if (/bf16|fp16|_f16/.test(lower)) {
    return 'bf16';
  }
  // Common Qwen installs omit a bf16 suffix — treat non-fp8 Qwen weights as bf16/fp16 tier.
  if (/qwen_image|qwen_2\.5_vl/.test(lower) && !/fp8|e4m3fn|fp8_scaled/.test(lower)) {
    return 'bf16';
  }
  return undefined;
}

export function filenameMatchesPrecisionTier(
  filename: string | undefined,
  tier: LoaderPrecisionTier
): boolean {
  if (!filename?.trim()) {
    return true;
  }
  const hint = precisionHintFromFilename(filename);
  return hint == null || hint === tier;
}

/** Infer fp8 vs bf16/fp16 tier already present in a workflow (before placeholder injection). */
export function detectLoaderPrecisionTier(
  workflow: Record<string, unknown>
): LoaderPrecisionTier | undefined {
  const tiers = new Set<LoaderPrecisionTier>();

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const inputs = (node as { inputs?: Record<string, unknown> }).inputs;
    if (!inputs) {
      continue;
    }

    for (const field of LOADER_STRING_FIELDS) {
      const value = inputs[field];
      if (typeof value !== 'string' || isUnresolvedWorkflowPlaceholder(value)) {
        continue;
      }
      const tier = precisionHintFromFilename(value);
      if (tier) {
        tiers.add(tier);
      }
    }
  }

  if (tiers.size === 0) {
    return undefined;
  }
  if (tiers.has('bf16')) {
    return 'bf16';
  }
  return 'fp8';
}

export function qwen2512UnetFilename(tier: LoaderPrecisionTier): string {
  return tier === 'fp8'
    ? 'qwen_image_2512_fp8_e4m3fn.safetensors'
    : 'qwen_image_2512_bf16.safetensors';
}

export function qwenEdit2511UnetFilename(tier: LoaderPrecisionTier): string {
  return tier === 'fp8'
    ? 'qwen_image_edit_2511_fp8_e4m3fn.safetensors'
    : 'qwen_image_edit_2511_bf16.safetensors';
}

export function qwenEdit2509UnetFilename(tier: LoaderPrecisionTier): string {
  return tier === 'fp8'
    ? 'qwen_image_edit_2509_fp8_e4m3fn.safetensors'
    : 'qwen_image_edit_2509_bf16.safetensors';
}

export function qwenGenericUnetFilename(tier: LoaderPrecisionTier): string {
  return tier === 'fp8' ? 'qwen_image_fp8_e4m3fn.safetensors' : 'qwen_image_2512_bf16.safetensors';
}

export function qwenDualClipFilename(tier: LoaderPrecisionTier): string {
  return tier === 'fp8' ? 'qwen_2.5_vl_7b_fp8_scaled.safetensors' : 'qwen_2.5_vl_7b.safetensors';
}

/** Qwen diffusion weight family — never cross-swap under precision alignment. */
export type QwenUnetFamily = 'edit-2511' | 'edit-2509' | 't2i' | 'unknown';

export function qwenUnetFamilyFromFilename(filename: string): QwenUnetFamily {
  const lower = filename.toLowerCase();
  if (/edit[_-]?2511/.test(lower)) {
    return 'edit-2511';
  }
  if (/edit[_-]?2509/.test(lower)) {
    return 'edit-2509';
  }
  if (/qwen_image_edit|qwen-image-edit/.test(lower)) {
    return 'edit-2511';
  }
  if (/qwen_image|2512|qwen-image/.test(lower)) {
    return 't2i';
  }
  return 'unknown';
}

export function qwenUnetFamiliesCompatible(a: string, b: string): boolean {
  const familyA = qwenUnetFamilyFromFilename(a);
  const familyB = qwenUnetFamilyFromFilename(b);
  if (familyA === 'unknown' || familyB === 'unknown') {
    return true;
  }
  return familyA === familyB;
}

/** Prefer bf16 when unknown — avoids fp8 UNET with bf16 CLIP in mixed workflows. */
export function defaultLoaderPrecisionTier(): LoaderPrecisionTier {
  return 'bf16';
}

/**
 * Qwen Lightning models whose UNET is pinned to bf16. 2512 Lightning is not: on its Lightning
 * LoRA the fp8 UNET rendered the same stills as bf16 (houndstooth, wet neon, skin; same seeds,
 * 2026-09-29) about 1.7× faster on a 24 GB card, where the 40.9 GB bf16 file offloads.
 */
export function qwenLightningPinsBf16Unet(model?: string | null): boolean {
  return (
    isQwenLightningModel(model ?? undefined) &&
    !/^qwen-image-2512-lightning-/i.test(String(model ?? '').trim())
  );
}

export function resolveLoaderPrecisionTier(input: {
  workflow?: Record<string, unknown>;
  explicit?: LoaderPrecisionTier;
  model?: string;
}): LoaderPrecisionTier {
  if (input.explicit) {
    return input.explicit;
  }

  if (qwenLightningPinsBf16Unet(input.model)) {
    return 'bf16';
  }

  const fromWorkflow = input.workflow ? detectLoaderPrecisionTier(input.workflow) : undefined;
  if (fromWorkflow) {
    return fromWorkflow;
  }

  return defaultLoaderPrecisionTier();
}

/** fp8 Edit 2511 UNETs, preferred first (Comfy-Org now ships `fp8mixed`). */
export const EDIT_2511_FP8_UNETS = [
  'qwen_image_edit_2511_fp8mixed.safetensors',
  'qwen_image_edit_2511_fp8_e4m3fn.safetensors',
] as const;
export const QWEN_VL_FP8_CLIP = 'qwen_2.5_vl_7b_fp8_scaled.safetensors';

function inventoryName(
  inventory: readonly string[] | null | undefined,
  wanted: string
): string | undefined {
  const lower = wanted.toLowerCase();
  return inventory?.find(name => {
    const base = name.split(/[\\/]/).pop()?.toLowerCase();
    return base === lower;
  });
}

/**
 * Edit 2511 Lightning on fp8 when ComfyUI has the files. bf16 (40.9 GB UNET + 16.6 GB text
 * encoder) does not fit a 24 GB card, so both were swapped in and out on every still: fp8 UNET +
 * fp8 text encoder ran the same stills in 25.9 s vs 45.8 s (4090, 2026-10-07), same dresses,
 * faces and skin, face distance 0.49 vs 0.53. Unknown inventory → the graph is left as it is.
 */
export function preferInstalledFp8ForEdit2511(
  workflow: Record<string, unknown>,
  model: string | null | undefined,
  inventory: {
    availableUnets?: readonly string[] | null;
    availableClips?: readonly string[] | null;
  }
): Record<string, unknown> {
  if (!/^qwen-image-edit-2511-lightning-/i.test(String(model ?? '').trim())) return workflow;
  const unet = EDIT_2511_FP8_UNETS.map(name => inventoryName(inventory.availableUnets, name)).find(
    Boolean
  );
  if (!unet) return workflow;
  const clip = inventoryName(inventory.availableClips, QWEN_VL_FP8_CLIP);
  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  for (const node of Object.values(next)) {
    const inputs = node?.inputs;
    if (!inputs) continue;
    if (
      node.class_type === 'UNETLoader' &&
      typeof inputs.unet_name === 'string' &&
      qwenUnetFamilyFromFilename(inputs.unet_name) === 'edit-2511' &&
      precisionHintFromFilename(inputs.unet_name) !== 'fp8'
    ) {
      inputs.unet_name = unet;
    }
    if (
      clip &&
      (node.class_type === 'CLIPLoader' || node.class_type === 'DualCLIPLoader') &&
      typeof inputs.clip_name === 'string' &&
      /^qwen_2\.5_vl_7b(?:_bf16)?\.safetensors$/i.test(inputs.clip_name.split(/[\\/]/).pop() ?? '')
    ) {
      inputs.clip_name = clip;
    }
  }
  return next;
}
