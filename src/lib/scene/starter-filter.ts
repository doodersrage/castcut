import type { SceneStarterCategory, SceneStarterPreset } from './starter-types';

export type SceneStarterFramingFilter = 'all' | 'portrait' | 'full-body' | 'action';

export type SceneStarterFilterState = {
  category: SceneStarterCategory | 'all';
  framing: SceneStarterFramingFilter;
  query: string;
  tags: string[];
};

export const DEFAULT_SCENE_STARTER_FILTER: SceneStarterFilterState = {
  category: 'all',
  framing: 'all',
  query: '',
  tags: [],
};

export const SCENE_STARTER_TAG_OPTIONS: { id: string; label: string }[] = [
  { id: 'night', label: 'Night' },
  { id: 'golden-hour', label: 'Golden hour' },
  { id: 'rain', label: 'Rain' },
  { id: 'snow', label: 'Snow' },
  { id: 'fog', label: 'Fog' },
  { id: 'studio', label: 'Studio' },
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'moody', label: 'Moody' },
  { id: 'bright', label: 'Bright' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'action', label: 'Action' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'candid', label: 'Candid' },
  { id: 'duo', label: 'Duo' },
];

const TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'night', pattern: /\b(night|midnight|neon|after dark|blue hour)\b/i },
  { tag: 'golden-hour', pattern: /\b(golden hour|sunset|sunrise|dusk|dawn)\b/i },
  { tag: 'rain', pattern: /\b(rain|rainy|wet pavement|storm)\b/i },
  { tag: 'snow', pattern: /\b(snow|snowy|blizzard|frost|winter)\b/i },
  { tag: 'fog', pattern: /\b(fog|mist|misty|haze|steam)\b/i },
  { tag: 'studio', pattern: /\b(studio|cyclorama|softbox|backdrop)\b/i },
  { tag: 'indoor', pattern: /\b(indoor|interior|kitchen|bedroom|caf[eé]|bookshop|library)\b/i },
  { tag: 'outdoor', pattern: /\b(outdoor|forest|field|beach|mountain|trail|park|meadow|coast)\b/i },
  { tag: 'moody', pattern: /\b(moody|dramatic|noir|ominous|gritty|high-contrast)\b/i },
  { tag: 'bright', pattern: /\b(bright|sunny|vibrant|optimistic|cheerful|sunlit)\b/i },
  { tag: 'cozy', pattern: /\b(cozy|hygge|warm|fireplace|blanket|tea|bakery)\b/i },
  { tag: 'action', pattern: /\b(action|running|sprint|mid-|motion|dynamic|competition)\b/i },
  { tag: 'editorial', pattern: /\b(editorial|runway|couture|magazine|avant-garde)\b/i },
  { tag: 'candid', pattern: /\b(candid|natural|everyday|shopping|commute|picnic)\b/i },
];

export function inferSceneStarterTags(preset: SceneStarterPreset): string[] {
  const hay = `${preset.label} ${preset.hints}`.toLowerCase();
  const inferred = TAG_RULES.filter(rule => rule.pattern.test(hay)).map(rule => rule.tag);
  if (preset.duo) {
    inferred.push('duo');
  }
  if (preset.category === 'sport') {
    inferred.push('action');
  }
  const merged = [...new Set([...(preset.tags ?? []), ...inferred])];
  return merged;
}

export function withSceneStarterTags(preset: SceneStarterPreset): SceneStarterPreset {
  return {
    ...preset,
    tags: inferSceneStarterTags(preset),
  };
}

export function filterSceneStarters(
  presets: readonly SceneStarterPreset[],
  filter: SceneStarterFilterState,
  mode: 'solo' | 'duo' | 'all' = 'all'
): SceneStarterPreset[] {
  const query = filter.query.trim().toLowerCase();

  return presets.filter(preset => {
    if (mode === 'duo' && !preset.duo) {
      return false;
    }
    if (mode === 'solo' && preset.duo) {
      return false;
    }
    if (filter.category !== 'all' && preset.category !== filter.category) {
      return false;
    }
    if (filter.framing !== 'all') {
      const framing = preset.portraitStyle ?? 'portrait';
      if (framing !== filter.framing) {
        return false;
      }
    }
    if (filter.tags.length > 0) {
      const tags = preset.tags ?? inferSceneStarterTags(preset);
      if (!filter.tags.every(tag => tags.includes(tag))) {
        return false;
      }
    }
    if (query) {
      const tokens = query.split(/\s+/).filter(Boolean);
      const hay = [
        preset.label,
        preset.hints,
        preset.category,
        ...(preset.tags ?? inferSceneStarterTags(preset)),
      ]
        .join(' ')
        .toLowerCase();
      if (!tokens.every(token => hay.includes(token))) {
        return false;
      }
    }
    return true;
  });
}

export function sceneStarterTagCounts(presets: readonly SceneStarterPreset[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const preset of presets) {
    for (const tag of preset.tags ?? inferSceneStarterTags(preset)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}
