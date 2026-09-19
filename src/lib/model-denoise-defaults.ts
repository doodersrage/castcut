import { getComfyModelDefinition, type ComfyImageModel } from './comfy-models/client';
import { isQwenLightningModel, isWanLightningModel } from './model-sampling-patch';

export const DEFAULT_EDIT_DENOISE = 0.65;

/**
 * Z-Image Turbo is 8-step CFG 1 — generic 0.65 rewrite (~5 of 8 steps) jumps
 * identity. Strength chips span ~1 / ~3 / ~5 of those steps so Gentle and
 * Strong actually look different.
 */
export type ZImageTurboImg2imgStrength = 'gentle' | 'balanced' | 'strong';

export const Z_IMAGE_TURBO_IMG2IMG_DENOISE: Record<ZImageTurboImg2imgStrength, number> = {
  gentle: 0.16,
  balanced: 0.36,
  strong: 0.58,
};

/**
 * Classic VAEEncode img2img (FLUX.1, Qwen T2I, Z-Image Base, SDXL, …).
 * Longer samplers than Turbo — bands sit around the old 0.65 default so
 * Gentle / Strong actually look different.
 */
export const SOFT_IMG2IMG_STRENGTH_DENOISE: Record<ZImageTurboImg2imgStrength, number> = {
  gentle: 0.28,
  balanced: 0.55,
  strong: 0.78,
};

export const DEFAULT_Z_IMAGE_TURBO_IMG2IMG_DENOISE = Z_IMAGE_TURBO_IMG2IMG_DENOISE.balanced;

/** @deprecated Use DEFAULT_Z_IMAGE_TURBO_IMG2IMG_DENOISE — compose no longer special-cases 0.42. */
export const DEFAULT_Z_IMAGE_TURBO_COMPOSE_DENOISE = DEFAULT_Z_IMAGE_TURBO_IMG2IMG_DENOISE;

export const DEFAULT_INPAINT_DENOISE = 0.75;

/**
 * Masked inpaint — bands sit around the 0.75 default so Gentle / Strong
 * actually look different without blowing the unmasked frame.
 */
export const INPAINT_STRENGTH_DENOISE: Record<ZImageTurboImg2imgStrength, number> = {
  gentle: 0.55,
  balanced: 0.75,
  strong: 0.9,
};

/**
 * Outpaint / expand — bands sit around the 0.85 default. Strong can fill
 * a larger border; Gentle keeps more of the original canvas.
 */
export const OUTPAINT_STRENGTH_DENOISE: Record<ZImageTurboImg2imgStrength, number> = {
  gentle: 0.65,
  balanced: 0.85,
  strong: 0.95,
};

/**
 * FLUX.2 Klein instruction edit uses ReferenceLatent + EmptyFlux2Latent at
 * denoise 1 (official Comfy path). Soft img2img denoise is the wrong mechanism.
 */
export const DEFAULT_KLEIN_EDIT_DENOISE = 1;

const EDIT_TOOLS = new Set([
  'refine',
  'image-prompt',
  'controlnet',
  'inpaint',
  'outpaint',
  'compose',
]);

/** SharedToolControls uses camelCase tool ids in a few places. */
const EDIT_TOOL_ALIASES: Record<string, string> = {
  imagePrompt: 'image-prompt',
};

export function normalizeEditQueueToolId(tool?: string): string | undefined {
  const id = tool?.trim();
  if (!id) {
    return undefined;
  }
  return EDIT_TOOL_ALIASES[id] ?? id;
}

export const DEFAULT_OUTPAINT_DENOISE = 0.85;

function clampDenoise(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_EDIT_DENOISE;
  }
  return Math.min(1, Math.max(0.05, value));
}

function isVideoCategoryModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (def?.category === 'video') {
    return true;
  }
  return /-(video)$/i.test(String(model));
}

export function isEditCapableModel(model: ComfyImageModel | string): boolean {
  const def = getComfyModelDefinition(model);
  if (!def) {
    return /edit|inpaint|ip2p|pix2pix/i.test(model);
  }
  if (def.category === 'instruct-edit') {
    return true;
  }
  if (def.profile === 'qwen_edit' || def.profile === 'qwen_edit_instruction') {
    return true;
  }
  if (
    model === 'flux-inpaint' ||
    model === 'qwen-rapid-aio-edit' ||
    model === 'qwen-rapid-aio-edit-nsfw'
  ) {
    return true;
  }
  // Rapid AIO SFW/NSFW are T2I-first dual-purpose checkpoints — not edit-primary.
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(String(model))) {
    return false;
  }
  return /edit|inpaint/i.test(model);
}

/** Phr00t Rapid AIO single-file checkpoints (SFW / NSFW / Edit). */
export function isQwenRapidAioModel(model?: string): boolean {
  return /^qwen-rapid-aio-/i.test(String(model ?? '').trim());
}

/**
 * Rapid AIO still uses Image 3 for pose unlock — keep attaching the guide PNG.
 * Leak fixes live in outline draw style + skipping ReferenceLatent for that slot.
 */
export function modelAttachesPoseGuideImage(_model?: string | null): boolean {
  return true;
}

/** Phr00t WAN Rapid All-In-One — CFG-1 distilled video checkpoint (no Lightning LoRA). */
export function isWanRapidAioModel(model?: string): boolean {
  const id = String(model ?? '').trim();
  if (!id) {
    return false;
  }
  if (id === 'wan-video-rapid-aio') {
    return true;
  }
  return /wan.*rapid[\s_-]*aio/i.test(id);
}

/** Any Phr00t Rapid AIO stack (Qwen stills or WAN video). */
export function isRapidAioModel(model?: string): boolean {
  return isQwenRapidAioModel(model) || isWanRapidAioModel(model);
}

export function isBooguImageModel(model: ComfyImageModel | string | null | undefined): boolean {
  const id = String(model ?? '').trim();
  return id === 'boogu-image' || id === 'boogu-image-turbo';
}

export function isBooguImageTurboModel(
  model: ComfyImageModel | string | null | undefined
): boolean {
  return String(model ?? '').trim() === 'boogu-image-turbo';
}

export function isBooguEditModel(model: ComfyImageModel | string | null | undefined): boolean {
  const id = String(model ?? '').trim();
  return id === 'boogu-image-edit' || id === 'boogu-image-edit-turbo';
}

export function isBooguEditTurboModel(model: ComfyImageModel | string | null | undefined): boolean {
  return String(model ?? '').trim() === 'boogu-image-edit-turbo';
}

/** T2I or Edit distilled turbo — CFG 1, empty negative, no AuraFlow. */
export function isBooguTurboModel(model: ComfyImageModel | string | null | undefined): boolean {
  return isBooguImageTurboModel(model) || isBooguEditTurboModel(model);
}

export function isBooguFamilyModel(model: ComfyImageModel | string | null | undefined): boolean {
  return /^boogu-image/i.test(String(model ?? '').trim());
}

export function isQwenEditModel(model: ComfyImageModel | string): boolean {
  if (isBooguEditModel(model)) {
    return false;
  }
  const def = getComfyModelDefinition(model);
  if (def?.profile === 'qwen_edit' || def?.profile === 'qwen_edit_instruction') {
    return true;
  }
  return /qwen.*edit|qwen-rapid-aio-edit/i.test(String(model));
}

/** FLUX.2 Klein family (4B/9B base + distilled) — Compose uses img2img + IP-Adapter. */
export function isFluxKleinModel(model: ComfyImageModel | string | null | undefined): boolean {
  return /flux-2-klein/i.test(String(model ?? ''));
}

/** Z-Image Base or Turbo T2I (UNETLoader + CLIPLoader lumina2 + Flux AE VAE). */
export function isZImageModel(model: ComfyImageModel | string | null | undefined): boolean {
  const id = String(model ?? '').trim();
  return id === 'z-image' || id === 'z-image-turbo';
}

export function isZImageTurboModel(model: ComfyImageModel | string | null | undefined): boolean {
  return String(model ?? '').trim() === 'z-image-turbo';
}

/** Refine / Image → Prompt / Compose — Figure 1 VAEEncode img2img (not Qwen ReferenceLatent). */
export function isZImageImg2imgQueueTool(tool?: string): boolean {
  const normalized = normalizeEditQueueToolId(tool);
  return normalized === 'refine' || normalized === 'image-prompt' || normalized === 'compose';
}

export function isZImageImg2imgEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (!isZImageModel(model) || options?.hasMaskImage || isInpaintModel(model)) {
    return false;
  }
  if (!isZImageImg2imgQueueTool(options?.tool)) {
    return false;
  }
  const tool = normalizeEditQueueToolId(options?.tool);
  return (
    tool === 'compose' ||
    tool === 'refine' ||
    tool === 'image-prompt' ||
    (Boolean(options?.hasInputImage) && tool != null && EDIT_TOOLS.has(tool))
  );
}

/**
 * FLUX.1 Dev / Schnell / fine-tunes (UltraReal, etc.) — DualCLIP type flux + ae.safetensors.
 * Excludes FLUX.2 Klein and flux2.
 */
export function isFlux1FamilyModel(model: ComfyImageModel | string | null | undefined): boolean {
  const id = String(model ?? '').trim();
  if (!id || isFluxKleinModel(id) || id === 'flux2') {
    return false;
  }
  const def = getComfyModelDefinition(id);
  return def?.category === 'flux';
}

/**
 * Multi-ref Compose / Transfer — Qwen Edit (image1–4 encode), FLUX.2 Klein
 * (ReferenceLatent instruction edit), Boogu Edit (TextEncodeBooguEdit vision
 * refs), or Z-Image (Figure 1 img2img; extras are prompt-only).
 */
export function isComposeCapableModel(model: ComfyImageModel | string | null | undefined): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  return (
    isQwenEditModel(model) ||
    isFluxKleinModel(model) ||
    isZImageModel(model) ||
    isBooguEditModel(model)
  );
}

/**
 * Models that can consume a reference image without a T2I overbake:
 * dedicated edit/inpaint checkpoints, plus Klein / Z-Image / Boogu Edit
 * img2img graphs.
 */
export function isImg2imgCapableModel(model: ComfyImageModel | string | null | undefined): boolean {
  if (!model?.toString().trim()) {
    return false;
  }
  return isEditCapableModel(model) || isComposeCapableModel(model);
}

export function isInpaintModel(model: ComfyImageModel | string): boolean {
  if (model === 'flux-inpaint') {
    return true;
  }
  return /inpaint/i.test(model);
}

export function isEditQueueTool(tool?: string): boolean {
  const normalized = normalizeEditQueueToolId(tool);
  return Boolean(normalized && EDIT_TOOLS.has(normalized));
}

/** True when Klein Compose/Refine should use ReferenceLatent edit (denoise 1). */
export function isKleinReferenceLatentEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (!isFluxKleinModel(model) || options?.hasMaskImage || isInpaintModel(model)) {
    return false;
  }
  return (
    options?.tool === 'compose' ||
    options?.tool === 'refine' ||
    options?.tool === 'image-prompt' ||
    (Boolean(options?.hasInputImage) && options?.tool != null && EDIT_TOOLS.has(options.tool))
  );
}

/** Boogu Edit Compose/Refine — TextEncodeBooguEdit reference latents (denoise 1). */
export function isBooguReferenceLatentEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (!isBooguEditModel(model) || options?.hasMaskImage || isInpaintModel(model)) {
    return false;
  }
  return (
    options?.tool === 'compose' ||
    options?.tool === 'refine' ||
    options?.tool === 'image-prompt' ||
    (Boolean(options?.hasInputImage) && options?.tool != null && EDIT_TOOLS.has(options.tool))
  );
}

/** Qwen Edit Compose/Refine with ReferenceLatent + EmptySD3Latent (denoise 1). */
export function isQwenReferenceLatentEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (!isQwenEditModel(model) || options?.hasMaskImage || isInpaintModel(model)) {
    return false;
  }
  return (
    options?.tool === 'compose' ||
    options?.tool === 'refine' ||
    options?.tool === 'image-prompt' ||
    (Boolean(options?.hasInputImage) && options?.tool != null && EDIT_TOOLS.has(options.tool))
  );
}

/** @deprecated Soft img2img is not used for Klein — kept for call-site compat. */
export function isKleinImg2imgEditContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  return isKleinReferenceLatentEditContext(model, options);
}

/** Distilled Klein stays CFG 1 on the ReferenceLatent edit path. */
export function resolveKleinEditCfg(
  _model: ComfyImageModel | string,
  _options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    currentCfg?: number;
  }
): number | undefined {
  return undefined;
}

/**
 * Lightning distilled recipes (including edit-2511 Lightning) expect denoise 1
 * with TextEncodeQwenImageEditPlus + EmptyLatent. Soft img2img denoise (0.65)
 * fights the LoRA and causes soft/garbled artifacts vs native ComfyUI — even
 * when a reference image is attached (refs go through the encode node, not VAEEncode).
 *
 * Rapid AIO is the same class of CFG-1 distilled checkpoint: T2I / TextEncode
 * paths need denoise 1. Soft denoise only for masked inpaint (true latent paint).
 */
export function resolveDenoiseForModel(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    override?: number;
    turboEditStrength?: ZImageTurboImg2imgStrength;
  }
): number | undefined {
  // Lightning must ignore Settings editDenoiseStrength / soft overrides.
  if (isQwenLightningModel(model) || isWanLightningModel(model) || isWanRapidAioModel(model)) {
    return 1;
  }

  if (isQwenRapidAioModel(model) && !isMaskedPaintStrengthContext(model, options)) {
    return 1;
  }

  // Video T2V/I2V should not reuse still-image soft edit denoise (0.65) —
  // that morphs limbs/objects across frames. Keep denoise 1 for video graphs.
  if (options?.tool === 'video' || isVideoCategoryModel(model)) {
    return 1;
  }

  // Generate is T2I-first — leftover init-image session state must not soft-denoise
  // the whole latent (0.65 mush). Soft denoise only for true edit tools / masks.
  if (options?.tool === 'generate' && !options?.hasMaskImage && !isInpaintModel(model)) {
    return 1;
  }

  // Klein Compose/Refine — ReferenceLatent + EmptyFlux2Latent (ignore soft edit denoise).
  if (isKleinReferenceLatentEditContext(model, options)) {
    return DEFAULT_KLEIN_EDIT_DENOISE;
  }

  // Qwen Edit Compose/Refine — ReferenceLatent + EmptySD3Latent (not soft img2img).
  if (isQwenReferenceLatentEditContext(model, options)) {
    return 1;
  }

  // Boogu Edit — TextEncodeBooguEdit reference latents (not soft img2img).
  if (isBooguReferenceLatentEditContext(model, options)) {
    return 1;
  }

  // Soft img2img / inpaint / outpaint — ignore Settings 0.65; chips pick the band.
  if (isSoftImg2imgStrengthContext(model, options)) {
    return resolveSoftStrengthDenoise(model, options);
  }

  if (options?.override != null && options.override.toString().trim() !== '') {
    return clampDenoise(Number(options.override));
  }

  const editContext =
    options?.hasInputImage ||
    options?.hasMaskImage ||
    (options?.tool ? EDIT_TOOLS.has(options.tool) : false) ||
    isEditCapableModel(model);

  if (!editContext) {
    return 1;
  }

  if (isInpaintModel(model) || options?.hasMaskImage || options?.tool === 'outpaint') {
    return options?.tool === 'outpaint' ? DEFAULT_OUTPAINT_DENOISE : DEFAULT_INPAINT_DENOISE;
  }

  return DEFAULT_EDIT_DENOISE;
}

/** Z-Image Turbo Refine / Image → Prompt / Compose — VAEEncode img2img, not instruction-edit. */
export function isZImageTurboSoftImg2imgContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  return isZImageTurboModel(model) && isZImageImg2imgEditContext(model, options);
}

/**
 * Classic VAEEncode img2img where Gentle / Balanced / Strong should move denoise.
 * Instruction-edit stacks (Qwen Edit, Klein, Boogu, Lightning, Rapid) stay at 1.
 */
export function isSoftImg2imgStrengthContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (isInstructionEditDenoiseContext(model, options)) {
    return false;
  }
  if (isQwenLightningModel(model) || isWanLightningModel(model) || isWanRapidAioModel(model)) {
    return false;
  }
  if (isQwenRapidAioModel(model) && !isMaskedPaintStrengthContext(model, options)) {
    return false;
  }
  if (options?.tool === 'video' || isVideoCategoryModel(model)) {
    return false;
  }
  if (options?.tool === 'generate' && !options?.hasMaskImage && !isInpaintModel(model)) {
    return false;
  }
  if (isMaskedPaintStrengthContext(model, options)) {
    return true;
  }
  if (isZImageImg2imgQueueTool(options?.tool)) {
    return true;
  }
  return Boolean(options?.hasInputImage) && isEditQueueTool(options?.tool);
}

export function isMaskedPaintStrengthContext(
  model?: ComfyImageModel | string | null,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  const tool = normalizeEditQueueToolId(options?.tool);
  if (tool === 'outpaint') {
    return true;
  }
  if (tool === 'inpaint' || options?.hasMaskImage) {
    return true;
  }
  return Boolean(model && isInpaintModel(model));
}

function resolveSoftStrengthDenoise(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    turboEditStrength?: ZImageTurboImg2imgStrength;
  }
): number {
  const strength = options?.turboEditStrength;
  if (isOutpaintStrengthTool(options?.tool)) {
    if (strength && strength in OUTPAINT_STRENGTH_DENOISE) {
      return OUTPAINT_STRENGTH_DENOISE[strength];
    }
    return OUTPAINT_STRENGTH_DENOISE.balanced;
  }
  if (isMaskedPaintStrengthContext(model, options)) {
    if (strength && strength in INPAINT_STRENGTH_DENOISE) {
      return INPAINT_STRENGTH_DENOISE[strength];
    }
    return INPAINT_STRENGTH_DENOISE.balanced;
  }
  if (isZImageTurboModel(model)) {
    if (strength && strength in Z_IMAGE_TURBO_IMG2IMG_DENOISE) {
      return Z_IMAGE_TURBO_IMG2IMG_DENOISE[strength];
    }
    return DEFAULT_Z_IMAGE_TURBO_IMG2IMG_DENOISE;
  }
  if (strength && strength in SOFT_IMG2IMG_STRENGTH_DENOISE) {
    return SOFT_IMG2IMG_STRENGTH_DENOISE[strength];
  }
  return SOFT_IMG2IMG_STRENGTH_DENOISE.balanced;
}

function isOutpaintStrengthTool(tool?: string): boolean {
  return normalizeEditQueueToolId(tool) === 'outpaint';
}

/**
 * ReferenceLatent instruction-edit (Klein/Qwen Compose/Refine, Lightning edit).
 * Soft img2img denoise from gallery handoff or Settings must not leak — only
 * sidebar KSampler denoise override may change the default (denoise 1).
 */
export function isInstructionEditDenoiseContext(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
  }
): boolean {
  if (options?.hasMaskImage || isInpaintModel(model)) {
    return false;
  }
  if (isKleinReferenceLatentEditContext(model, options)) {
    return true;
  }
  if (isQwenReferenceLatentEditContext(model, options)) {
    return true;
  }
  if (isBooguReferenceLatentEditContext(model, options)) {
    return true;
  }
  if (isQwenLightningModel(model) && isEditCapableModel(model) && isEditQueueTool(options?.tool)) {
    return true;
  }
  if (
    isQwenRapidAioModel(model) &&
    options?.tool != null &&
    EDIT_TOOLS.has(options.tool) &&
    !options.hasMaskImage
  ) {
    return true;
  }
  return false;
}

/** Queue denoise: sidebar override wins; instruction-edit resets to 1 (no handoff leak). */
export function resolveQueueDenoise(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    userDenoiseOverride?: string;
    handoffDenoise?: string | number;
    editDenoiseStrength?: number;
    turboEditStrength?: ZImageTurboImg2imgStrength;
  }
): string | number | undefined {
  const userOverride = options?.userDenoiseOverride?.toString().trim();
  if (userOverride) {
    return userOverride;
  }

  const context = {
    tool: options?.tool,
    hasInputImage: options?.hasInputImage,
    hasMaskImage: options?.hasMaskImage,
  };

  if (isInstructionEditDenoiseContext(model, context)) {
    return resolveDenoiseForModel(model, context);
  }

  // Soft img2img: ignore gallery handoff + Settings 0.65 — chips pick the band.
  if (isSoftImg2imgStrengthContext(model, context)) {
    return resolveDenoiseForModel(model, {
      ...context,
      turboEditStrength: options?.turboEditStrength,
    });
  }

  const handoff = options?.handoffDenoise?.toString().trim();
  if (handoff) {
    return handoff;
  }

  const denoise = resolveDenoiseForModel(model, {
    ...context,
    override:
      isQwenLightningModel(model) || isWanLightningModel(model)
        ? undefined
        : options?.editDenoiseStrength,
  });
  return denoise;
}

/**
 * Distilled Lightning/Rapid queue denoise: honor sidebar override and explicit
 * client params; only auto-force when missing or soft handoff (~0.65).
 */
export function resolveDistilledQueueDenoise(
  model: ComfyImageModel | string,
  options?: {
    tool?: string;
    hasInputImage?: boolean;
    hasMaskImage?: boolean;
    paramsDenoise?: string | number;
    userDenoiseOverride?: string;
  }
): string | number | undefined {
  const userOverride = options?.userDenoiseOverride?.toString().trim();
  if (userOverride) {
    return userOverride;
  }

  const forced = resolveDenoiseForModel(model, {
    tool: options?.tool,
    hasInputImage: options?.hasInputImage,
    hasMaskImage: options?.hasMaskImage,
  });

  const paramsDenoise = options?.paramsDenoise?.toString().trim();
  if (!paramsDenoise) {
    return forced;
  }

  const current = Number(paramsDenoise);
  const isSoftHandoff =
    forced === 1 && Number.isFinite(current) && Math.abs(current - DEFAULT_EDIT_DENOISE) < 0.001;
  if (isSoftHandoff) {
    return forced;
  }

  return paramsDenoise;
}
