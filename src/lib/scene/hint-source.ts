export type SceneHintSource = 'manual' | 'history' | 'random';

export type HistorySeedScope = 'tool' | 'related' | 'favorites' | 'top-rated';

export type HistorySeedTool =
  | 'generate'
  | 'character'
  | 'duo'
  | 'compose'
  | 'background'
  | 'pet'
  | 'fantasy'
  | 'refine'
  | 'inpaint'
  | 'outpaint'
  | 'video'
  | 'controlnet'
  | 'imagePrompt';

export const SCENE_HINT_SOURCE_OPTIONS: Array<{
  value: SceneHintSource;
  label: string;
  description: string;
}> = [
  {
    value: 'manual',
    label: 'Manual hints',
    description: 'Write the hints yourself.',
  },
  {
    value: 'history',
    label: 'From history',
    description: 'Seed hints from saved prompts — favors favorites and high ratings.',
  },
  {
    value: 'random',
    label: 'Random surprise',
    description: 'Let preset options and scene pools roll ingredients.',
  },
];

export const HISTORY_SEED_SCOPE_OPTIONS: Array<{
  value: HistorySeedScope;
  label: string;
}> = [
  { value: 'tool', label: 'This tool only' },
  { value: 'related', label: 'Related tools' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'top-rated', label: '4★ and up' },
];

export function normalizeSceneHintSource(value: string | null | undefined): SceneHintSource {
  if (value === 'history' || value === 'random') {
    return value;
  }
  return 'manual';
}

export function normalizeHistorySeedScope(value: string | null | undefined): HistorySeedScope {
  if (value === 'tool' || value === 'related' || value === 'favorites' || value === 'top-rated') {
    return value;
  }
  return 'related';
}

export function resolveGenerateHintSource(settings: {
  hintSource?: SceneHintSource;
  generateSource?: 'keywords' | 'random';
}): SceneHintSource {
  if (settings.hintSource) {
    return normalizeSceneHintSource(settings.hintSource);
  }
  return settings.generateSource === 'random' ? 'random' : 'manual';
}
