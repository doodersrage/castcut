'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadComfyGallery, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { toastBulkQueueSummary, toastQueueOutcome } from '@/lib/app-toast';
import { resolveStudioEmptyCta } from '@/lib/empty-cta';
import { requeueComfyJobFromEntry, requeueComfyJobs } from '@/lib/comfyui-requeue';
import { resolveRequeueImageUrlsFromEntry } from '@/lib/queue-requeue-images';
import { markOnboardingFirstQueue } from '@/lib/onboarding-hooks';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  cancelComfyUiJob,
  freeComfyUiMemory,
  interruptComfyUiQueue,
  restartComfyUi,
} from '@/lib/comfyui-queue-control';
import { claimOrphanComfyJob, claimOrphanComfyJobs } from '@/lib/comfyui-gallery-client';
import { mergeHostJobLists, type ComfyJobListItem, type HostOrphanJob } from '@/lib/comfyui-jobs';
import { listHealComfyUrls } from '@/lib/comfyui-manager-install-client';
import { summarizePoolQueueDepth } from '@/lib/comfyui-host-ready';
import { cancelComfyGalleryJob } from '@/lib/comfyui-queue-cancel';
import { refreshSharedHealth } from '@/lib/shared-health-poll';
import { useWorkspaceMode } from '@/hooks/useWorkspaceMode';
import { removeComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { cancelComfyGalleryPoll } from '@/lib/comfyui-gallery-poller';
import { loadCharacters } from '@/lib/character-os';
import { loadSettingsCache, saveToolSettings } from '@/lib/settings-cache';
import { whenBrowserStorageReady } from '@/lib/browser-storage';
import { estimateQueueEta } from '@/lib/queue-eta';
import {
  buildPlayJobIndex,
  describeQueueJob,
  groupQueueJobs,
  repointPlayJobIds,
} from '@/lib/queue-job-context';

type ComfyQueueHealth = {
  queueRunning?: number;
  queuePending?: number;
  ok?: boolean;
  url?: string;
};

type PoolHealthEndpoint = {
  url?: string;
  ok?: boolean;
  queueRunning?: number;
  queuePending?: number;
};

export function useQueueToolOrchestration() {
  const workspaceMode = useWorkspaceMode();
  const isSimple = workspaceMode === 'simple';
  const [entries, setEntries] = useState<ComfyGalleryEntry[]>([]);
  const [queueHealth, setQueueHealth] = useState<ComfyQueueHealth | null>(null);
  const [poolEndpoints, setPoolEndpoints] = useState<PoolHealthEndpoint[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [hostJobs, setHostJobs] = useState<HostOrphanJob[]>([]);

  const refreshEntries = useCallback(() => {
    setEntries(loadComfyGallery());
  }, []);

  const refreshHealth = useCallback(async () => {
    let healthUrl: string | undefined;
    try {
      const data = (await refreshSharedHealth({ force: true })) as {
        comfyui?: ComfyQueueHealth;
        comfyuiPool?: { enabled?: boolean; endpoints?: PoolHealthEndpoint[] };
      } | null;
      setQueueHealth(data?.comfyui ?? null);
      setPoolEndpoints(
        data?.comfyuiPool?.enabled && Array.isArray(data.comfyuiPool.endpoints)
          ? data.comfyuiPool.endpoints
          : []
      );
      healthUrl = data?.comfyui?.url?.trim() || undefined;
    } catch {
      setQueueHealth(null);
      setPoolEndpoints([]);
    }
    try {
      const urls = await listHealComfyUrls(healthUrl);
      const targets = urls.length > 0 ? urls : healthUrl ? [healthUrl] : [''];
      const batches = await Promise.all(
        targets.map(async url => {
          const params = new URLSearchParams({ status: 'pending,in_progress', limit: '40' });
          if (url) {
            params.set('comfyUrl', url);
          }
          const response = await fetch(`/api/comfyui/jobs?${params.toString()}`);
          if (!response.ok) {
            return { url, jobs: [] as ComfyJobListItem[] };
          }
          const payload = (await response.json()) as { jobs?: ComfyJobListItem[] };
          return { url, jobs: Array.isArray(payload.jobs) ? payload.jobs : [] };
        })
      );
      setHostJobs(mergeHostJobLists(batches));
    } catch {
      setHostJobs([]);
    }
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      refreshEntries();
      void refreshHealth();
    });
    const interval = window.setInterval(() => {
      refreshEntries();
      void refreshHealth();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refreshEntries, refreshHealth]);

  const pending = useMemo(
    () => entries.filter(entry => entry.status === 'pending' || entry.status === 'running'),
    [entries]
  );
  const failed = useMemo(
    () => entries.filter(entry => entry.status === 'error').slice(0, 30),
    [entries]
  );
  const recent = useMemo(
    () => entries.filter(entry => entry.status === 'completed').slice(0, 20),
    [entries]
  );
  const galleryPromptIds = useMemo(
    () => new Set(entries.map(entry => entry.promptId).filter(Boolean)),
    [entries]
  );
  const orphanHostJobs = useMemo(
    () => hostJobs.filter(job => !galleryPromptIds.has(job.id)),
    [galleryPromptIds, hostJobs]
  );
  const orphanHostCount = useMemo(
    () => new Set(orphanHostJobs.map(job => job.comfyUrl).filter(Boolean)).size,
    [orphanHostJobs]
  );

  const interruptComfyQueue = useCallback(async () => {
    setStatus('Sending interrupt to ComfyUI…');
    const result = await interruptComfyUiQueue(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? 'Interrupt failed.');
      return;
    }
    setStatus('ComfyUI interrupt sent.');
    void refreshHealth();
  }, [queueHealth?.url, refreshHealth]);

  const freeComfyVram = useCallback(async () => {
    setStatus('Freeing ComfyUI VRAM…');
    const result = await freeComfyUiMemory(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? 'Free VRAM failed.');
      return;
    }
    setStatus('ComfyUI VRAM freed.');
    void refreshHealth();
  }, [queueHealth?.url, refreshHealth]);

  const restartComfy = useCallback(async () => {
    setStatus('Sending ComfyUI restart…');
    const result = await restartComfyUi(queueHealth?.url);
    if (!result.ok) {
      setStatus(result.error ?? 'Restart failed.');
      return;
    }
    setStatus('Waiting for ComfyUI to come back…');
    const { waitForComfyUiHostAfterRestart } = await import('@/lib/comfyui-host-ready');
    const ready = await waitForComfyUiHostAfterRestart(queueHealth?.url);
    if (ready.ok) {
      setStatus(`ComfyUI ready after ${Math.round(ready.waitedMs / 1000)}s.`);
      void import('@/lib/comfyui-gallery-poller').then(({ resumePendingGalleryPolls }) => {
        resumePendingGalleryPolls();
      });
    } else {
      setStatus(
        'ComfyUI restart requested; host did not answer in time. Try Heal & ready on Overview.'
      );
    }
    void refreshHealth();
  }, [queueHealth?.url, refreshHealth]);

  const cancelJob = useCallback(
    async (entry: ComfyGalleryEntry) => {
      setStatus(`Cancelling ${entry.promptId || 'job'}…`);
      const result = await cancelComfyGalleryJob(entry);
      setStatus(result.ok ? 'Job cancelled.' : (result.error ?? 'Cancel failed.'));
      refreshEntries();
      void refreshHealth();
    },
    [refreshEntries, refreshHealth]
  );

  // Day / Story settings live in browser storage that hydrates after mount — relabel then.
  const [storageReady, setStorageReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (!cancelled) setStorageReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // What each job is (Day slot / Story beat / tool, on which Cast), for labels and batches.
  const jobLabels = useMemo(() => {
    const tools = loadSettingsCache().tools;
    const index = buildPlayJobIndex({
      daySlots: tools.day?.slots,
      dayStills: tools.day?.stills,
      story: tools.roleplay?.story,
    });
    const names = new Map(loadCharacters().map(character => [character.id, character.name]));
    return new Map(
      entries.map(entry => [
        entry.id,
        describeQueueJob(entry, index, entry.characterId ? names.get(entry.characterId) : null),
      ])
    );
    // Re-read the Play context whenever the gallery entries refresh or storage hydrates.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storageReady gates the reads
  }, [entries, storageReady]);
  const pendingGroups = useMemo(
    () => groupQueueJobs(pending, entry => jobLabels.get(entry.id)?.source ?? 'generate'),
    [jobLabels, pending]
  );
  const eta = useMemo(
    () =>
      estimateQueueEta(
        pending,
        entries,
        poolEndpoints.filter(host => host.ok !== false).length || 1
      ),
    [entries, pending, poolEndpoints]
  );

  /**
   * Run next: resubmit a waiting job at the front of ComfyUI's queue, then drop the original.
   * A Day slot / Story beat waiting on it is re-pointed at the new job.
   */
  const runJobNext = useCallback(
    async (entry: ComfyGalleryEntry) => {
      const oldId = entry.promptId?.trim();
      if (entry.status !== 'pending' || !oldId) {
        setStatus('Only a waiting job can be moved to the front.');
        return;
      }
      setStatus('Moving the job to the front…');
      const queued = await requeueComfyJobFromEntry(entry);
      if (!queued.ok || !queued.promptId) {
        setStatus(queued.error ?? 'Could not move the job — it is still where it was.');
        return;
      }
      await cancelComfyUiJob({ promptId: oldId, comfyUrl: entry.comfyUrl, deleteHistory: true });
      cancelComfyGalleryPoll(oldId);
      removeComfyGalleryEntry(entry.id);
      const tools = loadSettingsCache().tools;
      const repointed = repointPlayJobIds({
        dayStills: tools.day?.stills,
        story: tools.roleplay?.story,
        from: oldId,
        to: queued.promptId,
      });
      if (repointed?.dayStills) saveToolSettings('day', { stills: repointed.dayStills });
      if (repointed?.story) saveToolSettings('roleplay', { story: repointed.story });
      setStatus('Moved to the front of the queue.');
      refreshEntries();
      void refreshHealth();
    },
    [refreshEntries, refreshHealth]
  );

  /** Cancel every job in a batch, one at a time. */
  const cancelBatch = useCallback(
    async (batch: ComfyGalleryEntry[]) => {
      setStatus(`Cancelling ${batch.length} jobs…`);
      let cancelled = 0;
      for (const entry of batch) {
        const result = await cancelComfyGalleryJob(entry);
        if (result.ok) cancelled += 1;
      }
      setStatus(`Cancelled ${cancelled} of ${batch.length} jobs.`);
      refreshEntries();
      void refreshHealth();
    },
    [refreshEntries, refreshHealth]
  );

  const cancelHostJob = useCallback(
    async (job: HostOrphanJob) => {
      setStatus(`Cancelling ${job.id}…`);
      const result = await cancelComfyUiJob({
        promptId: job.id,
        comfyUrl: job.comfyUrl || queueHealth?.url,
        deleteHistory: true,
      });
      setStatus(result.ok ? 'Job cancelled.' : (result.error ?? 'Cancel failed.'));
      refreshEntries();
      void refreshHealth();
    },
    [queueHealth?.url, refreshEntries, refreshHealth]
  );

  const claimHostJob = useCallback(
    async (job: HostOrphanJob) => {
      setStatus(`Importing ${job.id}…`);
      const result = await claimOrphanComfyJob({
        promptId: job.id,
        status: job.status,
        comfyUrl: job.comfyUrl || queueHealth?.url,
      });
      setStatus(result.message);
      refreshEntries();
      void refreshHealth();
    },
    [queueHealth?.url, refreshEntries, refreshHealth]
  );

  const claimAllHostJobs = useCallback(async () => {
    if (orphanHostJobs.length === 0) {
      return;
    }
    setStatus(`Importing ${orphanHostJobs.length} host job(s)…`);
    const result = await claimOrphanComfyJobs(
      orphanHostJobs.map(job => ({
        promptId: job.id,
        status: job.status,
        comfyUrl: job.comfyUrl || queueHealth?.url,
      }))
    );
    setStatus(result.message);
    refreshEntries();
    void refreshHealth();
  }, [orphanHostJobs, queueHealth?.url, refreshEntries, refreshHealth]);

  const retryFailed = useCallback(async () => {
    if (failed.length === 0) {
      return;
    }
    setStatus(`Retrying ${failed.length} failed job(s)…`);
    const results = await requeueComfyJobs(
      failed.map(entry => {
        const urls = resolveRequeueImageUrlsFromEntry(entry);
        return {
          prompt: entry.prompt,
          negativePrompt: entry.negativePrompt,
          tool: entry.tool,
          model: entry.model,
          queueParams: entry.queueParams,
          sourceImageUrl: urls.sourceImageUrl,
          maskImageUrl: urls.maskImageUrl,
        };
      })
    );
    markOnboardingFirstQueue();
    setStatus(`Retried ${results.queued}/${failed.length}.`);
    toastBulkQueueSummary({
      label: 'Retry failed finished',
      queued: results.queued,
      failed: results.failed,
    });
    refreshEntries();
  }, [failed, refreshEntries]);

  const retryEntry = useCallback(
    (entry: ComfyGalleryEntry) => {
      void requeueComfyJobFromEntry(entry).then(result => {
        if (result.ok) {
          markOnboardingFirstQueue();
          toastQueueOutcome({
            ok: true,
            text: result.promptId ? `Retry queued · ${result.promptId}` : 'Retry queued',
          });
        } else {
          toastQueueOutcome({
            ok: false,
            text: result.error ?? 'Retry failed.',
          });
        }
        refreshEntries();
      });
    },
    [refreshEntries]
  );

  const generateCta = resolveStudioEmptyCta();
  const poolQueue = useMemo(
    () =>
      summarizePoolQueueDepth(poolEndpoints, {
        url: queueHealth?.url,
        ok: queueHealth?.ok,
        queueRunning: queueHealth?.queueRunning,
        queuePending: queueHealth?.queuePending,
      }),
    [poolEndpoints, queueHealth]
  );

  return {
    isSimple,
    entries,
    queueHealth,
    status,
    setStatus,
    pending,
    failed,
    recent,
    orphanHostJobs,
    orphanHostCount,
    generateCta,
    poolQueue,
    refreshEntries,
    refreshHealth,
    interruptComfyQueue,
    freeComfyVram,
    restartComfy,
    cancelJob,
    cancelBatch,
    runJobNext,
    jobLabels,
    pendingGroups,
    eta,
    cancelHostJob,
    claimHostJob,
    claimAllHostJobs,
    retryFailed,
    retryEntry,
  };
}
