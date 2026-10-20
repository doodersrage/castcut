import {
  buildBackgroundPresetBlock,
  buildBackgroundPresetSanitizeContext,
  buildBackgroundPresetUserDirective,
  countBackgroundPresetSelections,
  hasBackgroundPresetOptions,
  mergeBackgroundPresetsIntoPrompt,
  normalizeBackgroundPresetOptions,
} from '../scene/background-options';
import { buildMandatoryLocationBlock, parseSettingHint } from '../prompt/hint-location';
import { buildRandomBackgroundSeed } from './scene-pools';
import { mergeLocationExclusions } from '../scene/location-exclusions';
import { runSpecializedPrompt } from './runner';
import type { BackgroundOptions, ToolGenerateResult } from './types';

export async function generateBackgroundPrompt(
  options: BackgroundOptions
): Promise<ToolGenerateResult> {
  const presetOptions = normalizeBackgroundPresetOptions(options.presetOptions);
  const hasPresets = hasBackgroundPresetOptions(presetOptions);
  const settingHint = parseSettingHint(options.settingType);
  const { seed, location: sceneLocation } = buildRandomBackgroundSeed({
    settingType: options.settingType,
    timeOfDay: options.timeOfDay,
    mood: options.mood,
    recentLocations: mergeLocationExclusions(options.recentLocations, options.blockedLocations),
    avoidedTokens: options.avoidedTokens,
  });
  const locationBlock = buildMandatoryLocationBlock(settingHint.location);
  const presetBlock = buildBackgroundPresetBlock(presetOptions);
  const presetDirective = buildBackgroundPresetUserDirective(presetOptions);
  // User setting fields + presets only — not the rolled location seed (padding leak).
  const sanitizeContext = buildBackgroundPresetSanitizeContext(
    '',
    presetOptions,
    [options.settingType?.trim(), options.timeOfDay?.trim(), options.mood?.trim()].filter(
      Boolean
    ) as string[]
  );

  const toolInstructions = `You are an environment/background prompt generator for ComfyUI.
- Describe ONLY the setting—architecture, landscape, objects, weather, materials, lighting, atmosphere, and depth.
- When a MANDATORY SETTING block is present, use that exact place. Do not substitute a different location.
- When a BACKGROUND PRESET block is present, follow its perspective, depth, lighting, room state, material, and environment anchor phrases exactly—integrate them smoothly into prose.
- Keep furniture, walls, outlets, and props anchored to the floor plane with coherent geometry—no floating clip-art objects.
- ABSOLUTELY NO people, human figures, faces, silhouettes, crowds, mannequins, statues of people, or body parts.
- No "a person", "someone", "figure in the distance", or similar.
- Write one unified environment that could be used as a backdrop plate or empty scene.`;

  const userMessage = [
    presetBlock,
    presetDirective,
    locationBlock,
    `Background ingredients:\n${seed}`,
    options.avoidedTokensInstruction ?? null,
    'Write one highly detailed background-only prompt.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return runSpecializedPrompt({
    model: options.model,
    detail: options.detail === 'concise' ? 'balanced' : options.detail,
    toolInstructions,
    userMessage,
    allowTemplateFallback: options.llm?.allowTemplateFallback,
    temperature: options.llm?.temperature,
    llmModel: options.llm?.llmModel,
    llmEnabled: options.llm?.llmEnabled,
    llmProvider: options.llm?.llmProvider,
    llmApiKey: options.llm?.llmApiKey,
    templateFallback: () => buildBackgroundTemplate(seed, presetOptions),
    sanitizeInput: sanitizeContext,
    enforceMinimum: !hasPresets,
    postProcessPrompt: hasPresets
      ? prompt => mergeBackgroundPresetsIntoPrompt(prompt, presetOptions)
      : undefined,
    metadata: {
      seed,
      settingType: options.settingType?.trim() || null,
      location: settingHint.location,
      sceneLocation,
      timeOfDay: options.timeOfDay?.trim() || null,
      mood: options.mood?.trim() || null,
      presetOptions,
      presetCount: hasPresets ? countBackgroundPresetSelections(presetOptions) : 0,
    },
  });
}

function buildBackgroundTemplate(
  seed: string,
  presetOptions: ReturnType<typeof normalizeBackgroundPresetOptions>
): string {
  const normalized = seed.replace(/,\s*empty of people, figures, silhouettes, and crowds\.?$/i, '');

  const base = `${capitalize(normalized)}. The space is completely empty of people and figures, with layered depth from foreground texture through midground forms to a soft atmospheric background. Materials, weather, and directional light read clearly across the entire environment.`;

  return mergeBackgroundPresetsIntoPrompt(base, presetOptions);
}

function capitalize(value: string): string {
  if (!value) {
    return value;
  }
  return value.charAt(0).toUpperCase() + value.slice(1);
}
