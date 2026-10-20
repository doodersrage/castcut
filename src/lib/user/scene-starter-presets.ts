import type { SceneStarterPreset } from '../scene/starter-types';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const USER_SCENE_STARTER_PRESETS_KEY = 'comfy-prompt-user-scene-starter-presets-v1';

export type UserSceneStarterPreset = SceneStarterPreset & {
  createdAt: number;
  favorite?: boolean;
  source?: 'user' | 'promoted';
};

export function loadUserSceneStarterPresets(): UserSceneStarterPreset[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    return readBrowserValue<UserSceneStarterPreset[]>(USER_SCENE_STARTER_PRESETS_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveUserSceneStarterPresets(presets: UserSceneStarterPreset[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(USER_SCENE_STARTER_PRESETS_KEY, presets.slice(0, 80));
}

export function createUserSceneStarterPreset(
  input: Omit<UserSceneStarterPreset, 'id' | 'createdAt'> & { id?: string }
): UserSceneStarterPreset {
  return {
    ...input,
    id: input.id ?? `user-${crypto.randomUUID()}`,
    createdAt: Date.now(),
    tags: input.tags ?? [],
  };
}

export function upsertUserSceneStarterPreset(preset: UserSceneStarterPreset): void {
  const presets = loadUserSceneStarterPresets();
  const index = presets.findIndex(entry => entry.id === preset.id);
  if (index >= 0) {
    presets[index] = preset;
  } else {
    presets.unshift(preset);
  }
  saveUserSceneStarterPresets(presets);
}

export function deleteUserSceneStarterPreset(id: string): void {
  saveUserSceneStarterPresets(loadUserSceneStarterPresets().filter(entry => entry.id !== id));
}

export function toggleUserSceneStarterFavorite(id: string): void {
  const presets = loadUserSceneStarterPresets();
  const index = presets.findIndex(entry => entry.id === id);
  if (index < 0) {
    return;
  }
  presets[index] = {
    ...presets[index],
    favorite: !presets[index].favorite,
  };
  saveUserSceneStarterPresets(presets);
}

export function buildUserSceneStarterFromHints(input: {
  label: string;
  hints: string;
  category?: UserSceneStarterPreset['category'];
  portraitStyle?: UserSceneStarterPreset['portraitStyle'];
  duo?: boolean;
  source?: UserSceneStarterPreset['source'];
}): UserSceneStarterPreset {
  return createUserSceneStarterPreset({
    label: input.label.trim(),
    hints: input.hints.trim(),
    category: input.category ?? 'lifestyle',
    portraitStyle: input.portraitStyle,
    duo: input.duo,
    source: input.source ?? 'user',
  });
}
