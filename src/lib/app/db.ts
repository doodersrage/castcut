import Dexie, { type Table } from 'dexie';
import type { ComfyGalleryEntry } from '../gallery/comfyui-gallery-entry';

export type AppDbKvRecord = {
  key: string;
  value: unknown;
};

export class AppDatabase extends Dexie {
  galleryEntries!: Table<ComfyGalleryEntry, string>;
  kv!: Table<AppDbKvRecord, string>;

  constructor() {
    super('comfy-prompt-studio-v1');
    this.version(1).stores({
      galleryEntries: 'id, queuedAt, status, favorite, tool, projectId, completedAt, reviewRating',
      kv: 'key',
    });
  }
}

export const appDb = typeof window !== 'undefined' ? new AppDatabase() : null;
