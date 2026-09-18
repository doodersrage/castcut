'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { loadSettingsCache } from '@/lib/settings-cache';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import { celebrateSystemTray } from '@/lib/system-tray-celebrate';
import { COMFY_ASSET_KIND_ORDER, type ComfyAssetKind } from '@/lib/comfy-asset-kinds';
import { getComfyModelDefinition } from '@/lib/comfy-models/client';
import type {
  AssetJob,
  AssetRow,
  AssetsResponse,
  ComfyModelAssetsPanelProps,
} from '@/components/settings/comfy-model-assets/comfy-model-assets-types';

export function useComfyModelAssets({
  onStatus,
  onInstalled,
  modelId: forcedModelId,
  compact = false,
}: ComfyModelAssetsPanelProps) {
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [rootConfigured, setRootConfigured] = useState(false);
  const [rootWritable, setRootWritable] = useState(true);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [rootHint, setRootHint] = useState<string | undefined>();
  const [filterCurrentModel, setFilterCurrentModel] = useState(Boolean(forcedModelId));
  const [kindFilter, setKindFilter] = useState<'all' | ComfyAssetKind>('all');
  const [missingOnly, setMissingOnly] = useState(compact);
  const [searchQuery, setSearchQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const jobsRef = useRef<AssetJob[]>([]);
  const loadRef = useRef<(forceRefresh?: boolean) => Promise<void>>(async () => {});
  const onInstalledRef = useRef(onInstalled);
  const pollInFlightRef = useRef(false);

  const load = useCallback(
    async (forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const settings = loadComfyUiSettings();
        const modelId =
          forcedModelId?.trim() ||
          (filterCurrentModel ? loadSettingsCache().shared.model : undefined);
        const params = new URLSearchParams();
        const apiUrl = settings.apiUrl?.trim() ?? '';
        if (apiUrl) {
          params.set('comfyUrl', apiUrl);
        }
        if (modelId) {
          params.set('modelId', modelId);
        }
        if (forceRefresh) {
          params.set('forceRefresh', '1');
        }
        const response = await fetch(`/api/comfyui/assets${params.size ? `?${params}` : ''}`);
        const data = (await response.json()) as AssetsResponse;
        if (!response.ok) {
          throw new Error(data.error || 'Could not load model assets.');
        }
        setRows(data.rows ?? []);
        setJobs(data.jobs ?? []);
        setRootConfigured(Boolean(data.rootConfigured));
        setRootWritable(data.rootWritable !== false);
        setRootPath(data.rootPath ?? null);
        setRootHint(data.rootHint);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load model assets.');
      } finally {
        setLoading(false);
      }
    },
    [filterCurrentModel, forcedModelId]
  );

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    onInstalledRef.current = onInstalled;
  }, [onInstalled]);

  useEffect(() => {
    scheduleAfterCommit(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || pollInFlightRef.current) {
        return;
      }
      const active = jobsRef.current.filter(
        job => job.status === 'queued' || job.status === 'downloading' || job.status === 'verifying'
      );
      if (active.length === 0) {
        return;
      }
      pollInFlightRef.current = true;
      const activeIds = active.map(job => job.id);
      try {
        const response = await fetch(
          `/api/comfyui/assets?jobId=${encodeURIComponent(activeIds[0]!)}`
        );
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (cancelled || !response.ok) {
          return;
        }
        const nextJobs = data.jobs ?? (data.job ? [data.job] : []);
        setJobs(nextJobs);
        const justFinished = nextJobs.some(
          job =>
            activeIds.includes(job.id) &&
            (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled')
        );
        if (justFinished) {
          const failed = nextJobs.find(job => activeIds.includes(job.id) && job.status === 'error');
          if (failed?.error) {
            setError(failed.error);
          }
          await loadRef.current(true);
          if (nextJobs.some(job => job.status === 'complete')) {
            void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
            onInstalledRef.current?.();
            celebrateSystemTray('download');
          }
        }
      } catch {
        // keep polling
      } finally {
        pollInFlightRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (jobs.some(job => ['queued', 'downloading', 'verifying'].includes(job.status))) {
      window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
    }
  }, [jobs]);

  const install = useCallback(
    async (assetId: string): Promise<AssetJob | null> => {
      setBusyId(assetId);
      setError(null);
      try {
        const response = await fetch('/api/comfyui/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId }),
        });
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (!response.ok || !data.job) {
          throw new Error(data.error || 'Install failed to start.');
        }
        setJobs(prev => {
          const without = prev.filter(job => job.id !== data.job!.id);
          return [data.job!, ...without];
        });
        onStatus?.(
          data.job.status === 'complete'
            ? `Already present: ${data.job.filename}`
            : `Downloading ${data.job.label}…`
        );
        if (data.job.status === 'complete') {
          await load(true);
          void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
          onInstalled?.();
          celebrateSystemTray('download');
        }
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
        return data.job;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Install failed.');
        return null;
      } finally {
        setBusyId(null);
      }
    },
    [load, onInstalled, onStatus]
  );

  const jobAction = useCallback(
    async (jobId: string, action: 'cancel' | 'retry') => {
      setBusyId(jobId);
      setError(null);
      try {
        const response = await fetch('/api/comfyui/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, jobId }),
        });
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (!response.ok || !data.job) {
          throw new Error(data.error || `Could not ${action} download.`);
        }
        if (data.jobs) {
          setJobs(data.jobs);
        } else {
          setJobs(prev => {
            const without = prev.filter(job => job.id !== data.job!.id);
            return [data.job!, ...without];
          });
        }
        onStatus?.(
          action === 'cancel'
            ? `Cancelled ${data.job.label} (partial kept for resume).`
            : `Retrying ${data.job.label}…`
        );
        window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not ${action} download.`);
      } finally {
        setBusyId(null);
      }
    },
    [onStatus]
  );

  const waitForJob = useCallback(async (jobId: string) => {
    for (let i = 0; i < 60 * 60; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const response = await fetch(`/api/comfyui/assets?jobId=${encodeURIComponent(jobId)}`);
        const data = (await response.json()) as AssetsResponse & { job?: AssetJob };
        if (!response.ok) {
          return null;
        }
        const job = data.job;
        if (!job) {
          return null;
        }
        setJobs(data.jobs ?? [job]);
        if (job.status === 'complete' || job.status === 'error' || job.status === 'cancelled') {
          return job;
        }
      } catch {
        // keep waiting
      }
    }
    return null;
  }, []);

  const jobFor = useCallback(
    (assetId: string) => jobs.find(job => job.assetId === assetId),
    [jobs]
  );

  const compactModelLabel = useMemo(() => {
    if (!forcedModelId) {
      return 'this model';
    }
    const category = getComfyModelDefinition(forcedModelId).category;
    if (category === 'video') {
      return 'this video model';
    }
    if (category === 'audio') {
      return 'this audio model';
    }
    if (category === 'mesh') {
      return 'this 3D mesh model';
    }
    return 'this model';
  }, [forcedModelId]);

  const visibleRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter(row => {
      if (compact && (row.kind === 'controlnet' || row.kind === 'upscale')) {
        return false;
      }
      if (kindFilter !== 'all' && row.kind !== kindFilter) {
        return false;
      }
      if (missingOnly && row.status === 'installed') {
        return false;
      }
      if (query) {
        const haystack = [row.label, row.filename, row.id, row.notes ?? '', row.kind]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [compact, rows, kindFilter, missingOnly, searchQuery]);

  const groupedRows = useMemo(() => {
    const groups: Array<{ kind: ComfyAssetKind | string; rows: AssetRow[] }> = [];
    const byKind = new Map<string, AssetRow[]>();
    for (const row of visibleRows) {
      const list = byKind.get(row.kind) ?? [];
      list.push(row);
      byKind.set(row.kind, list);
    }
    for (const kind of COMFY_ASSET_KIND_ORDER) {
      const list = byKind.get(kind);
      if (list?.length) {
        groups.push({ kind, rows: list });
        byKind.delete(kind);
      }
    }
    for (const [kind, list] of byKind) {
      groups.push({ kind, rows: list });
    }
    return groups;
  }, [visibleRows]);

  const downloadableMissing = visibleRows.filter(
    row => row.status === 'missing' && row.downloadable
  ).length;

  const queueJobs = useMemo(
    () =>
      jobs.filter(job =>
        ['queued', 'downloading', 'verifying', 'error', 'cancelled'].includes(job.status)
      ),
    [jobs]
  );
  const activeQueueCount = queueJobs.filter(job =>
    ['queued', 'downloading', 'verifying'].includes(job.status)
  ).length;

  const installMissingForModel = useCallback(async () => {
    const missing = visibleRows.filter(row => row.status === 'missing' && row.downloadable);
    if (missing.length === 0) {
      onStatus?.('No curated downloadable weights missing for this filter.');
      return;
    }
    onStatus?.(
      `Queuing ${missing.length} download${missing.length === 1 ? '' : 's'} one at a time…`
    );
    for (const row of missing) {
      const started = await install(row.id);
      if (!started) {
        continue;
      }
      if (started.status === 'complete' || started.status === 'error') {
        continue;
      }
      const finished = await waitForJob(started.id);
      if (finished?.status === 'error' && finished.error) {
        setError(finished.error);
      }
    }
    await load(true);
    void fetchComfyObjectInfoCached({ forceRefresh: true }).catch(() => null);
    onInstalled?.();
  }, [install, load, onInstalled, onStatus, visibleRows, waitForJob]);

  return {
    compact,
    forcedModelId,
    compactModelLabel,
    rows,
    loading,
    error,
    rootConfigured,
    rootWritable,
    rootPath,
    rootHint,
    filterCurrentModel,
    setFilterCurrentModel,
    kindFilter,
    setKindFilter,
    missingOnly,
    setMissingOnly,
    searchQuery,
    setSearchQuery,
    busyId,
    visibleRows,
    groupedRows,
    downloadableMissing,
    queueJobs,
    activeQueueCount,
    load,
    install,
    jobAction,
    jobFor,
    installMissingForModel,
  };
}

export type ComfyModelAssetsViewModel = ReturnType<typeof useComfyModelAssets>;
