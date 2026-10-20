'use client';

import { readBrowserValue, writeBrowserValue } from '../browser-storage';

const STORAGE_KEY = 'prompt-studio.gallery-deleted-ids';
const MAX_TOMBSTONES = 5000;

export type GalleryDeletedIdsPayload = {
  ids: string[];
  updatedAt: number;
};

function normalizeIds(ids: Iterable<string>): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of ids) {
    const trimmed = id?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    next.push(trimmed);
  }
  return next;
}

export function loadGalleryDeletedIds(): string[] {
  if (typeof window === 'undefined') {
    return [];
  }
  const stored = readBrowserValue<GalleryDeletedIdsPayload | string[]>(STORAGE_KEY);
  if (Array.isArray(stored)) {
    return normalizeIds(stored);
  }
  if (stored && Array.isArray(stored.ids)) {
    return normalizeIds(stored.ids);
  }
  return [];
}

export function saveGalleryDeletedIds(ids: string[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  const normalized = normalizeIds(ids).slice(-MAX_TOMBSTONES);
  writeBrowserValue(STORAGE_KEY, {
    ids: normalized,
    updatedAt: Date.now(),
  } satisfies GalleryDeletedIdsPayload);
}

export function rememberGalleryDeletedIds(ids: string[]): string[] {
  if (ids.length === 0) {
    return loadGalleryDeletedIds();
  }
  const next = normalizeIds([...loadGalleryDeletedIds(), ...ids]);
  saveGalleryDeletedIds(next);
  return next;
}

export function clearGalleryDeletedIds(): void {
  saveGalleryDeletedIds([]);
}

/** Drop tombstoned ids from a gallery list. */
export function filterOutDeletedGalleryEntries<T extends { id: string }>(
  entries: T[],
  deletedIds: Iterable<string> = loadGalleryDeletedIds()
): T[] {
  const blocked = new Set([...deletedIds].map(id => id.trim()).filter(Boolean));
  if (blocked.size === 0) {
    return entries;
  }
  return entries.filter(entry => !blocked.has(entry.id));
}

/** Union local + server tombstone lists (order preserved, capped). */
export function mergeGalleryDeletedIds(local: string[], server: string[]): string[] {
  return normalizeIds([...local, ...server]).slice(-MAX_TOMBSTONES);
}
