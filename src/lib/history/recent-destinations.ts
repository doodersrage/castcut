import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

const KEY = 'comfy-recent-destinations-v1';
const MAX = 5;

export type RecentDestination = {
  href: string;
  label: string;
  at: number;
};

export function loadRecentDestinations(): RecentDestination[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter(
      (entry): entry is RecentDestination =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof (entry as RecentDestination).href === 'string' &&
        typeof (entry as RecentDestination).label === 'string'
    )
    .map(entry => ({
      href: entry.href.trim(),
      label: entry.label.trim(),
      at: typeof entry.at === 'number' ? entry.at : Date.now(),
    }))
    .filter(entry => entry.href && entry.label)
    .slice(0, MAX);
}

export function pushRecentDestination(input: { href: string; label: string }): RecentDestination[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const href = input.href.trim();
  const label = input.label.trim();
  if (!href || !label) {
    return loadRecentDestinations();
  }
  // Skip query-noise for matrix vs variations — keep full href when meaningful.
  const next: RecentDestination[] = [
    { href, label, at: Date.now() },
    ...loadRecentDestinations().filter(entry => entry.href !== href),
  ].slice(0, MAX);
  writeBrowserValue(KEY, next);
  return next;
}
