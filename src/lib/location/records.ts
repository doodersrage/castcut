/**
 * Location records (M8 T1, ROADMAP §5.3): a place the film goes back to — the corner café, her
 * sister's flat — described once and named by every shot set there, so the engine draws the same
 * room each time instead of a new one from a word (V3 and T5: both café shots, both library shots
 * were different rooms). A record has a fixed look in words (as a Cast's home design does,
 * cast/places.ts), the script place names it answers to, and optionally a picture of it.
 *
 * Kept in browser storage and synced in studio-extras as `locations`, merged per record across
 * devices like the other record lists (record-list-sync.ts). A Cast's home and workplace stay
 * where they are (Cast → Places); a location is for everywhere else.
 */
import {
  BROWSER_STORAGE_HEALTH_EVENT,
  readBrowserValue,
  writeBrowserValue,
} from '@/lib/storage/browser-storage';
import { recordListSpec } from '../storage/record-list-sync';
import { trackRecordListWrite } from '../storage/record-tombstones';

export const LOCATIONS_STORAGE_KEY = 'castcut-locations-v1';
export const LOCATIONS_CHANGED_EVENT = 'castcut-locations-changed';
export const LOCATIONS_LIMIT = 200;
export const LOCATION_NAME_MAX = 80;
export const LOCATION_LOOK_MAX = 600;
export const LOCATION_ALIAS_MAX = 60;
export const LOCATION_ALIASES_LIMIT = 12;

export type LocationSetting = 'INT' | 'EXT';

export type LocationRecord = {
  id: string;
  name: string;
  /** Inside or outdoors. */
  setting: LocationSetting;
  /** What every shot of it shares: walls, floor, windows, the pieces that make it this place. */
  look: string;
  /** Script place names it answers to ("corner cafe", "the cafe"), lower case. */
  aliases: string[];
  /** Its picture, a ComfyUI input file (a render of the empty place, or the user's photo). */
  photo?: string;
  createdAt: number;
  /** Last edit (record-list-sync: the newest copy wins across devices). */
  updatedAt?: number;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

/** A place name as aliases are matched: lower case, no article, no punctuation. */
export function placeKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\b(the|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function newLocationId(now = Date.now()): string {
  return `loc-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function normalizeLocation(raw: unknown): LocationRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;
  const id = text(entry.id, 80);
  const name = text(entry.name, LOCATION_NAME_MAX);
  if (!id || !name) return null;
  const aliases = [
    ...new Set(
      (Array.isArray(entry.aliases) ? entry.aliases : [])
        .map(alias => placeKey(text(alias, LOCATION_ALIAS_MAX)))
        .filter(Boolean)
    ),
  ].slice(0, LOCATION_ALIASES_LIMIT);
  const photo = text(entry.photo, 240);
  const createdAt =
    typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
      ? entry.createdAt
      : Date.now();
  return {
    id,
    name,
    setting: entry.setting === 'EXT' ? 'EXT' : 'INT',
    look: text(entry.look, LOCATION_LOOK_MAX),
    aliases,
    ...(photo ? { photo } : {}),
    createdAt,
    ...(typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
      ? { updatedAt: entry.updatedAt }
      : {}),
  };
}

/** Records from storage or sync: valid ones, each id once (the first kept), within the limit. */
export function normalizeLocations(raw: unknown): LocationRecord[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LocationRecord[] = [];
  for (const entry of raw) {
    const location = normalizeLocation(entry);
    if (!location || seen.has(location.id)) continue;
    seen.add(location.id);
    out.push(location);
    if (out.length >= LOCATIONS_LIMIT) break;
  }
  return out;
}

export function loadLocations(): LocationRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    return normalizeLocations(readBrowserValue<unknown>(LOCATIONS_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeAll(entries: LocationRecord[], options: { fromSync?: boolean } = {}): void {
  const limited = entries.slice(0, LOCATIONS_LIMIT);
  const next = options.fromSync
    ? limited
    : trackRecordListWrite(recordListSpec('locations'), loadLocations(), limited);
  if (typeof window === 'undefined') return;
  try {
    writeBrowserValue(LOCATIONS_STORAGE_KEY, next);
    window.dispatchEvent(new Event(LOCATIONS_CHANGED_EVENT));
  } catch {
    /* quota / private mode */
  }
}

/** Add a location, or replace the one with its id. Null when it isn't valid (no name). */
export function saveLocation(
  input: Omit<LocationRecord, 'createdAt' | 'aliases' | 'setting' | 'look'> &
    Partial<Pick<LocationRecord, 'createdAt' | 'aliases' | 'setting' | 'look'>>,
  now = Date.now()
): LocationRecord | null {
  const all = loadLocations();
  const previous = all.find(entry => entry.id === input.id);
  const location = normalizeLocation({
    ...previous,
    ...input,
    createdAt: previous?.createdAt ?? input.createdAt ?? now,
  });
  if (!location) return null;
  writeAll(
    previous ? all.map(entry => (entry.id === location.id ? location : entry)) : [...all, location]
  );
  return location;
}

/** What uses a location: the Scenes whose shot is set there (by name, for the refusal). */
export function locationUsers(
  id: string,
  scenes: ReadonlyArray<{ name: string; slot?: { locationId?: string } | null }>
): string[] {
  return scenes.filter(scene => scene.slot?.locationId === id).map(scene => scene.name);
}

/**
 * Delete a location — refused while a Scene uses it (its shot would lose its place without
 * saying so). Returns the Scenes in the way, empty when it was deleted.
 */
export function deleteLocation(
  id: string,
  scenes: Parameters<typeof locationUsers>[1]
): { deleted: boolean; usedBy: string[] } {
  const usedBy = locationUsers(id, scenes);
  if (usedBy.length) return { deleted: false, usedBy };
  const all = loadLocations();
  if (!all.some(entry => entry.id === id)) return { deleted: false, usedBy: [] };
  writeAll(all.filter(entry => entry.id !== id));
  return { deleted: true, usedBy: [] };
}

/** The location a script place name answers to (its name or one of its aliases), if any. */
export function locationForPlace(
  place: string | null | undefined,
  locations: readonly LocationRecord[]
): LocationRecord | undefined {
  const key = placeKey(place);
  if (!key) return undefined;
  return locations.find(
    location => placeKey(location.name) === key || location.aliases.includes(key)
  );
}

/**
 * The Setting with its location's look, as a Cast's home is added to a room of it (cast/places.ts
 * `withCastPlace`): "at the counter by the window, at Corner café: green tiled counter, brass
 * espresso machine". No words of its own: "Corner café: …". No look: the Setting as it is.
 */
export function withLocation(
  setting: string | null | undefined,
  location: Pick<LocationRecord, 'name' | 'look'>
): string {
  const words = setting?.trim() ?? '';
  const look = location.look.trim();
  if (!look) return words || location.name;
  if (!words) return `${location.name}: ${look}`;
  const head = `at ${location.name}:`;
  if (words.includes(head)) return words;
  return `${words.replace(/[.\s]+$/, '')}, ${head} ${look}`;
}

/** Server pull (studio-extras). */
export function replaceLocations(entries: unknown): void {
  if (!Array.isArray(entries)) return;
  writeAll(normalizeLocations(entries), { fromSync: true });
}

export function subscribeLocations(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange();
  window.addEventListener(LOCATIONS_CHANGED_EVENT, handler);
  window.addEventListener('storage', handler);
  window.addEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  return () => {
    window.removeEventListener(LOCATIONS_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler);
    window.removeEventListener(BROWSER_STORAGE_HEALTH_EVENT, handler);
  };
}
