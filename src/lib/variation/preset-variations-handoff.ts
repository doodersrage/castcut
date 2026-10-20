import { loadSettingsCache, saveSettingsCache, type VariationsToolCache } from '../settings/cache';

export const PRESET_VARIATIONS_HANDOFF_KEY = 'preset-variations-handoff-v1';

export type PresetVariationsHandoff = {
  hints: string;
  target: NonNullable<VariationsToolCache['target']>;
  count: number;
  portraitStyle?: VariationsToolCache['portraitStyle'];
  sportPresetId?: string;
  savedAt: number;
};

export function buildPresetVariationsHandoff(input: {
  hints: string;
  target?: NonNullable<VariationsToolCache['target']>;
  count?: number;
  portraitStyle?: VariationsToolCache['portraitStyle'];
  sportPresetId?: string;
}): PresetVariationsHandoff {
  return {
    hints: input.hints.trim(),
    target: input.target ?? 'generate',
    count: input.count ?? 4,
    portraitStyle: input.portraitStyle,
    sportPresetId: input.sportPresetId,
    savedAt: Date.now(),
  };
}

export function savePresetVariationsHandoff(payload: PresetVariationsHandoff): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.sessionStorage.setItem(PRESET_VARIATIONS_HANDOFF_KEY, JSON.stringify(payload));

  const cache = loadSettingsCache();
  saveSettingsCache({
    ...cache,
    tools: {
      ...cache.tools,
      variations: {
        ...cache.tools.variations,
        hints: payload.hints,
        count: payload.count,
        target: payload.target,
        portraitStyle: payload.portraitStyle,
        sportPresetId: payload.sportPresetId,
        gridMode: 'roll',
      },
    },
  });
}

export function loadPresetVariationsHandoff(): PresetVariationsHandoff | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(PRESET_VARIATIONS_HANDOFF_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PresetVariationsHandoff;
    if (!parsed.hints?.trim()) {
      return null;
    }
    if (Date.now() - parsed.savedAt > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(PRESET_VARIATIONS_HANDOFF_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function presetVariationsPath(): string {
  return '/variations?from=preset';
}
