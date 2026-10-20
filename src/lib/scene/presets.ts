import type { SharedToolSettings } from '../settings/cache';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const SCENE_PRESETS_KEY = 'comfy-prompt-scene-presets-v1';

export type ScenePreset = {
  id: string;
  name: string;
  createdAt: number;
  hints?: string;
  sportPresetId?: string;
  tool?: string;
  sharedLocks?: Pick<
    SharedToolSettings,
    'lockedWardrobeId' | 'lockedLocation' | 'lockedVariationSeed'
  >;
};

export function loadScenePresets(): ScenePreset[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const presets = readBrowserValue<ScenePreset[]>(SCENE_PRESETS_KEY) ?? [];
    return dedupeScenePresets(presets);
  } catch {
    return [];
  }
}

function dedupeScenePresets(presets: ScenePreset[]): ScenePreset[] {
  const seen = new Set<string>();
  const deduped: ScenePreset[] = [];
  for (const preset of presets) {
    const key = `${preset.name.trim().toLowerCase()}|${(preset.hints ?? '').trim().toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(preset);
  }
  return deduped;
}

export function saveScenePresets(presets: ScenePreset[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(SCENE_PRESETS_KEY, dedupeScenePresets(presets).slice(0, 40));
}

export function createScenePreset(input: Omit<ScenePreset, 'id' | 'createdAt'>): ScenePreset {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
}

export function upsertScenePreset(preset: ScenePreset): void {
  const presets = loadScenePresets();
  const index = presets.findIndex(entry => entry.id === preset.id);
  if (index >= 0) {
    presets[index] = preset;
  } else {
    presets.unshift(preset);
  }
  saveScenePresets(presets);
}

export function deleteScenePreset(id: string): void {
  saveScenePresets(loadScenePresets().filter(entry => entry.id !== id));
}

export function applyScenePresetLocks(preset: ScenePreset): Partial<SharedToolSettings> {
  return {
    lockedWardrobeId: preset.sharedLocks?.lockedWardrobeId,
    lockedLocation: preset.sharedLocks?.lockedLocation,
    lockedVariationSeed: preset.sharedLocks?.lockedVariationSeed,
  };
}

export function buildScenePresetFromCurrent(input: {
  name: string;
  hints?: string;
  sportPresetId?: string;
  tool?: string;
  shared: SharedToolSettings;
}): ScenePreset {
  return createScenePreset({
    name: input.name.trim(),
    hints: input.hints?.trim() || undefined,
    sportPresetId: input.sportPresetId || undefined,
    tool: input.tool,
    sharedLocks: {
      lockedWardrobeId: input.shared.lockedWardrobeId,
      lockedLocation: input.shared.lockedLocation,
      lockedVariationSeed: input.shared.lockedVariationSeed,
    },
  });
}
