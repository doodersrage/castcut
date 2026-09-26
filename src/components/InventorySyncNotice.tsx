'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { gpuSettingsPatch, gpuSettingsSuggestion } from '@/lib/gpu-settings-match';
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettings,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import { subscribeSharedHealth } from '@/lib/shared-health-poll';

const GPU_OFFER_KEY = 'castcut.gpuMatchOffered.v1';

const RECHECK_MS = 60_000;
const SHOW_MS = 15_000;

/**
 * Watches ComfyUI's model list (on load and when the window regains focus, at most once a
 * minute) and fills empty loader-map entries when it changes — then says so briefly.
 */
export default function InventorySyncNotice() {
  const [message, setMessage] = useState<string | null>(null);
  const lastRunRef = useRef(0);
  // One-time "Match this GPU" offer the first time ComfyUI reports its card.
  const [gpuOffer, setGpuOffer] = useState<{
    label: string;
    patch: Partial<SharedToolSettings>;
  } | null>(null);

  useEffect(() => {
    let offered = false;
    return subscribeSharedHealth(data => {
      if (offered) return;
      const total = (data as { comfyui?: { vram?: { total?: number } } } | null)?.comfyui?.vram
        ?.total;
      const suggestion = gpuSettingsSuggestion(total);
      if (!suggestion) return;
      offered = true;
      try {
        if (window.localStorage.getItem(GPU_OFFER_KEY) === String(suggestion.totalGb)) return;
        window.localStorage.setItem(GPU_OFFER_KEY, String(suggestion.totalGb));
      } catch {
        return;
      }
      const patch = gpuSettingsPatch(
        loadSettingsCache().shared,
        DEFAULT_SHARED_SETTINGS,
        suggestion
      );
      if (Object.keys(patch).length > 0) setGpuOffer({ label: suggestion.label, patch });
    }, 60_000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
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
    return () => {
      cancelled = true;
      window.removeEventListener('focus', run);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  if (gpuOffer && !message) {
    return (
      <div
        role="status"
        data-testid="gpu-match-offer"
        className="fixed bottom-4 left-4 z-50 max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated,var(--bg-base))] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-surface)] lg:left-[calc(var(--sidebar-width)+1rem)]"
      >
        <p>ComfyUI found your GPU: {gpuOffer.label}. Match these settings to it?</p>
        <p className="type-caption mt-1 flex gap-3">
          <button
            type="button"
            className="ui-text-link"
            data-testid="gpu-match-offer-apply"
            onClick={() => {
              saveSharedSettings({ ...loadSettingsCache().shared, ...gpuOffer.patch });
              setGpuOffer(null);
            }}
          >
            Match it
          </button>
          <button type="button" className="ui-text-link" onClick={() => setGpuOffer(null)}>
            Not now
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
      className="fixed bottom-4 left-4 z-50 max-w-sm rounded-[var(--radius-lg)] border border-[var(--border-default)] bg-[var(--bg-elevated,var(--bg-base))] px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-surface)] lg:left-[calc(var(--sidebar-width)+1rem)]"
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
