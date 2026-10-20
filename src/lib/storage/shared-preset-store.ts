import { loadSharedPresets, saveSharedPresets } from '@/lib/sqlite/tables';

export type SharedPresetEntry = {
  id: string;
  label: string;
  hints: string;
  category?: string;
  model?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  publishedBy?: string;
};

export function listSharedPresets(): SharedPresetEntry[] {
  return loadSharedPresets().sort((a, b) => a.label.localeCompare(b.label));
}

export function upsertSharedPreset(
  input: Omit<SharedPresetEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
): SharedPresetEntry {
  const presets = loadSharedPresets();
  const now = Date.now();
  const index = input.id
    ? presets.findIndex(entry => entry.id === input.id)
    : presets.findIndex(
        entry => entry.label.trim().toLowerCase() === input.label.trim().toLowerCase()
      );

  const next: SharedPresetEntry = {
    id: input.id ?? `shared-${now}`,
    label: input.label.trim(),
    hints: input.hints.trim(),
    category: input.category?.trim() || undefined,
    model: input.model?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    publishedBy: input.publishedBy,
    createdAt: index >= 0 ? presets[index].createdAt : now,
    updatedAt: now,
  };

  if (index >= 0) {
    presets[index] = next;
  } else {
    presets.unshift(next);
  }

  saveSharedPresets(presets);
  return next;
}

export function deleteSharedPreset(id: string): void {
  saveSharedPresets(loadSharedPresets().filter(entry => entry.id !== id));
}
