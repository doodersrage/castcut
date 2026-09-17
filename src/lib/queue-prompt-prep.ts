'use client';

import { modelUsesNegativePrompt } from './prompt-pair';
import type { ComfyImageModel } from './comfy-models/client';
import {
  applyAnatomyGuardForModel,
  applyAnatomyGuardToNegative,
  applyAnatomyGuardToPositive,
  type AnatomyGuardMode,
} from './anatomy-guard';
import { loadAnatomyGuardMode } from './anatomy-guard-settings';
import {
  applyRenderRealismForModel,
  applyRenderRealismToNegative,
  applyRenderRealismToPositive,
  type RenderRealismMode,
} from './render-realism';
import { loadRenderRealismMode } from './render-realism-settings';
import {
  ensurePoseGuideStyleLock,
  mergePoseGuideNegatives,
  promptHasPoseGuideCue,
} from './pose-guide-prompt';
import { inferAthleticSport, type AthleticSport } from './athletic-sport-profiles';
import { resolveQueueNegativePromptRaw } from './queue-negative';
import { isQwenLightningModel, isWanLightningModel } from './model-sampling-patch';
import { isQwenRapidAioModel, isWanRapidAioModel } from './model-denoise-defaults';
import {
  applyTurboEditStrengthToPrompt,
  normalizeTurboEditStrength,
  skipsCfg1T2iSteeringForTurboEdit,
  usesTurboEditStrengthUi,
  type TurboEditStrength,
} from './turbo-edit-strength';
import { isFluxFineTuneCheckpointModel } from './model-checkpoint-map';
import {
  isKleinBaseModel,
  isKleinDistilledModel,
  isLightningModelId,
} from './model-sampler-defaults';
import { isBooguTurboModel } from './model-denoise-defaults';
import { ensureUltraRealAmplifierTriggerInPrompt } from './ultrareal-amplifier-lora';
import { ensureKleinRealisticDetailTriggerInPrompt } from './klein-realistic-detail-lora';
import { expandWildcardText } from './wildcard-expand';
import {
  loadCustomWildcardLists,
  loadWildcardExpansionEnabled,
  loadWildcardSeed,
} from './wildcard-settings';
import { buildClothingNegativePack } from './clothing-quality';
import { appendEmbeddingTokens, modelSupportsTextualInversion } from './textual-inversion';

/** Distilled Lightning (CFG 1) softens with long auto-negatives — keep only short explicit ones. */
const LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS = 160;

/**
 * Cap combined realism + anatomy growth so scene-specific positive text stays dominant.
 * Negatives are budgeted separately and can stay longer.
 */
const MAX_QUEUE_POSITIVE_SUFFIX_CHARS = 200;
const KLEIN_BASE_QUEUE_POSITIVE_SUFFIX_CHARS = 580;
const KLEIN_DISTILLED_QUEUE_POSITIVE_SUFFIX_CHARS = 180;
const ULTRAREAL_QUEUE_POSITIVE_SUFFIX_CHARS = 420;

function maxQueuePositiveSuffixChars(model: ComfyImageModel | string): number {
  if (isKleinBaseModel(model)) {
    return KLEIN_BASE_QUEUE_POSITIVE_SUFFIX_CHARS;
  }
  if (isKleinDistilledModel(model)) {
    return KLEIN_DISTILLED_QUEUE_POSITIVE_SUFFIX_CHARS;
  }
  if (isFluxFineTuneCheckpointModel(model)) {
    return ULTRAREAL_QUEUE_POSITIVE_SUFFIX_CHARS;
  }
  return MAX_QUEUE_POSITIVE_SUFFIX_CHARS;
}

/** Short CFG-1-friendly anti-moiré terms for Phr00t Rapid AIO. */
const RAPID_AIO_MOIRE_NEGATIVE =
  'moire, moiré, halftone, screen door, mesh pattern, wavy interference, grid artifacts, banding, crosshatch';

const RAPID_AIO_MOIRE_POSITIVE =
  'clean continuous tones, smooth natural skin texture, even gradients';

/** Short CFG-1-friendly temporal / anatomy cues for WAN Lightning 4-step. */
export const WAN_LIGHTNING_ARTIFACT_NEGATIVE =
  'flicker, morphing, identity drift, abrupt cuts, extra limbs, warped hands, duplicate subjects, floating props';

export const WAN_LIGHTNING_ARTIFACT_POSITIVE =
  'stable identity, consistent limb count, coherent hands, temporal continuity';

/**
 * Short CFG-1 photo cues for Qwen Image Lightning — long realism suffixes soften
 * distilled stacks, but a compact photograph / anti-illustration pack helps
 * pull 8-step Max away from a drawn look.
 */
export const QWEN_LIGHTNING_PHOTO_POSITIVE =
  'natural photograph, realistic skin texture, soft natural light, lifelike materials';

export const QWEN_LIGHTNING_PHOTO_NEGATIVE =
  'illustration, drawing, cartoon, anime, painting, CGI, plastic skin, airbrushed, painterly';

/** CFG-1 T2I (Boogu/Z-Image Turbo, Schnell): short anatomy + anti-halo cues — not long auto-neg lists. */
export const CFG1_T2I_ANATOMY_POSITIVE =
  'single subject, natural limb count, five distinct fingers, coherent hands and wrists';

export const CFG1_T2I_ARTIFACT_NEGATIVE =
  'extra limbs, duplicate hands, fused fingers, bad anatomy, oversaturated, oversharpened halos, plastic skin, moire, grid artifacts';

export const QWEN_LIGHTNING_HYPER_PHOTO_POSITIVE =
  'natural photograph, lifelike skin pores, camera realism, soft natural light';

function appendUniqueCsv(base: string | undefined, extra: string): string {
  const existing = base?.trim() ?? '';
  if (!existing) {
    return extra;
  }
  const lower = existing.toLowerCase();
  const missing = extra
    .split(',')
    .map(part => part.trim())
    .filter(part => part && !lower.includes(part.toLowerCase()));
  if (missing.length === 0) {
    return existing;
  }
  return `${existing}, ${missing.join(', ')}`;
}

function isCfg1DistilledStillImageModel(model: ComfyImageModel | string): boolean {
  return isLightningModelId(model) && !isQwenLightningModel(model) && !isWanLightningModel(model);
}

function steeringForCfg1DistilledStillImage(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  realismMode: RenderRealismMode;
  anatomyMode: AnatomyGuardMode;
  tool?: string;
  turboEditStrength?: TurboEditStrength;
}): { positive: string; negative?: string } {
  const explicit = input.negative?.trim();
  const shortExplicit =
    explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS ? explicit : undefined;
  if (skipsCfg1T2iSteeringForTurboEdit(String(input.model), input.tool)) {
    const positive = applyTurboEditStrengthToPrompt(
      input.positive,
      String(input.model),
      input.turboEditStrength
    );
    if (isBooguTurboModel(input.model)) {
      return { positive, negative: undefined };
    }
    return {
      positive,
      negative: appendUniqueCsv(shortExplicit, CFG1_T2I_ARTIFACT_NEGATIVE),
    };
  }
  let positive = input.positive;
  if (input.realismMode === 'realistic' || input.realismMode === 'hyper-realistic') {
    positive = appendUniqueCsv(
      positive,
      input.realismMode === 'hyper-realistic'
        ? QWEN_LIGHTNING_HYPER_PHOTO_POSITIVE
        : QWEN_LIGHTNING_PHOTO_POSITIVE
    );
  }
  if (
    input.anatomyMode !== 'off' &&
    /\b(?:person|people|woman|man|girl|boy|figure|model|portrait|hand|hands|finger|limb|subject)\b/i.test(
      positive
    )
  ) {
    positive = appendUniqueCsv(positive, CFG1_T2I_ANATOMY_POSITIVE);
  }
  // Official Boogu Turbo: ConditioningZeroOut / empty encode — never steer a negative.
  if (isBooguTurboModel(input.model)) {
    return { positive, negative: undefined };
  }
  return {
    positive,
    negative: appendUniqueCsv(shortExplicit, CFG1_T2I_ARTIFACT_NEGATIVE),
  };
}

export function applyQueuePromptSteering(input: {
  positive: string;
  negative?: string;
  model: ComfyImageModel | string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
  tool?: string;
  turboEditStrength?: TurboEditStrength;
}): { positive: string; negative?: string } {
  const realismMode = input.realismMode ?? loadRenderRealismMode();
  const anatomyMode = input.anatomyMode ?? loadAnatomyGuardMode();
  const turboEditStrength = normalizeTurboEditStrength(input.turboEditStrength);
  // Pose-guide Image 3: lock finished-scene realism and block stick-figure bleed.
  const poseGuideAttached = promptHasPoseGuideCue(input.positive);
  const steeredPositive = poseGuideAttached
    ? ensurePoseGuideStyleLock(input.positive, realismMode)
    : input.positive;
  const steeredNegative = mergePoseGuideNegatives(input.negative, poseGuideAttached);
  const finish = (result: { positive: string; negative?: string }) => {
    if (!usesTurboEditStrengthUi(String(input.model), input.tool)) {
      return result;
    }
    return {
      ...result,
      positive: applyTurboEditStrengthToPrompt(
        result.positive,
        String(input.model),
        turboEditStrength
      ),
    };
  };

  if (isQwenLightningModel(input.model)) {
    // CFG-1: skip long realism/anatomy suffixes — keep a short photo pack instead.
    const explicit = steeredNegative?.trim();
    const shortExplicit =
      explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS ? explicit : undefined;
    if (realismMode === 'realistic' || realismMode === 'hyper-realistic') {
      return finish({
        positive: appendUniqueCsv(
          steeredPositive,
          realismMode === 'hyper-realistic'
            ? QWEN_LIGHTNING_HYPER_PHOTO_POSITIVE
            : QWEN_LIGHTNING_PHOTO_POSITIVE
        ),
        negative: appendUniqueCsv(
          shortExplicit,
          appendUniqueCsv(QWEN_LIGHTNING_PHOTO_NEGATIVE, 'stick figure, wireframe, pose diagram')
        ),
      });
    }
    return finish({
      positive: steeredPositive,
      negative: shortExplicit,
    });
  }

  // WAN Lightning / Rapid AIO are CFG-1 distilled — long video-motion + anatomy lists fight them.
  // Keep short temporal/limb cues instead of full still-image steering.
  if (isWanLightningModel(input.model) || isWanRapidAioModel(input.model)) {
    const explicit = steeredNegative?.trim();
    const shortExplicit =
      explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS ? explicit : undefined;
    return finish({
      positive: appendUniqueCsv(steeredPositive, WAN_LIGHTNING_ARTIFACT_POSITIVE),
      negative: appendUniqueCsv(shortExplicit, WAN_LIGHTNING_ARTIFACT_NEGATIVE),
    });
  }

  // Rapid AIO is CFG-1 distilled (Lightning baked in) — skip long auto-negatives
  // and long realism/anatomy positives; keep short anti-moiré cues only.
  if (isQwenRapidAioModel(input.model)) {
    const explicit = steeredNegative?.trim();
    const shortExplicit =
      explicit && explicit.length <= LIGHTNING_MAX_EXPLICIT_NEGATIVE_CHARS ? explicit : undefined;
    return finish({
      positive: appendUniqueCsv(steeredPositive, RAPID_AIO_MOIRE_POSITIVE),
      negative: appendUniqueCsv(shortExplicit, RAPID_AIO_MOIRE_NEGATIVE),
    });
  }

  if (isCfg1DistilledStillImageModel(input.model)) {
    return finish(
      steeringForCfg1DistilledStillImage({
        positive: steeredPositive,
        negative: steeredNegative,
        model: input.model,
        realismMode,
        anatomyMode,
        tool: input.tool,
        turboEditStrength,
      })
    );
  }

  const suffixBudget = maxQueuePositiveSuffixChars(input.model);
  const baseLength = steeredPositive.trim().length;

  // Klein Distilled (CFG-1): anatomy/hand cues first — realism often ate the budget.
  // Edit tools skip those T2I suffixes — they fight ReferenceLatent and rewrite the frame.
  if (isKleinDistilledModel(input.model)) {
    if (skipsCfg1T2iSteeringForTurboEdit(String(input.model), input.tool)) {
      return finish({
        positive: steeredPositive,
        negative: steeredNegative,
      });
    }
    const withAnatomy = applyAnatomyGuardForModel({
      positive: steeredPositive,
      negative: steeredNegative,
      model: input.model,
      mode: anatomyMode,
      maxPositiveAppendChars: suffixBudget,
    });
    const anatomyGrowth = Math.max(0, withAnatomy.positive.trim().length - baseLength);
    return finish(
      applyRenderRealismForModel({
        positive: withAnatomy.positive,
        negative: withAnatomy.negative,
        model: input.model,
        mode: realismMode,
        maxPositiveAppendChars: Math.max(0, suffixBudget - anatomyGrowth),
      })
    );
  }

  // UltraReal: anatomy/hand cues first — soft decode + fragile hands need the budget.
  if (isFluxFineTuneCheckpointModel(input.model)) {
    const withAnatomy = applyAnatomyGuardForModel({
      positive: steeredPositive,
      negative: steeredNegative,
      model: input.model,
      mode: anatomyMode,
      maxPositiveAppendChars: suffixBudget,
    });
    const anatomyGrowth = Math.max(0, withAnatomy.positive.trim().length - baseLength);
    const withRealism = applyRenderRealismForModel({
      positive: withAnatomy.positive,
      negative: withAnatomy.negative,
      model: input.model,
      mode: realismMode,
      maxPositiveAppendChars: Math.max(0, suffixBudget - anatomyGrowth),
    });
    return finish({
      ...withRealism,
      positive: ensureUltraRealAmplifierTriggerInPrompt(withRealism.positive),
    });
  }

  const withRealism = applyRenderRealismForModel({
    positive: steeredPositive,
    negative: steeredNegative,
    model: input.model,
    mode: realismMode,
    maxPositiveAppendChars: suffixBudget,
  });
  const realismGrowth = Math.max(0, withRealism.positive.trim().length - baseLength);

  const withAnatomy = applyAnatomyGuardForModel({
    positive: withRealism.positive,
    negative: withRealism.negative,
    model: input.model,
    mode: anatomyMode,
    maxPositiveAppendChars: Math.max(0, suffixBudget - realismGrowth),
  });

  if (isKleinBaseModel(input.model)) {
    return finish({
      ...withAnatomy,
      positive: ensureKleinRealisticDetailTriggerInPrompt(withAnatomy.positive),
    });
  }

  return finish(withAnatomy);
}

/**
 * Wildcards / dynamic prompts: `__name__` list tokens and `{a|b|c}` choice
 * groups, expanded before any other queue-prep step. Gated by the shared
 * `expandWildcards` setting (default on) and reproducible via `wildcardSeed`.
 */
function expandWildcardsForQueue(
  text: string | undefined,
  options?: { expandWildcards?: boolean; wildcardSeed?: string }
): string | undefined {
  if (!text) {
    return text;
  }
  const enabled = options?.expandWildcards ?? loadWildcardExpansionEnabled();
  if (!enabled) {
    return text;
  }
  return expandWildcardText(text, {
    seed: options?.wildcardSeed ?? loadWildcardSeed(),
    wildcards: loadCustomWildcardLists(),
  });
}

export async function prepareQueuePrompts(input: {
  model: ComfyImageModel | string;
  positive: string;
  hints?: string;
  sport?: AthleticSport | null;
  tool?: string;
  explicitNegative?: string;
  realismMode?: RenderRealismMode;
  anatomyMode?: AnatomyGuardMode;
  /** Overrides the shared `expandWildcards` setting for this call. */
  expandWildcards?: boolean;
  /** Overrides the shared `wildcardSeed` setting for this call (reproducible expands). */
  wildcardSeed?: string;
  /** SD/SDXL textual inversion stems; appended as embedding:name. */
  embeddingTokens?: string[];
  turboEditStrength?: TurboEditStrength;
}): Promise<{ positive: string; negative?: string }> {
  const wildcardOptions = {
    expandWildcards: input.expandWildcards,
    wildcardSeed: input.wildcardSeed,
  };
  let positive = expandWildcardsForQueue(input.positive, wildcardOptions) ?? input.positive;
  if (modelSupportsTextualInversion(input.model) && input.embeddingTokens?.length) {
    positive = appendEmbeddingTokens(positive, input.embeddingTokens);
  }
  const hints = expandWildcardsForQueue(input.hints, wildcardOptions);
  const explicitNegative = expandWildcardsForQueue(input.explicitNegative, wildcardOptions);

  let negative: string | undefined;
  const distilledCfg1 =
    isLightningModelId(input.model) ||
    isWanLightningModel(input.model) ||
    isWanRapidAioModel(input.model) ||
    isQwenRapidAioModel(input.model);
  if (distilledCfg1) {
    // Skip auto-negative profiles — they fight CFG-1 distillation.
    // WAN Lightning gets a short artifact pack in applyQueuePromptSteering.
    // Boogu Turbo uses ConditioningZeroOut / empty encode — drop explicit negatives too.
    negative = isBooguTurboModel(input.model) ? undefined : explicitNegative?.trim() || undefined;
  } else if (modelUsesNegativePrompt(input.model)) {
    negative = await resolveQueueNegativePromptRaw({
      model: input.model,
      hints,
      sport: input.sport,
      tool: input.tool,
      explicitNegative,
    });
  }

  // People / wardrobe queues: append high-signal clothing artifact negatives.
  const clothingHints = hints ?? positive;
  const clothingTool =
    input.tool === 'character' ||
    input.tool === 'duo' ||
    input.tool === 'generate' ||
    input.tool === 'gallery-mutate' ||
    input.tool === 'pet' ||
    input.tool === 'fantasy' ||
    input.tool === 'roleplay';
  if (
    !distilledCfg1 &&
    modelUsesNegativePrompt(input.model) &&
    (clothingTool ||
      /\b(?:wearing|outfit|wardrobe|jersey|helmet|scrubs|uniform)\b/i.test(clothingHints))
  ) {
    negative = appendUniqueCsv(
      negative,
      buildClothingNegativePack({
        hints: clothingHints,
        tool: input.tool,
        sport: input.sport ?? inferAthleticSport(clothingHints),
      })
    );
  }

  return applyQueuePromptSteering({
    positive,
    negative,
    model: input.model,
    realismMode: input.realismMode,
    anatomyMode: input.anatomyMode,
    tool: input.tool,
    turboEditStrength: input.turboEditStrength,
  });
}

export function preparePositiveForQueue(
  positive: string,
  options?: {
    realismMode?: RenderRealismMode;
    anatomyMode?: AnatomyGuardMode;
  }
): string {
  const realismMode = options?.realismMode ?? loadRenderRealismMode();
  const withPoseLock = ensurePoseGuideStyleLock(positive, realismMode);
  const withRealism = applyRenderRealismToPositive(withPoseLock, realismMode);
  return applyAnatomyGuardToPositive(withRealism, options?.anatomyMode ?? loadAnatomyGuardMode());
}

export function prepareNegativeForQueue(
  negative: string | undefined,
  options?: {
    realismMode?: RenderRealismMode;
    anatomyMode?: AnatomyGuardMode;
    /** When true, or when pairing with a pose-guide positive, block stick-figure bleed. */
    poseGuide?: boolean;
  }
): string | undefined {
  const withPoseNeg = mergePoseGuideNegatives(negative, options?.poseGuide === true);
  const withRealism = applyRenderRealismToNegative(
    withPoseNeg,
    options?.realismMode ?? loadRenderRealismMode()
  );
  return applyAnatomyGuardToNegative(withRealism, options?.anatomyMode ?? loadAnatomyGuardMode());
}
