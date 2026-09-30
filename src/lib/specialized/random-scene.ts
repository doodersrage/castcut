import { buildMandatoryLocationBlock, parseSettingHint } from '../hint-location';
import {
  buildGenerateWardrobeAssignments,
  buildGenerateWardrobeUserDirective,
  mergeGenerateWardrobeIntoPrompt,
} from '../generate-wardrobe';
import { buildNoClothingUserDirective, hintsImplyNoClothing } from '../clothing-tags';
import { getDetailLimits } from '../detail-level';
import { isMultiPersonInput } from '../distinct-people';
import { DEFAULT_GENERATION_SETTINGS } from '../generation-settings';
import { generatePrompt } from '../prompt-generator';
import { mergeLocationExclusions } from '../location-exclusions';
import { applyLockedLocation } from '../locked-location';
import { applyLockedVariationSeed } from '../locked-variation-seed';
import { resolveModelForPromptGeneration } from '../queue-tool-model';
import { buildRandomSceneSeed } from './scene-pools';
import { buildToolResult, runSpecializedPrompt } from './runner';
import type { RandomSceneOptions, ToolGenerateResult } from './types';

export async function generateRandomScene(
  options: RandomSceneOptions
): Promise<ToolGenerateResult> {
  const seedIngredients = options.seedLlmWithIngredients === true;
  const effectiveGenre = seedIngredients
    ? applyLockedLocation(options.genre, options.lockedLocation)
    : options.genre;
  const genreHint = parseSettingHint(effectiveGenre);
  const pinnedLocation = options.lockedLocation?.trim() || genreHint.location || null;
  const includePeople = options.includePeople !== false;
  const alwaysIncludeClothing = options.alwaysIncludeClothing === true;
  const promptModel = resolveModelForPromptGeneration(options.model, 'generate');
  const { seed: rolledSeed, location: sceneLocation } = buildRandomSceneSeed({
    genre: options.genre,
    includePeople,
    recentLocations: mergeLocationExclusions(options.recentLocations, options.blockedLocations),
    avoidedTokens: options.avoidedTokens,
  });
  const seed = applyLockedVariationSeed(rolledSeed, options.variationSeed);
  const locationBlock = seedIngredients ? buildMandatoryLocationBlock(pinnedLocation) : null;

  const wildness = Math.min(100, Math.max(0, options.wildness ?? 65));
  const distinctPeople = isMultiPersonInput(seed);
  const wardrobeSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    model: promptModel,
    detail: options.detail,
    alwaysIncludeClothing,
    seedLlmWithIngredients: seedIngredients,
    distinctPeople,
    variation: {
      enabled: true,
      strength: wildness,
    },
  };
  const wardrobeAssignments =
    seedIngredients && includePeople && alwaysIncludeClothing
      ? buildGenerateWardrobeAssignments(seed, wardrobeSettings, {
          assumePeople: true,
          recentClothing: options.recentClothing,
          lockedWardrobeId: options.lockedWardrobeId,
          avoidedTokens: options.avoidedTokens,
        })
      : null;
  const clothingDirective = !seedIngredients
    ? null
    : wardrobeAssignments?.length
      ? buildGenerateWardrobeUserDirective(wardrobeAssignments)
      : hintsImplyNoClothing(seed)
        ? buildNoClothingUserDirective()
        : null;

  const keywordsOnly = !seedIngredients;
  const genreText = effectiveGenre?.trim() || '';
  const toolInstructions = keywordsOnly
    ? `You are a scene prompt generator for ComfyUI.
- Write ONE cohesive scene from the provided keywords only.
- Follow the target model's prompt style exactly.
- ${includePeople === false ? 'Do not include any people, figures, silhouettes, or crowds.' : 'If people appear, give them specific visual identity—not generic figures.'}
- Do not invent a wardrobe catalog or substitute a different location unless the keywords ask for it.
- Wildness level: ${wildness}/100.`
    : `You are a random scene prompt generator for ComfyUI.
- Invent ONE cohesive scene from the provided random ingredients.
- When a MANDATORY SETTING block is present, use that exact place. Do not substitute a different location.
- Follow the target model's prompt style exactly.
- ${includePeople === false ? 'Do not include any people, figures, silhouettes, or crowds.' : 'If people appear, give them specific visual identity—not generic figures.'}
- When wardrobe ingredients are assigned, keep every garment in the final prompt with scene-appropriate styling.
- Surprise the viewer with at least one unexpected but coherent detail.
- Wildness level: ${wildness}/100 (higher = stranger combinations, still one unified image).`;

  const userMessage = (
    keywordsOnly
      ? [
          genreText
            ? `Scene keywords:\n${genreText}`
            : 'Scene keywords:\n(none provided — invent one cohesive scene without a wardrobe catalog or unrelated location swap)',
          options.avoidedTokensInstruction,
          'Write a single model-ready prompt from the keywords above.',
        ]
      : [
          locationBlock,
          `Random scene ingredients:\n${seed}`,
          clothingDirective,
          options.avoidedTokensInstruction,
          'Write a single model-ready prompt using every major ingredient above.',
        ]
  )
    .filter(Boolean)
    .join('\n\n');

  const metadata = {
    seed: keywordsOnly ? genreText || null : seed,
    includePeople,
    alwaysIncludeClothing,
    seedLlmWithIngredients: seedIngredients,
    wildness,
    genre: options.genre?.trim() || null,
    location: genreHint.location,
    sceneLocation: keywordsOnly ? null : sceneLocation,
    randomOutfit: keywordsOnly ? null : wardrobeAssignments,
  };

  const postProcessPrompt =
    !keywordsOnly && wardrobeAssignments?.length
      ? (prompt: string) => {
          const { maxChars } = getDetailLimits(options.detail, promptModel);
          return mergeGenerateWardrobeIntoPrompt(prompt, wardrobeAssignments, maxChars, seed);
        }
      : undefined;

  const templateFallback = async () => {
    const fallbackInput = keywordsOnly ? genreText || 'cinematic scene' : seed;
    const result = await generatePrompt(
      fallbackInput,
      'positive',
      {
        ...wardrobeSettings,
        alwaysIncludeClothing: false,
        seedLlmWithIngredients: seedIngredients,
      },
      { tool: 'generate' }
    );
    if (keywordsOnly || !wardrobeAssignments?.length) {
      return result.prompt;
    }
    const { maxChars } = getDetailLimits(options.detail, promptModel);
    return mergeGenerateWardrobeIntoPrompt(result.prompt, wardrobeAssignments, maxChars, seed);
  };

  try {
    return await runSpecializedPrompt({
      model: promptModel,
      detail: options.detail,
      toolInstructions,
      userMessage,
      templateFallback,
      // Never sanitize against the rolled ingredient seed — padding would inject
      // location phrases that were not in the LLM draft.
      sanitizeInput: genreText || undefined,
      postProcessPrompt,
      // Sparse expand invents garments/locations — off in keywords-only mode.
      enforceMinimum: !keywordsOnly,
      temperature: options.llm?.temperature ?? 0.85 + wildness / 200,
      allowTemplateFallback: options.llm?.allowTemplateFallback,
      llmModel: options.llm?.llmModel,
      llmEnabled: options.llm?.llmEnabled,
      llmProvider: options.llm?.llmProvider,
      llmApiKey: options.llm?.llmApiKey,
      seed: keywordsOnly ? genreText || undefined : seed,
      metadata,
      resultModel: options.model,
    });
  } catch {
    const result = await templateFallback();
    return buildToolResult(result, 'template', options.model, options.detail, {
      seed,
      metadata,
    });
  }
}
