import {
  getComfyModelDefinition,
  type ComfyImageModel,
  type ComfyModelCategory,
} from './comfy-models';
import type { CustomWorkflowToken, WorkflowParamValues } from './comfyui-config';
import {
  isBooguFamilyModel,
  isFlux1FamilyModel,
  isFluxKleinModel,
  isQwenRapidAioModel,
  isZImageModel,
} from './model-denoise-defaults';
import {
  defaultLoaderPrecisionTier,
  detectLoaderPrecisionTier,
  filenameMatchesPrecisionTier,
  precisionHintFromFilename,
  qwen2512UnetFilename,
  qwenDualClipFilename,
  qwenEdit2509UnetFilename,
  qwenEdit2511UnetFilename,
  qwenGenericUnetFilename,
  type LoaderPrecisionTier,
} from './model-loader-precision';
import { isQwenLightningModel } from './model-sampling-patch';

export type ModelLoaderFilenames = {
  checkpoint?: string;
  unet?: string;
  vae?: string;
  dualClip?: string;
};

export type ModelCheckpointMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelUnetMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelVaeMap = Partial<Record<ComfyImageModel | string, string>>;

export type ModelRefinerMap = Partial<Record<ComfyImageModel | string, string>>;

export const DEFAULT_CHECKPOINT_TOKEN = '{{CHECKPOINT}}';
export const DEFAULT_UNET_TOKEN = '{{UNET}}';
export const DEFAULT_VAE_TOKEN = '{{VAE}}';
export const DEFAULT_REFINER_TOKEN = '{{REFINER}}';

export const DEFAULT_SDXL_REFINER_CHECKPOINT = 'sd_xl_refiner_1.0.safetensors';

/** Suggested checkpoint/UNET filenames for common models (merged into Settings; user entries win). */
export const SUGGESTED_MODEL_CHECKPOINT_MAP: ModelCheckpointMap = {
  'qwen-image-2512': 'qwen_image_2512_fp8_e4m3fn.safetensors',
  // Lightning needs bf16 UNET on Comfy (fp8 tends to moiré/grid); keep base on fp8.
  'qwen-image-2512-lightning-4': 'qwen_image_2512_bf16.safetensors',
  'qwen-image-2512-lightning-8': 'qwen_image_2512_bf16.safetensors',
  'qwen-image-edit-2511': 'qwen_image_edit_2511_bf16.safetensors',
  'qwen-image-edit-2511-lightning-4': 'qwen_image_edit_2511_bf16.safetensors',
  'qwen-image-edit-2511-lightning-8': 'qwen_image_edit_2511_bf16.safetensors',
  'qwen-image-edit-2509': 'qwen_image_edit_2509_bf16.safetensors',
  'qwen-rapid-aio-edit': 'Qwen-Rapid-AIO-v21.safetensors',
  'qwen-rapid-aio-sfw': 'Qwen-Rapid-AIO-SFW-v23.safetensors',
  'qwen-rapid-aio-nsfw': 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
  'flux-2-klein': 'flux-2-klein-base-4b.safetensors',
  'flux-2-klein-4b-distilled': 'flux-2-klein-4b.safetensors',
  'flux-2-klein-9b': 'flux-2-klein-base-9b.safetensors',
  'flux-2-klein-9b-distilled': 'flux-2-klein-9b-distilled.safetensors',
  'flux-2-klein-9b-kv': 'flux-2-klein-9b-kv.safetensors',
  'flux-dev': 'flux1-dev.safetensors',
  'flux-ultrareal-v4': 'ultrarealFineTune_v4.safetensors',
  sdxl: 'sd_xl_base_1.0.safetensors',
  'sd3-medium': 'sd3_medium_incl_clips_t5xxlfp8.safetensors',
  'sd3-large': 'sd3_large_incl_clips_t5xxlfp8.safetensors',
  'sd3.5-large': 'sd3.5_large.safetensors',
  auraflow: 'aura_flow_0.3.safetensors',
  omnigen2: 'omnigen2.safetensors',
  hidream: 'hidream_i1_full_fp8.safetensors',
  'hidream-o1': 'hidream_o1_fp8.safetensors',
  lumina2: 'lumina2.safetensors',
  'pixart-alpha': 'PixArt-alpha.safetensors',
  'pixart-sigma': 'PixArt-Sigma-XL-2-1024-MS.safetensors',
  'sd15-instruct-pix2pix': 'instruct-pix2pix-00-22000.safetensors',
  'sdxl-instruct-pix2pix': 'instruct-pix2pix-00-22000.safetensors',
  'wan-video': 'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
  'wan-video-rapid-aio': 'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
  'wan-video-lightning-4': 'wan2.2-i2v-rapid-aio-v10-nsfw.safetensors',
  'hunyuan-video': 'hunyuan_video_t2v_720p_bf16.safetensors',
  'hunyuan-video-1.5': 'hunyuanvideo1.5_720p_t2v_fp16.safetensors',
  'ltx-video': 'ltxv-2b-0.9.8-distilled.safetensors',
  'ltx-video-2': 'ltx-2.3-22b-distilled.safetensors',
  'stable-audio': 'stable-audio-open-1.0.safetensors',
  'hunyuan-3d': 'hunyuan3d-dit-v2.safetensors',
  'z-image': 'z_image_bf16.safetensors',
  'z-image-turbo': 'z_image_turbo_bf16.safetensors',
  'boogu-image': 'boogu_image_base_bf16.safetensors',
  'boogu-image-turbo': 'boogu_image_turbo_bf16.safetensors',
  'boogu-image-edit': 'boogu_image_edit_bf16.safetensors',
  'boogu-image-edit-turbo': 'boogu_image_edit_turbo_bf16.safetensors',
};

export const SUGGESTED_MODEL_VAE_MAP: ModelVaeMap = {
  default: 'flux2-vae.safetensors',
  'flux-2-klein': 'flux2-vae.safetensors',
  'flux-2-klein-4b-distilled': 'flux2-vae.safetensors',
  'flux-2-klein-9b': 'flux2-vae.safetensors',
  'flux-2-klein-9b-distilled': 'flux2-vae.safetensors',
  'flux-2-klein-9b-kv': 'flux2-vae.safetensors',
  // Keep UltraReal in the sticky Settings map. FLUX.1 Dev/Schnell get ae via
  // suggestedVaeFilenameForModel() (not this map) so Settings merge won't leak
  // ae onto Qwen Edit as a default sticky VAE.
  'flux-ultrareal-v4': 'ae.safetensors',
  'qwen-image-2512': 'qwen_image_vae.safetensors',
  'qwen-image-2512-lightning-4': 'qwen_image_vae.safetensors',
  'qwen-image-2512-lightning-8': 'qwen_image_vae.safetensors',
  'qwen-image-edit-2511': 'qwen_image_vae.safetensors',
  'qwen-image-edit-2511-lightning-4': 'qwen_image_vae.safetensors',
  'qwen-image-edit-2511-lightning-8': 'qwen_image_vae.safetensors',
  'qwen-image-edit-2509': 'qwen_image_vae.safetensors',
  'hunyuan-video-1.5': 'hunyuanvideo15_vae_fp16.safetensors',
  'z-image': 'ae.safetensors',
  'z-image-turbo': 'ae.safetensors',
  'boogu-image': 'flux1_vae_bf16.safetensors',
  'boogu-image-turbo': 'flux1_vae_bf16.safetensors',
  'boogu-image-edit': 'flux1_vae_bf16.safetensors',
  'boogu-image-edit-turbo': 'flux1_vae_bf16.safetensors',
};

export const SUGGESTED_MODEL_REFINER_MAP: ModelRefinerMap = {
  default: DEFAULT_SDXL_REFINER_CHECKPOINT,
};

/** Merge suggested loader maps; explicit user entries win over suggestions. */
export function mergeSuggestedLoaderMaps(input?: {
  checkpointMap?: ModelCheckpointMap;
  vaeMap?: ModelVaeMap;
  refinerMap?: ModelRefinerMap;
}): {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelRefinerMap: ModelRefinerMap;
  addedCheckpointKeys: string[];
  addedVaeKeys: string[];
  addedRefinerKeys: string[];
} {
  const modelCheckpointMap = {
    ...SUGGESTED_MODEL_CHECKPOINT_MAP,
    ...input?.checkpointMap,
  };
  const modelVaeMap = {
    ...SUGGESTED_MODEL_VAE_MAP,
    ...input?.vaeMap,
  };
  const modelRefinerMap = {
    ...SUGGESTED_MODEL_REFINER_MAP,
    ...input?.refinerMap,
  };

  const addedCheckpointKeys = Object.keys(SUGGESTED_MODEL_CHECKPOINT_MAP).filter(
    key => !trimFilename(input?.checkpointMap?.[key])
  );
  const addedVaeKeys = Object.keys(SUGGESTED_MODEL_VAE_MAP).filter(
    key => !trimFilename(input?.vaeMap?.[key])
  );
  const addedRefinerKeys = Object.keys(SUGGESTED_MODEL_REFINER_MAP).filter(
    key => !trimFilename(input?.refinerMap?.[key])
  );

  return {
    modelCheckpointMap,
    modelVaeMap,
    modelRefinerMap,
    addedCheckpointKeys,
    addedVaeKeys,
    addedRefinerKeys,
  };
}

export function formatSuggestedLoaderMergeMessage(result: {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelRefinerMap: ModelRefinerMap;
  addedCheckpointKeys: string[];
  addedVaeKeys: string[];
  addedRefinerKeys: string[];
}): string {
  const checkpointCount = Object.keys(result.modelCheckpointMap).length;
  const vaeCount = Object.keys(result.modelVaeMap).length;
  const refinerCount = Object.keys(result.modelRefinerMap).length;
  const addedTotal =
    result.addedCheckpointKeys.length + result.addedVaeKeys.length + result.addedRefinerKeys.length;

  if (addedTotal === 0) {
    return `Loader maps already include all suggested entries (${checkpointCount} checkpoint, ${vaeCount} VAE, ${refinerCount} refiner). Edit the text areas below if your ComfyUI folder uses different filenames.`;
  }

  const parts: string[] = [];
  if (result.addedCheckpointKeys.length > 0) {
    parts.push(`${result.addedCheckpointKeys.length} checkpoint`);
  }
  if (result.addedVaeKeys.length > 0) {
    parts.push(`${result.addedVaeKeys.length} VAE`);
  }
  if (result.addedRefinerKeys.length > 0) {
    parts.push(`${result.addedRefinerKeys.length} refiner`);
  }

  return `Merged suggested loader maps — added ${parts.join(', ')} ${parts.length === 1 ? 'entry' : 'entries'} (${checkpointCount} checkpoint, ${vaeCount} VAE, ${refinerCount} refiner total). Review the text areas below.`;
}

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

/**
 * Phr00t Rapid AIO / Wan Rapid AIO merges are full checkpoints for CheckpointLoader,
 * not diffusion_models UNETs. Never write these into UNETLoader.unet_name.
 */
export function filenameLooksLikeCheckpointOnly(filename: string | undefined): boolean {
  const name = trimFilename(filename)?.toLowerCase();
  if (!name) {
    return false;
  }
  if (/rapid[\s_-]*aio/.test(name)) {
    return true;
  }
  if (/phr00t/.test(name) && /aio/.test(name)) {
    return true;
  }
  return false;
}

/** FLUX.1 Civitai fine-tunes — latent detail + heavy Max polish causes ghosting / melted anatomy. */
export function isFluxFineTuneCheckpointModel(
  model: ComfyImageModel | string | undefined
): boolean {
  return String(model ?? '').trim() === 'flux-ultrareal-v4';
}

function preferUnetCompatibleFilename(
  candidate: string | undefined,
  fallback?: string
): string | undefined {
  const trimmed = trimFilename(candidate);
  if (!trimmed || filenameLooksLikeCheckpointOnly(trimmed)) {
    return trimFilename(fallback);
  }
  return trimmed;
}

function resolveCustomTokenValue(
  token: string,
  customTokens?: CustomWorkflowToken[]
): string | undefined {
  if (!customTokens?.length) {
    return undefined;
  }
  const match = customTokens.find(entry => entry.token.trim() === token);
  return trimFilename(match?.value);
}

const CATEGORY_VAE_HINTS: Partial<Record<ComfyModelCategory, string>> = {
  // No blanket flux → ae: category covers Klein/FLUX.2 too; UltraReal has an
  // explicit map entry + registry vaeHint.
  sd3: 'sd3_vae.safetensors',
  sdxl: 'sdxl_vae.safetensors',
  qwen: 'qwen_image_vae.safetensors',
  'stable-diffusion': 'vae-ft-mse-840000-ema-pruned.safetensors',
};

/** Preferred VAE filename for queue/scaffold binding (UltraReal → ae, Klein/FLUX.2 → flux2-vae). */
export function suggestedVaeFilenameForModel(model: ComfyImageModel | string): string | undefined {
  const mapped = trimFilename(SUGGESTED_MODEL_VAE_MAP[model as ComfyImageModel]);
  if (mapped) {
    return mapped;
  }
  const def = getComfyModelDefinition(model);
  const fromHint = trimFilename(def?.vaeHint);
  if (fromHint) {
    return fromHint;
  }
  // UltraReal Fine-Tune v4 and classic FLUX.1 (Dev/Schnell/inpaint) use ae.
  if (isFluxFineTuneCheckpointModel(model) || isFlux1FamilyModel(model)) {
    return 'ae.safetensors';
  }
  if (isFluxKleinModel(model) || model === 'flux2') {
    return 'flux2-vae.safetensors';
  }
  if (def?.category) {
    return CATEGORY_VAE_HINTS[def.category];
  }
  return undefined;
}

/** True when a wired VAE cannot decode latents from the selected model (e.g. flux2-vae + FLUX.1). */
export function isVaeFilenameIncompatibleWithModel(
  model: ComfyImageModel | string,
  vaeFilename: string
): boolean {
  const actual = vaeFilename.trim().toLowerCase();
  if (!actual) {
    return false;
  }
  // ae is for UltraReal / FLUX.1 / Boogu / Z-Image — never leave it on Klein / FLUX.2 / Qwen.
  if (/^ae\.safetensors$/i.test(actual) && !isFluxFineTuneCheckpointModel(model)) {
    if (isBooguFamilyModel(model) || isZImageModel(model) || isFlux1FamilyModel(model)) {
      return false;
    }
    return true;
  }
  if (/^flux1_vae_bf16\.safetensors$/i.test(actual) && isBooguFamilyModel(model)) {
    return false;
  }
  const expected = suggestedVaeFilenameForModel(model);
  if (!expected?.trim()) {
    return false;
  }
  if (actual === expected.trim().toLowerCase()) {
    return false;
  }
  if (isFluxFineTuneCheckpointModel(model) && /flux2-vae/i.test(actual)) {
    return true;
  }
  if (isFlux1FamilyModel(model) && /flux2-vae/i.test(actual)) {
    return true;
  }
  // Qwen Image / Edit latents decoded with Flux ae or flux2-vae → gray mosaic garbage.
  const modelId = String(model);
  if (/qwen/i.test(modelId) && !isQwenRapidAioModel(modelId)) {
    if (/qwen.*vae/i.test(actual)) {
      return false;
    }
    if (
      /flux2-vae/i.test(actual) ||
      /sdxl_vae/i.test(actual) ||
      /sd3_vae/i.test(actual) ||
      /wan.*vae/i.test(actual)
    ) {
      return true;
    }
  }
  return false;
}

const DEFAULT_QWEN_VAE = 'qwen_image_vae.safetensors';

/** Default UNET/checkpoint filenames when registry hints are missing (matches common ComfyUI installs). */
function inferQwenLoaderHints(
  modelId: string,
  tier: LoaderPrecisionTier = defaultLoaderPrecisionTier()
): ModelLoaderFilenames {
  const id = modelId.toLowerCase();
  if (!id.includes('qwen')) {
    return {};
  }

  if (id.includes('qwen-rapid-aio') || id.includes('qwen_rapid_aio')) {
    const suggested =
      SUGGESTED_MODEL_CHECKPOINT_MAP[modelId] ??
      SUGGESTED_MODEL_CHECKPOINT_MAP[id] ??
      (id.includes('nsfw')
        ? SUGGESTED_MODEL_CHECKPOINT_MAP['qwen-rapid-aio-nsfw']
        : id.includes('sfw')
          ? SUGGESTED_MODEL_CHECKPOINT_MAP['qwen-rapid-aio-sfw']
          : SUGGESTED_MODEL_CHECKPOINT_MAP['qwen-rapid-aio-edit']);
    return {
      // Checkpoint-only family — never invent a UNET name from the Rapid AIO merge.
      checkpoint: suggested,
      vae: DEFAULT_QWEN_VAE,
    };
  }

  if (id.includes('qwen-image-2512') || id.includes('qwen_image_2512')) {
    const unet = qwen2512UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes('qwen-image-edit-2511') || id.includes('qwen_image_edit_2511')) {
    const unet = qwenEdit2511UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes('qwen-image-edit-2509') || id.includes('qwen_image_edit_2509')) {
    const unet = qwenEdit2509UnetFilename(tier);
    return {
      checkpoint: unet,
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes('qwen-image-edit') || id.includes('qwen_image_edit')) {
    const unet = qwenEdit2509UnetFilename(tier);
    return {
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  if (id.includes('qwen-image') || id.includes('qwen_image')) {
    const unet = qwenGenericUnetFilename(tier);
    return {
      unet,
      vae: DEFAULT_QWEN_VAE,
      dualClip: qwenDualClipFilename(tier),
    };
  }

  return { vae: DEFAULT_QWEN_VAE };
}

function inferZImageLoaderHints(modelId: string): ModelLoaderFilenames {
  const id = modelId.toLowerCase();
  if (!id.startsWith('z-image')) {
    return {};
  }
  if (id.includes('turbo')) {
    return {
      unet: 'z_image_turbo_bf16.safetensors',
      vae: 'ae.safetensors',
    };
  }
  return {
    unet: 'z_image_bf16.safetensors',
    vae: 'ae.safetensors',
  };
}

function inferBooguLoaderHints(modelId: string): ModelLoaderFilenames {
  const id = modelId.toLowerCase();
  if (!id.startsWith('boogu-image')) {
    return {};
  }
  const vae = pickBooguVaeFromInventory(null, { model: modelId });
  const isEdit = id.includes('edit');
  const isTurbo = id.includes('turbo');
  if (isEdit && isTurbo) {
    return { unet: 'boogu_image_edit_turbo_bf16.safetensors', vae };
  }
  if (isEdit) {
    return { unet: 'boogu_image_edit_bf16.safetensors', vae };
  }
  if (isTurbo) {
    return { unet: 'boogu_image_turbo_bf16.safetensors', vae };
  }
  return { unet: 'boogu_image_base_bf16.safetensors', vae };
}

/** Comfy-Org Boogu repack name first; ae.safetensors from Z-Image/FLUX also works. */
export const BOOGU_VAE_CANDIDATES = ['flux1_vae_bf16.safetensors', 'ae.safetensors'] as const;

export const BOOGU_TURBO_VAE_CANDIDATES = ['flux1_vae_bf16.safetensors', 'ae.safetensors'] as const;

export function pickBooguVaeFromInventory(
  vaes?: string[] | null,
  options?: { model?: string }
): string {
  const inventory = (vaes ?? []).map(name => name.trim()).filter(Boolean);
  const isTurbo = /boogu-image.*turbo/i.test(String(options?.model ?? '').trim());
  const candidates = isTurbo ? BOOGU_TURBO_VAE_CANDIDATES : BOOGU_VAE_CANDIDATES;
  for (const candidate of candidates) {
    if (inventory.includes(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

/**
 * Prefer bf16 Klein weights (no `-fp8` suffix). Official Comfy installs ship both;
 * fp8 is a VRAM fallback — map/settings can still force fp8 explicitly.
 */
function inferKleinLoaderHints(modelId: string): ModelLoaderFilenames {
  const id = modelId.toLowerCase();
  if (id.includes('flux-2-klein-9b-kv') || id.includes('klein-9b-kv')) {
    return {
      checkpoint: 'flux-2-klein-9b-kv.safetensors',
      unet: 'flux-2-klein-9b-kv.safetensors',
      dualClip: 'qwen_3_8b_fp8mixed.safetensors',
    };
  }
  if (id.includes('flux-2-klein-9b-distilled') || id.includes('flux-2-klein-9b-distill')) {
    return {
      checkpoint: 'flux-2-klein-9b-distilled.safetensors',
      unet: 'flux-2-klein-9b-distilled.safetensors',
      // Prefer bf16 Klein TE; fp8mixed is a VRAM fallback for Comfy.
      dualClip: 'flux2-klein-9b-base.safetensors',
    };
  }
  if (id.includes('flux-2-klein-9b')) {
    return {
      checkpoint: 'flux-2-klein-base-9b.safetensors',
      unet: 'flux-2-klein-base-9b.safetensors',
      dualClip: 'qwen_3_8b_fp8mixed.safetensors',
    };
  }
  if (id.includes('flux-2-klein-4b-distilled') || id.includes('flux-2-klein-4b-distill')) {
    return {
      checkpoint: 'flux-2-klein-4b.safetensors',
      unet: 'flux-2-klein-4b.safetensors',
      dualClip: 'qwen_3_4b.safetensors',
    };
  }
  if (id.includes('flux-2-klein')) {
    return {
      checkpoint: 'flux-2-klein-base-4b.safetensors',
      unet: 'flux-2-klein-base-4b.safetensors',
      dualClip: 'qwen_3_4b.safetensors',
    };
  }
  return {};
}

/** Prefer installed bf16 Klein filename when inventory lists both bf16 and fp8. */
export function preferKleinBf16FromInventory(
  preferred: string | undefined,
  inventory?: string[] | null
): string | undefined {
  const preferredName = preferred?.trim();
  if (!preferredName) {
    return undefined;
  }
  if (!inventory?.length) {
    return preferredName;
  }
  const trimmed = inventory.map(name => name.trim()).filter(Boolean);
  if (trimmed.includes(preferredName)) {
    return preferredName;
  }
  const fp8Variant = preferredName.replace(/\.safetensors$/i, '-fp8.safetensors');
  if (trimmed.includes(fp8Variant)) {
    return fp8Variant;
  }
  const withoutFp8 = preferredName.replace(/-fp8(?=\.safetensors$)/i, '');
  if (withoutFp8 !== preferredName && trimmed.includes(withoutFp8)) {
    return withoutFp8;
  }
  return preferredName;
}

function preferTierAlignedLoaderFilename(
  candidate: string | undefined,
  tier: LoaderPrecisionTier,
  fallback: string | undefined,
  workflowTier?: LoaderPrecisionTier
): string | undefined {
  const trimmed = trimFilename(candidate);
  if (!trimmed) {
    return fallback;
  }
  if (workflowTier && !filenameMatchesPrecisionTier(trimmed, workflowTier)) {
    return fallback;
  }
  if (!filenameMatchesPrecisionTier(trimmed, tier)) {
    return fallback;
  }
  return trimmed;
}

export function realignLoaderFilenamesToWorkflowPrecision(
  params: WorkflowParamValues,
  model: string,
  workflow: Record<string, unknown> | undefined,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    vaeMap?: ModelVaeMap;
    customTokens?: CustomWorkflowToken[];
    workflowCustomTokens?: CustomWorkflowToken[];
  }
): WorkflowParamValues {
  const workflowTier = workflow ? detectLoaderPrecisionTier(workflow) : undefined;
  const tier = isQwenLightningModel(model) ? 'bf16' : workflowTier;
  if (!tier || !model.trim()) {
    return params;
  }

  const aligned = resolveLoaderFilenamesForModel(model, {
    ...options,
    precisionTier: tier,
    workflow,
  });
  const next = { ...params };

  if (
    next.unetFilename?.toString().trim() &&
    !filenameMatchesPrecisionTier(next.unetFilename.toString(), tier)
  ) {
    if (aligned.unet) {
      next.unetFilename = aligned.unet;
    }
  }
  if (
    next.checkpointFilename?.toString().trim() &&
    !filenameMatchesPrecisionTier(next.checkpointFilename.toString(), tier)
  ) {
    if (aligned.checkpoint) {
      next.checkpointFilename = aligned.checkpoint;
    }
  }

  return next;
}

export function resolveLoaderFilenamesForModel(
  model: ComfyImageModel | string,
  options?: {
    checkpointMap?: ModelCheckpointMap;
    unetMap?: ModelUnetMap;
    vaeMap?: ModelVaeMap;
    customTokens?: CustomWorkflowToken[];
    /** Per-workflow tokens — beat modelCheckpointMap for CHECKPOINT/UNET/VAE. */
    workflowCustomTokens?: CustomWorkflowToken[];
    precisionTier?: LoaderPrecisionTier;
    workflow?: Record<string, unknown>;
    /** When set, Klein prefers installed bf16 weights and falls back to fp8 if needed. */
    availableCheckpoints?: string[] | null;
    availableUnets?: string[] | null;
    availableVaes?: string[] | null;
  }
): ModelLoaderFilenames {
  const workflowTier = options?.workflow ? detectLoaderPrecisionTier(options.workflow) : undefined;
  const tier = options?.precisionTier ?? workflowTier ?? defaultLoaderPrecisionTier();
  const def = getComfyModelDefinition(model);
  const inferred = {
    ...inferQwenLoaderHints(model, workflowTier ?? tier),
    ...inferKleinLoaderHints(model),
    ...inferZImageLoaderHints(model),
    ...inferBooguLoaderHints(model),
  };
  const mappedCheckpoint = trimFilename(options?.checkpointMap?.[model]);
  const mappedUnet = trimFilename(options?.unetMap?.[model]);
  const workflowCheckpoint = resolveCustomTokenValue(
    DEFAULT_CHECKPOINT_TOKEN,
    options?.workflowCustomTokens
  );
  const workflowUnet = resolveCustomTokenValue(DEFAULT_UNET_TOKEN, options?.workflowCustomTokens);
  const workflowVae = resolveCustomTokenValue(DEFAULT_VAE_TOKEN, options?.workflowCustomTokens);
  const customCheckpoint = resolveCustomTokenValue(DEFAULT_CHECKPOINT_TOKEN, options?.customTokens);
  const customUnet = resolveCustomTokenValue(DEFAULT_UNET_TOKEN, options?.customTokens);

  let checkpoint: string | undefined;
  let unet: string | undefined;

  if (workflowTier) {
    checkpoint =
      preferTierAlignedLoaderFilename(workflowCheckpoint, tier, undefined, workflowTier) ??
      preferTierAlignedLoaderFilename(mappedCheckpoint, tier, undefined, workflowTier) ??
      preferTierAlignedLoaderFilename(customCheckpoint, tier, undefined, workflowTier) ??
      trimFilename(def?.checkpointHint) ??
      inferred.checkpoint;
    unet =
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(workflowUnet, tier, undefined, workflowTier)
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(mappedUnet, tier, undefined, workflowTier)
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(mappedCheckpoint, tier, undefined, workflowTier)
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(customUnet, tier, undefined, workflowTier)
      ) ??
      preferUnetCompatibleFilename(
        preferTierAlignedLoaderFilename(checkpoint, tier, undefined, workflowTier)
      ) ??
      inferred.unet ??
      trimFilename(def?.unetHint);
  } else {
    checkpoint =
      workflowCheckpoint ??
      mappedCheckpoint ??
      customCheckpoint ??
      trimFilename(def?.checkpointHint) ??
      inferred.checkpoint;
    unet =
      preferUnetCompatibleFilename(workflowUnet) ??
      preferUnetCompatibleFilename(mappedUnet) ??
      preferUnetCompatibleFilename(mappedCheckpoint) ??
      preferUnetCompatibleFilename(customUnet) ??
      preferUnetCompatibleFilename(inferred.unet) ??
      preferUnetCompatibleFilename(trimFilename(def?.unetHint)) ??
      preferUnetCompatibleFilename(checkpoint);
  }
  const vae =
    workflowVae ??
    trimFilename(options?.vaeMap?.[model]) ??
    trimFilename(def?.vaeHint) ??
    suggestedVaeFilenameForModel(model);
  const resolvedVae = String(model).toLowerCase().startsWith('boogu-image')
    ? pickBooguVaeFromInventory(options?.availableVaes, { model: String(model) })
    : vae;

  const effectiveTier = precisionHintFromFilename(unet ?? checkpoint ?? '') ?? workflowTier ?? tier;

  const kleinInventory = [
    ...(options?.availableUnets ?? []),
    ...(options?.availableCheckpoints ?? []),
  ];
  const result: ModelLoaderFilenames = {};
  if (checkpoint) {
    result.checkpoint = isFluxKleinModel(model)
      ? (preferKleinBf16FromInventory(
          checkpoint,
          kleinInventory.length > 0 ? kleinInventory : null
        ) ?? checkpoint)
      : checkpoint;
  }
  if (unet) {
    result.unet = isFluxKleinModel(model)
      ? (preferKleinBf16FromInventory(unet, kleinInventory.length > 0 ? kleinInventory : null) ??
        unet)
      : unet;
  }
  if (resolvedVae) {
    result.vae = resolvedVae;
  }
  if (model.toLowerCase().includes('qwen')) {
    result.dualClip = qwenDualClipFilename(effectiveTier);
  } else if (inferred.dualClip) {
    result.dualClip = inferred.dualClip;
  } else {
    const clipHint = trimFilename(def?.clipHint);
    if (clipHint) {
      result.dualClip = clipHint;
    }
  }
  return result;
}

export function loaderFilenameCustomTokens(loaders: ModelLoaderFilenames): CustomWorkflowToken[] {
  const tokens: CustomWorkflowToken[] = [];
  if (loaders.checkpoint?.trim()) {
    tokens.push({ token: DEFAULT_CHECKPOINT_TOKEN, value: loaders.checkpoint.trim() });
  }
  if (loaders.unet?.trim()) {
    tokens.push({ token: DEFAULT_UNET_TOKEN, value: loaders.unet.trim() });
  }
  if (loaders.vae?.trim()) {
    tokens.push({ token: DEFAULT_VAE_TOKEN, value: loaders.vae.trim() });
  }
  return tokens;
}

/** Prefer official SDXL refiner, else any checkpoint whose name looks like a refiner. */
export function pickSdxlRefinerFromInventory(checkpoints?: string[] | null): string | undefined {
  if (!checkpoints?.length) {
    return undefined;
  }
  const trimmed = checkpoints.map(name => name.trim()).filter(Boolean);
  const preferred = trimmed.find(name => /sd_xl_refiner/i.test(name));
  if (preferred) {
    return preferred;
  }
  return trimmed.find(name => /refiner/i.test(name));
}

export function resolveRefinerFilenameForModel(
  model: ComfyImageModel | string,
  options?: {
    refinerMap?: ModelRefinerMap;
    customTokens?: CustomWorkflowToken[];
    availableCheckpoints?: string[] | null;
  }
): string | undefined {
  const def = getComfyModelDefinition(model);
  if (def.category !== 'sdxl' || model.toLowerCase().includes('refiner')) {
    return undefined;
  }

  const mapped =
    trimFilename(options?.refinerMap?.[model]) ??
    trimFilename(options?.refinerMap?.default) ??
    resolveCustomTokenValue(DEFAULT_REFINER_TOKEN, options?.customTokens) ??
    DEFAULT_SDXL_REFINER_CHECKPOINT;

  const inventory = options?.availableCheckpoints;
  if (inventory && inventory.length > 0) {
    if (mapped && inventory.includes(mapped)) {
      return mapped;
    }
    return pickSdxlRefinerFromInventory(inventory) ?? mapped;
  }

  return mapped;
}

export function formatModelCheckpointMap(map: ModelCheckpointMap | undefined): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .filter((entry): entry is [string, string] => Boolean(entry[1]?.trim()))
    .map(([modelId, filename]) => `${modelId}=${filename.trim()}`)
    .join('\n');
}

export function parseModelCheckpointMap(text: string): ModelCheckpointMap {
  const map: ModelCheckpointMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.includes('=') ? '=' : ':';
    const [modelId, ...rest] = trimmed.split(separator);
    const filename = rest.join(separator).trim();
    if (modelId?.trim() && filename) {
      map[modelId.trim()] = filename;
    }
  }
  return map;
}

export const formatModelVaeMap = formatModelCheckpointMap;
export const parseModelVaeMap = parseModelCheckpointMap;
export const formatModelRefinerMap = formatModelCheckpointMap;
export const parseModelRefinerMap = parseModelCheckpointMap;
