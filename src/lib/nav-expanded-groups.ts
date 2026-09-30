import { readBrowserValue, writeBrowserValue } from './browser-storage';

// v2: groups were renamed (Film / Create / Edit / Library / More tools) — old saved labels no longer match.
const KEY = 'comfy-nav-expanded-groups-v2';

export function loadExpandedNavGroups(): string[] | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!Array.isArray(raw)) {
    return null;
  }
  return raw.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  );
}

export function saveExpandedNavGroups(groups: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(KEY, [...new Set(groups.map(group => group.trim()).filter(Boolean))]);
}

export function toggleExpandedNavGroup(group: string, currentlyExpanded: string[]): string[] {
  const next = currentlyExpanded.includes(group)
    ? currentlyExpanded.filter(entry => entry !== group)
    : [...currentlyExpanded, group];
  saveExpandedNavGroups(next);
  return next;
}
