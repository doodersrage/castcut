import type { StorageNamespace } from './storage-namespaces';
import { SYNC_STORAGE_NAMESPACES } from './storage-namespaces';

export async function syncNamespaceToServer<T>(
  namespace: StorageNamespace,
  data: T
): Promise<boolean> {
  try {
    const response = await fetch('/api/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ namespace, data }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Pull that tells a failed request apart from an empty namespace. Callers that seed the server
 * from local data must only do so on `ok` — a 401 / network error used to read as "server is
 * empty" and a fresh profile's map-less settings were pushed over the real ones.
 */
export async function pullNamespaceFromServerResult<T>(
  namespace: StorageNamespace
): Promise<{ ok: boolean; data: T | null }> {
  try {
    const response = await fetch(`/api/storage?namespace=${encodeURIComponent(namespace)}`, {
      method: 'PUT',
    });
    if (!response.ok) {
      return { ok: false, data: null };
    }
    const payload = (await response.json()) as { data?: T };
    return { ok: true, data: payload.data ?? null };
  } catch {
    return { ok: false, data: null };
  }
}

export async function pullNamespaceFromServer<T>(namespace: StorageNamespace): Promise<T | null> {
  try {
    const response = await fetch(`/api/storage?namespace=${encodeURIComponent(namespace)}`, {
      method: 'PUT',
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { data?: T };
    return payload.data ?? null;
  } catch {
    return null;
  }
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
