'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from '@/hooks/useAuth';
import type { AutoSyncResult } from '@/lib/auto-storage-sync';
import type { StorageNamespace } from '@/lib/storage-namespaces';
import type { MergeChoice } from '@/lib/storage-merge';
import { suggestMergeChoice } from '@/lib/storage-merge';
import { COMFYUI_GALLERY_UPDATED_EVENT } from '@/lib/gallery/comfyui-gallery-storage-meta';

const StorageSyncConflictModal = dynamic(() => import('@/components/StorageSyncConflictModal'), {
  ssr: false,
});

const DISMISS_KEY = 'prompt-studio.storage-sync.dismissed';

function deferIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const idleId = window.requestIdleCallback(callback, { timeout: 5000 });
    return () => window.cancelIdleCallback(idleId);
  }
  const timeoutId = window.setTimeout(callback, 1500);
  return () => window.clearTimeout(timeoutId);
}

function wasDismissedThisSession(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function markDismissedThisSession(): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // ignore quota / private mode
  }
}

export default function AutoStorageSyncInit() {
  const auth = useAuth();
  const [conflicts, setConflicts] = useState<AutoSyncResult['conflicts']>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!auth || auth.loading || process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
      return;
    }
    // Auth enabled requires a signed-in user; auth-off still syncs to PROMPT_DATA_DIR.
    if (auth.authEnabled && !auth.user) {
      return;
    }

    return deferIdle(() => {
      void import('@/lib/auto-storage-sync').then(async ({ autoPullStorageIfEmpty }) => {
        const result = await autoPullStorageIfEmpty();
        // Startup path auto-merges; conflicts here are a rare fallback only.
        if (result.conflicts.length > 0 && !wasDismissedThisSession()) {
          setConflicts(result.conflicts);
          setOpen(true);
          return;
        }
        // Refresh gallery/history consumers — avoid location.reload() which races
        // with in-flight shared-settings writes (LoRAs, system workflows, maps).
        if (result.pulledIntoEmpty) {
          window.dispatchEvent(new Event(COMFYUI_GALLERY_UPDATED_EVENT));
          window.dispatchEvent(new Event('prompt-history-updated'));
        }
      });
    });
    // Intentionally key off user id / auth flags so object identity churn does not re-trigger sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable identity fields only
  }, [auth?.loading, auth?.authEnabled, auth?.user?.id]);

  if (!auth) return null; // Hydration / HMR boundary

  async function resolveConflicts(choices: Partial<Record<StorageNamespace, MergeChoice>>) {
    const { applyStorageMerge } = await import('@/lib/auto-storage-sync');
    await applyStorageMerge(choices);
    markDismissedThisSession();
    setOpen(false);
    window.location.reload();
  }

  if (!open || conflicts.length === 0) {
    return null;
  }

  const defaults = Object.fromEntries(
    conflicts.map(conflict => [conflict.namespace, suggestMergeChoice(conflict)])
  ) as Partial<Record<StorageNamespace, MergeChoice>>;

  return (
    <StorageSyncConflictModal
      conflicts={conflicts}
      initialChoices={defaults}
      onResolve={choices => void resolveConflicts(choices)}
      onDismiss={() => {
        markDismissedThisSession();
        setOpen(false);
      }}
    />
  );
}

export function useStorageConflictProbe() {
  return {
    probe: async (
      ...args: Parameters<(typeof import('@/lib/auto-storage-sync'))['probeStorageConflicts']>
    ) => {
      const { probeStorageConflicts } = await import('@/lib/auto-storage-sync');
      return probeStorageConflicts(...args);
    },
    apply: async (
      ...args: Parameters<(typeof import('@/lib/auto-storage-sync'))['applyStorageMerge']>
    ) => {
      const { applyStorageMerge } = await import('@/lib/auto-storage-sync');
      return applyStorageMerge(...args);
    },
  };
}
