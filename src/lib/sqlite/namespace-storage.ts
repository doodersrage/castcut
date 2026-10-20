import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';
import { STORAGE_NAMESPACES, type StorageNamespace } from '@/lib/storage/namespaces';
import {
  countGalleryEntries,
  readGalleryDeletedIds,
  readGalleryEntries,
  upsertGalleryEntries,
  writeGalleryDeletedIds,
} from './gallery';
import { kvScopeForUser, readKv, writeKv } from './kv';

function mergeOwnedAndGlobalGallery(
  owned: ComfyGalleryEntry[],
  global: ComfyGalleryEntry[]
): ComfyGalleryEntry[] {
  if (global.length === 0) {
    return owned;
  }
  const byId = new Map<string, ComfyGalleryEntry>();
  for (const entry of global) {
    byId.set(entry.id, entry);
  }
  for (const entry of owned) {
    byId.set(entry.id, entry);
  }
  return [...byId.values()].sort(
    (a, b) => (b.completedAt ?? b.queuedAt ?? 0) - (a.completedAt ?? a.queuedAt ?? 0)
  );
}

/**
 * Deleting Gallery entries (delete, Purge, Archive & purge) used to leave their kept copies in
 * gallery-media forever. Remove them after this write, unless something still links to them.
 */
function removeDeletedEntryMediaSoon(userId: string | null | undefined, ids: string[]): void {
  setImmediate(() => {
    void import('../gallery/media-cleanup-server')
      .then(({ removeDeletedGalleryEntryMedia }) => removeDeletedGalleryEntryMedia({ userId, ids }))
      .catch(() => {
        // Left for Settings → Data → Clean up old copies.
      });
  });
}

export function readNamespaceStorage<T>(
  namespace: StorageNamespace,
  userId?: string | null
): T | null {
  const owner = userId?.trim() || '';
  const scope = kvScopeForUser(userId);
  if (namespace === 'comfy-gallery') {
    const owned = readGalleryEntries(owner);
    if (!owner) {
      return owned as T;
    }
    return mergeOwnedAndGlobalGallery(owned, readGalleryEntries('')) as T;
  }
  if (namespace === 'gallery-deleted-ids') {
    return readGalleryDeletedIds(owner) as T;
  }
  return readKv<T>(scope, namespace);
}

export function writeNamespaceStorage(
  namespace: StorageNamespace,
  data: unknown,
  userId?: string | null
): void {
  const owner = userId?.trim() || '';
  const scope = kvScopeForUser(userId);
  if (namespace === 'comfy-gallery') {
    upsertGalleryEntries(owner, data);
    return;
  }
  if (namespace === 'gallery-deleted-ids') {
    const before = new Set(readGalleryDeletedIds(owner));
    writeGalleryDeletedIds(owner, data);
    const deleted = readGalleryDeletedIds(owner).filter(id => !before.has(id));
    if (deleted.length > 0) removeDeletedEntryMediaSoon(userId, deleted);
    return;
  }
  writeKv(scope, namespace, data);
}

export function countNamespaceGallery(userId?: string | null): number {
  return countGalleryEntries(userId?.trim() || '');
}

export function listSqliteStorageNamespaces(): StorageNamespace[] {
  return [...STORAGE_NAMESPACES];
}
