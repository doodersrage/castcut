import { applyLockedLocation } from './locked-location';
import { enrichGenerateResult } from './generation-diagnostics';
import { normalizeGenerationSettings } from './generation-settings';
import { generatePrompt } from './prompt-generator';
import { generateBackgroundPrompt } from './specialized/background-generator';
import { generateCharacterPrompt } from './specialized/character-generator';
import { generateFantasyPrompt } from './specialized/fantasy-generator';
import { generatePetPrompt } from './specialized/pet-generator';
import type { ComfyImageModel } from './comfy-models/client';
import type { DetailLevel } from './detail-level';
import type { LlmRequestOptions } from './llm-request-options';
import { mapWithConcurrency } from './concurrency';
import { getLlmMaxInflight } from './llm-backpressure';

export type BatchFromTopicsTarget =
  'generate' | 'duo' | 'character' | 'pet' | 'fantasy' | 'background';

export type BatchFromTopicsOptions = {
  topics: string[];
  target: BatchFromTopicsTarget;
  model: ComfyImageModel;
  detail: DetailLevel;
  lockedWardrobeId?: string;
  lockedLocation?: string;
  variationSeed?: string;
  recentClothing?: string[];
  recentLocations?: string[];
  blockedLocations?: string[];
  alwaysIncludeClothing?: boolean;
  seedLlmWithIngredients?: boolean;
  distinctPeople?: boolean;
  teamKit?: boolean;
  llm?: LlmRequestOptions;
  avoidedTokens?: string[];
  avoidedTokensInstruction?: string;
};

export type BatchFromTopicsItem = {
  topic: string;
  prompt: string;
  provider: 'llm' | 'template';
};

export type BatchFromTopicsResult = {
  results: BatchFromTopicsItem[];
  count: number;
};

export async function batchGenerateFromTopics(
  options: BatchFromTopicsOptions
): Promise<BatchFromTopicsResult> {
  const topics = options.topics
    .map(entry => entry.trim())
    .filter(Boolean)
    .slice(0, 12);

  const seedLlmWithIngredients = options.seedLlmWithIngredients === true;

  async function generateOne(topic: string): Promise<BatchFromTopicsItem> {
    const hints = seedLlmWithIngredients
      ? (applyLockedLocation(topic, options.lockedLocation) ?? topic)
      : topic;
    const avoidance = {
      avoidedTokens: options.avoidedTokens,
      avoidedTokensInstruction: options.avoidedTokensInstruction,
    };

    if (options.target === 'duo') {
      const result = await generateCharacterPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: 'action',
        variationStrength: 50,
        presetOptions: { headcount: 'duo' },
        alwaysIncludeClothing: options.alwaysIncludeClothing === true,
        seedLlmWithIngredients,
        teamKit: options.teamKit === true,
        lockedWardrobeId: options.lockedWardrobeId,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        llm: options.llm,
        ...avoidance,
      });
      const enriched = enrichGenerateResult(result, hints, {
        teamKit: options.teamKit,
      });
      return {
        topic,
        prompt: enriched.prompt,
        provider: enriched.provider,
      };
    }

    if (options.target === 'character') {
      const result = await generateCharacterPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: 'portrait',
        variationStrength: 50,
        alwaysIncludeClothing: options.alwaysIncludeClothing === true,
        seedLlmWithIngredients,
        lockedWardrobeId: options.lockedWardrobeId,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        llm: options.llm,
        ...avoidance,
      });
      return {
        topic,
        prompt: result.prompt,
        provider: result.provider,
      };
    }

    if (options.target === 'pet') {
      const result = await generatePetPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: 'action',
        variationStrength: 50,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        recentLocations: options.recentLocations,
        blockedLocations: options.blockedLocations,
        llm: options.llm,
        ...avoidance,
      });
      return {
        topic,
        prompt: result.prompt,
        provider: result.provider,
      };
    }

    if (options.target === 'fantasy') {
      const result = await generateFantasyPrompt({
        model: options.model,
        detail: options.detail,
        hints,
        portraitStyle: 'action',
        wildness: 65,
        variationStrength: 50,
        lockedWardrobeId: options.lockedWardrobeId,
        lockedLocation: options.lockedLocation,
        variationSeed: options.variationSeed,
        recentLocations: options.recentLocations,
        blockedLocations: options.blockedLocations,
        alwaysIncludeClothing: options.alwaysIncludeClothing === true,
        seedLlmWithIngredients,
        llm: options.llm,
        ...avoidance,
      });
      return {
        topic,
        prompt: result.prompt,
        provider: result.provider,
      };
    }

    if (options.target === 'background') {
      const result = await generateBackgroundPrompt({
        model: options.model,
        detail: options.detail,
        settingType: hints,
        recentLocations: options.recentLocations,
        blockedLocations: options.blockedLocations,
        llm: options.llm,
        ...avoidance,
      });
      return {
        topic,
        prompt: result.prompt,
        provider: result.provider,
      };
    }

    const settings = normalizeGenerationSettings({
      model: options.model,
      detail: options.detail,
      distinctPeople: options.distinctPeople,
      alwaysIncludeClothing: options.alwaysIncludeClothing,
      seedLlmWithIngredients,
    });

    const result = await generatePrompt(hints, 'positive', settings, {
      recentClothing: options.recentClothing,
      lockedWardrobeId: options.lockedWardrobeId,
      avoidedTokensInstruction: options.avoidedTokensInstruction,
    });

    return {
      topic,
      prompt: result.prompt,
      provider: result.provider,
    };
  }

  // Each topic's generation is independent — was previously one LLM round-trip at a time, up to
  // 12 in a row. Bounded by the same limit the text LLM client enforces (llm-backpressure.ts).
  const results = await mapWithConcurrency(topics, getLlmMaxInflight(), generateOne);

  return { results, count: results.length };
}
