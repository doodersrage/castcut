import { buildMandatoryLocationBlock, parseSettingHint } from '../prompt/hint-location';
import {
  buildPetPresetBlock,
  buildPetPresetUserDirective,
  hasPetPresetOptions,
  normalizePetPresetOptions,
  countPetPresetSelections,
} from '../scene/pet-options';
import { applyLockedLocation } from '../scene/locked-location';
import { applyLockedVariationSeed } from '../variation/locked-variation-seed';
import { mergeLocationExclusions } from '../scene/location-exclusions';
import { buildPetMandatoryBlock, parsePetHints } from '../scene/pet-hints';
import { buildRandomPetSeed } from '../scene/pet-scene-pools';
import { runSpecializedPrompt } from './runner';
import type { PetOptions, ToolGenerateResult } from './types';

const PORTRAIT_FRAMING: Record<NonNullable<PetOptions['portraitStyle']>, string> = {
  portrait:
    'tight portrait framing on face, eyes, whiskers, fur or feather texture, and expression',
  'full-body': 'full-body framing from head to paws or tail with readable posture and proportions',
  action:
    'dynamic action framing: mid-motion body with visible momentum, engaged muscles, and environment interaction—never a static posed snapshot',
};

const ACTION_INSTRUCTIONS = `- Name a specific animal action (run, leap, pounce, fetch, shake, stretch, groom, sniff, play, perch, hop, etc.) and show the body mid-movement.
- Describe weight shift, paw or wing placement, muscle tension, and fur/feather reacting to motion.
- Include one concrete environment beat tied to the action (kicked leaves, splashing water, scattered kibble, fluttering feathers).
- Prefer energetic camera language: low angle, shallow depth of field, or freeze-frame peak action.`;

export async function generatePetPrompt(options: PetOptions): Promise<ToolGenerateResult> {
  const detail = options.detail === 'concise' ? 'balanced' : options.detail;
  const portraitStyle = options.portraitStyle ?? 'portrait';
  const presetOptions = normalizePetPresetOptions(options.presetOptions);
  const hasPresets = hasPetPresetOptions(presetOptions);
  const effectiveHints = applyLockedLocation(options.hints, options.lockedLocation);
  const parsed = parsePetHints(effectiveHints, {
    ...(presetOptions.species
      ? {
          species:
            presetOptions.species === 'small-pet' || presetOptions.species === 'reptile'
              ? 'other'
              : presetOptions.species,
        }
      : {}),
    ...(presetOptions.pairMode === 'pair'
      ? { pair: true }
      : presetOptions.pairMode === 'solo'
        ? { pair: false }
        : {}),
  });
  const settingHint = parseSettingHint(effectiveHints);
  const locationExclude = mergeLocationExclusions(
    options.recentLocations,
    options.blockedLocations
  );
  const { seed: rolledSeed, location: sceneLocation } = buildRandomPetSeed(
    effectiveHints,
    portraitStyle,
    locationExclude,
    presetOptions,
    options.avoidedTokens
  );
  const seed = applyLockedVariationSeed(rolledSeed, options.variationSeed);
  const mandatoryBlock = buildPetMandatoryBlock(parsed, effectiveHints);
  const locationBlock = buildMandatoryLocationBlock(settingHint.location);
  const presetBlock = buildPetPresetBlock(presetOptions);
  const presetDirective = buildPetPresetUserDirective(presetOptions);

  const toolInstructions = `You are a pet and animal scene prompt generator for ComfyUI.
- Describe ONLY the animal subject(s) and their immediate environment—breed read, coat or plumage, markings, pose, expression, and setting details.
- When a MANDATORY PET block is present, follow its species, count, and identity constraints exactly.
- When a MANDATORY SETTING block is present, use that exact place. Do not substitute a different location.
- ABSOLUTELY NO people, human hands, faces, silhouettes, crowds, or human body parts.
- Keep anatomy believable: correct limb count, natural proportions, and species-appropriate features.
- Write one unified, model-ready prompt focused on the pet as the hero subject.`;

  const userMessage = [
    mandatoryBlock,
    presetBlock,
    presetDirective,
    locationBlock,
    `Pet scene ingredients:\n${seed}`,
    `Framing: ${PORTRAIT_FRAMING[portraitStyle]}`,
    portraitStyle === 'action' ? ACTION_INSTRUCTIONS : null,
    parsed.pair
      ? 'PAIR MODE (mandatory): exactly two animals interacting in frame. No third animal, crowd, or background critters.'
      : 'SOLO MODE (mandatory): exactly one animal in frame. No extra pets, animal crowds, or background animals.',
    options.avoidedTokensInstruction ?? null,
    'Write one model-ready pet scene prompt.',
  ]
    .filter(Boolean)
    .join('\n\n');

  const variationStrength = options.variationStrength ?? 50;
  const temperature = parsed.hasSpeciesConstraints
    ? 0.55 + variationStrength / 400
    : 0.75 + variationStrength / 200;

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
    // Hints only — never the rolled pet scene seed (location leaks into padding).
    sanitizeInput: effectiveHints?.trim() || undefined,
    templateFallback: () => buildPetTemplate(seed, portraitStyle, parsed.pair),
    enforceMinimum: !hasPresets,
    metadata: {
      seed,
      hints: effectiveHints?.trim() || null,
      location: settingHint.location,
      sceneLocation,
      portraitStyle,
      species: parsed.species,
      pair: parsed.pair,
      presetOptions,
      presetCount: hasPresets ? countPetPresetSelections(presetOptions) : 0,
    },
  });
}

function buildPetTemplate(
  seed: string,
  portraitStyle: NonNullable<PetOptions['portraitStyle']>,
  pair: boolean
): string {
  const normalized = capitalize(seed.replace(/\.$/, ''));
  const countLine = pair
    ? 'Exactly two animals interact in frame with no other pets or people visible.'
    : 'Exactly one animal is the clear hero subject with no other pets or people visible.';
  const framingLine =
    portraitStyle === 'action'
      ? 'The body reads mid-motion with believable anatomy, engaged muscles, and fur or feathers reacting to movement.'
      : portraitStyle === 'full-body'
        ? 'Full-body proportions read clearly from head to paws or tail with natural posture.'
        : 'Facial detail, eyes, whiskers or beak, and coat texture are crisp in portrait framing.';

  return `${normalized}. ${countLine} ${framingLine} The environment supports the subject with coherent depth, material detail, and directional light. No human hands, faces, or figures appear anywhere in the scene.`;
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
