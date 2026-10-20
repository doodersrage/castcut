import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';
import { tokenizePrompt } from './duplicate-detection';

export type NegativeSuggestion = {
  token: string;
  count: number;
  dismissed?: boolean;
};

const KEY = 'comfy-negative-suggestions-v1';

export function loadNegativeSuggestions(): NegativeSuggestion[] {
  if (typeof window === 'undefined') {
    return [];
  }
  return readBrowserValue<NegativeSuggestion[]>(KEY) ?? [];
}

export function saveNegativeSuggestions(entries: NegativeSuggestion[]): void {
  writeBrowserValue(KEY, entries.slice(0, 100));
}

export function learnFromLowRatedPrompt(prompt: string, rating: number): number {
  if (rating > 2) {
    return 0;
  }
  const tokens = [...tokenizePrompt(prompt)].filter(token => token.length >= 4);
  const map = new Map(loadNegativeSuggestions().map(entry => [entry.token, entry]));
  let learned = 0;

  for (const token of tokens) {
    const existing = map.get(token);
    const nextCount = (existing?.count ?? 0) + 1;
    if (!existing || existing.count === 0) {
      learned += 1;
    }
    map.set(token, {
      token,
      count: nextCount,
      dismissed: existing?.dismissed,
    });
  }

  saveNegativeSuggestions([...map.values()].sort((a, b) => b.count - a.count).slice(0, 100));
  return learned;
}

export function dismissNegativeSuggestion(token: string): void {
  saveNegativeSuggestions(
    loadNegativeSuggestions().map(entry =>
      entry.token === token ? { ...entry, dismissed: true } : entry
    )
  );
}

export function activeNegativeSuggestions(limit = 12): NegativeSuggestion[] {
  return loadNegativeSuggestions()
    .filter(entry => !entry.dismissed && entry.count >= 2)
    .slice(0, limit);
}
