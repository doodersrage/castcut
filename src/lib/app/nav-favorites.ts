import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

const KEY = 'comfy-nav-favorites-v1';
const MAX_FAVORITES = 12;

export function loadNavFavorites(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const raw = readBrowserValue<unknown>(KEY);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    .map(entry => entry.trim())
    .slice(0, MAX_FAVORITES);
}

export function saveNavFavorites(hrefs: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  const next = [...new Set(hrefs.map(href => href.trim()).filter(Boolean))].slice(0, MAX_FAVORITES);
  writeBrowserValue(KEY, next);
}

export function isNavFavorite(href: string, favorites = loadNavFavorites()): boolean {
  return favorites.includes(href.trim());
}

export function toggleNavFavorite(href: string): string[] {
  const target = href.trim();
  if (!target) {
    return loadNavFavorites();
  }
  const current = loadNavFavorites();
  const next = current.includes(target)
    ? current.filter(entry => entry !== target)
    : [...current, target].slice(0, MAX_FAVORITES);
  saveNavFavorites(next);
  if (!current.includes(target) && next.includes(target)) {
    void import('./onboarding-hooks').then(({ markOnboardingPinTool }) => markOnboardingPinTool());
  }
  return next;
}
