'use client';

/**
 * Is there anything to render with? One answer for the header chip, the offline banner and the
 * Queue / Animate buttons, read from the shared /api/health poll. UI audit (2026-10-11): with
 * ComfyUI unreachable, Day still said "Ready to cut", showed a green "plate ready" dot and kept
 * Queue / Animate live — the only sign was an unlabelled red dot that looked the same as "LLM
 * unreachable".
 */

import { useEffect, useState } from 'react';
import { isCloudEngine } from '@/lib/engine/capabilities';
import { loadSettingsCache } from '@/lib/settings-cache';
import { refreshSharedHealth, subscribeSharedHealth } from '@/lib/shared-health-poll';
import { renderBackendFromHealth, type RenderBackendStatus } from '@/lib/render-backend-health';

export {
  RENDER_BACKEND_OFFLINE_MESSAGE,
  type RenderBackendState,
  type RenderBackendStatus,
} from '@/lib/render-backend-health';
import { RENDER_BACKEND_OFFLINE_MESSAGE } from '@/lib/render-backend-health';

let last: RenderBackendStatus = { state: 'checking', llmOk: null };

/**
 * Rendering does not depend on this ComfyUI: a cloud engine is picked — or an e2e build (CI has
 * no ComfyUI and stubs every queue call), unless a test sets `window.__castcutRenderOffline`.
 */
function renderBackendNotNeeded(): boolean {
  if (process.env.NEXT_PUBLIC_PLAYWRIGHT === '1') {
    return (globalThis as { __castcutRenderOffline?: boolean }).__castcutRenderOffline !== true;
  }
  try {
    return isCloudEngine(loadSettingsCache().shared.inferenceEngine);
  } catch {
    return false;
  }
}

/** The latest known status (no fetch). */
export function lastRenderBackendStatus(): RenderBackendStatus {
  return last;
}

/**
 * Refuse a render up front when the backend is known to be down: re-checks once (it may have
 * just come back) and throws the plain message instead of a fetch error.
 */
export async function assertRenderBackendReachable(): Promise<void> {
  if (last.state !== 'offline' || renderBackendNotNeeded()) return;
  last = renderBackendFromHealth(await refreshSharedHealth({ force: true }), {
    cloudEngine: renderBackendNotNeeded(),
  });
  if (last.state === 'offline') throw new Error(RENDER_BACKEND_OFFLINE_MESSAGE);
}

/** Subscribe a component to the render backend status (polls every 30 s while mounted). */
export function useRenderBackend(): RenderBackendStatus {
  const [status, setStatus] = useState<RenderBackendStatus>(last);
  useEffect(() => {
    const unsubscribe = subscribeSharedHealth(data => {
      last = renderBackendFromHealth(data, { cloudEngine: renderBackendNotNeeded() });
      setStatus(last);
    }, 30_000);
    const onFocus = () => void refreshSharedHealth({ force: true });
    window.addEventListener('focus', onFocus);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', onFocus);
    };
  }, []);
  return status;
}

/** Ask again now (the banner's Retry). */
export function recheckRenderBackend(): void {
  void refreshSharedHealth({ force: true });
}
