'use client';

import { loadComfyGallery } from './gallery/comfyui-gallery';
import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const CATALOG_RATING_BIAS_KEY = 'comfy-catalog-rating-bias-v1';

type CatalogBiasEntry = {
  token: string;
  score: number;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length > 3);
}

function loadBiasMap(): Map<string, number> {
  if (typeof window === 'undefined') {
    return new Map();
  }
  try {
    const entries = readBrowserValue<CatalogBiasEntry[]>(CATALOG_RATING_BIAS_KEY) ?? [];
    return new Map(entries.map(entry => [entry.token, entry.score]));
  } catch {
    return new Map();
  }
}

function saveBiasMap(map: Map<string, number>): void {
  if (typeof window === 'undefined') {
    return;
  }
  const entries: CatalogBiasEntry[] = [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 120)
    .map(([token, score]) => ({ token, score }));
  writeBrowserValue(CATALOG_RATING_BIAS_KEY, entries);
}

export function recordCatalogBiasFromPrompt(prompt: string, rating: number | undefined): void {
  if (typeof window === 'undefined' || !prompt.trim() || !rating) {
    return;
  }
  const delta = rating >= 4 ? 1 : rating <= 2 ? -1 : 0;
  if (delta === 0) {
    return;
  }

  const map = loadBiasMap();
  for (const token of tokenize(prompt)) {
    map.set(token, (map.get(token) ?? 0) + delta);
  }
  saveBiasMap(map);
}

export function scoreCatalogCandidate(label: string): number {
  const map = loadBiasMap();
  if (map.size === 0) {
    return 0;
  }
  return tokenize(label).reduce((sum, token) => sum + (map.get(token) ?? 0), 0);
}

export function sortCatalogByRatingBias<T>(items: T[], toLabel: (item: T) => string): T[] {
  return [...items].sort(
    (a, b) => scoreCatalogCandidate(toLabel(b)) - scoreCatalogCandidate(toLabel(a))
  );
}

export function rebuildCatalogBiasFromGallery(): void {
  const map = new Map<string, number>();
  for (const entry of loadComfyGallery()) {
    if (!entry.reviewRating || entry.status !== 'completed') {
      continue;
    }
    const delta = entry.reviewRating >= 4 ? 1 : entry.reviewRating <= 2 ? -1 : 0;
    if (delta === 0) {
      continue;
    }
    for (const token of tokenize(entry.prompt)) {
      map.set(token, (map.get(token) ?? 0) + delta);
    }
  }
  saveBiasMap(map);
}
