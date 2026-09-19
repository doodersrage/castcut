'use client';

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import { pullNamespaceFromServer, syncNamespaceToServer } from './storage-sync';
import { capGalleryEntriesForLocalStorage } from './gallery-cap';
import { loadCharacters } from './character-os';
import { collectGalleryProtectedEntryIds } from './gallery-protected-ids';
import { MAX_GALLERY_ENTRIES } from './comfyui-gallery-storage-meta';
import {
  filterOutDeletedGalleryEntries,
  loadGalleryDeletedIds,
  mergeGalleryDeletedIds,
  saveGalleryDeletedIds,
} from './gallery-deleted-ids';

const GALLERY_NAMESPACE = 'comfy-gallery' as const;
const DELETED_IDS_NAMESPACE = 'gallery-deleted-ids' as const;

type MergeableGalleryEntry = Pick<ComfyGalleryEntry, 'id' | 'queuedAt' | 'completedAt'> & {
  status?: ComfyGalleryEntry['status'];
};

function entryTimestamp(entry: MergeableGalleryEntry): number {
  return entry.completedAt ?? entry.queuedAt ?? 0;
}

export type GalleryMergeResult<T extends MergeableGalleryEntry> = {
  merged: T[];
  addedFromServer: number;
  updatedFromServer: number;
  skippedDeleted: number;
};

/**
 * Merges a server-pulled gallery snapshot into the local list, deduping by
 * id and preferring whichever side is newer by completedAt (falling back to
 * queuedAt). Tombstoned ids are never re-added from the server.
 */
export function mergeGalleryWithServer<
  L extends MergeableGalleryEntry,
  S extends MergeableGalleryEntry = L,
>(local: L[], server: S[], deletedIds: Iterable<string> = []): GalleryMergeResult<L | S> {
  const blocked = new Set([...deletedIds].map(id => id.trim()).filter(Boolean));
  const byId = new Map<string, L | S>(
    local.filter(entry => !blocked.has(entry.id)).map(entry => [entry.id, entry])
  );
  let addedFromServer = 0;
  let updatedFromServer = 0;
  let skippedDeleted = 0;

  for (const serverEntry of server) {
    if (blocked.has(serverEntry.id)) {
      skippedDeleted += 1;
      continue;
    }
    const localEntry = byId.get(serverEntry.id);
    if (!localEntry) {
      byId.set(serverEntry.id, serverEntry);
      addedFromServer += 1;
      continue;
    }
    if (
      (localEntry.status === 'pending' || localEntry.status === 'running') &&
      serverEntry.status !== 'completed' &&
      serverEntry.status !== 'error'
    ) {
      continue;
    }
    if (entryTimestamp(serverEntry) > entryTimestamp(localEntry)) {
      byId.set(serverEntry.id, serverEntry);
      updatedFromServer += 1;
    }
  }

  const merged = [...byId.values()].sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
  return { merged, addedFromServer, updatedFromServer, skippedDeleted };
}

async function isServerStorageEnabledClient(): Promise<boolean> {
  try {
    const response = await fetch('/api/health');
    const data = (await response.json()) as { storage?: { enabled?: boolean } };
    return Boolean(data.storage?.enabled);
  } catch {
    return false;
  }
}

export type GalleryServerPullResult = {
  ok: boolean;
  changed: boolean;
  addedFromServer: number;
  updatedFromServer: number;
  evictedLocally: number;
  skippedDeleted?: number;
  error?: string;
};

/**
 * Pulls the server `comfy-gallery` namespace and merges it into the local
 * gallery (keeps local-only entries; never resurrects tombstoned deletions).
 */
export async function pullAndMergeGalleryFromServer(): Promise<GalleryServerPullResult> {
  if (typeof window === 'undefined') {
    return {
      ok: false,
      changed: false,
      addedFromServer: 0,
      updatedFromServer: 0,
      evictedLocally: 0,
    };
  }

  if (!(await isServerStorageEnabledClient())) {
    return {
      ok: false,
      changed: false,
      addedFromServer: 0,
      updatedFromServer: 0,
      evictedLocally: 0,
      error: 'Server storage disabled. Set PROMPT_DATA_DIR on the server.',
    };
  }

  const [server, serverDeleted] = await Promise.all([
    pullNamespaceFromServer<ComfyGalleryEntry[]>(GALLERY_NAMESPACE),
    pullNamespaceFromServer<string[] | { ids?: string[] }>(DELETED_IDS_NAMESPACE),
  ]);

  const serverDeletedIds = Array.isArray(serverDeleted)
    ? serverDeleted
    : Array.isArray(serverDeleted?.ids)
      ? serverDeleted.ids
      : [];
  const deletedIds = mergeGalleryDeletedIds(loadGalleryDeletedIds(), serverDeletedIds);
  saveGalleryDeletedIds(deletedIds);

  if (!server?.length) {
    return {
      ok: true,
      changed: false,
      addedFromServer: 0,
      updatedFromServer: 0,
      evictedLocally: 0,
    };
  }

  const { loadComfyGallery, saveComfyGalleryAsync } = await import('./comfyui-gallery');
  const local = loadComfyGallery();
  const localClean = filterOutDeletedGalleryEntries(local, deletedIds);
  const droppedLocalDeleted = local.length - localClean.length;
  const { merged, addedFromServer, updatedFromServer, skippedDeleted } = mergeGalleryWithServer(
    localClean,
    server,
    deletedIds
  );

  if (
    addedFromServer === 0 &&
    updatedFromServer === 0 &&
    skippedDeleted === 0 &&
    droppedLocalDeleted === 0
  ) {
    return {
      ok: true,
      changed: false,
      addedFromServer: 0,
      updatedFromServer: 0,
      evictedLocally: 0,
    };
  }

  const protectedIds = collectGalleryProtectedEntryIds(merged, loadCharacters());
  const capped = capGalleryEntriesForLocalStorage(merged, MAX_GALLERY_ENTRIES, protectedIds);
  await saveComfyGalleryAsync(capped.kept);

  if (skippedDeleted > 0 || droppedLocalDeleted > 0 || capped.evicted.length > 0) {
    const serverSafe = filterOutDeletedGalleryEntries(merged, deletedIds);
    void syncNamespaceToServer(GALLERY_NAMESPACE, serverSafe);
    void syncNamespaceToServer(DELETED_IDS_NAMESPACE, deletedIds);
  }

  return {
    ok: true,
    changed: addedFromServer > 0 || updatedFromServer > 0 || droppedLocalDeleted > 0,
    addedFromServer,
    updatedFromServer,
    evictedLocally: capped.evicted.length,
    skippedDeleted,
  };
}

/** Immediate write-through of the current Dexie gallery (add / complete / error). */
export async function pushGallerySnapshotToServer(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  if (!(await isServerStorageEnabledClient())) {
    return;
  }
  const { loadComfyGallery } = await import('./comfyui-gallery');
  // This overwrites the ENTIRE server namespace, so it must read the full local gallery — not
  // just the initial fast-paint page (see awaitFullGalleryHydration's doc comment). Skipping this
  // wait let an early job completion (during the first few seconds after load) push a truncated
  // ~48-entry snapshot that silently discarded all older server-persisted history.
  const { awaitFullGalleryHydration } = await import('./gallery-db-store');
  await awaitFullGalleryHydration();
  await syncNamespaceToServer(GALLERY_NAMESPACE, loadComfyGallery());
}

/** Push gallery + tombstones immediately (used after delete/clear). */
export async function pushGalleryDeletionsToServer(
  gallery: ComfyGalleryEntry[],
  deletedIds: string[]
): Promise<void> {
  if (!(await isServerStorageEnabledClient())) {
    return;
  }
  await Promise.all([
    syncNamespaceToServer(GALLERY_NAMESPACE, gallery),
    syncNamespaceToServer(DELETED_IDS_NAMESPACE, deletedIds),
  ]);
}

export type GalleryServerPushResult = {
  ok: boolean;
  count: number;
  error?: string;
};

/** Pushes the full local gallery to server storage (overwrites the server namespace). */
export async function pushGalleryToServer(): Promise<GalleryServerPushResult> {
  if (typeof window === 'undefined') {
    return { ok: false, count: 0 };
  }
  if (!(await isServerStorageEnabledClient())) {
    return {
      ok: false,
      count: 0,
      error: 'Server storage disabled. Set PROMPT_DATA_DIR on the server.',
    };
  }
  const { loadComfyGallery } = await import('./comfyui-gallery');
  const gallery = loadComfyGallery();
  const deletedIds = loadGalleryDeletedIds();
  const [okGallery, okDeleted] = await Promise.all([
    syncNamespaceToServer(GALLERY_NAMESPACE, gallery),
    syncNamespaceToServer(DELETED_IDS_NAMESPACE, deletedIds),
  ]);
  return { ok: okGallery && okDeleted, count: gallery.length };
}

/** Server gallery entry count for display in Settings → Data — null when unavailable. */
export async function fetchServerGalleryCount(): Promise<number | null> {
  const server = await pullNamespaceFromServer<ComfyGalleryEntry[]>(GALLERY_NAMESPACE);
  return Array.isArray(server) ? server.length : null;
}
