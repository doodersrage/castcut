/** Durable library of Outfit/Day BYO clothing packshots for reuse across sessions. */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/browser-storage';

export const FITTING_SAVED_GARMENTS_STORAGE_KEY = 'fitting-saved-garments';
export const FITTING_SAVED_GARMENTS_CHANGED_EVENT = 'fitting-saved-garments-changed';
export const FITTING_SAVED_GARMENTS_LIMIT = 12;

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
};

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
  return { id, label, imageFilename, imageUrl, description, savedAt };
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

function writeAll(entries: SavedFittingGarment[]): SavedFittingGarment[] {
  const next = entries.slice(0, FITTING_SAVED_GARMENTS_LIMIT);
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

export function removeSavedFittingGarment(id: string | null | undefined): SavedFittingGarment[] {
  const target = id?.trim();
  if (!target) {
    return loadSavedFittingGarments();
  }
  return writeAll(readAll().filter(entry => entry.id !== target));
}
