import { appDb } from './app-db';
import { readBrowserValue, removeBrowserKey, writeBrowserValue } from './browser-storage';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';
import {
  COMFYUI_GALLERY_KEY,
  COMFYUI_GALLERY_UPDATED_EVENT,
  MAX_GALLERY_ENTRIES,
} from './comfyui-gallery-storage-meta';
import { filterOutDeletedGalleryEntries } from './gallery-deleted-ids';
import { getActiveUserId, isUserScoped } from './user-scope';
import { seedBatchCorpus } from './embedding-rank';

/** First paint loads one page of recent entries; the rest hydrate in the background. */
export const INITIAL_GALLERY_LOAD_LIMIT = 48;

let allEntries: ComfyGalleryEntry[] = [];
let cache: ComfyGalleryEntry[] = [];
let cacheDirty = false;
let ready = false;
let readyPromise: Promise<void> | null = null;
let fullLoadPromise: Promise<void> | null = null;
/** Fingerprints of entries last written to IndexedDB (incremental sync). */
let persistedFingerprints = new Map<string, string>();

function galleryEntryFingerprint(entry: ComfyGalleryEntry): string {
  // Must cover every field that can change without a new entry id — otherwise
  // incremental IndexedDB sync silently skips vision tags, project moves, progress, etc.
  const images = entry.images
    .map(image => `${image.filename}:${image.subfolder}:${image.type}`)
    .join(',');
  const workflowLen = entry.workflowJson?.length ?? 0;
  const workflowSig = workflowLen
    ? `${workflowLen}:${entry.workflowJson!.slice(0, 24)}:${entry.workflowJson!.slice(-24)}`
    : entry.workflowJsonOmitted
      ? 'omitted'
      : '';
  return [
    entry.status,
    entry.completedAt ?? 0,
    entry.favorite ? 1 : 0,
    entry.reviewRating ?? 0,
    images,
    entry.statusMessage ?? '',
    entry.queuePosition ?? '',
    entry.progressValue ?? '',
    entry.progressMax ?? '',
    entry.progressNode ?? '',
    entry.visionTags?.join(',') ?? '',
    entry.userTags?.join(',') ?? '',
    entry.customGroup ?? '',
    entry.projectId ?? '',
    entry.promptId ?? '',
    entry.prompt.length,
    entry.negativePrompt?.length ?? 0,
    entry.derivedKind ?? '',
    entry.parentGalleryEntryId ?? '',
    entry.characterId ?? '',
    entry.lookId ?? '',
    `${entry.playChecks?.pose ?? ''}:${entry.playChecks?.face ?? ''}`,
    workflowSig,
  ].join('|');
}

/** Strip heavy workflow JSON from list projections; keep a flag for UI badges. */
export function projectGalleryEntryForList(entry: ComfyGalleryEntry): ComfyGalleryEntry {
  if (!entry.workflowJson) {
    return entry;
  }
  const { workflowJson: _omit, ...rest } = entry;
  return {
    ...rest,
    hasStoredWorkflow: true,
  };
}

/** Sync legacy localStorage into memory for instant first paint. */
export function primeGalleryCacheSync(): void {
  if (typeof window === 'undefined' || cache.length > 0) {
    return;
  }

  const legacy = readLegacyLocalStorageGallery();
  if (legacy.length === 0) {
    return;
  }

  allEntries = legacy.slice(0, MAX_GALLERY_ENTRIES);
  seedBatchCorpus(allEntries);
  assignLegacyGalleryEntriesToActiveUser();
  refreshCacheFromAll();
}

export function warmGalleryStore(): Promise<void> {
  primeGalleryCacheSync();
  return hydrateGalleryStore();
}

function stampEntryUserId(entry: ComfyGalleryEntry): ComfyGalleryEntry {
  const userId = getActiveUserId();
  if (!userId || entry.userId) {
    return entry;
  }
  return { ...entry, userId };
}

function filterEntriesForActiveUser(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  const userId = getActiveUserId();
  if (!userId) {
    return entries;
  }
  // Fast path: all entries already carry the active user ID — zero allocation.
  let untagged = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].userId && entries[i].userId !== userId) {
      untagged++;
      break;
    }
  }
  if (untagged === 0) {
    return entries;
  }
  return entries.filter(entry => !entry.userId || entry.userId === userId);
}

function mergeUserEntriesIntoAll(userEntries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  const userId = getActiveUserId();
  const trimmedUser = userEntries.slice(0, MAX_GALLERY_ENTRIES).map(stampEntryUserId);

  if (!userId) {
    return trimmedUser;
  }

  const others = allEntries.filter(entry => entry.userId && entry.userId !== userId);
  return [...trimmedUser, ...others];
}

/**
 * Tracks the (allEntries reference, active user) pair `cache` was last built
 * from. `null` for lastRefreshEntriesRef never equals a real array, so the
 * very first call always rebuilds regardless of lastRefreshUserId.
 */
let lastRefreshEntriesRef: ComfyGalleryEntry[] | null = null;
let lastRefreshUserId: string | null = null;

function refreshCacheFromAll(): void {
  const userId = getActiveUserId();
  // `allEntries` is always fully reassigned (never mutated in place) by every
  // writer in this module, so a reference check is a safe, exact proxy for
  // "did the underlying data actually change since the cache was last built."
  // This function runs after essentially every gallery mutation (favorite /
  // rating / tag toggle, poll completion, hydrate, etc.), so skipping the
  // full filter+slice+map over up to MAX_GALLERY_ENTRIES items when nothing
  // changed avoids real, frequent, unnecessary work.
  if (lastRefreshEntriesRef === allEntries && lastRefreshUserId === userId) {
    return;
  }
  cache = filterEntriesForActiveUser(allEntries)
    .slice(0, MAX_GALLERY_ENTRIES)
    .map(projectGalleryEntryForList);
  lastRefreshEntriesRef = allEntries;
  lastRefreshUserId = userId;
}

/** Full entry including stored workflowJson (not the list projection). */
export function getGalleryEntryById(id: string): ComfyGalleryEntry | undefined {
  return allEntries.find(entry => entry.id === id);
}

function assignLegacyGalleryEntriesToActiveUser(): void {
  if (!isUserScoped()) {
    return;
  }

  const userId = getActiveUserId();
  if (!userId) {
    return;
  }

  // Single-pass: check for user-matches AND find orphans simultaneously.
  let hasUserMatch = false;
  let needsAssign = false;
  for (let i = 0; i < allEntries.length; i++) {
    const entry = allEntries[i];
    if (!hasUserMatch && entry.userId === userId) {
      hasUserMatch = true;
    }
    if (!needsAssign && !entry.userId) {
      needsAssign = true;
    }
    if (hasUserMatch && !needsAssign) break; // early exit
  }

  if (hasUserMatch || !needsAssign) {
    return;
  }

  allEntries = allEntries.map(entry => (entry.userId ? entry : { ...entry, userId }));
}

export function isGalleryStoreReady(): boolean {
  return ready;
}

export function getGalleryCache(): ComfyGalleryEntry[] {
  return cache;
}

export function setGalleryCache(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  allEntries = mergeUserEntriesIntoAll(entries);
  refreshCacheFromAll();
  cacheDirty = true;
  return cache;
}

export function notifyGalleryUpdated(): void {
  window.dispatchEvent(new CustomEvent(COMFYUI_GALLERY_UPDATED_EVENT));
}

export async function reloadGalleryForActiveUser(): Promise<void> {
  if (!ready) {
    return;
  }

  assignLegacyGalleryEntriesToActiveUser();
  refreshCacheFromAll();
  notifyGalleryUpdated();
}

/** Re-read IndexedDB into memory (other tabs / external writers). */
export async function reloadGalleryFromDb(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  if (cacheDirty) {
    await persistGalleryCache();
  }
  if (!appDb) {
    allEntries = filterOutDeletedGalleryEntries(
      readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES)
    );
    assignLegacyGalleryEntriesToActiveUser();
    refreshCacheFromAll();
    notifyGalleryUpdated();
    return;
  }
  try {
    allEntries = await readAllGalleryEntriesFromDb();
    assignLegacyGalleryEntriesToActiveUser();
    refreshCacheFromAll();
    persistedFingerprints = new Map(
      allEntries.map(entry => [entry.id, galleryEntryFingerprint(entry)])
    );
    notifyGalleryUpdated();
  } catch {
    /* keep current cache */
  }
}

function readLegacyLocalStorageGallery(): ComfyGalleryEntry[] {
  const parsed = readBrowserValue<unknown>(COMFYUI_GALLERY_KEY);
  return Array.isArray(parsed) ? (parsed as ComfyGalleryEntry[]) : [];
}

function writeLegacyLocalStorageGallery(entries: ComfyGalleryEntry[]): void {
  writeBrowserValue(COMFYUI_GALLERY_KEY, entries.slice(0, MAX_GALLERY_ENTRIES));
}

async function migrateGalleryFromLocalStorage(): Promise<void> {
  if (!appDb) {
    return;
  }

  const existing = await appDb.galleryEntries.orderBy('queuedAt').reverse().limit(1).first();
  if (existing) {
    return;
  }

  const legacy = readLegacyLocalStorageGallery();
  if (legacy.length === 0) {
    return;
  }

  await appDb.galleryEntries.bulkPut(legacy.slice(0, MAX_GALLERY_ENTRIES));
  removeBrowserKey(COMFYUI_GALLERY_KEY);
}

async function readAllGalleryEntriesFromDb(): Promise<ComfyGalleryEntry[]> {
  if (!appDb) {
    return [];
  }
  const full = await appDb.galleryEntries.orderBy('queuedAt').reverse().toArray();
  return filterOutDeletedGalleryEntries(full);
}

/**
 * Background completion of the initial partial hydrate. Must not clobber
 * in-memory deletes/edits: after a delete, `allEntries.length` shrinks, so a
 * naive "replace if DB is longer" check would resurrect removed ids from a
 * stale IndexedDB snapshot.
 */
async function loadRemainingGalleryEntries(): Promise<void> {
  if (!appDb || fullLoadPromise) {
    return fullLoadPromise ?? Promise.resolve();
  }

  fullLoadPromise = (async () => {
    try {
      // Flush pending mutations first so deletes are in IDB before we re-read.
      if (cacheDirty) {
        await persistGalleryCache();
      }
      let full = await readAllGalleryEntriesFromDb();
      // User may have mutated again while the read was in flight.
      if (cacheDirty) {
        await persistGalleryCache();
        full = await readAllGalleryEntriesFromDb();
      }

      allEntries = full;
      seedBatchCorpus(allEntries);
      assignLegacyGalleryEntriesToActiveUser();
      refreshCacheFromAll();
      persistedFingerprints = new Map(
        allEntries.map(entry => [entry.id, galleryEntryFingerprint(entry)])
      );
      notifyGalleryUpdated();
    } catch {
      /* keep partial cache */
    }
  })();

  return fullLoadPromise;
}

/**
 * Resolves once the FULL gallery (not just the initial `INITIAL_GALLERY_LOAD_LIMIT`-entry page)
 * has loaded into memory. `loadComfyGallery()`/`getGalleryCache()` only reflect the initial page
 * until the background hydrate (kicked off via `scheduleLoadRemainingGalleryEntries`, up to 4s+
 * after first paint) completes — a caller that needs a complete, non-partial snapshot (e.g. a
 * full-overwrite push to server storage) must await this first, or it can silently push a
 * truncated gallery that then overwrites — and discards — the server's older history.
 */
export async function awaitFullGalleryHydration(): Promise<void> {
  await hydrateGalleryStore();
  await loadRemainingGalleryEntries();
}

function scheduleLoadRemainingGalleryEntries(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const run = () => {
    void loadRemainingGalleryEntries();
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 4000 });
    return;
  }

  window.setTimeout(run, 250);
}

export async function hydrateGalleryStore(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  if (ready) {
    return;
  }

  if (readyPromise) {
    return readyPromise;
  }

  readyPromise = (async () => {
    if (!appDb) {
      if (allEntries.length === 0) {
        allEntries = readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES);
        seedBatchCorpus(allEntries);
      }
      assignLegacyGalleryEntriesToActiveUser();
      refreshCacheFromAll();
      ready = true;
      return;
    }

    try {
      await migrateGalleryFromLocalStorage();

      if (!cacheDirty) {
        const initial = await appDb.galleryEntries
          .orderBy('queuedAt')
          .reverse()
          .limit(INITIAL_GALLERY_LOAD_LIMIT)
          .toArray();
        allEntries = filterOutDeletedGalleryEntries(initial);
        seedBatchCorpus(allEntries);
        assignLegacyGalleryEntriesToActiveUser();
        refreshCacheFromAll();
        persistedFingerprints = new Map(
          allEntries.map(entry => [entry.id, galleryEntryFingerprint(entry)])
        );
        scheduleLoadRemainingGalleryEntries();
      } else {
        await persistGalleryCache();
      }
    } catch {
      if (allEntries.length === 0) {
        allEntries = readLegacyLocalStorageGallery().slice(0, MAX_GALLERY_ENTRIES);
        seedBatchCorpus(allEntries);
        assignLegacyGalleryEntriesToActiveUser();
        refreshCacheFromAll();
      }
    }

    ready = true;
    notifyGalleryUpdated();
  })();

  return readyPromise;
}

export async function persistGalleryCache(): Promise<void> {
  const merged = mergeUserEntriesIntoAll(cache);
  allEntries = merged;
  refreshCacheFromAll();

  const db = appDb;
  if (!db) {
    writeLegacyLocalStorageGallery(allEntries);
    persistedFingerprints = new Map(
      allEntries.map(entry => [entry.id, galleryEntryFingerprint(entry)])
    );
    return;
  }

  try {
    const nextFingerprints = new Map<string, string>();
    const toPut: ComfyGalleryEntry[] = [];
    for (const entry of allEntries) {
      const fingerprint = galleryEntryFingerprint(entry);
      nextFingerprints.set(entry.id, fingerprint);
      if (persistedFingerprints.get(entry.id) !== fingerprint) {
        toPut.push(entry);
      }
    }

    const toDelete: string[] = [];
    for (const id of persistedFingerprints.keys()) {
      if (!nextFingerprints.has(id)) {
        toDelete.push(id);
      }
    }

    if (toPut.length > 0 || toDelete.length > 0) {
      await db.transaction('rw', db.galleryEntries, async () => {
        if (toDelete.length > 0) {
          await db.galleryEntries.bulkDelete(toDelete);
        }
        if (toPut.length > 0) {
          await db.galleryEntries.bulkPut(toPut);
        }
      });
    }

    persistedFingerprints = nextFingerprints;
    removeBrowserKey(COMFYUI_GALLERY_KEY);
  } catch {
    writeLegacyLocalStorageGallery(allEntries);
  }
}

export async function clearGalleryDb(): Promise<void> {
  if (isUserScoped()) {
    allEntries = allEntries.filter(entry => entry.userId !== getActiveUserId());
    refreshCacheFromAll();
    cacheDirty = true;
    await persistGalleryCache();
    notifyGalleryUpdated();
    return;
  }

  allEntries = [];
  cache = [];
  cacheDirty = false;
  persistedFingerprints = new Map();
  removeBrowserKey(COMFYUI_GALLERY_KEY);

  if (appDb) {
    try {
      await appDb.galleryEntries.clear();
    } catch {
      /* ignore */
    }
  }
}
