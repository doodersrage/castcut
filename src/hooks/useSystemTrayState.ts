'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  COMFYUI_GALLERY_UPDATED_EVENT,
  loadComfyGallery,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { comfyUiJobProgressPercent } from '@/lib/comfyui-job-status';
import { HELD_MAX_UPDATED_EVENT, listHeldMaxJobs, type HeldMaxJob } from '@/lib/held-max-queue';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { summarizePoolQueueDepth } from '@/lib/comfyui-host-ready';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import {
  getSystemTrayMessagesServerSnapshot,
  getSystemTrayMessagesSnapshot,
  subscribeSystemTrayMessages,
  type SystemTrayMessage,
} from '@/lib/system-tray-messages';
import {
  refreshSharedHealth,
  subscribeSharedHealth,
  type RawHealthResponse,
} from '@/lib/shared-health-poll';

export type SystemTrayAssetJob = {
  id: string;
  label: string;
  status: 'queued' | 'downloading' | 'verifying' | 'complete' | 'error';
  progress: number;
};

export type SystemTrayQueueHealth = {
  queuePending: number;
  queueRunning: number;
  ok: boolean;
};

export type SystemTrayPrimary =
  | { kind: 'gallery'; entry: ComfyGalleryEntry; percent: number | null }
  | { kind: 'asset'; job: SystemTrayAssetJob }
  | { kind: 'held'; count: number; label: string }
  | { kind: 'queue'; pending: number; running: number };

export type SystemTrayState = {
  activeGalleryJobs: ComfyGalleryEntry[];
  heldJobs: HeldMaxJob[];
  assetJobs: SystemTrayAssetJob[];
  queueHealth: SystemTrayQueueHealth | null;
  primary: SystemTrayPrimary | null;
  totalActiveCount: number;
  hasActivity: boolean;
  trayMessages: readonly SystemTrayMessage[];
  refresh: () => void;
};

const ACTIVE_ASSET_STATUSES = new Set(['queued', 'downloading', 'verifying']);

function sortActiveGalleryJobs(entries: ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  return [...entries].sort((left, right) => {
    if (left.status === 'running' && right.status !== 'running') {
      return -1;
    }
    if (right.status === 'running' && left.status !== 'running') {
      return 1;
    }
    const leftPos = left.queuePosition ?? Number.MAX_SAFE_INTEGER;
    const rightPos = right.queuePosition ?? Number.MAX_SAFE_INTEGER;
    if (leftPos !== rightPos) {
      return leftPos - rightPos;
    }
    return right.queuedAt - left.queuedAt;
  });
}

function resolvePrimary(
  activeGalleryJobs: ComfyGalleryEntry[],
  assetJobs: SystemTrayAssetJob[],
  heldJobs: HeldMaxJob[],
  queueHealth: SystemTrayQueueHealth | null
): SystemTrayPrimary | null {
  const running = activeGalleryJobs.find(entry => entry.status === 'running');
  if (running) {
    return { kind: 'gallery', entry: running, percent: comfyUiJobProgressPercent(running) };
  }

  const downloading = assetJobs.find(
    job => job.status === 'downloading' || job.status === 'verifying'
  );
  if (downloading) {
    return { kind: 'asset', job: downloading };
  }

  const queuedAsset = assetJobs.find(job => job.status === 'queued');
  if (queuedAsset) {
    return { kind: 'asset', job: queuedAsset };
  }

  const pending = activeGalleryJobs.find(entry => entry.status === 'pending');
  if (pending) {
    return { kind: 'gallery', entry: pending, percent: null };
  }

  if (heldJobs.length > 0) {
    return {
      kind: 'held',
      count: heldJobs.length,
      label: heldJobs[0]?.label ?? 'Held Best job',
    };
  }

  if (queueHealth && (queueHealth.queueRunning > 0 || queueHealth.queuePending > 0)) {
    return {
      kind: 'queue',
      pending: queueHealth.queuePending,
      running: queueHealth.queueRunning,
    };
  }

  return null;
}

export function useSystemTrayState(options?: { pollAssets?: boolean }): SystemTrayState {
  const pollAssets = options?.pollAssets ?? true;
  const [galleryEntries, setGalleryEntries] = useState<ComfyGalleryEntry[]>([]);
  const [heldJobs, setHeldJobs] = useState<HeldMaxJob[]>([]);
  const [assetJobs, setAssetJobs] = useState<SystemTrayAssetJob[]>([]);
  const [queueHealth, setQueueHealth] = useState<SystemTrayQueueHealth | null>(null);
  const trayMessages = useSyncExternalStore(
    subscribeSystemTrayMessages,
    getSystemTrayMessagesSnapshot,
    getSystemTrayMessagesServerSnapshot
  );

  const refreshGallery = useCallback(() => {
    setGalleryEntries(loadComfyGallery());
  }, []);

  const refreshHeld = useCallback(() => {
    setHeldJobs(listHeldMaxJobs());
  }, []);

  const deriveQueueHealth = useCallback((data: RawHealthResponse): SystemTrayQueueHealth | null => {
    const typed = data as {
      comfyui?: { queuePending?: number; queueRunning?: number; ok?: boolean };
      comfyuiPool?: {
        enabled?: boolean;
        endpoints?: Array<{
          url?: string;
          ok?: boolean;
          queuePending?: number;
          queueRunning?: number;
        }>;
      };
    } | null;
    const comfy = typed?.comfyui;
    if (!comfy) {
      return null;
    }
    const pool =
      typed?.comfyuiPool?.enabled && typed.comfyuiPool.endpoints?.length
        ? summarizePoolQueueDepth(typed.comfyuiPool.endpoints)
        : null;
    return {
      queuePending: pool?.totalPending ?? comfy.queuePending ?? 0,
      queueRunning: pool?.totalRunning ?? comfy.queueRunning ?? 0,
      ok: pool ? pool.anyOk : (comfy.ok ?? false),
    };
  }, []);

  // Shared with ConnectionHealthChip/QueueTool/QueueOrchestrationPanel/MobileQueueTool — see
  // shared-health-poll.ts. `refreshHealth` force-refreshes (for the manual `refresh()` bundle
  // below); the passive 20s tick is a subscription set up in the effect further down instead of
  // this hook owning its own interval.
  const refreshHealth = useCallback(async () => {
    const data = await refreshSharedHealth({ force: true });
    setQueueHealth(deriveQueueHealth(data));
  }, [deriveQueueHealth]);

  const refreshAssets = useCallback(async () => {
    if (!pollAssets) {
      return;
    }
    try {
      const response = await fetch('/api/comfyui/assets');
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as {
        jobs?: Array<{
          id: string;
          label: string;
          status: SystemTrayAssetJob['status'];
          progress: number;
        }>;
      };
      const jobs = (data.jobs ?? [])
        .filter(job => ACTIVE_ASSET_STATUSES.has(job.status))
        .map(job => ({
          id: job.id,
          label: job.label,
          status: job.status,
          progress: job.progress,
        }));
      setAssetJobs(jobs);
    } catch {
      // ignore — asset downloads are optional tray content
    }
  }, [pollAssets]);

  const downloading = assetJobs.length > 0;

  const refresh = useCallback(() => {
    refreshGallery();
    refreshHeld();
    void refreshHealth();
    void refreshAssets();
  }, [refreshAssets, refreshGallery, refreshHeld, refreshHealth]);

  // Event-driven: every gallery write fires COMFYUI_GALLERY_UPDATED_EVENT (live progress lands
  // there from the ComfyUI stream every ~250ms), and every in-app download start fires the asset
  // event. The 4s gallery re-read and the always-on 8s asset poll ran on every page while idle.
  useEffect(() => {
    scheduleAfterCommit(refresh);

    const onGallery = () => refreshGallery();
    const onHeld = () => refreshHeld();
    const onAssets = () => void refreshAssets();
    // Downloads started outside this tab show up when you come back to it.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void refreshAssets();
      }
    };

    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGallery);
    window.addEventListener(HELD_MAX_UPDATED_EVENT, onHeld);
    window.addEventListener(COMFY_ASSET_JOBS_UPDATED_EVENT, onAssets);
    window.addEventListener('storage', onHeld);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGallery);
      window.removeEventListener(HELD_MAX_UPDATED_EVENT, onHeld);
      window.removeEventListener(COMFY_ASSET_JOBS_UPDATED_EVENT, onAssets);
      window.removeEventListener('storage', onHeld);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, refreshAssets, refreshGallery, refreshHeld]);

  // Download progress has no push channel — poll only while one is running.
  useEffect(() => {
    if (!downloading) {
      return;
    }
    const interval = window.setInterval(() => {
      void refreshAssets();
    }, 2000);
    return () => window.clearInterval(interval);
  }, [downloading, refreshAssets]);

  // Passive 20s health tick, shared with the other pollers (see shared-health-poll.ts) — this
  // used to be its own window.setInterval inside the effect above.
  useEffect(() => {
    return subscribeSharedHealth(data => {
      scheduleAfterCommit(() => setQueueHealth(deriveQueueHealth(data)));
    }, 20000);
  }, [deriveQueueHealth]);

  const activeGalleryJobs = useMemo(
    () =>
      sortActiveGalleryJobs(
        galleryEntries.filter(entry => entry.status === 'pending' || entry.status === 'running')
      ),
    [galleryEntries]
  );

  const primary = useMemo(
    () => resolvePrimary(activeGalleryJobs, assetJobs, heldJobs, queueHealth),
    [activeGalleryJobs, assetJobs, heldJobs, queueHealth]
  );

  const totalActiveCount = activeGalleryJobs.length + heldJobs.length + assetJobs.length;

  const hasActivity =
    totalActiveCount > 0 ||
    (queueHealth != null && (queueHealth.queuePending > 0 || queueHealth.queueRunning > 0));

  return {
    activeGalleryJobs,
    heldJobs,
    assetJobs,
    queueHealth,
    primary,
    totalActiveCount,
    hasActivity,
    trayMessages,
    refresh,
  };
}
