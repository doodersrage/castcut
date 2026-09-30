import {
  buildFantasyPresetBlock,
  buildFantasyPresetUserDirective,
  countFantasyPresetSelections,
  getFantasyShotFramingLine,
  hasFantasyPresetOptions,
  normalizeFantasyPresetOptions,
  resolveFantasyFocus,
  resolveFantasyShotFraming,
} from '../fantasy-options';
import { buildMandatoryLocationBlock, parseSettingHint } from '../hint-location';
import {
  buildGenerateWardrobeAssignments,
  buildGenerateWardrobeUserDirective,
  mergeGenerateWardrobeIntoPrompt,
} from '../generate-wardrobe';
import { buildNoClothingUserDirective, hintsImplyNoClothing } from '../clothing-tags';
import { isMultiPersonInput } from '../distinct-people';
import { DEFAULT_GENERATION_SETTINGS } from '../generation-settings';
import { applyLockedLocation } from '../locked-location';
import { applyLockedVariationSeed } from '../locked-variation-seed';
import { mergeLocationExclusions } from '../location-exclusions';
import { buildRandomFantasySeed, fantasyFocusIncludesPeople } from '../fantasy-scene-pools';
import { runSpecializedPrompt } from './runner';
import type { FantasyOptions, ToolGenerateResult } from './types';

const FANTASY_ACTION_INSTRUCTIONS = `- Name a specific fantasy action (cast a spell, draw a blade, leap, dodge, channel magic, summon, strike, etc.) and show the body or creature mid-movement.
- Describe weight shift, garment or armor motion, spell particles, and environmental reaction (kicked embers, splashing mist, drifting runes).
- Prefer energetic camera language tied to the chosen framing.`;

export async function generateFantasyPrompt(options: FantasyOptions): Promise<ToolGenerateResult> {
  const detail = options.detail === 'concise' ? 'balanced' : options.detail;
  const presetOptions = normalizeFantasyPresetOptions(options.presetOptions);
  const hasPresets = hasFantasyPresetOptions(presetOptions);
  const wildness = Math.min(100, Math.max(0, options.wildness ?? 65));
  const seedIngredients = options.seedLlmWithIngredients === true;
  const effectiveHints = seedIngredients
    ? applyLockedLocation(options.hints, options.lockedLocation)
    : options.hints;
  const focus = resolveFantasyFocus(presetOptions, effectiveHints);
  const shotFraming = resolveFantasyShotFraming(focus, options.portraitStyle);
  const includePeople = fantasyFocusIncludesPeople(focus);
  const settingHint = parseSettingHint(effectiveHints);
  const locationExclude = mergeLocationExclusions(
    options.recentLocations,
    options.blockedLocations
  );
  const { seed: rolledSeed, location: sceneLocation } = buildRandomFantasySeed(
    effectiveHints,
    locationExclude,
    presetOptions,
    wildness,
    options.avoidedTokens
  );
  const seed = applyLockedVariationSeed(rolledSeed, options.variationSeed);
  const presetBlock = buildFantasyPresetBlock(presetOptions);
  const presetDirective = buildFantasyPresetUserDirective(presetOptions);
  const locationBlock = seedIngredients ? buildMandatoryLocationBlock(settingHint.location) : null;
  const alwaysIncludeClothing = options.alwaysIncludeClothing === true;
  const distinctPeople = isMultiPersonInput(
    [effectiveHints, seed, focus].filter(Boolean).join(', ')
  );
  const wardrobeSettings = {
    ...DEFAULT_GENERATION_SETTINGS,
    model: options.model,
    detail: options.detail,
    alwaysIncludeClothing,
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
          fantasyWardrobe: true,
          avoidedTokens: options.avoidedTokens,
        })
      : null;
  const clothingDirective = !seedIngredients
    ? null
    : wardrobeAssignments?.length
      ? buildGenerateWardrobeUserDirective(wardrobeAssignments)
      : hintsImplyNoClothing(effectiveHints) || hintsImplyNoClothing(seed)
        ? buildNoClothingUserDirective()
        : null;

  const focusInstructions =
    focus === 'environment'
      ? 'Describe ONLY the fantasy environment—architecture, landscape, magic phenomena, weather, materials, and atmosphere. ABSOLUTELY NO people, creatures, silhouettes, or figures.'
      : focus === 'creature'
        ? 'Center the image on ONE fantastical creature with believable anatomy and vivid detail. No crowds.'
        : focus === 'ensemble'
          ? 'Show a SMALL fantasy ensemble of two or three figures interacting. No crowds or background extras.'
          : 'Center the image on ONE fantasy character hero with specific identity, gear, and expression. No crowds.';

  const keywordsOnly = !seedIngredients;
  const hintText = effectiveHints?.trim() || '';
  const toolInstructions = keywordsOnly
    ? `You are a fantasy scene prompt generator for ComfyUI.
- Expand the user's keywords into ONE cohesive fantasy image.
- Stay faithful to those keywords for setting, wardrobe, creatures, and props.
- Do not invent a wardrobe catalog or substitute a different location unless the keywords ask for it.
- ${focusInstructions}
- Wildness level: ${wildness}/100.`
    : `You are a fantasy scene prompt generator for ComfyUI.
- Invent ONE cohesive fantasy image from the provided ingredients.
- When a FANTASY PRESET block is present, follow its phrases exactly.
- When a MANDATORY SETTING block is present, use that exact place.
- ${focusInstructions}
- Include readable magical effects, material detail, and atmospheric depth.
- Wildness level: ${wildness}/100 (higher = stranger combinations, still one unified image).`;

  const userMessage = (
    keywordsOnly
      ? [
          hintText
            ? `Scene keywords:\n${hintText}`
            : 'Scene keywords:\n(none provided — invent one cohesive fantasy scene from the focus only, without a wardrobe catalog)',
          `Framing: ${getFantasyShotFramingLine(shotFraming)}`,
          `Scene focus: ${focus}`,
          options.avoidedTokensInstruction ?? null,
          'Write one model-ready fantasy scene prompt from the keywords above. Do not invent a wardrobe catalog or substitute a different location unless the keywords ask for it.',
        ]
      : [
          presetBlock,
          presetDirective,
          locationBlock,
          `Fantasy scene ingredients:\n${seed}`,
          clothingDirective,
          `Framing: ${getFantasyShotFramingLine(shotFraming)}`,
          shotFraming === 'action' ? FANTASY_ACTION_INSTRUCTIONS : null,
          `Scene focus: ${focus}`,
          options.avoidedTokensInstruction ?? null,
          'Write one model-ready fantasy scene prompt.',
        ]
  )
    .filter(Boolean)
    .join('\n\n');

  const variationStrength = options.variationStrength ?? wildness;
  const temperature = hasPresets ? 0.6 + variationStrength / 350 : 0.75 + variationStrength / 220;

  return runSpecializedPrompt({
    model: options.model,
    detail,
    toolInstructions,
    userMessage,
    temperature: options.llm?.temperature ?? temperature,
    allowTemplateFallback: options.llm?.allowTemplateFallback,
    llmModel: options.llm?.llmModel,
    llmEnabled: options.llm?.llmEnabled,
    llmProvider: options.llm?.llmProvider,
    llmApiKey: options.llm?.llmApiKey,
    // Hints only — never the rolled fantasy ingredient seed.
    sanitizeInput: hintText || undefined,
    templateFallback: () =>
      buildFantasyTemplate(
        keywordsOnly ? hintText || focus : seed,
        focus,
        shotFraming,
        keywordsOnly ? null : wardrobeAssignments,
        keywordsOnly ? normalizeFantasyPresetOptions({}) : presetOptions
      ),
    enforceMinimum: keywordsOnly ? false : !hasPresets,
    postProcessPrompt:
      !keywordsOnly && includePeople && wardrobeAssignments?.length
        ? prompt => mergeGenerateWardrobeIntoPrompt(prompt, wardrobeAssignments)
        : undefined,
    metadata: {
      seed: keywordsOnly ? hintText || null : seed,
      hints: hintText || null,
      location: settingHint.location,
      sceneLocation: keywordsOnly ? null : sceneLocation,
      focus,
      shotFraming,
      wildness,
      seedLlmWithIngredients: seedIngredients,
      presetOptions: keywordsOnly ? normalizeFantasyPresetOptions({}) : presetOptions,
      presetCount: !keywordsOnly && hasPresets ? countFantasyPresetSelections(presetOptions) : 0,
      includePeople,
    },
  });
}

function buildFantasyTemplate(
  seed: string,
  focus: ReturnType<typeof resolveFantasyFocus>,
  shotFraming: ReturnType<typeof resolveFantasyShotFraming>,
  wardrobeAssignments: ReturnType<typeof buildGenerateWardrobeAssignments> | null,
  presetOptions: ReturnType<typeof normalizeFantasyPresetOptions>
): string {
  let prompt = capitalize(seed.replace(/\.$/, ''));

  if (focus === 'environment') {
    prompt +=
      '. The fantasy environment reads with layered depth, coherent materials, and visible magical atmosphere. No people, creatures, or silhouettes appear anywhere in frame.';
  } else if (focus === 'creature') {
    prompt +=
      '. The creature dominates the frame with detailed anatomy, texture, and mythic presence while the environment supports the subject.';
  } else if (focus === 'ensemble') {
    prompt +=
      '. Exactly two or three fantasy figures interact in frame with readable identity and no crowd extras.';
  } else {
    prompt +=
      '. One fantasy hero reads clearly with specific gear, expression, and magical context.';
  }

  prompt += ` ${getFantasyShotFramingLine(shotFraming).replace(/\.$/, '')}.`;

  if (shotFraming === 'action') {
    prompt +=
      ' The body reads mid-motion with believable anatomy, spell energy, and garments or armor reacting to movement.';
  } else if (shotFraming === 'full-body') {
    prompt +=
      ' Full proportions read clearly from head to toe with natural posture and readable gear.';
  } else if (shotFraming === 'portrait') {
    prompt += ' Facial detail, expression, and key gear textures are crisp in portrait framing.';
  } else if (shotFraming === 'wide') {
    prompt +=
      ' The scene holds layered environmental depth with the subject anchored in mythic surroundings.';
  }

  if (presetOptions.magicElement) {
    prompt += ' Magical effects remain visible and integrated into the scene lighting.';
  }

  if (wardrobeAssignments?.length) {
    prompt = mergeGenerateWardrobeIntoPrompt(prompt, wardrobeAssignments);
  }

  return prompt;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
