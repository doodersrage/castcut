'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { whenBrowserStorageReady } from '@/lib/storage/browser-storage';
import type { ComfyUiRuntimeConfig } from '@/lib/comfyui/config';
import {
  comfyUiSettingsToRuntime,
  loadComfyUiSettings,
  saveComfyUiSettings,
  type ComfyUiSettings,
} from '@/lib/comfyui/settings';

export function useComfyUiSettings() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<ComfyUiSettings>(() => loadComfyUiSettings());

  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (cancelled) {
        return;
      }
      setSettings(loadComfyUiSettings());
      setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<ComfyUiSettings>) => {
    setSettings(previous => {
      const next = { ...previous, ...patch };
      saveComfyUiSettings(next);
      return next;
    });
  }, []);

  const runtimeConfig = useMemo(() => comfyUiSettingsToRuntime(settings), [settings]);

  const getRuntimeConfig = useCallback((): ComfyUiRuntimeConfig | undefined => {
    return comfyUiSettingsToRuntime(loadComfyUiSettings());
  }, []);

  return {
    mounted,
    settings,
    updateSettings,
    runtimeConfig,
    getRuntimeConfig,
  };
}
