import { readBrowserValue, writeBrowserValue } from '../browser-storage';
import type { EloEntry } from './elo';

export const GALLERY_ELO_KEY = 'comfy-gallery-elo-v1';
export const GALLERY_ELO_UPDATED_EVENT = 'comfy-gallery-elo-updated';

export type GalleryEloRecord = {
  groupId: string;
  entries: EloEntry[];
  winnerId: string;
  updatedAt: number;
};

function emitUpdated(): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(new Event(GALLERY_ELO_UPDATED_EVENT));
}

export function loadGalleryEloStore(): Record<string, GalleryEloRecord> {
  if (typeof window === 'undefined') {
    return {};
  }
  return readBrowserValue<Record<string, GalleryEloRecord>>(GALLERY_ELO_KEY) ?? {};
}

export function loadGalleryElo(groupId: string): GalleryEloRecord | null {
  return loadGalleryEloStore()[groupId] ?? null;
}

export function replaceGalleryEloStore(store: Record<string, GalleryEloRecord>): void {
  if (typeof window === 'undefined') {
    return;
  }
  writeBrowserValue(GALLERY_ELO_KEY, store);
  emitUpdated();
}

export function saveGalleryElo(record: GalleryEloRecord): void {
  if (typeof window === 'undefined') {
    return;
  }
  replaceGalleryEloStore({ ...loadGalleryEloStore(), [record.groupId]: record });
}

export function galleryEloWinnerId(entries: EloEntry[]): string | null {
  if (entries.length === 0) {
    return null;
  }
  return [...entries].sort((a, b) => b.rating - a.rating || b.matches - a.matches)[0]?.id ?? null;
}
