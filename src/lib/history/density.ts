import { readBrowserString, writeBrowserString } from '../storage/browser-storage';

export type HistoryDensity = 'comfortable' | 'compact';

export const HISTORY_DENSITY_KEY = 'studio-history-density-v1';

export function normalizeHistoryDensity(value: unknown): HistoryDensity {
  return value === 'compact' ? 'compact' : 'comfortable';
}

export function loadHistoryDensity(): HistoryDensity {
  if (typeof window === 'undefined') {
    return 'comfortable';
  }
  return normalizeHistoryDensity(readBrowserString(HISTORY_DENSITY_KEY));
}

export function saveHistoryDensity(density: HistoryDensity): void {
  writeBrowserString(HISTORY_DENSITY_KEY, density);
}
