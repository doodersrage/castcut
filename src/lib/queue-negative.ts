'use client';

import { modelUsesNegativePrompt } from './prompt-pair';
import type { ComfyImageModel } from './comfy-models/client';
import { DEFAULT_NEGATIVE_PROFILES, fetchNegativeWithProfile } from './negative-profiles';
import { resolveContextNegativeProfile } from './context-negative-profile';
import { loadComfyUiSettings } from './comfyui-settings';
import { applyRenderRealismToNegative, type RenderRealismMode } from './render-realism';
import { loadRenderRealismMode } from './render-realism-settings';
import type { AthleticSport } from './athletic-sport-profiles';
import { resolveModelSamplerParams, type ModelSamplerPresetTier } from './model-sampler-defaults';

const SAMPLER_TIERS: ModelSamplerPresetTier[] = ['base', 'optimized', 'maxCompatible', 'max'];

/**
 * CFG 1 skips the unconditional pass in ComfyUI, so a negative prompt does nothing on models that
 * run at CFG ≤ 1 on every tier (Rapid AIO, Lightning, Wan Rapid) — don't build one for them.
 */
export function modelIgnoresNegativeAtCfg(model: ComfyImageModel | string): boolean {
  return SAMPLER_TIERS.every(tier => {
    const cfg = Number(resolveModelSamplerParams(model, tier).cfg);
    return Number.isFinite(cfg) && cfg <= 1;
  });
}

export type ResolveQueueNegativeInput = {
  model: ComfyImageModel | string;
  hints?: string;
  sport?: AthleticSport | null;
  tool?: string;
  explicitNegative?: string;
  realismMode?: RenderRealismMode;
  /** When false, skip realism negative merge (caller applies full prompt prep). */
  applyRealism?: boolean;
};

export async function resolveQueueNegativePromptRaw(
  input: ResolveQueueNegativeInput
): Promise<string | undefined> {
  const explicit = input.explicitNegative?.trim();
  if (explicit) {
    return explicit;
  }

  const settings = loadComfyUiSettings();
  if (settings.autoNegativeOnQueue === false) {
    return undefined;
  }

  if (!modelUsesNegativePrompt(input.model) || modelIgnoresNegativeAtCfg(input.model)) {
    return undefined;
  }

  const profiles = settings.negativeProfiles?.length
    ? settings.negativeProfiles
    : DEFAULT_NEGATIVE_PROFILES;
  const profile = resolveContextNegativeProfile(profiles, settings.selectedNegativeProfileId, {
    tool: input.tool,
    model: input.model,
    hints: input.hints,
    sport: input.sport,
  });

  return (
    (await fetchNegativeWithProfile({
      profile,
      hints: input.hints,
      sport: input.sport,
    })) ?? undefined
  );
}

export async function resolveQueueNegativePrompt(
  input: ResolveQueueNegativeInput
): Promise<string | undefined> {
  const raw = await resolveQueueNegativePromptRaw(input);
  if (!raw || input.applyRealism === false) {
    return raw;
  }

  return applyRenderRealismToNegative(raw, input.realismMode ?? loadRenderRealismMode());
}
