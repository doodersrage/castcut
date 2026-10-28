import { appDb } from '../app/db';
import { COMFYUI_GALLERY_KEY } from '../gallery/comfyui-gallery-storage-meta';
import { mergeSessionLoraIdsByModel } from '../model/lora-map';
import { DURABLE_BROWSER_SYNC_KEYS } from './durable-sync-keys';

const cache = new Map<string, unknown>();
const dirtyKeys = new Set<string>();
let ready = false;
let readyPromise: Promise<void> | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenersAttached = false;
let lastSavedAt: number | null = null;
let lastError: string | null = null;
const PERSIST_DEBOUNCE_MS = 350;
/** Nested apply from server pull — avoid scheduling a push storm. */
let suppressDurableSyncPush = 0;

export const BROWSER_STORAGE_HEALTH_EVENT = 'browser-storage-health';

export type BrowserStorageHealth = {
  ready: boolean;
  lastSavedAt: number | null;
  lastError: string | null;
  dirtyCount: number;
};

function notifyBrowserStorageHealth(): void {
  if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') {
    return;
  }
  window.dispatchEvent(new Event(BROWSER_STORAGE_HEALTH_EVENT));
}

export function getBrowserStorageHealth(): BrowserStorageHealth {
  return {
    ready,
    lastSavedAt,
    lastError,
    dirtyCount: dirtyKeys.size,
  };
}

/** Theme/ambient/density only — small keys read before paint. */
const SYNC_LOCALSTORAGE_KEYS = new Set([
  'comfy-app-theme-v1',
  'comfy-ambient-intensity-v1',
  'comfy-ui-density-v1',
  'comfy-calm-ui-v1',
]);

/**
 * Tiny preference sidecars — always mirror to localStorage so critical toggles
 * survive IndexedDB quota/errors and reload even when the main settings blob fails.
 */
const CRITICAL_LOCALSTORAGE_MIRROR_KEYS = new Set([
  'comfy-use-system-workflows-v1',
  'comfy-session-lora-prefs-v1',
]);

/**
 * Large or authoritative app data — IndexedDB only when Dexie is available.
 * Never mirror to localStorage (quota failures were wiping settings on refresh).
 */
export const IDB_ONLY_KEYS = new Set([
  'comfy-prompt-tool-settings-v1',
  'comfy-prompt-tool-settings-tools-v1',
  'comfy-prompt-tool-settings-plugins-v1',
  'comfy-prompt-tool-settings-maps-v1',
  'comfy-prompt-tool-history-v1',
  'comfyui-settings-v4',
  'comfy-onboarding-v2',
  'comfy-use-system-workflows-v1',
  'comfy-session-lora-prefs-v1',
  // Screenplays (day/scene-script-store.ts): megabytes at most, never in localStorage.
  'castcut-scene-scripts-v1',
]);

/** Keys loaded before the full KV table so settings/history hydrate sooner. */
const HOT_KV_KEYS = [
  'comfy-prompt-tool-settings-v1',
  'comfy-prompt-tool-settings-tools-v1',
  'comfy-prompt-tool-settings-plugins-v1',
  'comfy-prompt-tool-settings-maps-v1',
  'comfy-use-system-workflows-v1',
  'comfy-session-lora-prefs-v1',
  'comfyui-settings-v4',
  'comfy-prompt-tool-history-v1',
] as const;

function usesIndexedDbOnly(key: string): boolean {
  return Boolean(appDb) && IDB_ONLY_KEYS.has(key);
}

function readStorageUpdatedAt(value: unknown): number {
  if (!value || typeof value !== 'object') {
    return 0;
  }
  const updatedAt = (value as { updatedAt?: unknown }).updatedAt;
  return typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : 0;
}

function readSystemWorkflowsSidecarFlag(value: unknown): boolean | null {
  if (value === '1' || value === 1 || value === true) {
    return true;
  }
  if (value === '0' || value === 0 || value === false) {
    return false;
  }
  return null;
}

const SESSION_LORA_PREFS_STORAGE_KEY = 'comfy-session-lora-prefs-v1';

type SessionLoraPrefsSidecar = {
  sessionActiveLoraIdsByModel?: Partial<Record<string, string[]>>;
  sessionLoraStrengthOverridesByModel?: Record<string, unknown>;
};

function asSessionLoraPrefsSidecar(value: unknown): SessionLoraPrefsSidecar | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as SessionLoraPrefsSidecar;
}

function mergeSessionLoraPrefsSidecar(
  existing: unknown,
  incoming: unknown
): SessionLoraPrefsSidecar | null {
  const a = asSessionLoraPrefsSidecar(existing);
  const b = asSessionLoraPrefsSidecar(incoming);
  if (!a && !b) {
    return null;
  }
  // Incoming wins per model (including shorter / empty stacks) so unchecks stick.
  const byModel = mergeSessionLoraIdsByModel(
    a?.sessionActiveLoraIdsByModel,
    b?.sessionActiveLoraIdsByModel
  );
  const strength = {
    ...(a?.sessionLoraStrengthOverridesByModel ?? {}),
    ...(b?.sessionLoraStrengthOverridesByModel ?? {}),
  };
  const hasByModel = Object.keys(byModel).length > 0;
  const hasStrength = Object.keys(strength).length > 0;
  if (!hasByModel && !hasStrength) {
    return null;
  }
  return {
    ...(hasByModel ? { sessionActiveLoraIdsByModel: byModel } : {}),
    ...(hasStrength ? { sessionLoraStrengthOverridesByModel: strength } : {}),
  };
}

/** Prefer the value with the newest `updatedAt`; tie-break toward `incoming` (usually IDB). */
function pickNewerStorageValue(key: string, existing: unknown, incoming: unknown): unknown {
  if (key === 'comfy-use-system-workflows-v1') {
    const existingOn = readSystemWorkflowsSidecarFlag(existing);
    const incomingOn = readSystemWorkflowsSidecarFlag(incoming);
    if (existingOn === true || incomingOn === true) {
      return '1';
    }
    if (incomingOn === false) {
      return '0';
    }
    if (existingOn === false) {
      return '0';
    }
    return incoming ?? existing;
  }

  if (key === SESSION_LORA_PREFS_STORAGE_KEY) {
    return mergeSessionLoraPrefsSidecar(existing, incoming) ?? incoming ?? existing;
  }

  const existingAt = readStorageUpdatedAt(existing);
  const incomingAt = readStorageUpdatedAt(incoming);
  if (incomingAt > existingAt) {
    return incoming;
  }
  if (incomingAt < existingAt) {
    return existing;
  }
  return incoming;
}

function adoptStorageValue(key: string, incoming: unknown): void {
  if (incoming === undefined || dirtyKeys.has(key)) {
    return;
  }
  const existing = cache.get(key);
  if (existing === undefined) {
    cache.set(key, incoming);
  } else {
    cache.set(key, pickNewerStorageValue(key, existing, incoming));
  }
  mirrorToLocalStorageIfAllowed(key);
}

function mirrorToLocalStorageIfAllowed(key: string): void {
  if (CRITICAL_LOCALSTORAGE_MIRROR_KEYS.has(key) || SYNC_LOCALSTORAGE_KEYS.has(key)) {
    const value = cache.get(key);
    if (value !== undefined) {
      writeLegacyLocalStorageValue(key, value);
    }
    return;
  }
  if (usesIndexedDbOnly(key)) {
    return;
  }
  const value = cache.get(key);
  if (value !== undefined) {
    writeLegacyLocalStorageValue(key, value);
  }
}

function readLegacyLocalStorageValue(key: string): unknown | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const raw = window.localStorage.getItem(key);
  if (raw === null) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function writeLegacyLocalStorageValue(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    // ignore quota / privacy mode
  }
}

function removeLegacyLocalStorageValue(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(key);
}

export function isBrowserStorageReady(): boolean {
  return ready;
}

/** Resolves once IndexedDB KV (or legacy fallback) has finished hydrating. */
export function whenBrowserStorageReady(): Promise<void> {
  if (typeof window === 'undefined' || ready) {
    return Promise.resolve();
  }
  return initBrowserStorage();
}

export function resetBrowserStorageCache(): void {
  cache.clear();
  dirtyKeys.clear();
  localWriteAt.clear();
  // No Dexie (SSR / unit tests): there is nothing to hydrate — treat as ready so
  // settings writes are not refused. Real browsers keep ready=false until init.
  ready = !appDb;
  readyPromise = null;
  // A fresh page, as far as the journal and the flush listeners go (tests only).
  inFlightKeys.clear();
  failedKeys.clear();
  journalKey = null;
  journalWritten = false;
  flushListenersAttached = false;
}

export function readBrowserValue<T>(key: string): T | null {
  if (typeof window === 'undefined') {
    return null;
  }

  if (cache.has(key)) {
    return cache.get(key) as T;
  }

  // IndexedDB-authoritative keys must not read stale localStorage mirrors,
  // except tiny sidecars that are dual-written for reliability.
  if (usesIndexedDbOnly(key) && !CRITICAL_LOCALSTORAGE_MIRROR_KEYS.has(key)) {
    return null;
  }

  const legacy = readLegacyLocalStorageValue(key);
  if (legacy !== undefined) {
    cache.set(key, legacy);
    return legacy as T;
  }

  return null;
}

export function readBrowserString(key: string): string | null {
  const value = readBrowserValue<unknown>(key);
  if (typeof value === 'string') {
    return value;
  }
  if (value == null) {
    return null;
  }
  return String(value);
}

/** When this tab last wrote each key itself (writes under a suppressed push are pulls, not edits). */
const localWriteAt = new Map<string, number>();
let preserveLocalWritesSince: number | null = null;
let preservedLocalWriteCount = 0;

/**
 * Runs a startup pull's writes without clobbering keys this tab edited since `since` — a fresh
 * browser's first pull landed seconds after load and replaced edits made meanwhile (e.g. a
 * Scheduled batch toggle). Returns how many writes were skipped so the caller can push them.
 */
export function withLocalWritesPreserved(since: number, fn: () => void): number {
  const previous = preserveLocalWritesSince;
  preserveLocalWritesSince = since;
  preservedLocalWriteCount = 0;
  try {
    fn();
    return preservedLocalWriteCount;
  } finally {
    preserveLocalWritesSince = previous;
  }
}

function skipForPreservedLocalWrite(key: string): boolean {
  if (preserveLocalWritesSince === null) {
    return false;
  }
  const at = localWriteAt.get(key);
  if (at === undefined || at < preserveLocalWritesSince) {
    return false;
  }
  preservedLocalWriteCount += 1;
  return true;
}

function noteLocalWrite(key: string): void {
  if (suppressDurableSyncPush === 0) {
    localWriteAt.set(key, Date.now());
  }
}

export function withSuppressedDurableSyncPush<T>(fn: () => T): T {
  suppressDurableSyncPush += 1;
  try {
    return fn();
  } finally {
    suppressDurableSyncPush -= 1;
  }
}

function scheduleDurableServerPush(key: string): void {
  if (suppressDurableSyncPush > 0 || !DURABLE_BROWSER_SYNC_KEYS.has(key)) {
    return;
  }
  void import('./auto-storage-sync').then(({ scheduleAutoPushStorage }) =>
    scheduleAutoPushStorage()
  );
}

export function writeBrowserValue(key: string, value: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (skipForPreservedLocalWrite(key)) {
    return;
  }
  noteLocalWrite(key);
  cache.set(key, value);
  dirtyKeys.add(key);
  mirrorToLocalStorageIfAllowed(key);
  schedulePersistDirtyKeys();
  scheduleDurableServerPush(key);
}

export function writeBrowserString(key: string, value: string): void {
  writeBrowserValue(key, value);
}

export function removeBrowserKey(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (skipForPreservedLocalWrite(key)) {
    return;
  }
  noteLocalWrite(key);
  cache.delete(key);
  dirtyKeys.add(key);
  if (!usesIndexedDbOnly(key)) {
    removeLegacyLocalStorageValue(key);
  }
  schedulePersistDirtyKeys();
  scheduleDurableServerPush(key);
}

function schedulePersistDirtyKeys(): void {
  attachBrowserStorageFlushListeners();
  if (persistTimer) {
    return;
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void initBrowserStorage().then(() => persistDirtyBrowserKeys());
  }, PERSIST_DEBOUNCE_MS);
}

export function flushBrowserStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  void initBrowserStorage().then(() => persistDirtyBrowserKeys());
}

/** Await IndexedDB (or legacy) persistence for dirty keys — use before navigation or reload. */
export async function flushBrowserStorageNow(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  await initBrowserStorage();
  await persistDirtyBrowserKeys();
}

function attachBrowserStorageFlushListeners(): void {
  if (typeof window === 'undefined' || flushListenersAttached) {
    return;
  }
  if (typeof window.addEventListener !== 'function') {
    return;
  }
  flushListenersAttached = true;
  const flush = () => {
    journalUnsavedWrites();
    flushBrowserStorage();
  };
  window.addEventListener('pagehide', flush);
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });
  }
}

/**
 * Writes not yet in IndexedDB when the page goes away. The debounce, or an IndexedDB write still in
 * flight, lost the last edit to a reload or a tab close; localStorage is synchronous, so the page
 * journals what is pending as it hides and the next load replays it. One journal per page, removed
 * once its writes land.
 */
export const UNSAVED_JOURNAL_PREFIX = 'castcut-unsaved-writes-v1:';
/** A journal past this (a huge settings blob) keeps what fits; localStorage holds about 5 MB. */
const UNSAVED_JOURNAL_MAX_CHARS = 1_500_000;
const inFlightKeys = new Set<string>();
/** Keys whose last IndexedDB write failed (quota, say): journaled too, until a write lands. */
const failedKeys = new Set<string>();
let journalKey: string | null = null;
let journalWritten = false;

type UnsavedJournal = {
  at: number;
  writes: Array<{ key: string; value?: unknown; removed?: true }>;
};

function journalUnsavedWrites(): void {
  const keys = new Set([...dirtyKeys, ...inFlightKeys, ...failedKeys]);
  if (keys.size === 0) {
    return;
  }
  const writes: UnsavedJournal['writes'] = [];
  let size = 0;
  for (const key of keys) {
    const write = cache.has(key) ? { key, value: cache.get(key) } : { key, removed: true as const };
    let json: string;
    try {
      json = JSON.stringify(write);
    } catch {
      continue;
    }
    if (size + json.length > UNSAVED_JOURNAL_MAX_CHARS) {
      continue;
    }
    size += json.length;
    writes.push(write);
  }
  if (writes.length === 0) {
    return;
  }
  journalKey ??= `${UNSAVED_JOURNAL_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    window.localStorage.setItem(journalKey, JSON.stringify({ at: Date.now(), writes }));
    journalWritten = true;
  } catch {
    // quota / privacy mode: the IndexedDB flush is all there is
  }
}

function clearOwnUnsavedJournal(): void {
  if (
    !journalWritten ||
    !journalKey ||
    dirtyKeys.size > 0 ||
    inFlightKeys.size > 0 ||
    failedKeys.size > 0
  ) {
    return;
  }
  journalWritten = false;
  try {
    window.localStorage.removeItem(journalKey);
  } catch {
    /* ignore */
  }
}

function readUnsavedJournals(): Array<{ key: string; journal: UnsavedJournal }> {
  const found: Array<{ key: string; journal: UnsavedJournal }> = [];
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key?.startsWith(UNSAVED_JOURNAL_PREFIX) || key === journalKey) {
        continue;
      }
      try {
        const journal = JSON.parse(window.localStorage.getItem(key) ?? '') as UnsavedJournal;
        if (typeof journal?.at === 'number' && Array.isArray(journal.writes)) {
          found.push({ key, journal });
          continue;
        }
      } catch {
        /* unreadable: dropped below */
      }
      found.push({ key, journal: { at: 0, writes: [] } });
    }
  } catch {
    return [];
  }
  return found.sort((a, b) => a.journal.at - b.journal.at);
}

/**
 * Replays journals left by pages that closed before their writes landed, oldest first, after the
 * IndexedDB hydrate. This page's own edits since load win, and so does a stored value stamped later
 * than the edit (another tab saved the key since).
 */
function replayUnsavedJournals(): void {
  for (const { key: storageKey, journal } of readUnsavedJournals()) {
    for (const write of journal.writes) {
      if (
        typeof write?.key !== 'string' ||
        dirtyKeys.has(write.key) ||
        localWriteAt.has(write.key)
      ) {
        continue;
      }
      // The edit's own stamp when it has one (the journal is written later, as the page hides).
      const editedAt = readStorageUpdatedAt(write.value) || journal.at;
      if (readStorageUpdatedAt(cache.get(write.key)) > editedAt) {
        continue;
      }
      if (write.removed) {
        cache.delete(write.key);
      } else if (write.value !== undefined) {
        cache.set(write.key, write.value);
        mirrorToLocalStorageIfAllowed(write.key);
      } else {
        continue;
      }
      dirtyKeys.add(write.key);
    }
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }
}

async function persistBrowserKey(key: string): Promise<boolean> {
  const db = appDb;
  if (!db) {
    const value = cache.get(key);
    if (value === undefined) {
      removeLegacyLocalStorageValue(key);
      return true;
    }
    writeLegacyLocalStorageValue(key, value);
    return true;
  }

  try {
    if (!cache.has(key)) {
      await db.kv.delete(key);
      if (!usesIndexedDbOnly(key)) {
        removeLegacyLocalStorageValue(key);
      }
      return true;
    }

    await db.kv.put({ key, value: cache.get(key) });
    if (!usesIndexedDbOnly(key)) {
      const value = cache.get(key);
      if (value !== undefined) {
        writeLegacyLocalStorageValue(key, value);
      }
    }
    return true;
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'Browser storage write failed';
    notifyBrowserStorageHealth();
    const value = cache.get(key);
    if (
      value !== undefined &&
      (!usesIndexedDbOnly(key) || CRITICAL_LOCALSTORAGE_MIRROR_KEYS.has(key))
    ) {
      writeLegacyLocalStorageValue(key, value);
    }
    return false;
  }
}

async function persistDirtyBrowserKeys(): Promise<void> {
  // A key whose last write failed goes again with the next flush.
  const keys = [...new Set([...dirtyKeys, ...failedKeys])];
  dirtyKeys.clear();
  if (keys.length === 0) {
    return;
  }
  for (const key of keys) {
    inFlightKeys.add(key);
  }
  const saved = await Promise.all(keys.map(key => persistBrowserKey(key)));
  keys.forEach((key, index) => {
    inFlightKeys.delete(key);
    if (saved[index]) {
      failedKeys.delete(key);
    } else {
      failedKeys.add(key);
    }
  });
  clearOwnUnsavedJournal();
  lastSavedAt = Date.now();
  if (!lastError) {
    lastError = null;
  }
  notifyBrowserStorageHealth();
}

/** One-time: move legacy localStorage copies into IndexedDB, then delete LS copies. */
/** Prefer enabled sidecar + localStorage backup after IDB hydrate (stale IDB must not win). */
function reconcileCriticalSidecarPrefs(): void {
  const wfLs = readSystemWorkflowsSidecarFlag(
    readLegacyLocalStorageValue('comfy-use-system-workflows-v1')
  );
  const wfCache = readSystemWorkflowsSidecarFlag(cache.get('comfy-use-system-workflows-v1'));
  if (wfLs === true || wfCache === true) {
    cache.set('comfy-use-system-workflows-v1', '1');
    dirtyKeys.add('comfy-use-system-workflows-v1');
    mirrorToLocalStorageIfAllowed('comfy-use-system-workflows-v1');
  } else if (wfLs === false || wfCache === false) {
    cache.set('comfy-use-system-workflows-v1', '0');
    mirrorToLocalStorageIfAllowed('comfy-use-system-workflows-v1');
  }

  const loraLs = asSessionLoraPrefsSidecar(
    readLegacyLocalStorageValue(SESSION_LORA_PREFS_STORAGE_KEY)
  );
  const loraCache = asSessionLoraPrefsSidecar(cache.get(SESSION_LORA_PREFS_STORAGE_KEY));
  const mergedLoras = mergeSessionLoraPrefsSidecar(loraCache, loraLs);
  if (mergedLoras) {
    cache.set(SESSION_LORA_PREFS_STORAGE_KEY, mergedLoras);
    dirtyKeys.add(SESSION_LORA_PREFS_STORAGE_KEY);
    mirrorToLocalStorageIfAllowed(SESSION_LORA_PREFS_STORAGE_KEY);
  }
}

async function migrateIdbOnlyKeysFromLocalStorage(): Promise<void> {
  if (typeof window === 'undefined' || !appDb) {
    return;
  }

  for (const key of IDB_ONLY_KEYS) {
    const legacy = readLegacyLocalStorageValue(key);
    if (legacy === undefined) {
      continue;
    }
    adoptStorageValue(key, legacy);
    if (!CRITICAL_LOCALSTORAGE_MIRROR_KEYS.has(key)) {
      removeLegacyLocalStorageValue(key);
    }
  }

  await persistDirtyBrowserKeys();
}

async function migrateLocalStorageToBrowserDb(): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }

  const keysToMigrate: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (
      !key ||
      key === COMFYUI_GALLERY_KEY ||
      key.startsWith(UNSAVED_JOURNAL_PREFIX) ||
      cache.has(key)
    ) {
      continue;
    }
    if (IDB_ONLY_KEYS.has(key) || SYNC_LOCALSTORAGE_KEYS.has(key)) {
      continue;
    }
    keysToMigrate.push(key);
  }

  for (const key of keysToMigrate) {
    const legacy = readLegacyLocalStorageValue(key);
    if (legacy === undefined) {
      continue;
    }
    cache.set(key, legacy);
    dirtyKeys.add(key);
    removeLegacyLocalStorageValue(key);
  }

  await persistDirtyBrowserKeys();
}

export async function initBrowserStorage(): Promise<void> {
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
    const db = appDb;
    if (!db) {
      ready = true;
      return;
    }

    try {
      await Promise.all(
        HOT_KV_KEYS.map(async key => {
          try {
            const record = await db.kv.get(key);
            if (record) {
              adoptStorageValue(record.key, record.value);
            }
          } catch {
            // ignore per-key failures; full hydrate follows
          }
        })
      );

      await migrateIdbOnlyKeysFromLocalStorage();

      const records = await db.kv.toArray();
      for (const record of records) {
        if ((HOT_KV_KEYS as readonly string[]).includes(record.key)) {
          continue;
        }
        adoptStorageValue(record.key, record.value);
      }
      replayUnsavedJournals();
      await migrateLocalStorageToBrowserDb();
      reconcileCriticalSidecarPrefs();
      await persistDirtyBrowserKeys();

      // Drop stale localStorage mirrors for large IDB-only keys — keep tiny sidecar backups.
      for (const key of IDB_ONLY_KEYS) {
        if (CRITICAL_LOCALSTORAGE_MIRROR_KEYS.has(key)) {
          mirrorToLocalStorageIfAllowed(key);
          continue;
        }
        removeLegacyLocalStorageValue(key);
      }
    } catch {
      // IndexedDB unavailable — cache continues to use legacy localStorage reads.
    }

    ready = true;
    notifyBrowserStorageHealth();
  })();

  return readyPromise;
}

if (typeof window !== 'undefined') {
  void initBrowserStorage();
}

export async function clearBrowserKvStore(): Promise<void> {
  cache.clear();
  dirtyKeys.clear();

  if (typeof window === 'undefined') {
    return;
  }

  for (const { key } of readUnsavedJournals()) {
    window.localStorage.removeItem(key);
  }
  if (journalKey) {
    window.localStorage.removeItem(journalKey);
    journalWritten = false;
  }

  if (appDb) {
    try {
      await appDb.kv.clear();
    } catch {
      /* ignore */
    }
  }
}

/** Drop in-memory cache entries and reload specific keys from IndexedDB (cross-tab sync). */
export async function reloadBrowserStorageKeys(keys: readonly string[]): Promise<void> {
  if (typeof window === 'undefined' || keys.length === 0) {
    return;
  }

  const db = appDb;

  await Promise.all(
    keys.map(async key => {
      if (dirtyKeys.has(key)) {
        return;
      }

      cache.delete(key);

      if (db && (usesIndexedDbOnly(key) || IDB_ONLY_KEYS.has(key))) {
        try {
          const record = await db.kv.get(key);
          if (record) {
            cache.set(record.key, record.value);
          }
        } catch {
          /* ignore per-key failures */
        }
        return;
      }

      let idbValue: unknown | undefined;
      if (db) {
        try {
          const record = await db.kv.get(key);
          idbValue = record?.value;
        } catch {
          /* ignore per-key failures */
        }
      }

      const legacy = readLegacyLocalStorageValue(key);
      const winner =
        legacy === undefined
          ? idbValue
          : idbValue === undefined
            ? legacy
            : pickNewerStorageValue(key, legacy, idbValue);

      if (winner !== undefined) {
        cache.set(key, winner);
        mirrorToLocalStorageIfAllowed(key);
      }
    })
  );
}
