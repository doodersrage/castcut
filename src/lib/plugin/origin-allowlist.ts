import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const PLUGIN_ORIGIN_ALLOWLIST_KEY = 'comfy-plugin-origin-allowlist-v1';

export function normalizePluginOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    if (trimmed.startsWith('/')) {
      return typeof window !== 'undefined' ? window.location.origin : null;
    }
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

export function loadPluginOriginAllowlist(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = readBrowserValue<unknown>(PLUGIN_ORIGIN_ALLOWLIST_KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  const origins = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      continue;
    }
    const origin = normalizePluginOrigin(entry);
    if (origin) {
      origins.add(origin);
    }
  }
  return [...origins].sort();
}

export function savePluginOriginAllowlist(origins: string[]): string[] {
  const next = [
    ...new Set(
      origins
        .map(entry => normalizePluginOrigin(entry))
        .filter((origin): origin is string => Boolean(origin))
    ),
  ].sort();
  writeBrowserValue(PLUGIN_ORIGIN_ALLOWLIST_KEY, next);
  return next;
}

export function isOriginInPluginAllowlist(
  origin: string,
  allowlist = loadPluginOriginAllowlist()
): boolean {
  const normalized = normalizePluginOrigin(origin);
  if (!normalized) {
    return false;
  }
  return allowlist.includes(normalized);
}
