/**
 * LoRA library housekeeping: merge file scans (lora-family-detect.ts), find stack picks that
 * can't apply to their model, and named stacks per model family.
 */

import { isLoraCompatibleWithModel } from './lora-model-compat';
import { loraFamilyForModel, type LoraFamily } from './lora-family-detect';
import type { LoraLibraryEntry, SessionLoraStrengthOverrides } from './lora-stack';

export type LoraScanRow = {
  filename: string;
  family: LoraFamily;
  source: 'metadata' | 'keys' | 'unreadable' | 'missing';
  trigger?: string;
};

/** Stacks larger than this fight each other even when every LoRA matches the model. */
export const LORA_STACK_WARN_SIZE = 6;

/** Library entries that have a file but were never scanned (or the scan couldn't read them). */
export function loraEntriesNeedingScan(library: LoraLibraryEntry[]): LoraLibraryEntry[] {
  return library.filter(
    entry =>
      entry.tokenValue?.trim() &&
      (!entry.family || entry.familySource === 'unreadable' || entry.familySource === 'missing')
  );
}

/** Merge scan rows into the library: family + source, and a trigger where none was set. */
export function applyLoraScanResults(
  library: LoraLibraryEntry[],
  rows: LoraScanRow[]
): { library: LoraLibraryEntry[]; changed: number } {
  const byFile = new Map(rows.map(row => [row.filename.trim(), row] as const));
  let changed = 0;
  const next = library.map(entry => {
    const row = byFile.get(entry.tokenValue?.trim() ?? '');
    if (!row) return entry;
    const trigger = !entry.triggerPhrase?.trim() && row.trigger ? row.trigger : entry.triggerPhrase;
    if (
      entry.family === row.family &&
      entry.familySource === row.source &&
      trigger === entry.triggerPhrase
    ) {
      return entry;
    }
    changed += 1;
    return { ...entry, family: row.family, familySource: row.source, triggerPhrase: trigger };
  });
  return { library: next, changed };
}

/** Picked LoRA ids that can't apply to `model` (wrong family, or no longer in the library). */
export function incompatibleLoraIds(
  library: LoraLibraryEntry[],
  ids: readonly string[],
  model: string
): string[] {
  const byId = new Map(library.map(entry => [entry.id, entry] as const));
  return ids.filter(id => {
    const entry = byId.get(id);
    return !entry || !isLoraCompatibleWithModel(entry, model);
  });
}

export type LoraStackAudit = {
  model: string;
  ids: string[];
  incompatible: string[];
  oversized: boolean;
};

/** One row per model that has its own picks: what can't apply and whether the stack is huge. */
export function auditLoraStacksByModel(
  library: LoraLibraryEntry[],
  byModel: Partial<Record<string, string[]>> | undefined
): LoraStackAudit[] {
  return Object.entries(byModel ?? {})
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    .map(([model, ids]) => {
      const incompatible = incompatibleLoraIds(library, ids, model);
      return {
        model,
        ids,
        incompatible,
        oversized: ids.length - incompatible.length > LORA_STACK_WARN_SIZE,
      };
    })
    .filter(row => row.incompatible.length > 0 || row.oversized);
}

/** `byModel` with every pick that can't apply to its model removed. */
export function pruneIncompatibleLoraPicks(
  library: LoraLibraryEntry[],
  byModel: Partial<Record<string, string[]>> | undefined
): { byModel: Partial<Record<string, string[]>>; removed: number } {
  let removed = 0;
  const next: Partial<Record<string, string[]>> = {};
  for (const [model, ids] of Object.entries(byModel ?? {})) {
    if (!Array.isArray(ids)) continue;
    const bad = new Set(incompatibleLoraIds(library, ids, model));
    removed += bad.size;
    next[model] = ids.filter(id => !bad.has(id));
  }
  return { byModel: next, removed };
}

export type LoraStackPreset = {
  id: string;
  name: string;
  /** Family the stack was saved for — offered on every model of that family. */
  family: LoraFamily;
  loraIds: string[];
  strengthOverrides?: SessionLoraStrengthOverrides;
};

export function normalizeLoraStackPresets(raw: unknown): LoraStackPreset[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (preset): preset is LoraStackPreset =>
      Boolean(preset) &&
      typeof preset.id === 'string' &&
      typeof preset.name === 'string' &&
      typeof preset.family === 'string' &&
      Array.isArray(preset.loraIds)
  );
}

/** Stacks saved for the model's family. */
export function loraStackPresetsForModel(
  presets: LoraStackPreset[],
  model: string
): LoraStackPreset[] {
  const family = loraFamilyForModel(model);
  return family ? presets.filter(preset => preset.family === family) : [];
}

/** Save (or replace, by name within the family) the current picks as a named stack. */
export function saveLoraStackPreset(
  presets: LoraStackPreset[],
  input: {
    name: string;
    model: string;
    loraIds: string[];
    strengthOverrides?: SessionLoraStrengthOverrides;
  }
): LoraStackPreset[] {
  const family = loraFamilyForModel(input.model) ?? 'unknown';
  const name = input.name.trim();
  if (!name) return presets;
  const preset: LoraStackPreset = {
    id: `${family}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    family,
    loraIds: [...input.loraIds],
    ...(input.strengthOverrides && Object.keys(input.strengthOverrides).length
      ? { strengthOverrides: input.strengthOverrides }
      : {}),
  };
  return [...presets.filter(existing => existing.id !== preset.id), preset];
}

export function deleteLoraStackPreset(presets: LoraStackPreset[], id: string): LoraStackPreset[] {
  return presets.filter(preset => preset.id !== id);
}

export type LoraUsageStats = {
  /** Finished images queued with this LoRA on a model it applies to. */
  images: number;
  favorites: number;
  /** Images rated 4–5 in gallery review. */
  wellRated: number;
  /** Mean Play face match (0–1) of images with this LoRA, and of same-family images without. */
  faceWith: number | null;
  faceWithout: number | null;
  faceSamples: number;
};

/** Minimum face-checked images on each side before comparing faces with / without a LoRA. */
export const LORA_USAGE_MIN_FACE_SAMPLES = 3;

type UsageGalleryEntry = {
  status?: string;
  model?: string;
  sessionActiveLoraIds?: string[];
  favorite?: boolean;
  reviewRating?: number;
  playChecks?: { face?: number };
};

const mean = (values: number[]) =>
  values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000
    : null;

/** How each library LoRA shows up in the gallery: uses, favorites, good ratings, face match. */
export function loraUsageStats(
  library: LoraLibraryEntry[],
  gallery: UsageGalleryEntry[]
): Map<string, LoraUsageStats> {
  const finished = gallery.filter(entry => entry.status === 'completed' && entry.model);
  const stats = new Map<string, LoraUsageStats>();
  for (const lora of library) {
    const family = lora.family && lora.familySource !== 'missing' ? lora.family : null;
    const applies = finished.filter(entry => isLoraCompatibleWithModel(lora, entry.model!));
    const withIt = applies.filter(entry => entry.sessionActiveLoraIds?.includes(lora.id));
    if (withIt.length === 0) continue;
    const withFaces = withIt
      .map(entry => entry.playChecks?.face)
      .filter((face): face is number => typeof face === 'number');
    const withoutFaces = (family ? applies : [])
      .filter(entry => !entry.sessionActiveLoraIds?.includes(lora.id))
      .map(entry => entry.playChecks?.face)
      .filter((face): face is number => typeof face === 'number');
    const compare =
      withFaces.length >= LORA_USAGE_MIN_FACE_SAMPLES &&
      withoutFaces.length >= LORA_USAGE_MIN_FACE_SAMPLES;
    stats.set(lora.id, {
      images: withIt.length,
      favorites: withIt.filter(entry => entry.favorite === true).length,
      wellRated: withIt.filter(entry => (entry.reviewRating ?? 0) >= 4).length,
      faceWith: compare ? mean(withFaces) : null,
      faceWithout: compare ? mean(withoutFaces) : null,
      faceSamples: withFaces.length,
    });
  }
  return stats;
}

function loraFileKey(entry: LoraLibraryEntry): string {
  return (entry.tokenValue ?? '').trim().replace(/\\/g, '/').toLowerCase();
}

/** Entries whose file is gone from ComfyUI (scan source `missing`). */
export function missingLoraEntries(library: LoraLibraryEntry[]): LoraLibraryEntry[] {
  return library.filter(entry => entry.familySource === 'missing');
}

/** Groups of entries pointing at the same file (first entry first). */
export function duplicateLoraEntries(library: LoraLibraryEntry[]): LoraLibraryEntry[][] {
  const groups = new Map<string, LoraLibraryEntry[]>();
  for (const entry of library) {
    const key = loraFileKey(entry);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

/**
 * Drop `ids` from the library and from every model's session picks. Picks of a removed
 * duplicate move to the entry that stays (`replaceWith`).
 */
export function removeLoraEntries(
  library: LoraLibraryEntry[],
  byModel: Partial<Record<string, string[]>> | undefined,
  ids: Iterable<string>,
  replaceWith?: Record<string, string>
): { library: LoraLibraryEntry[]; byModel: Partial<Record<string, string[]>> } {
  const drop = new Set(ids);
  const nextByModel: Partial<Record<string, string[]>> = {};
  for (const [model, picks] of Object.entries(byModel ?? {})) {
    if (!Array.isArray(picks)) continue;
    const next: string[] = [];
    for (const id of picks) {
      const kept = drop.has(id) ? replaceWith?.[id] : id;
      if (kept && !next.includes(kept)) next.push(kept);
    }
    nextByModel[model] = next;
  }
  return { library: library.filter(entry => !drop.has(entry.id)), byModel: nextByModel };
}

export type LoraMembership = { models: string[]; savedStacks: string[] };

/** Which models' session stacks and which saved stacks include each LoRA id. */
export function loraStackMembership(
  byModel: Partial<Record<string, string[]>> | undefined,
  presets: LoraStackPreset[]
): Map<string, LoraMembership> {
  const result = new Map<string, LoraMembership>();
  const entry = (id: string) => {
    const existing = result.get(id);
    if (existing) return existing;
    const created: LoraMembership = { models: [], savedStacks: [] };
    result.set(id, created);
    return created;
  };
  for (const [model, ids] of Object.entries(byModel ?? {})) {
    for (const id of ids ?? []) entry(id).models.push(model);
  }
  for (const preset of presets) {
    for (const id of preset.loraIds) entry(id).savedStacks.push(preset.name);
  }
  return result;
}
