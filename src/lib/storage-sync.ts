import type { StorageNamespace } from './storage-namespaces';
import { SYNC_STORAGE_NAMESPACES } from './storage-namespaces';

/**
 * What this tab last pulled from or pushed to the server, per namespace. Every save schedules a
 * push of every namespace, so a page load re-uploaded the ~13 MB it had just pulled (gallery,
 * history, settings). An upload identical to the server's copy is skipped.
 */
const serverFingerprints = new Map<StorageNamespace, string>();

type PullResult = { ok: boolean; data: unknown };

/** One startup sync asked for the same namespace up to three times (~22 MB on a returning load). */
let pullMemo: Map<StorageNamespace, Promise<PullResult>> | null = null;

/** Server-side these are rows re-sorted on read, so the order a tab holds them in is not a change. */
const UNORDERED_NAMESPACES = new Set<StorageNamespace>(['comfy-gallery', 'gallery-deleted-ids']);

function fingerprintText(namespace: StorageNamespace, data: unknown): string {
  if (Array.isArray(data) && UNORDERED_NAMESPACES.has(namespace)) {
    return data
      .map(entry => JSON.stringify(entry))
      .sort()
      .join('\n');
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && 'updatedAt' in data) {
    // studio-extras is re-stamped on every collect; a new stamp alone is not new content.
    const { updatedAt: _updatedAt, ...rest } = data as Record<string, unknown>;
    return JSON.stringify(rest);
  }
  return JSON.stringify(data) ?? '';
}

/** FNV-1a over the serialized payload, plus its length. */
export function storageFingerprint(namespace: StorageNamespace, data: unknown): string {
  const text = fingerprintText(namespace, data);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${text.length}:${(hash >>> 0).toString(36)}`;
}

function noteServerCopy(namespace: StorageNamespace, data: unknown): void {
  if (data === null || data === undefined) {
    serverFingerprints.delete(namespace);
    return;
  }
  serverFingerprints.set(namespace, storageFingerprint(namespace, data));
}

/** Test hook: forget what the server is known to hold. */
export function resetServerStorageFingerprints(): void {
  serverFingerprints.clear();
}

export async function syncNamespaceToServer<T>(
  namespace: StorageNamespace,
  data: T
): Promise<boolean> {
  const fingerprint = storageFingerprint(namespace, data);
  if (serverFingerprints.get(namespace) === fingerprint) {
    return true;
  }
  try {
    const response = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ namespace, data }),
    });
    if (response.ok) {
      serverFingerprints.set(namespace, fingerprint);
    }
    pullMemo?.delete(namespace);
    return response.ok;
  } catch {
    return false;
  }
}

/** Runs `fn` with repeat pulls of a namespace sharing the first response (a push resets it). */
export async function withStoragePullMemo<T>(fn: () => Promise<T>): Promise<T> {
  const previous = pullMemo;
  pullMemo = previous ?? new Map();
  try {
    return await fn();
  } finally {
    pullMemo = previous;
  }
}

async function fetchNamespace(
  namespace: StorageNamespace,
  localCopy: unknown
): Promise<PullResult> {
  try {
    // With a local copy, the server answers "unchanged" instead of resending it (gallery ~9 MB).
    const ifMatch =
      localCopy === undefined || localCopy === null
        ? ''
        : `&ifMatch=${encodeURIComponent(storageFingerprint(namespace, localCopy))}`;
    const response = await fetch(
      `/api/storage?namespace=${encodeURIComponent(namespace)}${ifMatch}`,
      { method: 'PUT' }
    );
    if (!response.ok) {
      return { ok: false, data: null };
    }
    const payload = (await response.json()) as { data?: unknown; unchanged?: boolean };
    const data = payload.unchanged && ifMatch ? localCopy : payload.data;
    noteServerCopy(namespace, data);
    return { ok: true, data: data ?? null };
  } catch {
    return { ok: false, data: null };
  }
}

function pullNamespace(namespace: StorageNamespace, localCopy: unknown): Promise<PullResult> {
  const memo = pullMemo;
  const shared = memo?.get(namespace);
  if (shared) {
    return shared;
  }
  const request = fetchNamespace(namespace, localCopy).then(result => {
    // A failed pull is retried by the next caller, not replayed.
    if (!result.ok) {
      memo?.delete(namespace);
    }
    return result;
  });
  memo?.set(namespace, request);
  return request;
}

/**
 * Pull that tells a failed request apart from an empty namespace. Callers that seed the server
 * from local data must only do so on `ok` — a 401 / network error used to read as "server is
 * empty" and a fresh profile's map-less settings were pushed over the real ones.
 *
 * `localCopy` (optional) is what this tab holds; when the server's copy matches it, the server
 * skips the download and the local copy is returned as the server's.
 */
export async function pullNamespaceFromServerResult<T>(
  namespace: StorageNamespace,
  localCopy?: T
): Promise<{ ok: boolean; data: T | null }> {
  return (await pullNamespace(namespace, localCopy)) as { ok: boolean; data: T | null };
}

export async function pullNamespaceFromServer<T>(
  namespace: StorageNamespace,
  localCopy?: T
): Promise<T | null> {
  return (await pullNamespace(namespace, localCopy)).data as T | null;
}

export function serverStorageStatus(): {
  enabled: boolean;
  namespaces: StorageNamespace[];
} {
  return {
    enabled: false,
    namespaces: [...SYNC_STORAGE_NAMESPACES],
  };
}
