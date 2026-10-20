import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import type { NsfwGeneratorPreset, NsfwPresetCategory } from './nsfw-generator-presets';

export const USER_NSFW_GENERATOR_PRESETS_KEY = 'comfy-prompt-user-nsfw-presets-v1';
export const NSFW_PRESET_PREFS_KEY = 'comfy-prompt-nsfw-preset-prefs-v1';
export const MAX_USER_NSFW_PRESETS = 48;
export const MAX_NSFW_RECENT_PRESETS = 12;

export type UserNsfwGeneratorPreset = NsfwGeneratorPreset & {
  createdAt: number;
  user: true;
};

export type NsfwPresetPrefs = {
  favoriteIds: string[];
  recentIds: string[];
};

const EMPTY_PREFS: NsfwPresetPrefs = { favoriteIds: [], recentIds: [] };

function normalizeCategory(value: unknown): NsfwPresetCategory {
  if (value === 'mood' || value === 'setting' || value === 'style' || value === 'subject') {
    return value;
  }
  return 'subject';
}

export function normalizeUserNsfwGeneratorPreset(value: unknown): UserNsfwGeneratorPreset | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim().slice(0, 64) : '';
  const label = typeof record.label === 'string' ? record.label.trim().slice(0, 48) : '';
  const hints = typeof record.hints === 'string' ? record.hints.trim().slice(0, 1200) : '';
  if (!id || !label || !hints) {
    return null;
  }
  const createdAt = Number(record.createdAt);
  return {
    id,
    label,
    hints,
    category: normalizeCategory(record.category),
    mood: typeof record.mood === 'string' ? record.mood.trim().slice(0, 120) : undefined,
    duo: record.duo === true,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    user: true,
  };
}

export function loadUserNsfwGeneratorPresets(): UserNsfwGeneratorPreset[] {
  const raw = readBrowserValue<unknown>(USER_NSFW_GENERATOR_PRESETS_KEY) ?? [];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map(entry => normalizeUserNsfwGeneratorPreset(entry))
    .filter((entry): entry is UserNsfwGeneratorPreset => Boolean(entry))
    .slice(0, MAX_USER_NSFW_PRESETS);
}

export function saveUserNsfwGeneratorPresets(presets: UserNsfwGeneratorPreset[]): void {
  writeBrowserValue(
    USER_NSFW_GENERATOR_PRESETS_KEY,
    presets
      .map(entry => normalizeUserNsfwGeneratorPreset(entry))
      .filter((entry): entry is UserNsfwGeneratorPreset => Boolean(entry))
      .slice(0, MAX_USER_NSFW_PRESETS)
  );
}

export function createUserNsfwGeneratorPreset(
  input: Omit<UserNsfwGeneratorPreset, 'id' | 'createdAt' | 'user'> & { id?: string }
): UserNsfwGeneratorPreset {
  return {
    ...input,
    id: input.id ?? `user-nsfw-${crypto.randomUUID()}`,
    createdAt: Date.now(),
    user: true,
  };
}

export function upsertUserNsfwGeneratorPreset(preset: UserNsfwGeneratorPreset): void {
  const presets = loadUserNsfwGeneratorPresets();
  const index = presets.findIndex(entry => entry.id === preset.id);
  if (index >= 0) {
    presets[index] = preset;
  } else {
    presets.unshift(preset);
  }
  saveUserNsfwGeneratorPresets(presets);
}

export function deleteUserNsfwGeneratorPreset(id: string): void {
  saveUserNsfwGeneratorPresets(loadUserNsfwGeneratorPresets().filter(entry => entry.id !== id));
  const prefs = loadNsfwPresetPrefs();
  saveNsfwPresetPrefs({
    favoriteIds: prefs.favoriteIds.filter(entry => entry !== id),
    recentIds: prefs.recentIds.filter(entry => entry !== id),
  });
}

export function loadNsfwPresetPrefs(): NsfwPresetPrefs {
  const raw = readBrowserValue<NsfwPresetPrefs>(NSFW_PRESET_PREFS_KEY);
  if (!raw || typeof raw !== 'object') {
    return { ...EMPTY_PREFS };
  }
  const favoriteIds = Array.isArray(raw.favoriteIds)
    ? raw.favoriteIds
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .slice(0, MAX_USER_NSFW_PRESETS)
    : [];
  const recentIds = Array.isArray(raw.recentIds)
    ? raw.recentIds
        .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
        .filter(Boolean)
        .slice(0, MAX_NSFW_RECENT_PRESETS)
    : [];
  return { favoriteIds, recentIds };
}

export function saveNsfwPresetPrefs(prefs: NsfwPresetPrefs): void {
  writeBrowserValue(NSFW_PRESET_PREFS_KEY, {
    favoriteIds: prefs.favoriteIds.slice(0, MAX_USER_NSFW_PRESETS),
    recentIds: prefs.recentIds.slice(0, MAX_NSFW_RECENT_PRESETS),
  });
}

export function toggleNsfwPresetFavorite(id: string): NsfwPresetPrefs {
  const trimmed = id.trim();
  if (!trimmed) {
    return loadNsfwPresetPrefs();
  }
  const prefs = loadNsfwPresetPrefs();
  const next = prefs.favoriteIds.includes(trimmed)
    ? prefs.favoriteIds.filter(entry => entry !== trimmed)
    : [trimmed, ...prefs.favoriteIds];
  const updated = { ...prefs, favoriteIds: next.slice(0, MAX_USER_NSFW_PRESETS) };
  saveNsfwPresetPrefs(updated);
  return updated;
}

export function pushNsfwPresetRecent(id: string): NsfwPresetPrefs {
  const trimmed = id.trim();
  if (!trimmed) {
    return loadNsfwPresetPrefs();
  }
  const prefs = loadNsfwPresetPrefs();
  const updated = {
    ...prefs,
    recentIds: [trimmed, ...prefs.recentIds.filter(entry => entry !== trimmed)].slice(
      0,
      MAX_NSFW_RECENT_PRESETS
    ),
  };
  saveNsfwPresetPrefs(updated);
  return updated;
}

export type UserNsfwPresetPack = {
  version: 1;
  exportedAt: string;
  presets: UserNsfwGeneratorPreset[];
  prefs?: NsfwPresetPrefs;
};

export function exportUserNsfwPresetPack(): UserNsfwPresetPack {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: loadUserNsfwGeneratorPresets(),
    prefs: loadNsfwPresetPrefs(),
  };
}

export function importUserNsfwPresetPack(
  pack: UserNsfwPresetPack,
  mode: 'merge' | 'replace' = 'merge'
): UserNsfwGeneratorPreset[] {
  if (!pack || pack.version !== 1 || !Array.isArray(pack.presets)) {
    throw new Error('Invalid adult preset pack.');
  }
  const incoming = pack.presets
    .map(entry => normalizeUserNsfwGeneratorPreset(entry))
    .filter((entry): entry is UserNsfwGeneratorPreset => Boolean(entry));
  const next =
    mode === 'replace'
      ? incoming
      : [
          ...incoming,
          ...loadUserNsfwGeneratorPresets().filter(
            existing => !incoming.some(entry => entry.id === existing.id)
          ),
        ];
  saveUserNsfwGeneratorPresets(next.slice(0, MAX_USER_NSFW_PRESETS));
  if (pack.prefs) {
    saveNsfwPresetPrefs({
      favoriteIds: pack.prefs.favoriteIds ?? [],
      recentIds: pack.prefs.recentIds ?? [],
    });
  }
  return loadUserNsfwGeneratorPresets();
}
