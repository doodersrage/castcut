'use client';

import { useEffect } from 'react';
import { initBrowserStorage } from '@/lib/browser-storage';
import { SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings-cache';
import { currentEngineHealthUrl } from '@/lib/engine-health-store';

/** How often to look for a changed ComfyUI URL (cheap: no request). */
const URL_POLL_MS = 30 * 1000;
/** How often to refresh the checks while the app is open (expired ones only). */
const RECHECK_MS = 10 * 60 * 1000;

/**
 * Checks every pickable engine against ComfyUI when the app opens and again when the ComfyUI
 * URL changes, so the Engine chips can say "Missing node …" before a queue fails. See
 * lib/engine-health.
 */
export default function EngineHealthWatcher() {
  useEffect(() => {
    let cancelled = false;
    let lastUrl: string | null = null;

    const run = async (force: boolean) => {
      const { checkAllEngineHealth } = await import('@/lib/engine-health-client');
      if (cancelled) return;
      await checkAllEngineHealth({ force }).catch(() => undefined);
    };

    const onMaybeUrlChange = () => {
      const url = currentEngineHealthUrl();
      if (lastUrl === null || url === lastUrl) return;
      lastUrl = url;
      void run(true);
    };

    // Settings load from IndexedDB and merge with the server a few seconds later; checking
    // before that would build graphs from an empty map (same wait as the workflow watcher).
    let startTimer: number | undefined;
    void initBrowserStorage().then(() => {
      if (cancelled) return;
      startTimer = window.setTimeout(() => {
        lastUrl = currentEngineHealthUrl();
        void run(false);
      }, 8000);
    });
    const urlTimer = window.setInterval(onMaybeUrlChange, URL_POLL_MS);
    const recheckTimer = window.setInterval(() => void run(false), RECHECK_MS);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onMaybeUrlChange);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearInterval(urlTimer);
      window.clearInterval(recheckTimer);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onMaybeUrlChange);
    };
  }, []);

  return null;
}
