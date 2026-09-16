'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isBrowserStorageReady,
  whenBrowserStorageReady,
  flushBrowserStorageNow,
} from '@/lib/browser-storage';
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  loadToolSettings,
  saveSharedSettings,
  saveSessionLoraSelectionNow,
  saveToolSettings,
  SETTINGS_CACHE_UPDATED_EVENT,
  type SharedToolSettings,
  type ToolSettingsCache,
} from '@/lib/settings-cache';
import { loadToolContext, saveToolContext } from '@/lib/tool-context-memory';
import { COMFY_MODEL_IDS, type ComfyImageModel } from '@/lib/comfy-models/client';
import { sanitizePreferEditToolModel } from '@/lib/queue-tool-model';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';

/** Skip cache→React reloads briefly after local edits so typing is not clobbered. */
const LOCAL_EDIT_REFRESH_GUARD_MS = 500;

function applyToolContext(shared: SharedToolSettings, toolKey: string): SharedToolSettings {
  const memory = loadToolContext(toolKey);
  if (!memory?.model && !memory?.selectedWorkflowFileId) {
    return shared;
  }
  const remembered = memory.model ? sanitizePreferEditToolModel(toolKey, memory.model) : undefined;
  // Migrate stale Outfit/Day T2I memory (e.g. 2512) so it cannot keep winning over Edit 2511.
  if (memory.model && remembered && remembered !== memory.model) {
    saveToolContext(toolKey, {
      model: remembered,
      selectedWorkflowFileId: memory.selectedWorkflowFileId,
    });
  }
  return {
    ...shared,
    ...(remembered && COMFY_MODEL_IDS.has(remembered) ? { model: remembered } : {}),
    ...(memory.selectedWorkflowFileId
      ? { selectedWorkflowFileId: memory.selectedWorkflowFileId }
      : {}),
  };
}

function sharedPersistTouchesLoras(partial: Partial<SharedToolSettings>): boolean {
  return (
    partial.sessionActiveLoraIdsByModel !== undefined ||
    partial.sessionActiveLoraIds !== undefined ||
    partial.sessionLoraStrengthOverridesByModel !== undefined ||
    partial.sessionLoraStrengthOverrides !== undefined
  );
}

export function useCachedSettings<K extends keyof ToolSettingsCache>(
  toolKey: K,
  toolDefaults: NonNullable<ToolSettingsCache[K]>
) {
  const defaultsRef = useRef(toolDefaults);
  const hydratedRef = useRef(false);
  const pendingSharedRef = useRef<Partial<SharedToolSettings> | null>(null);
  const pendingToolRef = useRef<Partial<NonNullable<ToolSettingsCache[K]>> | null>(null);
  const pendingPersistSharedRef = useRef<Partial<SharedToolSettings> | null>(null);
  const pendingPersistToolRef = useRef<Partial<NonNullable<ToolSettingsCache[K]>> | null>(null);
  const sharedPersistScheduledRef = useRef(false);
  const toolPersistScheduledRef = useRef(false);
  const suppressExternalRefreshUntilRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [shared, setShared] = useState<SharedToolSettings>(DEFAULT_SHARED_SETTINGS);
  const [toolSettings, setToolSettings] = useState<NonNullable<ToolSettingsCache[K]>>(
    () => (toolDefaults ?? {}) as NonNullable<ToolSettingsCache[K]>
  );

  useEffect(() => {
    defaultsRef.current = toolDefaults ?? defaultsRef.current;
  }, [toolDefaults]);

  const markLocalEdit = useCallback(() => {
    suppressExternalRefreshUntilRef.current = Date.now() + LOCAL_EDIT_REFRESH_GUARD_MS;
  }, []);

  const hasPendingLocalWrites = useCallback(() => {
    return Boolean(
      pendingPersistSharedRef.current ||
      pendingPersistToolRef.current ||
      pendingSharedRef.current ||
      pendingToolRef.current
    );
  }, []);

  const flushPendingSharedPersist = useCallback(() => {
    const batch = pendingPersistSharedRef.current;
    pendingPersistSharedRef.current = null;
    if (!batch || Object.keys(batch).length === 0) {
      return;
    }
    const next = { ...loadSettingsCache().shared, ...batch };
    // Same-tab listeners must not reload React state mid-typing.
    if (sharedPersistTouchesLoras(batch)) {
      void saveSessionLoraSelectionNow(next, { notify: false });
    } else {
      saveSharedSettings(next, { notify: false });
      void flushBrowserStorageNow();
    }
    if ('model' in batch || 'selectedWorkflowFileId' in batch) {
      const sanitizedModel = sanitizePreferEditToolModel(String(toolKey), next.model) ?? next.model;
      saveToolContext(String(toolKey), {
        model: sanitizedModel as ComfyImageModel,
        selectedWorkflowFileId: next.selectedWorkflowFileId,
      });
    }
  }, [toolKey]);

  const queueSharedPersist = useCallback(
    (partial: Partial<SharedToolSettings>) => {
      pendingPersistSharedRef.current = {
        ...(pendingPersistSharedRef.current ?? {}),
        ...partial,
      };
      if (sharedPersistTouchesLoras(partial)) {
        sharedPersistScheduledRef.current = false;
        flushPendingSharedPersist();
        return;
      }
      if (sharedPersistScheduledRef.current) {
        return;
      }
      sharedPersistScheduledRef.current = true;
      scheduleAfterCommit(() => {
        sharedPersistScheduledRef.current = false;
        flushPendingSharedPersist();
      });
    },
    [flushPendingSharedPersist]
  );

  const flushPendingToolPersist = useCallback(() => {
    const batch = pendingPersistToolRef.current;
    pendingPersistToolRef.current = null;
    if (!batch || Object.keys(batch).length === 0) {
      return;
    }
    const defaults = defaultsRef.current ?? ({} as NonNullable<ToolSettingsCache[K]>);
    const next = {
      ...loadToolSettings(toolKey, defaults),
      ...batch,
    } as NonNullable<ToolSettingsCache[K]>;
    saveToolSettings(toolKey, next, { notify: false });
  }, [toolKey]);

  const queueToolPersist = useCallback(
    (partial: Partial<NonNullable<ToolSettingsCache[K]>>) => {
      pendingPersistToolRef.current = {
        ...(pendingPersistToolRef.current ?? {}),
        ...partial,
      };
      if (toolPersistScheduledRef.current) {
        return;
      }
      toolPersistScheduledRef.current = true;
      scheduleAfterCommit(() => {
        toolPersistScheduledRef.current = false;
        flushPendingToolPersist();
      });
    },
    [flushPendingToolPersist]
  );

  useEffect(() => {
    let cancelled = false;
    hydratedRef.current = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      const cache = loadSettingsCache();
      let nextShared = applyToolContext(cache.shared, String(toolKey));
      if (
        nextShared.model !== cache.shared.model ||
        nextShared.selectedWorkflowFileId !== cache.shared.selectedWorkflowFileId
      ) {
        scheduleAfterCommit(() => saveSharedSettings(nextShared, { notify: false }));
      }

      const pendingShared = pendingSharedRef.current;
      pendingSharedRef.current = null;
      if (pendingShared && Object.keys(pendingShared).length > 0) {
        nextShared = { ...nextShared, ...pendingShared };
        scheduleAfterCommit(() => {
          saveSharedSettings(nextShared, { notify: false });
          if ('model' in pendingShared || 'selectedWorkflowFileId' in pendingShared) {
            const sanitizedModel =
              sanitizePreferEditToolModel(String(toolKey), nextShared.model) ?? nextShared.model;
            saveToolContext(String(toolKey), {
              model: sanitizedModel as ComfyImageModel,
              selectedWorkflowFileId: nextShared.selectedWorkflowFileId,
            });
          }
        });
      }

      const defaults = defaultsRef.current ?? ({} as NonNullable<ToolSettingsCache[K]>);
      let nextTool = loadToolSettings(toolKey, defaults);
      const pendingTool = pendingToolRef.current;
      pendingToolRef.current = null;
      if (pendingTool && Object.keys(pendingTool).length > 0) {
        nextTool = { ...nextTool, ...pendingTool } as NonNullable<ToolSettingsCache[K]>;
        scheduleAfterCommit(() => saveToolSettings(toolKey, nextTool, { notify: false }));
      }

      // Always replace React defaults with hydrated settings. Pre-hydrate edits
      // are held in pending* refs and merged above — never block hydrate.
      setShared(nextShared);
      setToolSettings(nextTool);
      hydratedRef.current = true;
      setMounted(true);
    });
    // toolDefaults are module-level constants; toolKey selects the cache slice
    return () => {
      cancelled = true;
    };
  }, [toolKey]);

  useEffect(() => {
    const refresh = () => {
      if (!hydratedRef.current) {
        return;
      }
      scheduleAfterCommit(() => {
        if (!hydratedRef.current) {
          return;
        }
        // Do not clobber controlled inputs while the user is typing / saving.
        if (hasPendingLocalWrites() || Date.now() < suppressExternalRefreshUntilRef.current) {
          return;
        }
        const cache = loadSettingsCache();
        setShared(applyToolContext(cache.shared, String(toolKey)));
        setToolSettings(loadToolSettings(toolKey, defaultsRef.current));
      });
    };
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
  }, [hasPendingLocalWrites, toolKey]);

  const updateShared = useCallback(
    (partial: Partial<SharedToolSettings>) => {
      markLocalEdit();
      // Before IndexedDB hydrate, only update React optimistically and queue the
      // patch. Persisting here would stamp DEFAULT_SHARED_SETTINGS over real data.
      if (!hydratedRef.current || !isBrowserStorageReady()) {
        pendingSharedRef.current = {
          ...(pendingSharedRef.current ?? {}),
          ...partial,
        };
        setShared(previous => ({ ...previous, ...partial }));
        return;
      }

      setShared(previous => ({ ...previous, ...partial }));
      queueSharedPersist(partial);
    },
    [markLocalEdit, queueSharedPersist]
  );

  const updateToolSettings = useCallback(
    (partial: Partial<NonNullable<ToolSettingsCache[K]>>) => {
      markLocalEdit();
      if (!hydratedRef.current || !isBrowserStorageReady()) {
        pendingToolRef.current = {
          ...(pendingToolRef.current ?? {}),
          ...partial,
        };
        setToolSettings(previous => {
          const defaults = defaultsRef.current ?? ({} as NonNullable<ToolSettingsCache[K]>);
          return {
            ...(previous ?? defaults),
            ...partial,
          } as NonNullable<ToolSettingsCache[K]>;
        });
        return;
      }

      setToolSettings(previous => {
        const defaults = defaultsRef.current ?? ({} as NonNullable<ToolSettingsCache[K]>);
        return {
          ...(previous ?? defaults),
          ...partial,
        } as NonNullable<ToolSettingsCache[K]>;
      });
      queueToolPersist(partial);
    },
    [markLocalEdit, queueToolPersist]
  );

  return {
    mounted,
    shared,
    toolSettings: toolSettings ?? toolDefaults ?? ({} as NonNullable<ToolSettingsCache[K]>),
    updateShared,
    updateToolSettings,
    setModel: (model: SharedToolSettings['model']) => updateShared({ model }),
    setDetail: (detail: SharedToolSettings['detail']) => updateShared({ detail }),
  };
}
