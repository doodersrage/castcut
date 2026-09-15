import { readBrowserValue, writeBrowserValue } from './browser-storage';

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
  return next;
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
