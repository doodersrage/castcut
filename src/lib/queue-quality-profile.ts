import {
  isKleinBaseModel,
  normalizeModelSamplerPresetTier,
  type ModelSamplerPresetTier,
} from './model-sampler-defaults';
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveModelResolutionParams,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from './model-resolution-defaults';
import { loadSettingsCache } from './settings-cache';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import { isFluxKleinModel } from './model-denoise-defaults';

/** CFG-1 few-step T2I stacks (Boogu/Z-Image Turbo, etc.) — post upscale/sharpen over-cooks output. */
export function isDistilledFewStepImageModel(model?: string | null): boolean {
  const id = String(model ?? '').trim();
  return /^(z-image-turbo|boogu-image-turbo|boogu-image-edit-turbo|flux-schnell)$/i.test(id);
}

export type QueueQualityProfile = 'followSettings' | 'draft' | 'final' | 'max';

export const DEFAULT_QUEUE_QUALITY_PROFILE: QueueQualityProfile = 'followSettings';

export const QUEUE_QUALITY_PROFILE_OPTIONS: {
  id: QueueQualityProfile;
  label: string;
  description: string;
}[] = [
  {
    id: 'followSettings',
    label: 'Follow sidebar',
    description: 'Use the KSampler preset and resolution chips above as-is.',
  },
  {
    id: 'draft',
    label: 'Fast',
    description: 'Quick iteration — lighter sampler and a smaller canvas.',
  },
  {
    id: 'final',
    label: 'Good',
    description: 'Everyday keepers — stronger sampler and a medium-or-larger canvas.',
  },
  {
    id: 'max',
    label: 'Best',
    description: 'Highest quality — full sampler, largest canvas, and extra polish.',
  },
];

const SAMPLER_TIER_ORDER: ModelSamplerPresetTier[] = ['base', 'optimized', 'maxCompatible', 'max'];

const RESOLUTION_TIER_ORDER: ResolutionSizeTier[] = ['small', 'medium', 'max'];

function samplerTierRank(tier: ModelSamplerPresetTier): number {
  return SAMPLER_TIER_ORDER.indexOf(tier);
}

function resolutionTierRank(tier: ResolutionSizeTier): number {
  return RESOLUTION_TIER_ORDER.indexOf(tier);
}

export function normalizeQueueQualityProfile(value: unknown): QueueQualityProfile {
  if (value === 'followSettings' || value === 'draft' || value === 'final' || value === 'max') {
    return value;
  }
  return DEFAULT_QUEUE_QUALITY_PROFILE;
}

export function resolveEffectiveSamplerPreset(
  userPreset: ModelSamplerPresetTier | undefined,
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): ModelSamplerPresetTier {
  const user = normalizeModelSamplerPresetTier(userPreset);
  const mode = normalizeQueueQualityProfile(profile);

  let tier: ModelSamplerPresetTier;
  if (mode === 'followSettings') {
    tier = user;
  } else if (mode === 'draft') {
    tier = 'base';
  } else if (mode === 'final') {
    tier = SAMPLER_TIER_ORDER[Math.max(samplerTierRank(user), samplerTierRank('optimized'))]!;
  } else {
    // Max uses the full max sampler tier (steps/CFG ceiling), not maxCompatible.
    tier = SAMPLER_TIER_ORDER[Math.max(samplerTierRank(user), samplerTierRank('max'))]!;
  }

  return applyVideoSamplerQualityFloor(tier, options?.model);
}

/**
 * Full WAN / Hunyuan / LTX (and WAN Rapid AIO) keepers should not stay on Base —
 * Base undercooks motion continuity. Lightning is fixed 4-step so floor is a no-op.
 */
export function applyVideoSamplerQualityFloor(
  tier: ModelSamplerPresetTier,
  model?: string
): ModelSamplerPresetTier {
  const id = String(model ?? '').trim();
  if (!id || tier !== 'base') {
    return tier;
  }
  if (/wan.*lightning-(4|8)\b/i.test(id)) {
    return tier;
  }
  if (
    /^wan-video$/i.test(id) ||
    /wan.*rapid[\s_-]*aio/i.test(id) ||
    id === 'wan-video-rapid-aio' ||
    /^hunyuan-video/i.test(id) ||
    /^ltx-video/i.test(id)
  ) {
    return 'optimized';
  }
  return tier;
}

export function resolveEffectiveResolutionSizeTier(
  userTier: ResolutionSizeTier | undefined,
  profile: QueueQualityProfile | undefined
): ResolutionSizeTier {
  const user = normalizeResolutionSizeTier(userTier);
  const mode = normalizeQueueQualityProfile(profile);

  if (mode === 'followSettings') {
    return user;
  }
  if (mode === 'draft') {
    return RESOLUTION_TIER_ORDER[Math.min(resolutionTierRank(user), resolutionTierRank('medium'))]!;
  }
  if (mode === 'final') {
    return RESOLUTION_TIER_ORDER[Math.max(resolutionTierRank(user), resolutionTierRank('medium'))]!;
  }
  return 'max';
}

export function formatQueueQualityProfileLabel(profile: QueueQualityProfile | undefined): string {
  if (!profile || profile === 'followSettings') {
    return 'Follow sidebar';
  }
  return QUEUE_QUALITY_PROFILE_OPTIONS.find(entry => entry.id === profile)?.label ?? profile;
}
export function formatQueueQualityProfileHint(
  profile: QueueQualityProfile,
  userPreset: ModelSamplerPresetTier,
  userSizeTier: ResolutionSizeTier,
  options?: { neuralUpscaleAvailable?: boolean; model?: string; hasInputImage?: boolean }
): string | null {
  if (profile === 'followSettings') {
    return null;
  }

  const effectivePreset = resolveEffectiveSamplerPreset(userPreset, profile, {
    model: options?.model,
  });
  const model = options?.model?.trim() ?? '';
  const isRapid = /^qwen-rapid-aio-/i.test(model);
  const isWanRapid = /wan.*rapid[\s_-]*aio/i.test(model) || model === 'wan-video-rapid-aio';
  const isWanLightning = /wan.*lightning-(4|8)\b/i.test(model);
  const isLightning = /lightning-(4|8)\b/i.test(model) && !isWanLightning;
  const isDistilledTurbo = isDistilledFewStepImageModel(model);
  // Rapid T2I clamps Max→medium at queue time — don't advertise "max resolution".
  let effectiveSize = resolveEffectiveResolutionSizeTier(userSizeTier, profile);
  if (isRapid && effectiveSize === 'max') {
    effectiveSize = 'medium';
  }
  const option =
    QUEUE_QUALITY_PROFILE_OPTIONS.find(entry => entry.id === profile) ??
    QUEUE_QUALITY_PROFILE_OPTIONS[0];

  let upscaleNote = '';
  if (isRapid) {
    upscaleNote =
      profile === 'final' || profile === 'max'
        ? profile === 'max'
          ? ' · moiré polish (blur + mild resample) · no output upscale'
          : ' · moiré polish (soft blur) · no output upscale'
        : '';
  } else if (/qwen-image-2512-lightning/i.test(model)) {
    upscaleNote =
      profile === 'final' || profile === 'max'
        ? ' · native decode · soft blur polish · no upscale · CFG-1 short negatives'
        : ' · native decode · CFG-1 short negatives';
  } else if (/qwen-image-edit-2511-lightning/i.test(model)) {
    upscaleNote =
      profile === 'final' || profile === 'max'
        ? ' · Compose light Lanczos · T2I native · CFG-1 short negatives'
        : ' · CFG-1 short negatives';
  } else if (isWanLightning || isWanRapid) {
    upscaleNote = ' · CFG-1 short temporal negatives · simple motion prompts';
  } else if (isDistilledTurbo) {
    upscaleNote =
      profile === 'final' || profile === 'max'
        ? ` · mild Lanczos ~${upscaleScaleForProfile(profile, { model })}× · CFG-1 distilled (no neural)`
        : ' · CFG-1 distilled';
  } else if (isLightning) {
    upscaleNote =
      profile === 'final' || profile === 'max'
        ? profileSkipsOutputUpscaleForModel(profile, {
            model,
            hasInputImage: options?.hasInputImage,
          })
          ? ' · native decode (no Lanczos) · CFG-1 short negatives'
          : ' · Lanczos polish · CFG-1 short negatives'
        : ' · Fast (no Lanczos) · CFG-1 short negatives';
  } else if (isFluxFineTuneCheckpointModel(model) && profileUsesUpscaleEnrich(profile)) {
    upscaleNote =
      profile === 'max'
        ? ` · mild ~${upscaleScaleForProfile(profile, { model })}× (neural preferred, Lanczos fallback)`
        : ' · native decode (no Lanczos)';
  } else if (isFluxKleinModel(model) && profileUsesUpscaleEnrich(profile)) {
    upscaleNote = ` · mild Lanczos ~${upscaleScaleForProfile(profile, { model })}× (no neural)`;
  } else if (profileUsesUpscaleEnrich(profile)) {
    const targetScale = upscaleScaleForProfile(profile, { model });
    const usesNeural =
      options?.neuralUpscaleAvailable && profileUsesNeuralUpscaleEnrich(profile, { model });
    if (usesNeural) {
      upscaleNote = profileUsesNeuralUpscalePolish(profile, { model })
        ? ` · UpscaleModel → ~${targetScale}× (area) + Lanczos polish`
        : ` · UpscaleModel → ~${targetScale}× (area)`;
    } else if (/^qwen-image-2512$/i.test(model) || /^qwen-image-2\.0$/i.test(model)) {
      upscaleNote = ' · Lanczos upscale (chroma guard)';
    } else if (profileSkipsOutputUpscaleForModel(profile, { model })) {
      upscaleNote = ' · native decode (no output upscale)';
    } else {
      upscaleNote = ' · Lanczos upscale';
    }
  }

  const refinerNote =
    !isRapid && !isLightning && profileUsesSdxlRefinerEnrich(profile) && /^sdxl/i.test(model)
      ? ' · SDXL refiner pass'
      : '';
  const detailNote =
    !isRapid && !isLightning && profileUsesLatentDetailPass(profile, { model })
      ? ' · latent detail pass'
      : '';
  const sharpenNote =
    !isRapid &&
    !isLightning &&
    profile === 'max' &&
    options?.neuralUpscaleAvailable &&
    profileUsesNeuralUpscaleEnrich(profile, { model })
      ? ' · Best sharpen'
      : '';

  return `${option.label} queue → ${effectivePreset} sampler · ${effectiveSize} resolution${upscaleNote}${refinerNote}${detailNote}${sharpenNote} (sidebar: ${userPreset} · ${userSizeTier}).`;
}

export function resolveQueueQualityProfile(input: {
  tool?: string;
  override?: QueueQualityProfile;
  global?: QueueQualityProfile;
  toolProfiles?: Partial<Record<string, QueueQualityProfile>>;
  /** When set, Rapid AIO Draft is promoted to Final so moiré polish always runs. */
  model?: string;
}): QueueQualityProfile {
  if (input.override) {
    return normalizeQueueQualityProfile(input.override);
  }
  const tool = input.tool?.trim();
  const profile =
    tool && input.toolProfiles?.[tool]
      ? normalizeQueueQualityProfile(input.toolProfiles[tool])
      : normalizeQueueQualityProfile(input.global);

  // Draft skips Final/Max enrich (upscale, moiré, latent detail). Promote to Final
  // whenever a model is selected so system-workflow keepers get polish by default.
  // Explicit per-queue override: "draft" still wins (checked above).
  if (profile === 'draft' && input.model?.trim()) {
    return 'final';
  }
  if (profile === 'draft' && input.tool?.trim() === 'compose') {
    return 'final';
  }

  return profile;
}

/**
 * Short queue-status chips for the result panel (moiré polish, upscale skip, etc.).
 * Pure client-side — does not require API enrich change plumbing.
 */
export function formatQueuePipelineStatusNotes(input: {
  model?: string;
  qualityProfile?: QueueQualityProfile;
  tool?: string;
  /** When Max was downgraded to Final due to free VRAM. */
  vramDowngraded?: boolean;
  /** When 4–5★ remembered sampler params are active for this model. */
  samplerMemory?: boolean;
  /** System-workflow path: pack vs scaffold. */
  systemWorkflowSource?: 'pack' | 'scaffold';
  systemWorkflowLabel?: string;
  /** Compose/Transfer and other I2I queues — enables Edit Lightning Lanczos. */
  hasInputImage?: boolean;
}): string[] {
  const model = String(input.model ?? '').trim();
  const profile = normalizeQueueQualityProfile(input.qualityProfile);
  const notes: string[] = [];

  if (input.vramDowngraded) {
    notes.push('Best → Good (VRAM)');
  } else if (profile === 'final' || profile === 'max' || profile === 'draft') {
    notes.push(formatQueueQualityProfileLabel(profile));
  }

  if (input.samplerMemory) {
    notes.push('sampler memory');
  }

  if (input.systemWorkflowSource === 'pack') {
    const label = input.systemWorkflowLabel?.trim();
    notes.push(label ? `system pack · ${label}` : 'system pack');
  } else if (input.systemWorkflowSource === 'scaffold') {
    const label = input.systemWorkflowLabel?.trim();
    if (label && /·/.test(label)) {
      notes.push(label.replace(/^Built-in scaffold/i, 'system scaffold'));
    } else if (
      /^(wan|hunyuan|ltx)-video/i.test(model) ||
      /ltx/i.test(model) ||
      /wan-video/i.test(model)
    ) {
      notes.push(
        /ltx/i.test(model)
          ? 'system scaffold · LTX I2V needs pack'
          : input.hasInputImage
            ? 'system scaffold · I2V init set — prefer I2V pack for best motion'
            : 'system scaffold · prefer video pack for I2V'
      );
    } else {
      notes.push('system scaffold');
    }
  }

  if (/^qwen-rapid-aio-/i.test(model)) {
    if (profileUsesRapidAioMoirePolish(profile, { model })) {
      notes.push('moiré polish on');
      notes.push('upscale skipped (Rapid AIO)');
    } else {
      notes.push('moiré polish off (use Good/Best)');
    }
  } else if (/qwen-image-2512-lightning/i.test(model)) {
    notes.push('Lightning CFG-1 · short negatives');
    if (profile === 'final' || profile === 'max') {
      notes.push('native decode · soft blur (no upscale)');
    } else if (profile === 'draft') {
      notes.push('Fast · native decode');
    }
  } else if (/qwen-image-edit-2511-lightning/i.test(model)) {
    notes.push('Lightning CFG-1 · short negatives');
    if (profile === 'final' || profile === 'max') {
      if (input.hasInputImage === true) {
        notes.push('light Lanczos');
      } else {
        notes.push('native decode (no Lanczos)');
      }
    } else if (profile === 'draft') {
      notes.push('Fast · no Lanczos');
    }
  } else if (/wan.*lightning-(4|8)\b/i.test(model)) {
    notes.push('WAN Lightning · CFG-1 short temporal negatives');
  } else if (/wan.*rapid[\s_-]*aio/i.test(model) || model === 'wan-video-rapid-aio') {
    notes.push('WAN Rapid AIO · CFG-1 short temporal negatives');
  } else if (/lightning-(4|8)\b/i.test(model)) {
    notes.push('Lightning CFG-1 · short negatives');
    if (profile === 'final' || profile === 'max') {
      notes.push('Good/Best adds Lanczos');
    } else if (profile === 'draft') {
      notes.push('Fast · no Lanczos');
    }
  } else if (profile === 'final' || profile === 'max') {
    if (profileUsesLatentDetailPass(profile, { model })) {
      notes.push('latent detail pass');
    }
    if (profileUsesSdxlRefinerEnrich(profile) && /^sdxl/i.test(model)) {
      notes.push('SDXL refiner');
    }
    if (!profileSkipsOutputUpscaleForModel(profile, { model })) {
      notes.push(
        profileUsesNeuralUpscaleEnrich(profile, { model })
          ? `neural → ~${upscaleScaleForProfile(profile, { model })}×`
          : 'Lanczos upscale'
      );
    }
  }

  if (
    /qwen-image-edit-2511-lightning/i.test(model) &&
    (!input.tool ||
      /generate|format|topics|variations|character|pet|fantasy|duo|background/i.test(input.tool))
  ) {
    notes.push('Edit Lightning T2I · refs disconnected');
  }

  return notes;
}

/**
 * One-line size/quality path for sidebar preflight (EmptySD3 · 1328×1328 · Good · Lanczos 1.05× → ~1394).
 */
export function formatQueueSizeQualityExplain(input: {
  model?: string;
  qualityProfile?: QueueQualityProfile;
  width?: number;
  height?: number;
  orientation?: ResolutionOrientation;
  sizeTier?: ResolutionSizeTier;
  hasInputImage?: boolean;
  /** Expected latent class after queue prep (default EmptySD3 for Qwen/SD3). */
  latentClass?: string;
  /** When queue prep converts EmptyFlux2 → EmptySD3. */
  latentConvertedFrom?: string;
  systemWorkflowSource?: 'pack' | 'scaffold';
}): string {
  const model = String(input.model ?? '').trim();
  const profile = normalizeQueueQualityProfile(input.qualityProfile);
  const resolved =
    input.width != null &&
    input.height != null &&
    Number.isFinite(input.width) &&
    Number.isFinite(input.height) &&
    input.width > 0 &&
    input.height > 0
      ? { width: Math.round(input.width), height: Math.round(input.height) }
      : model
        ? resolveModelResolutionParams(
            model,
            normalizeResolutionOrientation(input.orientation),
            resolveEffectiveResolutionSizeTier(input.sizeTier, profile)
          )
        : {};
  const width = Number(resolved.width);
  const height = Number(resolved.height);
  const parts: string[] = [];

  const latent = input.latentClass?.trim() || (/qwen|sd3/i.test(model) ? 'EmptySD3' : 'latent');
  if (input.latentConvertedFrom?.trim()) {
    parts.push(`${latent} (from ${input.latentConvertedFrom.trim().replace(/LatentImage$/i, '')})`);
  } else {
    parts.push(latent.replace(/LatentImage$/i, '') || latent);
  }

  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    parts.push(`${width}×${height}`);
  }

  if (profile === 'draft' || profile === 'final' || profile === 'max') {
    parts.push(formatQueueQualityProfileLabel(profile));
  }

  const scale = upscaleScaleForProfile(profile, {
    model,
    hasInputImage: input.hasInputImage,
  });
  if (scale > 1.001 && Number.isFinite(width) && width > 0) {
    const outW = Math.round(width * scale);
    const outH = Math.round(height * scale);
    parts.push(`Lanczos ${scale}× → ~${outW}×${outH}`);
  } else if (profileUsesUpscaleEnrich(profile)) {
    parts.push('native decode');
  }

  if (input.systemWorkflowSource === 'pack') {
    parts.push('pack');
  } else if (input.systemWorkflowSource === 'scaffold') {
    parts.push('scaffold');
  }

  return parts.join(' · ');
}

export function profileUsesUpscaleEnrich(profile: QueueQualityProfile | undefined): boolean {
  const mode = normalizeQueueQualityProfile(profile);
  return mode === 'final' || mode === 'max';
}

/** Edit-2511 Lightning: Final/Max Lanczos enlarges soft mush / Max rings on CFG-1 — skip output upscale. */
export function profileSkipsOutputUpscaleForModel(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string; hasInputImage?: boolean }
): boolean {
  if (!profileUsesUpscaleEnrich(profile)) {
    return false;
  }
  const model = options?.model?.trim() ?? '';
  if (/^qwen-rapid-aio-/i.test(model)) {
    return true;
  }
  // UltraReal Fine-Tune: Final stays native (Lanczos plastics skin). Max uses mild neural/Lanczos.
  if (isFluxFineTuneCheckpointModel(model)) {
    return normalizeQueueQualityProfile(profile) !== 'max';
  }
  // Edit-2511 Lightning T2I: skip Final/Max Lanczos (enlarges soft mush).
  // Compose I2I keeps a light polish pass (see upscaleScaleForProfile).
  if (/qwen-image-edit-2511-lightning/i.test(model) && options?.hasInputImage !== true) {
    return true;
  }
  // Qwen 2512 Lightning T2I: post-decode Lanczos/UltraSharp hardens wet streets and skin.
  if (/qwen-image-2512-lightning/i.test(model) && options?.hasInputImage !== true) {
    return true;
  }
  // Klein / Boogu·Z-Image Turbo: mild Lanczos is allowed (see upscaleScaleForProfile);
  // neural stays off via profileUsesNeuralUpscaleEnrich.
  return false;
}

export function upscaleScaleForProfile(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string; hasInputImage?: boolean }
): number {
  const mode = normalizeQueueQualityProfile(profile);
  if (profileSkipsOutputUpscaleForModel(profile, options)) {
    return 1;
  }
  // Edit Lightning Compose I2I: light Lanczos only (VAE mosaic was ae mismatch).
  if (
    options?.model &&
    /qwen-image-edit-2511-lightning/i.test(options.model) &&
    options.hasInputImage === true
  ) {
    return mode === 'max' ? 1.08 : 1.05;
  }
  // Other Lightning (T2I 2512, etc.): gentle Lanczos only — keep finals near-native
  // so Max does not balloon past ~1.5k on a 1328 canvas.
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return mode === 'max' ? 1.12 : 1.08;
  }
  // Boogu / Z-Image Turbo / Schnell: light Lanczos only — neural over-sharpens CFG-1.
  if (options?.model && isDistilledFewStepImageModel(options.model)) {
    return mode === 'max' ? 1.12 : 1.08;
  }
  // FLUX.2 Klein: mild Lanczos only (neural plastics skin / fries distilled).
  if (options?.model && isFluxKleinModel(options.model)) {
    return mode === 'max' ? 1.15 : 1.08;
  }
  // UltraReal Max: mild neural target — enough to recover soft VAE decode without
  // the old 1.5× Lanczos mush.
  if (options?.model && isFluxFineTuneCheckpointModel(options.model)) {
    return mode === 'max' ? 1.35 : 1;
  }
  // Vanilla Qwen: keep Max at Final-scale Lanczos (~1.25×) for safer chroma.
  if (
    options?.model &&
    (/^qwen-image-2512$/i.test(options.model) || /^qwen-image-2\.0$/i.test(options.model))
  ) {
    return 1.25;
  }
  return mode === 'max' ? 1.5 : 1.25;
}

/** Most ESRGAN / UltraSharp / Siax models are 4×; used to land on Final/Max target scale. */
export const ASSUMED_NEURAL_UPSCALE_FACTOR = 4;

/** Parse 2×/4×/8× from common UpscaleModel filenames (`4x-UltraSharp`, `RealESRGAN_x2plus`). */
export function parseNeuralUpscaleFactor(filename?: string): number {
  const name = filename?.trim() ?? '';
  if (!name) {
    return ASSUMED_NEURAL_UPSCALE_FACTOR;
  }
  const match = name.match(/(\d)\s*[xX]|[xX]\s*(\d)/);
  const factor = Number(match?.[1] ?? match?.[2]);
  if (factor === 2 || factor === 4 || factor === 8) {
    return factor;
  }
  return ASSUMED_NEURAL_UPSCALE_FACTOR;
}

/**
 * After a neural UpscaleModel, scale to Final/Max target (≈1.25× / 1.5×) so
 * output matches Lanczos intent instead of the raw model factor (~2×/4×).
 * When a Lanczos polish scale follows, bake it in so the net size stays exact.
 * `priorLatentScale` accounts for SDXL refiner / latent detail already applied
 * before decode (so net ≠ latent × neural).
 */
export function neuralTargetScaleAfterUpscale(
  profile: QueueQualityProfile | undefined,
  options?: {
    model?: string;
    neuralFactor?: number;
    polishScale?: number;
    priorLatentScale?: number;
  }
): number {
  const target = upscaleScaleForProfile(profile, options);
  const factor = options?.neuralFactor ?? ASSUMED_NEURAL_UPSCALE_FACTOR;
  const polish = options?.polishScale != null && options.polishScale > 1 ? options.polishScale : 1;
  const prior =
    options?.priorLatentScale != null && options.priorLatentScale > 1
      ? options.priorLatentScale
      : 1;
  if (!(factor > 0) || !(target > 0) || !(polish > 0) || !(prior > 0)) {
    return 1;
  }
  return Math.round((target / factor / polish / prior) * 10000) / 10000;
}

/**
 * Lanczos (or soft) output scale after a Castcut latent pass so net size
 * matches Final/Max target instead of compounding with refiner/detail.
 */
export function outputUpscaleScaleAfterLatent(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string; priorLatentScale?: number; hasInputImage?: boolean }
): number {
  const target = upscaleScaleForProfile(profile, options);
  const prior =
    options?.priorLatentScale != null && options.priorLatentScale > 1
      ? options.priorLatentScale
      : 1;
  if (!(target > 0) || !(prior > 0)) {
    return 1;
  }
  const scale = target / prior;
  if (scale <= 1.001) {
    return 1;
  }
  return Math.round(scale * 10000) / 10000;
}

/** Lightning Final/Max use Lanczos now that native generate is clean. */
export function upscaleMethodForProfile(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): 'lanczos' | 'area' | 'bilinear' {
  void profile;
  void options;
  return 'lanczos';
}

/** Neural UpscaleModel + Lanczos polish amplify texture on Lightning — use soft ImageScaleBy only. */
export function profileUsesNeuralUpscaleEnrich(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): boolean {
  if (!profileUsesUpscaleEnrich(profile)) {
    return false;
  }
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return false;
  }
  if (options?.model && isDistilledFewStepImageModel(options.model)) {
    return false;
  }
  // Vanilla 2512 / 2.0: Lanczos only on Final and Max — neural 4× pushes chroma and
  // can amplify any residual anatomy noise after latent-detail was disabled.
  if (
    options?.model &&
    (/^qwen-image-2512$/i.test(options.model) || /^qwen-image-2\.0$/i.test(options.model))
  ) {
    return false;
  }
  if (isFluxFineTuneCheckpointModel(options?.model)) {
    // Max only — mild UltraSharp recovery; Final stays native decode.
    return normalizeQueueQualityProfile(profile) === 'max';
  }
  // All Klein (Base + Distilled): Lanczos only — neural plastics / fries CFG-1.
  if (isFluxKleinModel(options?.model ?? '')) {
    return false;
  }
  return true;
}

/** Small Lanczos pass chained after neural UpscaleModel on Max profile. */
export function lanczosPolishScaleAfterNeural(options?: { model?: string }): number {
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return 1;
  }
  if (isFluxFineTuneCheckpointModel(options?.model)) {
    return 1;
  }
  if (isFluxKleinModel(options?.model ?? '')) {
    return 1;
  }
  return 1.05;
}

export function profileUsesNeuralUpscalePolish(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): boolean {
  if (options?.model && /lightning-(4|8)\b/i.test(options.model)) {
    return false;
  }
  if (options?.model && isDistilledFewStepImageModel(options.model)) {
    return false;
  }
  if (isFluxFineTuneCheckpointModel(options?.model)) {
    return false;
  }
  if (isFluxKleinModel(options?.model ?? '')) {
    return false;
  }
  return normalizeQueueQualityProfile(profile) === 'max';
}

export function profileUsesSdxlRefinerEnrich(profile: QueueQualityProfile | undefined): boolean {
  const mode = normalizeQueueQualityProfile(profile);
  return mode === 'final' || mode === 'max';
}

export function sdxlRefinerLatentScaleForProfile(profile: QueueQualityProfile | undefined): number {
  return normalizeQueueQualityProfile(profile) === 'max' ? 1.5 : 1.25;
}

export function sdxlRefinerDenoiseForProfile(profile: QueueQualityProfile | undefined): number {
  return normalizeQueueQualityProfile(profile) === 'max' ? 0.3 : 0.22;
}

/**
 * Soft latent detail pass for Flux Final/Max (not Lightning, Rapid, SDXL, vanilla Qwen).
 * Mild LatentUpscaleBy + low-denoise second KSampler before VAEDecode.
 * Vanilla Qwen 2512 / 2.0 skip this — the second pass melts complex anatomy.
 */
export function profileUsesLatentDetailPass(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): boolean {
  if (!profileUsesUpscaleEnrich(profile)) {
    return false;
  }
  const model = options?.model?.trim() ?? '';
  if (!model) {
    return false;
  }
  if (
    /lightning-(4|8)\b/i.test(model) ||
    /^qwen-rapid-aio-/i.test(model) ||
    /distilled|schnell|z-image-turbo|boogu-image-turbo|boogu-image-edit-turbo/i.test(model)
  ) {
    return false;
  }
  if (/edit/i.test(model) && /qwen|flux/i.test(model)) {
    return false;
  }
  // SDXL already has a dedicated refiner enrich path.
  if (/^sdxl/i.test(model) || model === 'sdxl') {
    return false;
  }
  // Vanilla Qwen: image-space Final/Max upscale only — latent hires-fix
  // (1.12–1.2× + denoise 0.14–0.2) warps limbs/clothing on hard poses.
  if (/^qwen-image-2512$/i.test(model) || /^qwen-image-2\.0$/i.test(model)) {
    return false;
  }
  // Civitai FLUX.1 fine-tunes: one KSampler pass at 30–50 steps — latent hires-fix
  // adds edge ghosting and warped limbs (author notes v4 hands are already fragile).
  if (isFluxFineTuneCheckpointModel(model)) {
    return false;
  }
  // FLUX.2 Klein Base: latent detail softens skin into plastic and melts hands.
  if (isKleinBaseModel(model)) {
    return false;
  }
  return /^flux/i.test(model);
}

export function latentDetailScaleForProfile(profile: QueueQualityProfile | undefined): number {
  return normalizeQueueQualityProfile(profile) === 'max' ? 1.2 : 1.12;
}

export function latentDetailDenoiseForProfile(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): number {
  const isMax = normalizeQueueQualityProfile(profile) === 'max';
  const model = options?.model?.trim() ?? '';
  // Vanilla Qwen re-cooks at CFG ~3.2–3.5 — keep the second pass softer so
  // chroma doesn't climb into oversaturation (Flux stays on the prior ladder).
  if (/^qwen-image-2512$/i.test(model) || /^qwen-image-2\.0$/i.test(model)) {
    return isMax ? 0.2 : 0.14;
  }
  return isMax ? 0.28 : 0.2;
}

/** Tiled neural upscale on Max reduces VRAM spikes on large outputs (0 = no tiling). */
export function neuralUpscaleTileSizeForProfile(profile: QueueQualityProfile | undefined): number {
  if (normalizeQueueQualityProfile(profile) !== 'max') {
    return 0;
  }
  const override = loadSettingsCache().shared.neuralUpscaleTileSize;
  if (typeof override === 'number' && override >= 0) {
    return override;
  }
  return 512;
}

export function profileUsesSharpenAfterUpscale(profile: QueueQualityProfile | undefined): boolean {
  return normalizeQueueQualityProfile(profile) === 'max';
}

/**
 * Max sharpen only after neural UpscaleModel — Lanczos-only paths stay soft.
 * Skin/Qwen stacks get a lighter alpha to avoid wax.
 */
export function profileUsesSharpenAfterNeuralUpscale(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string; afterNeural?: boolean }
): boolean {
  if (!profileUsesSharpenAfterUpscale(profile)) {
    return false;
  }
  if (options?.afterNeural !== true) {
    return false;
  }
  const model = options?.model?.trim() ?? '';
  if (/lightning-(4|8)\b/i.test(model) || /^qwen-rapid-aio-/i.test(model)) {
    return false;
  }
  if (isDistilledFewStepImageModel(model)) {
    return false;
  }
  return true;
}

export function sharpenAlphaForProfile(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): number {
  const isMax = normalizeQueueQualityProfile(profile) === 'max';
  const model = options?.model?.trim() ?? '';
  // People / Qwen stacks wax easily — keep polish subtle.
  if (/qwen|flux-2-klein/i.test(model)) {
    return isMax ? 0.06 : 0.045;
  }
  // UltraReal skin plastics quickly — Max neural polish stays very light.
  if (isFluxFineTuneCheckpointModel(model)) {
    return 0.05;
  }
  return isMax ? 0.1 : 0.08;
}

/**
 * Rapid AIO often shows mild moiré / screen-door texture. A soft ImageBlur
 * after decode (Final/Max) knocks that down without looking soft-focus.
 */
export function profileUsesRapidAioMoirePolish(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): boolean {
  const model = options?.model?.trim() ?? '';
  if (!/^qwen-rapid-aio-/i.test(model)) {
    return false;
  }
  const normalized = normalizeQueueQualityProfile(profile);
  return normalized === 'final' || normalized === 'max';
}

export function rapidAioMoireBlurRadius(profile: QueueQualityProfile | undefined): number {
  return normalizeQueueQualityProfile(profile) === 'max' ? 1 : 1;
}

export function rapidAioMoireBlurSigma(profile: QueueQualityProfile | undefined): number {
  // Final stays soft-blur only (no resample) — stronger blur was mushy without helping moiré.
  return normalizeQueueQualityProfile(profile) === 'max' ? 0.55 : 0.45;
}

/**
 * Whether Rapid AIO polish includes a downsample→restore resample.
 * Final skips it (blur only) — area↓/lanczos↑ looked pixelated when gallery-scaled.
 * Max keeps a mild bicubic pass for stubborn screen-door.
 */
export function profileUsesRapidAioMoireResample(
  profile: QueueQualityProfile | undefined
): boolean {
  return normalizeQueueQualityProfile(profile) === 'max';
}

/**
 * Mild bicubic downsample factor for Rapid AIO Max anti-moiré.
 * Paired with inverse Lanczos restore; Final does not resample.
 */
export function rapidAioMoireDownscaleFactor(profile: QueueQualityProfile | undefined): number {
  return profileUsesRapidAioMoireResample(profile) ? 0.9 : 1;
}

export function rapidAioMoireDownscaleMethod(
  profile: QueueQualityProfile | undefined
): 'bicubic' | 'area' | 'lanczos' {
  void profile;
  // Bicubic preserves micro-detail better than area (which block-averages → pixelation).
  return 'bicubic';
}

export function rapidAioMoireRestoreScale(profile: QueueQualityProfile | undefined): number {
  const down = rapidAioMoireDownscaleFactor(profile);
  if (down >= 0.999) {
    return 1;
  }
  return Math.round((1 / down) * 1000) / 1000;
}

/** Soft edge recovery after Max resample — lighter than generic Max sharpen. */
export function rapidAioMoireRestoreSharpenAlpha(profile: QueueQualityProfile | undefined): number {
  return profileUsesRapidAioMoireResample(profile) ? 0.04 : 0;
}

/**
 * Qwen 2512 Lightning: Final/Max get a soft ImageBlur after decode instead of any
 * upscale. 4–8 step CFG-1 already rings; Lanczos/UltraSharp makes pavement sparkle.
 */
export function profileUsesLightningDecodePolish(
  profile: QueueQualityProfile | undefined,
  options?: { model?: string }
): boolean {
  const model = options?.model?.trim() ?? '';
  if (!/qwen-image-2512-lightning/i.test(model)) {
    return false;
  }
  return profileUsesUpscaleEnrich(profile);
}

export function lightningDecodePolishBlurRadius(profile: QueueQualityProfile | undefined): number {
  void profile;
  return 1;
}

export function lightningDecodePolishBlurSigma(profile: QueueQualityProfile | undefined): number {
  return normalizeQueueQualityProfile(profile) === 'max' ? 0.6 : 0.5;
}
