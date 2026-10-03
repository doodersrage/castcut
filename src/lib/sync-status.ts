/**
 * What this browser last managed with the server copy: when it last pushed and pulled, which
 * namespaces failed to push, and whether changes are waiting. Shown in Settings → Server storage;
 * before, a failed push was silent until another device came up without the change.
 */
import type { StorageNamespace } from './storage-namespaces';

export type SyncStatus = {
  lastPushAt?: number;
  lastPullAt?: number;
  /** Namespaces whose last push failed, and when the first of those failures happened. */
  failed?: { at: number; namespaces: StorageNamespace[] };
  /** A push is scheduled (changes not on the server yet). */
  pending?: boolean;
};

const STORAGE_KEY = 'comfy-prompt-sync-status-v1';
let status: SyncStatus | null = null;
const listeners = new Set<() => void>();

function load(): SyncStatus {
  if (status) return status;
  status = {};
  try {
    const raw = typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as SyncStatus) : null;
    if (parsed && typeof parsed === 'object') {
      // A push scheduled by a page that has since closed is not waiting any more.
      status = { ...parsed, pending: false };
    }
  } catch {
    // Unreadable storage: start empty.
  }
  return status;
}

function update(patch: (current: SyncStatus) => SyncStatus): void {
  const next = patch(load());
  status = next;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // The line in Settings is a convenience; it may not survive a reload.
  }
  for (const listener of listeners) listener();
}

export function noteSyncPush(namespace: StorageNamespace, ok: boolean, now = Date.now()): void {
  update(current => {
    const failedNamespaces = (current.failed?.namespaces ?? []).filter(name => name !== namespace);
    if (ok) {
      return {
        ...current,
        lastPushAt: now,
        failed: failedNamespaces.length
          ? { at: current.failed!.at, namespaces: failedNamespaces }
          : undefined,
      };
    }
    return {
      ...current,
      failed: { at: current.failed?.at ?? now, namespaces: [...failedNamespaces, namespace] },
    };
  });
}

export function noteSyncPull(ok: boolean, now = Date.now()): void {
  if (!ok) return;
  update(current => ({ ...current, lastPullAt: now }));
}

export function noteSyncPending(pending: boolean): void {
  if (Boolean(load().pending) === pending) return;
  update(current => ({ ...current, pending }));
}

export function getSyncStatus(): SyncStatus {
  return load();
}

const SERVER_SNAPSHOT: SyncStatus = {};
export function getServerSyncStatus(): SyncStatus {
  return SERVER_SNAPSHOT;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test hook. */
export function resetSyncStatus(): void {
  status = {};
}

const NAMESPACE_LABELS: Partial<Record<StorageNamespace, string>> = {
  'settings-cache': 'settings',
  'prompt-history': 'history',
  'comfy-gallery': 'gallery',
  'gallery-deleted-ids': 'gallery',
  'studio-extras': 'Cast, stories and libraries',
};

function ago(at: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** One line for Settings, and whether it is a problem. */
export function describeSyncStatus(
  current: SyncStatus,
  now = Date.now()
): { text: string; tone: 'ok' | 'waiting' | 'error' | 'none' } {
  if (current.failed?.namespaces.length) {
    const what = [
      ...new Set(current.failed.namespaces.map(name => NAMESPACE_LABELS[name] ?? name)),
    ];
    return {
      tone: 'error',
      text: `Couldn't reach the server ${ago(current.failed.at, now)} (${what.join(', ')}) — retrying every minute. Changes stay in this browser until then.`,
    };
  }
  const last = Math.max(current.lastPushAt ?? 0, current.lastPullAt ?? 0);
  if (current.pending) {
    return {
      tone: 'waiting',
      text: last
        ? `Changes waiting to sync (last synced ${ago(last, now)}).`
        : 'Changes waiting to sync.',
    };
  }
  if (!last) return { tone: 'none', text: 'Not synced from this browser yet.' };
  return { tone: 'ok', text: `Synced ${ago(last, now)}.` };
}
