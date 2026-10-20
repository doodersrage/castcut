import { parseSettingHint } from '../prompt/hint-location';
import {
  getFantasyPresetScriptLines,
  resolveFantasyFocus,
  type FantasyPresetOptions,
} from './fantasy-options';
import { pickSceneLocation, type RandomSeedBundle } from '../specialized/scene-pools';

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

const FANTASY_MOODS = [
  'legendary wonder',
  'dangerous beauty',
  'hushed enchantment',
  'volatile magic',
  'ancient mystery',
  'heroic resolve',
];

const FANTASY_TEXTURES = [
  'weathered stone and carved runes',
  'floating embers and spell particles',
  'moss, roots, and luminous flora',
  'polished armor and worn leather',
  'obsidian, gold, and arcane glass',
  'mist, silk banners, and drifting ash',
];

const CHARACTER_SUBJECTS = [
  'a fantasy knight in ornate armor',
  'a robed spellcaster with arcane focus',
  'an elven ranger with elegant gear',
  'a witch with ritual garments',
  'a prophetic oracle in symbolic robes',
];

const CREATURE_SUBJECTS = [
  'a majestic dragon with detailed scales',
  'a phoenix trailing ember feathers',
  'a stone golem with glowing rune seams',
  'a luminous fairy with iridescent wings',
  'a horned demon with infernal silhouette',
  'a winged angel with radiant feathers',
  'a mythic beast with primal power',
];

const ENSEMBLE_BEATS = [
  'two or three fantasy figures in balanced interaction',
  'a small adventuring party frozen mid-conflict',
  'paired spellcasters mirroring opposing magic',
];

function settingFromPreset(presetOptions?: FantasyPresetOptions): string | null {
  if (!presetOptions?.settingArchetype) {
    return null;
  }

  const [line] = getFantasyPresetScriptLines({
    settingArchetype: presetOptions.settingArchetype,
  });
  return line?.replace(/,$/, '') ?? null;
}

function pickFantasyLocation(
  hints: string | undefined,
  recentLocations: string[],
  presetOptions?: FantasyPresetOptions,
  avoidedTokens?: string[]
): string {
  const settingHint = parseSettingHint(hints);
  if (settingHint.location) {
    return settingHint.location;
  }

  const presetSetting = settingFromPreset(presetOptions);
  if (presetSetting) {
    return presetSetting;
  }

  return pickSceneLocation(recentLocations, avoidedTokens);
}

function pickSubjectLine(
  focus: ReturnType<typeof resolveFantasyFocus>,
  hints?: string
): string | null {
  if (focus === 'environment') {
    return 'empty fantasy environment with no people, creatures, silhouettes, or crowds';
  }

  if (hints?.trim()) {
    return hints.trim();
  }

  if (focus === 'creature') {
    return pick(CREATURE_SUBJECTS);
  }

  if (focus === 'ensemble') {
    return pick(ENSEMBLE_BEATS);
  }

  return pick(CHARACTER_SUBJECTS);
}

export function buildRandomFantasySeed(
  hints?: string,
  recentLocations: string[] = [],
  presetOptions: FantasyPresetOptions = {},
  wildness = 65,
  avoidedTokens?: string[]
): RandomSeedBundle {
  const focus = resolveFantasyFocus(presetOptions, hints);
  const location = pickFantasyLocation(hints, recentLocations, presetOptions, avoidedTokens);
  const presetLines = getFantasyPresetScriptLines({
    ...presetOptions,
    settingArchetype: undefined,
    focus: undefined,
  });

  const surprise =
    wildness >= 80
      ? pick([
          'unexpected floating debris',
          'impossible architecture in the distance',
          'a subtle reality tear in the sky',
          'ancient script glowing on stone',
        ])
      : wildness >= 55
        ? pick([
            'drifting magical particles',
            'a distant second landmark',
            'weather reacting to spell energy',
          ])
        : null;

  const parts = [
    pickSubjectLine(focus, hints),
    focus === 'environment' ? null : pick(FANTASY_TEXTURES),
    ...presetLines,
    location,
    pick(FANTASY_MOODS),
    surprise,
  ].filter(Boolean) as string[];

  return { seed: parts.join(', '), location };
}

export function fantasyFocusIncludesPeople(focus: ReturnType<typeof resolveFantasyFocus>): boolean {
  return focus === 'character' || focus === 'ensemble';
}

export function fantasyFocusAllowsCreatures(
  focus: ReturnType<typeof resolveFantasyFocus>
): boolean {
  return focus !== 'environment';
}
