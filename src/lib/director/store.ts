/**
 * Director: saved directions, per Cast member — stored and synced like My poses: one list in
 * browser storage, carried to the server in studio-extras (`directorDirections`, Play's section)
 * and merged record by record across devices (record-list-sync: the newest copy of each wins,
 * deletions travel). Newest first, a name each per Cast member; saving under a name that exists
 * replaces it.
 *
 * Before (v2.12.13) they were kept per browser only, as one object of lists by Cast id
 * (castcut-directions-v1); the first read moves those into the synced list once.
 */

import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  removeBrowserKey,
  writeBrowserValue,
} from '@/lib/storage/browser-storage';
import { mergeRecordList, recordListSpec } from '@/lib/storage/record-list-sync';
import { trackRecordListWrite } from '@/lib/storage/record-tombstones';
import { normalizeDirection, type Direction } from './types';

export const DIRECTIONS_STORAGE_KEY = 'castcut-directions-v2';
/** The browser-only store before directions synced (one-time migration). */
export const DIRECTIONS_V1_STORAGE_KEY = 'castcut-directions-v1';
export const DIRECTIONS_CHANGED_EVENT = 'castcut-directions-changed';
export const DIRECTIONS_PER_CAST = 20;
/** All Cast members together. */
export const DIRECTIONS_LIMIT = 200;
/** Directions saved without a Cast member (a Gallery still of nobody in particular). */
export const NO_CAST = '_';

export type SavedDirection = {
  id: string;
  /** Whose direction it is (NO_CAST for nobody in particular). */
  castId: string;
  name: string;
  direction: Direction;
  savedAt: number;
  /** Last edit (record-list-sync: the newest copy wins across devices). */
  updatedAt?: number;
};

const castKey = (castId: string | null | undefined) => (castId || NO_CAST).slice(0, 80);

function newId(now: number): string {
  return `dir-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeSavedDirection(raw: unknown, castId?: string): SavedDirection | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const direction = normalizeDirection(r.direction);
  if (!direction) return null;
  const name =
    typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : 'Direction';
  const savedAt =
    typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : Date.now();
  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 60) : newId(savedAt),
    castId: castKey(castId ?? (typeof r.castId === 'string' ? r.castId : '')),
    name,
    direction,
    savedAt,
    ...(typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt)
      ? { updatedAt: r.updatedAt }
      : {}),
  };
}

/** A stored list, checked: valid entries only, at most DIRECTIONS_PER_CAST per Cast member. */
export function normalizeDirectionList(raw: unknown): SavedDirection[] {
  if (!Array.isArray(raw)) return [];
  const perCast = new Map<string, number>();
  const out: SavedDirection[] = [];
  for (const entry of raw) {
    const saved = normalizeSavedDirection(entry);
    if (!saved) continue;
    const count = perCast.get(saved.castId) ?? 0;
    if (count >= DIRECTIONS_PER_CAST) continue;
    perCast.set(saved.castId, count + 1);
    out.push(saved);
    if (out.length >= DIRECTIONS_LIMIT) break;
  }
  return out;
}

/** The v1 store (lists by Cast id) as one list, newest first; edit times from when saved. */
export function migrateDirectionStore(raw: unknown): SavedDirection[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const all: SavedDirection[] = [];
  for (const [cast, list] of Object.entries(raw as Record<string, unknown>).slice(0, 200)) {
    if (!Array.isArray(list)) continue;
    for (const entry of list.slice(0, DIRECTIONS_PER_CAST)) {
      const saved = normalizeSavedDirection(entry, cast);
      if (saved) all.push({ ...saved, updatedAt: saved.updatedAt ?? saved.savedAt });
    }
  }
  return normalizeDirectionList(all.sort((a, b) => b.savedAt - a.savedAt));
}

function writeAll(entries: SavedDirection[], options: { fromSync?: boolean } = {}) {
  const limited = normalizeDirectionList(entries);
  const next = options.fromSync
    ? limited
    : trackRecordListWrite(recordListSpec('directorDirections'), loadAllDirections(), limited);
  if (typeof window === 'undefined') return next;
  try {
    writeBrowserValue(DIRECTIONS_STORAGE_KEY, next);
    window.dispatchEvent(new Event(DIRECTIONS_CHANGED_EVENT));
  } catch {
    /* quota / private mode: it lasts this visit */
  }
  return next;
}

/** Every saved direction, every Cast member (studio-extras collects this). */
export function loadAllDirections(): SavedDirection[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = readBrowserValue<unknown>(DIRECTIONS_STORAGE_KEY);
    if (stored == null) {
      // Once: the browser-only store moves into the synced list (and goes).
      const old = migrateDirectionStore(readBrowserValue<unknown>(DIRECTIONS_V1_STORAGE_KEY));
      if (old.length) {
        writeBrowserValue(DIRECTIONS_STORAGE_KEY, old);
        removeBrowserKey(DIRECTIONS_V1_STORAGE_KEY);
      }
      return old;
    }
    return normalizeDirectionList(stored);
  } catch {
    return [];
  }
}

export function loadDirections(castId: string | null | undefined): SavedDirection[] {
  const key = castKey(castId);
  return loadAllDirections().filter(entry => entry.castId === key);
}

/**
 * Put a direction at the top of the Cast member's list. One of the same name is replaced — the
 * same entry (its id kept), so another device sees an edit, not a deletion and a new one.
 */
export function withSavedDirection(
  list: SavedDirection[],
  castId: string | null | undefined,
  name: string,
  direction: Direction,
  now = Date.now()
): SavedDirection[] {
  const key = castKey(castId);
  const clean = name.trim().slice(0, 60) || 'Direction';
  const same = (entry: SavedDirection) =>
    entry.castId === key && entry.name.toLowerCase() === clean.toLowerCase();
  const existing = list.find(same);
  const entry: SavedDirection = {
    id: existing?.id ?? newId(now),
    castId: key,
    name: clean,
    direction,
    savedAt: now,
  };
  const kept = list.filter(item => !same(item));
  const mine = kept.filter(item => item.castId === key).slice(0, DIRECTIONS_PER_CAST - 1);
  const others = kept.filter(item => item.castId !== key);
  return [entry, ...mine, ...others];
}

export function saveDirection(
  castId: string | null | undefined,
  name: string,
  direction: Direction
): SavedDirection[] {
  writeAll(withSavedDirection(loadAllDirections(), castId, name, direction));
  return loadDirections(castId);
}

export function removeDirection(castId: string | null | undefined, id: string): SavedDirection[] {
  writeAll(loadAllDirections().filter(entry => entry.id !== id));
  return loadDirections(castId);
}

/** Server pull (studio-extras): the merged list as it is, no edit stamps or deletions. */
export function replaceDirections(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  // Not migrated yet (the server's list came first): this browser's old ones join it.
  const unmigrated =
    typeof window !== 'undefined' && readBrowserValue<unknown>(DIRECTIONS_STORAGE_KEY) == null;
  const old = unmigrated ? loadAllDirections() : [];
  if (old.length) {
    const spec = recordListSpec('directorDirections');
    writeAll(normalizeDirectionList(mergeRecordList(spec, entries, old, undefined)));
    return;
  }
  writeAll(normalizeDirectionList(entries), { fromSync: true });
}

export function subscribeDirections(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener(DIRECTIONS_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(DIRECTIONS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}
