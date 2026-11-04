/** Durable library of Outfit/Day BYO clothing packshots for reuse across sessions. */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/storage/browser-storage';
import { recordListSpec } from '@/lib/storage/record-list-sync';
import { trackRecordListWrite } from '@/lib/storage/record-tombstones';

export const FITTING_SAVED_GARMENTS_STORAGE_KEY = 'fitting-saved-garments';
export const FITTING_SAVED_GARMENTS_CHANGED_EVENT = 'fitting-saved-garments-changed';
// No cap (was 12 — the oldest dropped off silently; user request 2026-10-08). An entry is a
// filename plus its description; Browse searches a long list.
export const FITTING_SAVED_GARMENTS_LIMIT = Number.POSITIVE_INFINITY;

export type SavedFittingGarment = {
  id: string;
  /** Short label for the strip (from vision description or fallback). */
  label: string;
  /** Comfy input filename — durable handle for re-queue as Image 2. */
  imageFilename: string;
  /** View / preview URL when known (may go stale; filename is source of truth). */
  imageUrl?: string;
  description?: string;
  savedAt: number;
  /** Last edit (record-list-sync: the newest copy wins across devices). */
  updatedAt?: number;
  /** The clothing editor's tags (2026-11-04): its kind, who it's for, where it fits. */
  category?: string;
  gender?: SavedGarmentGender;
  contexts?: string[];
  /** A catalog item this was edited from (the clothing editor saves a copy). */
  fromWardrobeId?: string;
};

export type SavedGarmentGender = 'women' | 'men' | 'neutral';

/** Where a piece fits — the catalog's own context words (clothing-catalog-*.ts). */
export const SAVED_GARMENT_CONTEXTS = [
  'casual',
  'formal',
  'evening',
  'beach',
  'swimwear',
  'athletic',
  'outdoor',
  'cold',
  'warm',
  'work',
  'urban',
  'sleepwear',
  'intimate',
  'costume',
  'traditional',
] as const;

function tagFields(
  entry: Record<string, unknown>
): Pick<SavedFittingGarment, 'category' | 'gender' | 'contexts' | 'fromWardrobeId'> {
  const text = (value: unknown, max: number) =>
    typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined;
  const category = text(entry.category, 40);
  const gender =
    entry.gender === 'women' || entry.gender === 'men' || entry.gender === 'neutral'
      ? entry.gender
      : undefined;
  const contexts = Array.isArray(entry.contexts)
    ? [
        ...new Set(
          entry.contexts.filter(
            (context): context is string =>
              typeof context === 'string' &&
              (SAVED_GARMENT_CONTEXTS as readonly string[]).includes(context)
          )
        ),
      ]
    : [];
  const fromWardrobeId = text(entry.fromWardrobeId, 160);
  return {
    ...(category ? { category } : {}),
    ...(gender ? { gender } : {}),
    ...(contexts.length ? { contexts } : {}),
    ...(fromWardrobeId ? { fromWardrobeId } : {}),
  };
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `garment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Truncate a vision description into a strip label. */
export function labelForSavedFittingGarment(description?: string | null): string {
  const trimmed = description?.replace(/\s+/g, ' ').trim() ?? '';
  if (!trimmed) {
    return 'Saved clothing';
  }
  if (trimmed.length <= 48) {
    return trimmed;
  }
  const cut = trimmed.slice(0, 48);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function normalizeEntry(raw: unknown): SavedFittingGarment | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const entry = raw as Record<string, unknown>;
  const imageFilename = typeof entry.imageFilename === 'string' ? entry.imageFilename.trim() : '';
  if (!imageFilename) {
    return null;
  }
  const id = typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : newId();
  const description =
    typeof entry.description === 'string' && entry.description.trim()
      ? entry.description.trim()
      : undefined;
  const imageUrl =
    typeof entry.imageUrl === 'string' && entry.imageUrl.trim() ? entry.imageUrl.trim() : undefined;
  const label =
    typeof entry.label === 'string' && entry.label.trim()
      ? entry.label.trim()
      : labelForSavedFittingGarment(description);
  const savedAt =
    typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)
      ? entry.savedAt
      : Date.now();
  const updatedAt =
    typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
      ? entry.updatedAt
      : undefined;
  return {
    id,
    label,
    imageFilename,
    imageUrl,
    description,
    savedAt,
    ...(updatedAt ? { updatedAt } : {}),
    ...tagFields(entry),
  };
}

function readAll(): SavedFittingGarment[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    // Use browser KV (IndexedDB-backed) — raw localStorage is migrated away on boot
    // and would make saved clothing vanish after a hard refresh.
    const parsed = readBrowserValue<unknown>(FITTING_SAVED_GARMENTS_STORAGE_KEY);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const seen = new Set<string>();
    const out: SavedFittingGarment[] = [];
    for (const item of parsed) {
      const entry = normalizeEntry(item);
      if (!entry || seen.has(entry.imageFilename)) {
        continue;
      }
      seen.add(entry.imageFilename);
      out.push(entry);
    }
    return out;
  } catch {
    return [];
  }
}

function writeAll(
  entries: SavedFittingGarment[],
  options: { fromSync?: boolean } = {}
): SavedFittingGarment[] {
  const limited = entries.slice(0, FITTING_SAVED_GARMENTS_LIMIT);
  // The app's own edits and deletions are stamped for the cross-device merge; synced copies
  // already carry their times.
  const next = options.fromSync
    ? limited
    : trackRecordListWrite(recordListSpec('fittingSavedGarments'), readAll(), limited);
  if (typeof window !== 'undefined') {
    try {
      writeBrowserValue(FITTING_SAVED_GARMENTS_STORAGE_KEY, next);
      window.dispatchEvent(new Event(FITTING_SAVED_GARMENTS_CHANGED_EVENT));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return next;
}

export function loadSavedFittingGarments(
  limit = FITTING_SAVED_GARMENTS_LIMIT
): SavedFittingGarment[] {
  return readAll().slice(0, Math.max(1, limit));
}

export function subscribeSavedFittingGarments(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }
  const handler = () => onStoreChange();
  window.addEventListener(FITTING_SAVED_GARMENTS_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  // Re-read after IndexedDB hydrate / migration (boot can move LS → IDB).
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(FITTING_SAVED_GARMENTS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}

export function findSavedFittingGarmentByFilename(
  imageFilename: string | null | undefined
): SavedFittingGarment | null {
  const filename = imageFilename?.trim();
  if (!filename) {
    return null;
  }
  return readAll().find(entry => entry.imageFilename === filename) ?? null;
}

/** Persist the current Outfit clothing photo for later reuse (dedupes by filename). */
export function saveFittingGarment(input: {
  imageFilename: string;
  imageUrl?: string | null;
  description?: string | null;
  label?: string | null;
}): SavedFittingGarment {
  const imageFilename = input.imageFilename.trim();
  if (!imageFilename) {
    throw new Error('Nothing to save — upload a clothing photo first.');
  }
  const description = input.description?.trim() || undefined;
  const imageUrl = input.imageUrl?.trim() || undefined;
  const label = input.label?.trim() || labelForSavedFittingGarment(description);
  const existing = readAll();
  const prior = existing.find(entry => entry.imageFilename === imageFilename);
  const entry: SavedFittingGarment = {
    id: prior?.id ?? newId(),
    label,
    imageFilename,
    imageUrl: imageUrl ?? prior?.imageUrl,
    description: description ?? prior?.description,
    savedAt: Date.now(),
  };
  writeAll([entry, ...existing.filter(item => item.imageFilename !== imageFilename)]);
  return entry;
}

/**
 * Keep a saved photo's description in step with the active copy after Rescan or an edit —
 * otherwise re-picking the tile brings back the old (often empty) text. Keeps its place and a
 * hand-set label. Returns false when that photo is not saved.
 */
export function updateSavedFittingGarmentDescription(
  imageFilename: string | null | undefined,
  description: string | null | undefined
): boolean {
  const filename = imageFilename?.trim();
  const text = description?.trim();
  if (!filename || !text) {
    return false;
  }
  const existing = readAll();
  const index = existing.findIndex(entry => entry.imageFilename === filename);
  if (index < 0) {
    return false;
  }
  const prior = existing[index];
  if (prior.description === text) {
    return true;
  }
  const autoLabel = prior.label === labelForSavedFittingGarment(prior.description);
  const next = [...existing];
  next[index] = {
    ...prior,
    description: text,
    label: autoLabel ? labelForSavedFittingGarment(text) : prior.label,
  };
  writeAll(next);
  return true;
}

/**
 * The clothing editor's save (2026-11-04): a saved piece changed in place — its picture (a new
 * ComfyUI input file), name, description and tags — keeping its place in the list. Null when it is
 * not saved. A picture that another saved piece already uses takes that one's place.
 */
export function editSavedFittingGarment(
  id: string,
  patch: Partial<
    Pick<
      SavedFittingGarment,
      | 'label'
      | 'description'
      | 'imageFilename'
      | 'imageUrl'
      | 'category'
      | 'gender'
      | 'contexts'
      | 'fromWardrobeId'
    >
  >
): SavedFittingGarment | null {
  const existing = readAll();
  const index = existing.findIndex(entry => entry.id === id);
  if (index < 0) return null;
  const prior = existing[index]!;
  const imageFilename = patch.imageFilename?.trim() || prior.imageFilename;
  const merged = normalizeEntry({
    ...prior,
    ...patch,
    imageFilename,
    // A new picture: its old view URL no longer shows it.
    imageUrl:
      imageFilename !== prior.imageFilename
        ? patch.imageUrl?.trim() || undefined
        : (patch.imageUrl ?? prior.imageUrl),
  });
  if (!merged) return null;
  const next = existing
    .map((entry, at) => (at === index ? merged : entry))
    .filter((entry, at) => at === index || entry.imageFilename !== imageFilename);
  writeAll(next);
  return merged;
}

/**
 * A catalog item edited in the clothing editor, saved as the player's own copy (the catalog
 * item stays as it ships): first in the list.
 */
export function saveEditedCatalogGarment(input: {
  fromWardrobeId: string;
  imageFilename: string;
  imageUrl?: string | null;
  label: string;
  description?: string | null;
  category?: string;
  gender?: SavedGarmentGender;
  contexts?: string[];
}): SavedFittingGarment {
  const saved = saveFittingGarment({
    imageFilename: input.imageFilename,
    imageUrl: input.imageUrl,
    description: input.description,
    label: input.label,
  });
  return (
    editSavedFittingGarment(saved.id, {
      fromWardrobeId: input.fromWardrobeId,
      ...(input.category ? { category: input.category } : {}),
      ...(input.gender ? { gender: input.gender } : {}),
      ...(input.contexts?.length ? { contexts: input.contexts } : {}),
    }) ?? saved
  );
}

/** Replace the whole list from a synced copy (studio-extras); returns what was kept. */
export function replaceSavedFittingGarments(entries: unknown): SavedFittingGarment[] {
  if (!Array.isArray(entries)) {
    return loadSavedFittingGarments();
  }
  const seen = new Set<string>();
  const next: SavedFittingGarment[] = [];
  for (const item of entries) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.imageFilename)) {
      continue;
    }
    seen.add(entry.imageFilename);
    next.push(entry);
  }
  return writeAll(next, { fromSync: true });
}

export function removeSavedFittingGarment(id: string | null | undefined): SavedFittingGarment[] {
  const target = id?.trim();
  if (!target) {
    return loadSavedFittingGarments();
  }
  return writeAll(readAll().filter(entry => entry.id !== target));
}
