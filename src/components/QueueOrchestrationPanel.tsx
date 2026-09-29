'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { ChipButton } from '@/components/ui/Field';
import { StatCard, ToolActionRow } from '@/components/ui/ToolPageShell';
import {
  loadComfyGallery,
  COMFYUI_GALLERY_UPDATED_EVENT,
  type ComfyGalleryEntry,
} from '@/lib/comfyui-gallery';
import { scheduleComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { postComfyUiPrompt } from '@/lib/comfyui-queue-request';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  clearHeldMaxJobs,
  isComfyQueueIdle,
  removeHeldMaxJob,
  type HeldMaxJob,
} from '@/lib/held-max-queue';
import { useHeldMaxJobs } from '@/hooks/useHeldMaxJobs';
import {
  requeueMoireCleanFromGalleryEntry,
  requeueRefineFromGalleryEntry,
  requeueUpscaleFromGalleryEntry,
} from '@/lib/comfyui-requeue';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';
import { formatPoolQueueStrip, summarizePoolQueueDepth } from '@/lib/comfyui-host-ready';
import {
  refreshSharedHealth,
  subscribeSharedHealth,
  type RawHealthResponse,
} from '@/lib/shared-health-poll';

type ComfyHealth = {
  ok: boolean;
  url?: string;
  queuePending?: number;
  queueRunning?: number;
  vram?: { free?: number; total?: number };
  error?: string;
};

type PoolHealthEndpoint = {
  url?: string;
  ok?: boolean;
  queueRunning?: number;
  queuePending?: number;
};

export default function QueueOrchestrationPanel(props: { compact?: boolean }) {
  const [health, setHealth] = useState<ComfyHealth | null>(null);
  const [poolEndpoints, setPoolEndpoints] = useState<PoolHealthEndpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [galleryRevision, setGalleryRevision] = useState(0);
  const heldJobs = useHeldMaxJobs();
  // Stable SSR/client first paint — hydrate hold flag + gallery after mount.
  const [holdMaxUntilIdle, setHoldMaxUntilIdle] = useState(false);
  const [localJobs, setLocalJobs] = useState<ComfyGalleryEntry[]>([]);
  const [flushing, setFlushing] = useState(false);
  const flushingRef = useRef(false);

  const applyHealthData = useCallback((data: RawHealthResponse) => {
    const typed = data as {
      comfyui?: ComfyHealth;
      comfyuiPool?: { enabled?: boolean; endpoints?: PoolHealthEndpoint[] };
    } | null;
    setHealth(typed?.comfyui ?? null);
    setPoolEndpoints(
      typed?.comfyuiPool?.enabled && Array.isArray(typed.comfyuiPool.endpoints)
        ? typed.comfyuiPool.endpoints
        : []
    );
  }, []);

  // Shared with ConnectionHealthChip/SystemTray/QueueTool/MobileQueueTool — see
  // shared-health-poll.ts. This force-refreshes for the manual "Refresh" button and on mount;
  // the passive 30s tick is a subscription in the effect below instead of its own interval.
  const refreshHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await refreshSharedHealth({ force: true });
      applyHealthData(data);
    } finally {
      setLoading(false);
    }
  }, [applyHealthData]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setHoldMaxUntilIdle(loadSettingsCache().shared.holdMaxUntilIdle === true);
      setLocalJobs(loadComfyGallery());
      void refreshHealth();
    });
    const onGalleryUpdate = () => setGalleryRevision(value => value + 1);
    window.addEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdate);
    const unsubscribeHealth = subscribeSharedHealth(data => {
      scheduleAfterCommit(() => applyHealthData(data));
    }, 30_000);
    return () => {
      window.removeEventListener(COMFYUI_GALLERY_UPDATED_EVENT, onGalleryUpdate);
      unsubscribeHealth();
    };
  }, [refreshHealth, applyHealthData]);

  useEffect(() => {
    if (galleryRevision === 0) {
      return;
    }
    scheduleAfterCommit(() => {
      setLocalJobs(loadComfyGallery());
    });
  }, [galleryRevision]);

  const pendingLocal = useMemo(
    () => localJobs.filter(entry => entry.status === 'pending' || entry.status === 'running'),
    [localJobs]
  );
  const runningLocal = useMemo(
    () => localJobs.filter(entry => entry.status === 'running'),
    [localJobs]
  );

  const flushHeldJobs = useCallback(async (jobs: HeldMaxJob[]) => {
    if (jobs.length === 0 || flushingRef.current) {
      return;
    }
    flushingRef.current = true;
    setFlushing(true);
    setStatus(`Flushing ${jobs.length} held Max job(s)…`);
    const gallery = loadComfyGallery();
    let flushed = 0;
    try {
      for (const job of jobs) {
        if (job.kind === 'generate') {
          const { guardQueueQualityForVram } = await import('@/lib/vram-queue-guard');
          const vramGuard = await guardQueueQualityForVram({
            profile: job.qualityProfile,
            runtime: job.comfy,
          });
          const queued = await postComfyUiPrompt({
            prompt: job.prompt,
            negativePrompt: job.negativePrompt,
            model: job.model,
            params: job.params,
            ...(vramGuard.runtime
              ? { comfy: vramGuard.runtime }
              : job.comfy
                ? { comfy: job.comfy }
                : {}),
          });
          if (!queued.ok || !queued.promptId) {
            queued.releaseLiveSocket();
            setStatus(queued.error ?? 'Held generate flush failed.');
            continue;
          }
          const { registerComfyGalleryJob } = await import('@/lib/comfyui-gallery-client');
          registerComfyGalleryJob({
            promptId: queued.promptId,
            prompt: job.prompt,
            negativePrompt: job.negativePrompt,
            tool: job.tool ?? 'held-max',
            model: job.model,
            comfyUrl: queued.comfyUrl ?? 'http://127.0.0.1:8188',
            clientId: queued.clientId,
            queueParams: job.params,
            queueQualityProfile: job.qualityProfile,
          });
          void scheduleComfyGalleryPoll(queued.promptId, {
            comfyUrl: queued.comfyUrl ?? 'http://127.0.0.1:8188',
            clientId: queued.clientId,
          });
          queued.releaseLiveSocket();
          removeHeldMaxJob(job.id);
          flushed += 1;
          continue;
        }

        const entry = gallery.find(item => item.id === job.entryId);
        if (!entry) {
          removeHeldMaxJob(job.id);
          continue;
        }
        const result =
          job.kind === 'moire'
            ? await requeueMoireCleanFromGalleryEntry(entry, {
                qualityProfile: job.qualityProfile,
                force: true,
                onStatus: setStatus,
              })
            : job.kind === 'refine'
              ? await requeueRefineFromGalleryEntry(entry, {
                  qualityProfile: job.qualityProfile,
                  force: true,
                  onStatus: setStatus,
                })
              : await requeueUpscaleFromGalleryEntry(entry, {
                  qualityProfile: job.qualityProfile,
                  force: true,
                  onStatus: setStatus,
                });
        if (result.ok && !result.held) {
          removeHeldMaxJob(job.id);
          flushed += 1;
        }
      }
      setStatus(
        flushed > 0
          ? `Flushed ${flushed} held Max job(s).`
          : 'No held Max jobs could be flushed yet.'
      );
    } finally {
      flushingRef.current = false;
      setFlushing(false);
      setGalleryRevision(value => value + 1);
    }
  }, []);

  useEffect(() => {
    if (!health?.ok || !isComfyQueueIdle(health) || heldJobs.length === 0) {
      return;
    }
    void flushHeldJobs(heldJobs);
  }, [health, heldJobs, flushHeldJobs]);

  async function refreshPendingJobs() {
    setStatus(null);
    await Promise.all(
      pendingLocal.map(entry =>
        scheduleComfyGalleryPoll(entry.promptId, { comfyUrl: entry.comfyUrl })
      )
    );
    setStatus(`Refreshed ${pendingLocal.length} tracked job(s).`);
    setGalleryRevision(value => value + 1);
  }

  function toggleHoldMax(next: boolean) {
    setHoldMaxUntilIdle(next);
    const shared = loadSettingsCache().shared;
    saveSharedSettings({ ...shared, holdMaxUntilIdle: next });
  }

  const vramLabel =
    health?.vram?.total != null
      ? `${Math.round((health.vram.free ?? 0) / 1e9)} / ${Math.round(health.vram.total / 1e9)} GB free`
      : null;
  const poolQueue = useMemo(
    () =>
      summarizePoolQueueDepth(poolEndpoints, {
        url: health?.url,
        ok: health?.ok,
        queueRunning: health?.queueRunning,
        queuePending: health?.queuePending,
      }),
    [poolEndpoints, health]
  );

  return (
    <section className={`ui-meta-panel ${props.compact ? 'p-4' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="type-heading">Queue orchestration</h3>
          <p className="type-caption">
            ComfyUI server queue plus locally tracked jobs from this app.
          </p>
        </div>
        <Button variant="ghost" size="sm" loading={loading} onClick={() => void refreshHealth()}>
          Refresh
        </Button>
      </div>

      <div
        className={`mt-4 grid gap-3 ${props.compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 lg:grid-cols-4'}`}
      >
        <StatCard
          label="ComfyUI server"
          value={health?.ok || poolQueue.anyOk ? 'Online' : 'Offline'}
          detail={
            health?.ok || poolQueue.anyOk
              ? [formatPoolQueueStrip(poolQueue), vramLabel].filter(Boolean).join(' · ') ||
                health?.url
              : (health?.error ?? 'Unreachable')
          }
          valueClassName={health?.ok === false && !poolQueue.anyOk ? 'ui-status-danger' : ''}
        />
        <StatCard
          label="Local tracked"
          value={String(pendingLocal.length)}
          detail={`${runningLocal.length} running · ${pendingLocal.length - runningLocal.length} pending`}
        />
        <StatCard
          label="Held Max jobs"
          value={String(heldJobs.length)}
          detail={holdMaxUntilIdle ? 'Hold Best until idle is on' : 'Hold Best until idle is off'}
        />
        <StatCard
          label="Failed locally"
          value={String(localJobs.filter(entry => entry.status === 'error').length)}
          detail={
            localJobs.filter(entry => entry.status === 'error').length
              ? 'Check Gallery for details'
              : undefined
          }
        />
      </div>

      <div className="mt-4 space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/60 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <ChipButton active={holdMaxUntilIdle} onClick={() => toggleHoldMax(!holdMaxUntilIdle)}>
            Hold Best until idle
          </ChipButton>
          <Button
            variant="secondary"
            size="sm"
            loading={flushing}
            disabled={heldJobs.length === 0}
            onClick={() => void flushHeldJobs(heldJobs)}
          >
            Flush held Max
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={heldJobs.length === 0}
            onClick={() => {
              clearHeldMaxJobs();
              setStatus('Cleared held Max jobs.');
            }}
          >
            Clear held
          </Button>
        </div>
        {heldJobs.length > 0 ? (
          <p className="type-caption text-[var(--text-muted)]">
            Waiting:{' '}
            {heldJobs
              .slice(0, 4)
              .map(job => `${job.kind} · ${job.label}`)
              .join(' · ')}
            {heldJobs.length > 4 ? ` · +${heldJobs.length - 4} more` : ''}
          </p>
        ) : (
          <p className="type-caption text-[var(--text-muted)]">
            When on, Max Generate / re-queue / gallery Upscale / Moiré / Refine wait until the
            ComfyUI queue is empty, then flush automatically (VRAM is re-checked on flush).
          </p>
        )}
      </div>

      <ToolActionRow className="mt-4">
        <Button
          variant="secondary"
          size="sm"
          disabled={pendingLocal.length === 0}
          onClick={() => void refreshPendingJobs()}
        >
          Poll pending jobs
        </Button>
        <ButtonLink href="/gallery" size="sm">
          Open gallery
        </ButtonLink>
        <ButtonLink href="/studio?tab=experiments" size="sm">
          Experiments
        </ButtonLink>
      </ToolActionRow>

      {status ? <p className="mt-3 text-xs ui-status-success">{status}</p> : null}
    </section>
  );
}
