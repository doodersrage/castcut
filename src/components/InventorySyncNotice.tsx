'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';

const RECHECK_MS = 60_000;
const SHOW_MS = 15_000;

/**
 * Watches ComfyUI's model list (on load and when the window regains focus, at most once a
 * minute) and fills empty loader-map entries when it changes — then says so briefly.
 */
export default function InventorySyncNotice() {
  const [message, setMessage] = useState<string | null>(null);
  const lastRunRef = useRef(0);

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
