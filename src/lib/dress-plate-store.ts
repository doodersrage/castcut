/**
 * Dressed plates shared by Day, Story and Outfit: whichever tool dressed the Cast in a given
 * clothing + shoes selection, the others start from the same plate instead of rendering it again.
 * Browser KV, synced through studio-extras like saved clothing.
 */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/browser-storage';
import {
  findDayDressPlate,
  forgetDayDressPlate,
  rememberDayDressPlate,
  type DayDressPlateEntry,
} from '@/lib/dress-plate-cache';

export const DRESS_PLATES_STORAGE_KEY = 'dress-plates';
export const DRESS_PLATES_CHANGED_EVENT = 'dress-plates-changed';

function normalize(items: unknown): DayDressPlateEntry[] {
  if (!Array.isArray(items)) return [];
  const out: DayDressPlateEntry[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const key = typeof entry.key === 'string' ? entry.key.trim() : '';
    const filename = typeof entry.filename === 'string' ? entry.filename.trim() : '';
    if (!key || !filename || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      filename,
      ...(typeof entry.imageUrl === 'string' && entry.imageUrl.trim()
        ? { imageUrl: entry.imageUrl.trim() }
        : {}),
      at: typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : Date.now(),
      ...(entry.shoesChecked === true
        ? { shoesChecked: 1 }
        : typeof entry.shoesChecked === 'number' && entry.shoesChecked > 0
          ? { shoesChecked: entry.shoesChecked }
          : {}),
    });
  }
  return out;
}

export function loadDressPlates(): DayDressPlateEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalize(readBrowserValue<unknown>(DRESS_PLATES_STORAGE_KEY));
  } catch {
    return [];
  }
}

function write(entries: DayDressPlateEntry[]): DayDressPlateEntry[] {
  if (typeof window !== 'undefined') {
    try {
      writeBrowserValue(DRESS_PLATES_STORAGE_KEY, entries);
      window.dispatchEvent(new Event(DRESS_PLATES_CHANGED_EVENT));
    } catch {
      /* ignore quota / private mode */
    }
  }
  return entries;
}

export function subscribeDressPlates(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = [DRESS_PLATES_CHANGED_EVENT, 'storage', BROWSER_STORAGE_HEALTH_EVENT];
  for (const name of events) window.addEventListener(name, onStoreChange);
  return () => {
    for (const name of events) window.removeEventListener(name, onStoreChange);
  };
}

export function findDressPlate(key: string): DayDressPlateEntry | null {
  return findDayDressPlate(loadDressPlates(), key);
}

export function saveDressPlate(entry: DayDressPlateEntry): DayDressPlateEntry[] {
  return write(rememberDayDressPlate(loadDressPlates(), entry));
}

export function removeDressPlate(key: string): DayDressPlateEntry[] {
  return write(forgetDayDressPlate(loadDressPlates(), key));
}

export function clearDressPlates(): DayDressPlateEntry[] {
  return write([]);
}

/** Replace the whole list from a synced copy (studio-extras). */
export function replaceDressPlates(entries: unknown): DayDressPlateEntry[] {
  return Array.isArray(entries) ? write(normalize(entries)) : loadDressPlates();
}
