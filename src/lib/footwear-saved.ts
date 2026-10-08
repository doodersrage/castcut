/** Durable library of your own shoe photos (Outfit / Day / Story footwear), like saved clothing. */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/browser-storage';
import { normalizeFootwear } from '@/lib/footwear';

export const SAVED_FOOTWEAR_STORAGE_KEY = 'footwear-saved';
export const SAVED_FOOTWEAR_CHANGED_EVENT = 'footwear-saved-changed';
// No cap (was 12; user request 2026-10-08) — see FITTING_SAVED_GARMENTS_LIMIT.
export const SAVED_FOOTWEAR_LIMIT = Number.POSITIVE_INFINITY;

export type SavedFootwear = {
  id: string;
  /** Strip label (from the words, or a fallback). */
  label: string;
  /** Comfy input filename of the shoe packshot — what a still is shown. */
  imageFilename: string;
  /** Preview URL when known (may go stale; the filename is the source of truth). */
  imageUrl?: string;
  /** What the prompt names the shoes. */
  words?: string;
  savedAt: number;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `footwear-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function labelForSavedFootwear(words?: string | null): string {
  const text = normalizeFootwear(words);
  if (!text) return 'Saved shoes';
  if (text.length <= 48) return text;
  const cut = text.slice(0, 48);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

function normalizeEntry(raw: unknown): SavedFootwear | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const imageFilename = typeof entry.imageFilename === 'string' ? entry.imageFilename.trim() : '';
  if (!imageFilename) return null;
  const words = normalizeFootwear(entry.words) || undefined;
  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id.trim() : newId(),
    label:
      typeof entry.label === 'string' && entry.label.trim()
        ? entry.label.trim()
        : labelForSavedFootwear(words),
    imageFilename,
    imageUrl:
      typeof entry.imageUrl === 'string' && entry.imageUrl.trim()
        ? entry.imageUrl.trim()
        : undefined,
    words,
    savedAt:
      typeof entry.savedAt === 'number' && Number.isFinite(entry.savedAt)
        ? entry.savedAt
        : Date.now(),
  };
}

function normalizeList(items: unknown): SavedFootwear[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const out: SavedFootwear[] = [];
  for (const item of items) {
    const entry = normalizeEntry(item);
    if (!entry || seen.has(entry.imageFilename)) continue;
    seen.add(entry.imageFilename);
    out.push(entry);
  }
  return out;
}

function readAll(): SavedFootwear[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeList(readBrowserValue<unknown>(SAVED_FOOTWEAR_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeAll(entries: SavedFootwear[]): SavedFootwear[] {
  const next = entries.slice(0, SAVED_FOOTWEAR_LIMIT);
  if (typeof window !== 'undefined') {
    try {
      writeBrowserValue(SAVED_FOOTWEAR_STORAGE_KEY, next);
      window.dispatchEvent(new Event(SAVED_FOOTWEAR_CHANGED_EVENT));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return next;
}

export function loadSavedFootwear(): SavedFootwear[] {
  return readAll().slice(0, SAVED_FOOTWEAR_LIMIT);
}

export function subscribeSavedFootwear(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onStoreChange();
  const events = [SAVED_FOOTWEAR_CHANGED_EVENT, 'storage', BROWSER_STORAGE_HEALTH_EVENT];
  for (const name of events) window.addEventListener(name, handler);
  return () => {
    for (const name of events) window.removeEventListener(name, handler);
  };
}

export function findSavedFootwearByFilename(
  imageFilename: string | null | undefined
): SavedFootwear | null {
  const filename = imageFilename?.trim();
  return filename ? (readAll().find(entry => entry.imageFilename === filename) ?? null) : null;
}

/** Keep the current shoe photo for later (dedupes by filename; newest first). */
export function saveFootwear(input: {
  imageFilename: string;
  imageUrl?: string | null;
  words?: string | null;
}): SavedFootwear {
  const imageFilename = input.imageFilename.trim();
  if (!imageFilename) {
    throw new Error('Nothing to save — upload a shoe photo first.');
  }
  const existing = readAll();
  const prior = existing.find(entry => entry.imageFilename === imageFilename);
  const words = normalizeFootwear(input.words) || prior?.words;
  const entry: SavedFootwear = {
    id: prior?.id ?? newId(),
    label: labelForSavedFootwear(words),
    imageFilename,
    imageUrl: input.imageUrl?.trim() || prior?.imageUrl,
    words,
    savedAt: Date.now(),
  };
  writeAll([entry, ...existing.filter(item => item.imageFilename !== imageFilename)]);
  return entry;
}

/** Keep a saved photo's words in step with an edit; false when that photo is not saved. */
export function updateSavedFootwearWords(
  imageFilename: string | null | undefined,
  words: string | null | undefined
): boolean {
  const filename = imageFilename?.trim();
  const text = normalizeFootwear(words);
  if (!filename || !text) return false;
  const existing = readAll();
  const index = existing.findIndex(entry => entry.imageFilename === filename);
  if (index < 0) return false;
  if (existing[index]!.words === text) return true;
  const next = [...existing];
  next[index] = { ...existing[index]!, words: text, label: labelForSavedFootwear(text) };
  writeAll(next);
  return true;
}

/** Replace the whole list from a synced copy (studio-extras); returns what was kept. */
export function replaceSavedFootwear(entries: unknown): SavedFootwear[] {
  return Array.isArray(entries) ? writeAll(normalizeList(entries)) : loadSavedFootwear();
}

export function removeSavedFootwear(id: string | null | undefined): SavedFootwear[] {
  const target = id?.trim();
  return target ? writeAll(readAll().filter(entry => entry.id !== target)) : loadSavedFootwear();
}
