'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { gpuAutoMatchPlan, gpuSettingsSuggestion } from '@/lib/gpu-settings-match';
import {
  SETTINGS_SYNCED_WITH_SERVER_EVENT,
  isSettingsSyncedWithServer,
} from '@/lib/settings-push-flush';
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import { subscribeSharedHealth } from '@/lib/shared-health-poll';

/** Set by the earlier click-to-match offer; a card offered there isn't matched again. */
const LEGACY_GPU_OFFER_KEY = 'castcut.gpuMatchOffered.v1';

const RECHECK_MS = 60_000;
const SHOW_MS = 15_000;

/**
 * Watches ComfyUI's model list (on load and when the window regains focus, at most once a
 * minute) and fills empty loader-map entries when it changes — then says so briefly.
 */
export default function InventorySyncNotice() {
  const [message, setMessage] = useState<string | null>(null);
  const lastRunRef = useRef(0);
  // One-time automatic "Match this GPU" the first time ComfyUI reports a card (with Undo).
  const [gpuMatched, setGpuMatched] = useState<{
    label: string;
    previous: Partial<SharedToolSettings>;
  } | null>(null);

  useEffect(() => {
    let done = false;
    return subscribeSharedHealth(data => {
      if (done) return;
      const health = data as {
        comfyui?: { vram?: { total?: number } };
        storage?: { enabled?: boolean };
      } | null;
      const suggestion = gpuSettingsSuggestion(health?.comfyui?.vram?.total);
      if (!suggestion) return;
      // Before the first server sync this profile's copy may be all defaults — matching then
      // would push over the choices saved on the server. Try again on the next health tick.
      if (health?.storage?.enabled !== false && !isSettingsSyncedWithServer()) return;
      done = true;
      const shared = loadSettingsCache().shared;
      let offeredBefore = false;
      try {
        offeredBefore =
          window.localStorage.getItem(LEGACY_GPU_OFFER_KEY) === String(suggestion.totalGb);
      } catch {
        // Private mode — the settings flag below is what counts.
      }
      if (offeredBefore && shared.gpuMatchAutoGb === undefined) {
        // This browser already offered it (and it was taken or declined) — don't redo it.
        saveSharedSettings({ ...shared, gpuMatchAutoGb: suggestion.totalGb });
        return;
      }
      const plan = gpuAutoMatchPlan(shared, DEFAULT_SHARED_SETTINGS, suggestion);
      if (!plan) return;
      saveSharedSettings({ ...shared, ...plan.patch });
      if (Object.keys(plan.previous).length > 0) {
        setGpuMatched({ label: suggestion.label, previous: plan.previous });
      }
    }, 60_000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      // Before the first server sync a new browser's maps are empty — the fill "mapped" dozens
      // of entries the server already had and said so on every new device.
      if (!isSettingsSyncedWithServer()) return;
      const now = Date.now();
      if (now - lastRunRef.current < RECHECK_MS) return;
      lastRunRef.current = now;
      void import('@/lib/comfy-inventory-auto-sync')
        .then(({ autoSyncLoaderMapsIfInventoryChanged }) =>
          autoSyncLoaderMapsIfInventoryChanged({ comfyUrl: loadComfyUiSettings().apiUrl })
        )
        .then(outcome => {
          if (cancelled || outcome.status !== 'synced') return;
          setMessage(outcome.message);
          if (hideTimer) clearTimeout(hideTimer);
          hideTimer = setTimeout(() => setMessage(null), SHOW_MS);
        })
        .catch(() => undefined);
    };
    run();
    window.addEventListener('focus', run);
    window.addEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, run);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', run);
      window.removeEventListener(SETTINGS_SYNCED_WITH_SERVER_EVENT, run);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (gpuMatched && !message) {
    return (
      <div
        role="status"
        data-testid="gpu-match-notice"
        className="fixed bottom-[calc(max(var(--bottom-dock-height,0px),env(safe-area-inset-bottom),0.25rem)+0.75rem)] left-4 right-4 sm:right-auto z-50 max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated,var(--bg-base))] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-surface)] lg:left-[calc(var(--sidebar-width)+1rem)]"
      >
        <p>Matched settings to your GPU: {gpuMatched.label}.</p>
        <p className="type-caption mt-1 flex gap-3">
          <button
            type="button"
            className="ui-text-link"
            data-testid="gpu-match-undo"
            onClick={() => {
              saveSharedSettings({ ...loadSettingsCache().shared, ...gpuMatched.previous });
              setGpuMatched(null);
            }}
          >
            Undo
          </button>
          <button type="button" className="ui-text-link" onClick={() => setGpuMatched(null)}>
            OK
          </button>
        </p>
      </div>
    );
  }
  if (!message) return null;
  return (
    <div
      role="status"
      data-testid="inventory-sync-notice"
      className="fixed bottom-[calc(max(var(--bottom-dock-height,0px),env(safe-area-inset-bottom),0.25rem)+0.75rem)] left-4 right-4 sm:right-auto z-50 max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated,var(--bg-base))] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-surface)] lg:left-[calc(var(--sidebar-width)+1rem)]"
    >
      <p>{message}</p>
      <p className="type-caption mt-1 flex gap-3">
        <Link href="/settings?tab=comfyui&section=workflow-patching" className="ui-text-link">
          See maps
        </Link>
        <button type="button" className="ui-text-link" onClick={() => setMessage(null)}>
          Dismiss
        </button>
      </p>
    </div>
  );
}
