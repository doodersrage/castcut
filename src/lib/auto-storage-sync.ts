import type { StorageNamespace } from './storage-namespaces';
import { SYNC_STORAGE_NAMESPACES } from './storage-namespaces';
import {
  pullNamespaceFromServer,
  pullNamespaceFromServerResult,
  syncNamespaceToServer,
} from './storage-sync';
import { initAppDb } from './app-db-init';
import { loadSettingsCache, saveSettingsCache, type SettingsCache } from './settings-cache';
import {
  clearSettingsPushPending,
  isSettingsSyncedWithServer,
  markSettingsSyncedWithServer,
} from './settings-push-flush';
import {
  loadPromptHistoryStore,
  savePromptHistoryStore,
  type PromptHistoryEntry,
} from './prompt-history';
import { loadComfyGallery, saveComfyGalleryAsync, type ComfyGalleryEntry } from './comfyui-gallery';
import {
  filterOutDeletedGalleryEntries,
  loadGalleryDeletedIds,
  mergeGalleryDeletedIds,
  saveGalleryDeletedIds,
} from './gallery-deleted-ids';
import {
  applyStudioExtras,
  collectStudioExtras,
  foldLegacyNamespacesIntoExtras,
  localStudioExtrasLooksEmpty,
  mergeStudioExtras,
  type StudioExtrasPayload,
} from './studio-extras';
import {
  buildLoaderMapDiffSamples,
  detectLoaderMapDivergence,
  applyServerSessionStack,
  detectStorageConflicts,
  localSessionStackLooksEmpty,
  mergeArraysById,
  mergeSettingsCache,
  suggestMergeChoice,
  type MergeChoice,
  type StorageNamespaceConflict,
} from './storage-merge';

export type AutoSyncResult = {
  synced: StorageNamespace[];
  conflicts: StorageNamespaceConflict[];
  skipped: boolean;
  /** True when browser had no history/gallery and we pulled server snapshots. */
  pulledIntoEmpty?: boolean;
};

const SYNC_NAMESPACES: StorageNamespace[] = [...SYNC_STORAGE_NAMESPACES];

function namespaceMeta(data: unknown): { updatedAt?: number; count?: number } {
  if (!data) {
    return {};
  }
  if (Array.isArray(data)) {
    const times = data
      .map(
        entry =>
          (entry as { updatedAt?: number; queuedAt?: number }).updatedAt ??
          (entry as { queuedAt?: number }).queuedAt ??
          0
      )
      .filter(Boolean);
    return {
      count: data.length,
      updatedAt: times.length ? Math.max(...times) : undefined,
    };
  }
  const record = data as { updatedAt?: number };
  return { updatedAt: record.updatedAt, count: 1 };
}

async function loadStudioExtrasFromServer(): Promise<StudioExtrasPayload | null> {
  const serverExtras = await pullNamespaceFromServer<StudioExtrasPayload>('studio-extras');
  if (serverExtras) {
    // studio-extras is the live snapshot — skip deprecated namespace probes
    // (webhook-settings / avoided-tokens / prompt-projects / scheduled-batch).
    return serverExtras;
  }
  const [scheduledBatch, webhookSettings, avoidedTokens, promptProjects] = await Promise.all([
    pullNamespaceFromServer<import('./scheduled-batch').ScheduledBatchConfig>('scheduled-batch'),
    pullNamespaceFromServer<import('./webhook-settings').WebhookSettings>('webhook-settings'),
    pullNamespaceFromServer<string[]>('avoided-tokens'),
    pullNamespaceFromServer<unknown>('prompt-projects'),
  ]);
  const hasLegacy = Boolean(
    scheduledBatch || webhookSettings || avoidedTokens?.length || promptProjects
  );
  if (!hasLegacy) {
    return null;
  }
  return foldLegacyNamespacesIntoExtras(collectStudioExtras(), {
    scheduledBatch,
    webhookSettings,
    avoidedTokens,
    promptProjects,
  });
}

export async function probeStorageConflicts(): Promise<StorageNamespaceConflict[]> {
  await initAppDb();
  const localSettings = loadSettingsCache();
  const localHistory = loadPromptHistoryStore();
  const localGallery = loadComfyGallery();
  const localDeleted = loadGalleryDeletedIds();
  const localExtras = collectStudioExtras();

  const [serverSettings, serverHistory, serverGallery, serverDeletedPayload, serverExtras] =
    await Promise.all([
      pullNamespaceFromServer<SettingsCache>('settings-cache'),
      pullNamespaceFromServer<PromptHistoryEntry[]>('prompt-history'),
      pullNamespaceFromServer<ComfyGalleryEntry[]>('comfy-gallery'),
      pullNamespaceFromServer<string[] | { ids?: string[] }>('gallery-deleted-ids'),
      loadStudioExtrasFromServer(),
    ]);
  const serverDeletedIds = Array.isArray(serverDeletedPayload)
    ? serverDeletedPayload
    : Array.isArray(serverDeletedPayload?.ids)
      ? serverDeletedPayload.ids
      : [];
  const probes = [
    {
      namespace: 'settings-cache',
      local: namespaceMeta(localSettings),
      server: namespaceMeta(serverSettings),
    },
    {
      namespace: 'prompt-history',
      local: namespaceMeta(localHistory),
      server: namespaceMeta(serverHistory),
    },
    {
      namespace: 'comfy-gallery',
      local: namespaceMeta(localGallery),
      server: namespaceMeta(serverGallery),
    },
    {
      namespace: 'gallery-deleted-ids',
      local: { count: localDeleted.length, updatedAt: Date.now() },
      server: { count: serverDeletedIds.length },
    },
    {
      namespace: 'studio-extras',
      local: namespaceMeta(localExtras),
      server: namespaceMeta(serverExtras),
    },
  ];

  const conflicts = detectStorageConflicts({ namespaces: probes });
  const mapDiffKeys = detectLoaderMapDivergence(
    localSettings.shared as Record<string, unknown>,
    serverSettings?.shared as Record<string, unknown> | undefined
  );
  if (mapDiffKeys.length > 0) {
    const existing = conflicts.find(conflict => conflict.namespace === 'settings-cache');
    const detail = `Loader maps differ: ${mapDiffKeys.join(', ')}`;
    const mapDiffSamples = buildLoaderMapDiffSamples(
      localSettings.shared as Record<string, unknown>,
      serverSettings?.shared as Record<string, unknown> | undefined,
      mapDiffKeys
    );
    if (existing) {
      existing.mapDiffKeys = mapDiffKeys;
      existing.mapDiffSamples = mapDiffSamples;
      existing.detail = detail;
    } else {
      conflicts.push({
        namespace: 'settings-cache',
        localUpdatedAt: localSettings.updatedAt,
        serverUpdatedAt: serverSettings?.updatedAt,
        localCount: 1,
        serverCount: serverSettings ? 1 : 0,
        mapDiffKeys,
        mapDiffSamples,
        detail,
      });
    }
  }
  return conflicts;
}

export async function applyStorageMerge(
  choices: Partial<Record<StorageNamespace, MergeChoice>>
): Promise<AutoSyncResult> {
  await initAppDb();
  const conflicts = await probeStorageConflicts();
  const synced: StorageNamespace[] = [];

  for (const namespace of SYNC_NAMESPACES) {
    const choice = choices[namespace];
    if (namespace === 'gallery-deleted-ids') {
      const serverDeleted = await pullNamespaceFromServer<string[] | { ids?: string[] }>(namespace);
      const serverIds = Array.isArray(serverDeleted)
        ? serverDeleted
        : Array.isArray(serverDeleted?.ids)
          ? serverDeleted.ids
          : [];
      const localIds = loadGalleryDeletedIds();
      if (choice === 'server' && serverIds.length > 0) {
        saveGalleryDeletedIds(serverIds);
        synced.push(namespace);
        continue;
      }
      if (choice === 'local') {
        await syncNamespaceToServer(namespace, localIds);
        synced.push(namespace);
        continue;
      }
      const mergedIds = mergeGalleryDeletedIds(localIds, serverIds);
      saveGalleryDeletedIds(mergedIds);
      await syncNamespaceToServer(namespace, mergedIds);
      synced.push(namespace);
      continue;
    }

    if (namespace === 'studio-extras') {
      const server = await loadStudioExtrasFromServer();
      const local = collectStudioExtras();
      if (choice === 'server' && server) {
        applyStudioExtras(server);
        synced.push(namespace);
        continue;
      }
      if (choice === 'local') {
        await syncNamespaceToServer(namespace, local);
        synced.push(namespace);
        continue;
      }
      if (server) {
        const merged = mergeStudioExtras(local, server);
        applyStudioExtras(merged);
        await syncNamespaceToServer(namespace, collectStudioExtras());
      } else {
        await syncNamespaceToServer(namespace, local);
      }
      synced.push(namespace);
      continue;
    }

    const server =
      namespace === 'settings-cache'
        ? await pullNamespaceFromServer<SettingsCache>(namespace)
        : namespace === 'prompt-history'
          ? await pullNamespaceFromServer<PromptHistoryEntry[]>(namespace)
          : await pullNamespaceFromServer<ComfyGalleryEntry[]>(namespace);

    const local =
      namespace === 'settings-cache'
        ? loadSettingsCache()
        : namespace === 'prompt-history'
          ? loadPromptHistoryStore()
          : loadComfyGallery();

    if (choice === 'server' && server) {
      if (namespace === 'settings-cache') {
        saveSettingsCache(server as SettingsCache);
      } else if (namespace === 'prompt-history') {
        savePromptHistoryStore(server as PromptHistoryEntry[]);
      } else if (server) {
        const cleaned = filterOutDeletedGalleryEntries(server as ComfyGalleryEntry[]);
        await saveComfyGalleryAsync(cleaned);
      }
      synced.push(namespace);
      continue;
    }

    if (choice === 'local' && local) {
      await syncNamespaceToServer(namespace, local);
      synced.push(namespace);
      continue;
    }

    if (choice === 'merge' && local && server) {
      if (namespace === 'settings-cache') {
        const merged = mergeSettingsCache(local as SettingsCache, server as SettingsCache);
        const localShared = (local as SettingsCache).shared;
        if (localShared?.useSystemWorkflows === true) {
          merged.shared = { ...merged.shared, useSystemWorkflows: true };
        }
        if (
          localShared?.sessionActiveLoraIdsByModel &&
          Object.keys(localShared.sessionActiveLoraIdsByModel).length > 0 &&
          !localSessionStackLooksEmpty(localShared as Record<string, unknown>)
        ) {
          merged.shared = {
            ...merged.shared,
            sessionActiveLoraIdsByModel: {
              ...(merged.shared.sessionActiveLoraIdsByModel ?? {}),
              ...localShared.sessionActiveLoraIdsByModel,
            },
          };
        } else if (server) {
          const stacked = applyServerSessionStack(merged, server as SettingsCache);
          merged.shared = stacked.shared;
        }
        saveSettingsCache(merged);
        await syncNamespaceToServer(namespace, loadSettingsCache());
      } else if (namespace === 'prompt-history') {
        const merged = mergeArraysById(
          local as PromptHistoryEntry[],
          server as PromptHistoryEntry[],
          (a, b) => ((a.timestamp ?? 0) >= (b.timestamp ?? 0) ? a : b)
        );
        savePromptHistoryStore(merged);
        await syncNamespaceToServer(namespace, merged);
      } else {
        const merged = filterOutDeletedGalleryEntries(
          mergeArraysById(local as ComfyGalleryEntry[], server as ComfyGalleryEntry[], (a, b) =>
            (a.completedAt ?? a.queuedAt) >= (b.completedAt ?? b.queuedAt) ? a : b
          )
        );
        await saveComfyGalleryAsync(merged);
        await syncNamespaceToServer(namespace, merged);
      }
      synced.push(namespace);
    }
  }

  return { synced, conflicts, skipped: false };
}

/**
 * Startup sync: pull when local is empty; otherwise silently merge/push.
 * Avoids blocking the UI with the conflict modal on every visit.
 */
export async function autoPullStorageIfEmpty(): Promise<AutoSyncResult> {
  // The inner sync marks settings as synced only after a successful pull.
  return autoPullStorageIfEmptyInner();
}

async function autoPullStorageIfEmptyInner(): Promise<AutoSyncResult> {
  await initAppDb();
  const health = await fetch('/api/health')
    .then(response => response.json())
    .catch(() => null);
  if (!(health as { storage?: { enabled?: boolean } } | null)?.storage?.enabled) {
    // No server copy to wait for (health unreachable leaves pushes gated as before).
    if (health) markSettingsSyncedWithServer();
    return { synced: [], conflicts: [], skipped: true };
  }

  const history = loadPromptHistoryStore();
  const gallery = loadComfyGallery();
  if (history.length === 0 && gallery.length === 0) {
    const synced: StorageNamespace[] = [];
    const localSettings = loadSettingsCache();
    const serverDeleted = await pullNamespaceFromServer<string[] | { ids?: string[] }>(
      'gallery-deleted-ids'
    );
    const serverDeletedIds = Array.isArray(serverDeleted)
      ? serverDeleted
      : Array.isArray(serverDeleted?.ids)
        ? serverDeleted.ids
        : [];
    if (serverDeletedIds.length > 0) {
      saveGalleryDeletedIds(mergeGalleryDeletedIds(loadGalleryDeletedIds(), serverDeletedIds));
      synced.push('gallery-deleted-ids');
    }
    for (const namespace of SYNC_NAMESPACES) {
      if (
        namespace === 'gallery-deleted-ids' ||
        namespace === 'settings-cache' ||
        namespace === 'studio-extras'
      ) {
        continue;
      }
      const server = await pullNamespaceFromServer<unknown>(namespace);
      if (!server) {
        continue;
      }
      if (namespace === 'prompt-history') {
        savePromptHistoryStore(server as PromptHistoryEntry[]);
      } else {
        await saveComfyGalleryAsync(filterOutDeletedGalleryEntries(server as ComfyGalleryEntry[]));
      }
      synced.push(namespace);
    }
    // A failed pull is not an empty server: seeding it with this fresh profile's defaults
    // replaced the saved workflow library, characters and garments (studio-extras) in testing.
    const extrasPull = await pullNamespaceFromServerResult<StudioExtrasPayload>('studio-extras');
    const serverExtras = extrasPull.ok ? await loadStudioExtrasFromServer() : null;
    if (serverExtras) {
      applyStudioExtras(serverExtras);
      synced.push('studio-extras');
    } else if (extrasPull.ok) {
      await syncNamespaceToServer('studio-extras', collectStudioExtras());
      synced.push('studio-extras');
    }
    const settingsPull = await pullNamespaceFromServerResult<SettingsCache>('settings-cache');
    const serverSettings = settingsPull.data;
    if (serverSettings?.shared) {
      const merged = applyServerSessionStack(
        {
          ...localSettings,
          ...serverSettings,
          shared: { ...localSettings.shared, ...serverSettings.shared },
          tools: { ...(serverSettings.tools ?? {}), ...(localSettings.tools ?? {}) },
        },
        serverSettings
      );
      saveSettingsCache(merged);
    } else if (settingsPull.ok) {
      // The server really has no settings yet — seed it. A failed pull must not: this fresh
      // profile's copy has no maps, and pushing it replaced the server's.
      await syncNamespaceToServer('settings-cache', localSettings);
    }
    if (settingsPull.ok && extrasPull.ok) {
      markSettingsSyncedWithServer();
    }
    synced.push('settings-cache');
    return { synced, conflicts: [], skipped: false, pulledIntoEmpty: synced.length > 0 };
  }

  const { pullAndMergeGalleryFromServer } = await import('./gallery-server-sync');
  const galleryPull = await pullAndMergeGalleryFromServer();

  const settingsPull = await pullNamespaceFromServerResult<SettingsCache>('settings-cache');
  const serverSettings = settingsPull.data;
  const localSettings = loadSettingsCache();
  const extrasReachable = (await pullNamespaceFromServerResult<unknown>('studio-extras')).ok;
  if (settingsPull.ok && extrasReachable) {
    markSettingsSyncedWithServer();
  }
  if (
    serverSettings?.shared &&
    localSessionStackLooksEmpty(localSettings.shared as Record<string, unknown>)
  ) {
    saveSettingsCache(applyServerSessionStack(localSettings, serverSettings));
  }

  const localExtras = collectStudioExtras();
  const serverExtras = await loadStudioExtrasFromServer();
  if (
    serverExtras &&
    localStudioExtrasLooksEmpty(localExtras) &&
    !localStudioExtrasLooksEmpty(serverExtras)
  ) {
    applyStudioExtras(serverExtras);
  }

  const conflicts = await probeStorageConflicts();
  if (conflicts.length === 0) {
    // Still push extras/settings so durable prefs stay backed up even without conflicts.
    await autoPushStorageDebounced();
    return {
      synced: [...SYNC_NAMESPACES],
      conflicts: [],
      skipped: false,
      pulledIntoEmpty: galleryPull.changed,
    };
  }

  const choices: Partial<Record<StorageNamespace, MergeChoice>> = {};
  for (const conflict of conflicts) {
    if (conflict.namespace === 'studio-extras') {
      choices[conflict.namespace] = localStudioExtrasLooksEmpty(collectStudioExtras())
        ? 'server'
        : 'local';
    } else if (conflict.namespace === 'settings-cache') {
      choices[conflict.namespace] = 'merge';
    } else {
      choices[conflict.namespace as StorageNamespace] = suggestMergeChoice(conflict);
    }
  }
  const result = await applyStorageMerge(choices);
  return {
    synced: result.synced,
    conflicts: [],
    skipped: false,
    pulledIntoEmpty: galleryPull.changed,
  };
}

export async function autoPushStorageDebounced(): Promise<void> {
  const health = await fetch('/api/health')
    .then(response => response.json())
    .catch(() => null);
  if (!(health as { storage?: { enabled?: boolean } } | null)?.storage?.enabled) {
    return;
  }
  await initAppDb();
  // Until this page has pulled from the server, its copies may be a fresh profile's defaults —
  // pushing those replaced the server's settings maps and studio-extras (workflow library,
  // characters, garments). Nothing is pushed before a successful startup pull.
  if (!isSettingsSyncedWithServer()) {
    return;
  }
  if (await syncNamespaceToServer('settings-cache', loadSettingsCache())) {
    clearSettingsPushPending();
  }
  await syncNamespaceToServer('prompt-history', loadPromptHistoryStore());
  const gallery = loadComfyGallery();
  const deletedIds = loadGalleryDeletedIds();
  await syncNamespaceToServer('comfy-gallery', gallery);
  await syncNamespaceToServer('gallery-deleted-ids', deletedIds);
  await syncNamespaceToServer('studio-extras', collectStudioExtras());
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleAutoPushStorage(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if (pushTimer) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void autoPushStorageDebounced();
  }, 5000);
}
