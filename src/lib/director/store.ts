/**
 * Director: saved directions, per Cast member, in this browser (like My poses). The newest first,
 * a name each; saving under a name that exists replaces it.
 */

import { readBrowserValue, writeBrowserValue } from '@/lib/storage/browser-storage';
import { normalizeDirection, type Direction } from './types';

export const DIRECTIONS_STORAGE_KEY = 'castcut-directions-v1';
export const DIRECTIONS_CHANGED_EVENT = 'castcut-directions-changed';
export const DIRECTIONS_PER_CAST = 20;
/** Directions saved without a Cast member (a Gallery still of nobody in particular). */
export const NO_CAST = '_';

export type SavedDirection = {
  id: string;
  name: string;
  direction: Direction;
  savedAt: number;
};

type Store = Record<string, SavedDirection[]>;

function normalizeSaved(raw: unknown): SavedDirection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const direction = normalizeDirection(r.direction);
  if (!direction) return null;
  const name =
    typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : 'Direction';
  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 60) : `dir-${Date.now().toString(36)}`,
    name,
    direction,
    savedAt: typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : Date.now(),
  };
}

/** A stored value, checked: each Cast's list, valid entries only. */
export function normalizeDirectionStore(raw: unknown): Store {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Store = {};
  for (const [cast, list] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (!Array.isArray(list)) continue;
    const entries = list
      .map(normalizeSaved)
      .filter((entry): entry is SavedDirection => Boolean(entry))
      .slice(0, DIRECTIONS_PER_CAST);
    if (entries.length) out[cast.slice(0, 80)] = entries;
  }
  return out;
}

function readStore(): Store {
  if (typeof window === 'undefined') return {};
  try {
    return normalizeDirectionStore(readBrowserValue<unknown>(DIRECTIONS_STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeStore(store: Store): void {
  try {
    writeBrowserValue(DIRECTIONS_STORAGE_KEY, store);
    window.dispatchEvent(new Event(DIRECTIONS_CHANGED_EVENT));
  } catch {
    /* quota / private mode: it lasts this visit */
  }
}

export function loadDirections(castId: string | null | undefined): SavedDirection[] {
  return readStore()[castId || NO_CAST] ?? [];
}

/** Put a direction at the top of the Cast's list (replacing one of the same name). */
export function withSavedDirection(
  list: SavedDirection[],
  name: string,
  direction: Direction,
  now = Date.now()
): SavedDirection[] {
  const clean = name.trim().slice(0, 60) || 'Direction';
  const kept = list.filter(entry => entry.name.toLowerCase() !== clean.toLowerCase());
  const entry: SavedDirection = {
    id: `dir-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    direction,
    savedAt: now,
  };
  return [entry, ...kept].slice(0, DIRECTIONS_PER_CAST);
}

export function saveDirection(
  castId: string | null | undefined,
  name: string,
  direction: Direction
): SavedDirection[] {
  const store = readStore();
  const key = castId || NO_CAST;
  store[key] = withSavedDirection(store[key] ?? [], name, direction);
  writeStore(store);
  return store[key]!;
}

export function removeDirection(castId: string | null | undefined, id: string): SavedDirection[] {
  const store = readStore();
  const key = castId || NO_CAST;
  store[key] = (store[key] ?? []).filter(entry => entry.id !== id);
  if (!store[key]!.length) delete store[key];
  writeStore(store);
  return store[key] ?? [];
}
