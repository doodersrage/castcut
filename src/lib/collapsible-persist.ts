import {
  readBrowserValue,
  withSuppressedDurableSyncPush,
  writeBrowserValue,
} from './browser-storage';
import { pruneDeadCollapsibleIds } from './dead-settings';

const KEY = 'comfy-collapsible-open-v1';

type CollapsibleOpenMap = Record<string, boolean>;

function loadMap(): CollapsibleOpenMap {
  if (typeof window === 'undefined') {
    return {};
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const next: CollapsibleOpenMap = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'boolean' && id.trim()) {
      next[id.trim()] = value;
    }
  }
  // Sections that no longer exist (see dead-settings) — the next save stores the map without them.
  return pruneDeadCollapsibleIds(next).map;
}

/**
 * One-time clean-up of the stored map: drops the fold state of sections that no longer exist.
 * A background write — it does not count as an edit and schedules no push, so it can never beat
 * a server pull; the server copy loses the ids with the next ordinary push (collectStudioExtras
 * prunes too). Returns the ids dropped.
 */
export function pruneStoredDeadCollapsibleIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return [];
  }
  const { map, dropped } = pruneDeadCollapsibleIds(raw as Record<string, unknown>);
  if (dropped.length > 0) {
    withSuppressedDurableSyncPush(() => writeBrowserValue(KEY, map));
  }
  return dropped;
}

export function loadCollapsibleOpen(id: string, fallback: boolean): boolean {
  const map = loadMap();
  if (Object.prototype.hasOwnProperty.call(map, id)) {
    return Boolean(map[id]);
  }
  return fallback;
}

/** Returns stored open state when present; otherwise undefined. */
export function peekCollapsibleOpen(id: string): boolean | undefined {
  const map = loadMap();
  if (Object.prototype.hasOwnProperty.call(map, id)) {
    return Boolean(map[id]);
  }
  return undefined;
}

export function saveCollapsibleOpen(id: string, open: boolean): void {
  if (typeof window === 'undefined' || !id.trim()) {
    return;
  }
  const map = loadMap();
  map[id.trim()] = open;
  writeBrowserValue(KEY, map);
}
