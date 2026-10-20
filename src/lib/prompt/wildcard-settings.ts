'use client';

import { loadSettingsCache } from '../settings/cache';
import type { WildcardMap } from './wildcard-expand';

/** `expandWildcards` defaults to true (opt-out, not opt-in). */
export function loadWildcardExpansionEnabled(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  return loadSettingsCache().shared.expandWildcards !== false;
}

/** Trimmed session seed for reproducible expands, or `undefined` for a fresh roll each time. */
export function loadWildcardSeed(): string | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return loadSettingsCache().shared.wildcardSeed?.trim() || undefined;
}

/** User-defined `__name__` list overrides/additions layered on top of the built-in defaults. */
export function loadCustomWildcardLists(): WildcardMap | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }
  return loadSettingsCache().shared.wildcardLists;
}
