import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { removeGalleryEntriesByPromptIds, upsertGalleryEntries } from '../sqlite/gallery';

const GALLERY_NAMESPACE_OWNER = '' as const;

/**
 * Appends server-queued gallery entries to SQLite so the headless scheduled
 * batch shows up once the browser gallery next pulls/merges server storage.
 * No-ops when server storage is disabled.
 */
export async function appendServerGalleryEntries(entries: ComfyGalleryEntry[]): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  const { isServerStorageEnabled } = await import('../server-storage');
  if (!isServerStorageEnabled()) {
    return;
  }
  upsertGalleryEntries(GALLERY_NAMESPACE_OWNER, entries);
}

/** Removes server-stored gallery rows whose promptId is in the given set. */
export async function removeServerGalleryEntriesByPromptIds(promptIds: string[]): Promise<number> {
  if (promptIds.length === 0) {
    return 0;
  }
  const { isServerStorageEnabled } = await import('../server-storage');
  if (!isServerStorageEnabled()) {
    return 0;
  }
  return removeGalleryEntriesByPromptIds(GALLERY_NAMESPACE_OWNER, promptIds);
}
