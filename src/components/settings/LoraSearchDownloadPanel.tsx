'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfyui/comfy-asset-events';
import { civitaiBaseModelForStudioModel, type CivitaiLoraSearchHit } from '@/lib/lora/civitai-lora';
import { restartComfyUi } from '@/lib/comfyui/queue-control';
import { fetchComfyLoraInventory } from '@/lib/comfyui/object-info-cache';
import { loadSettingsCache } from '@/lib/settings/cache';
import { celebrateSystemTray } from '@/lib/app/system-tray-celebrate';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

type AssetJob = {
  id: string;
  assetId: string;
  label: string;
  filename: string;
  status: string;
  progress: number;
  bytesReceived: number;
  bytesTotal: number | null;
  error?: string;
};

type LoraSearchDownloadPanelProps = {
  comfyUrl?: string;
  libraryFilenames: Set<string>;
  onAddToLibrary: (filename: string) => void;
  onRefreshInventory: () => Promise<void> | void;
  onStatus?: (message: string) => void;
};

function formatBytes(value: number | null | undefined): string {
  if (value == null || value <= 0) {
    return '';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  if (value < 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function jobProgressLabel(job: AssetJob): string {
  const percent = `${Math.round(job.progress * 100)}%`;
  const bytes = formatBytes(job.bytesReceived);
  const total = formatBytes(job.bytesTotal);
  if (bytes && total) {
    return `${percent} · ${bytes} / ${total}`;
  }
  return percent;
}

export default function LoraSearchDownloadPanel({
  comfyUrl,
  libraryFilenames,
  onAddToLibrary,
  onRefreshInventory,
  onStatus,
}: LoraSearchDownloadPanelProps) {
  const [query, setQuery] = useState('');
  const [matchModel, setMatchModel] = useState(true);
  const [includeNsfw, setIncludeNsfw] = useState(false);
  const [hits, setHits] = useState<CivitaiLoraSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyVersionId, setBusyVersionId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [restarting, setRestarting] = useState(false);
  const jobsRef = useRef<AssetJob[]>([]);
  const pollInFlightRef = useRef(false);
  const completedIdsRef = useRef(new Set<string>());
  const onAddToLibraryRef = useRef(onAddToLibrary);
  const onRefreshInventoryRef = useRef(onRefreshInventory);
  const onStatusRef = useRef(onStatus);
  const libraryFilenamesRef = useRef(libraryFilenames);
  const comfyUrlRef = useRef(comfyUrl);

  const currentModel = loadSettingsCache().shared.model;
  const baseModel = matchModel ? civitaiBaseModelForStudioModel(currentModel) : undefined;

  const civitaiJobs = jobs.filter(job => job.assetId.startsWith('civitai:'));

  const search = useCallback(async () => {
    const q = query.trim();
    if (q.length < 2) {
      setError('Enter at least 2 characters to search Civitai.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({ q });
      if (baseModel) {
        params.set('baseModel', baseModel);
      }
      if (includeNsfw) {
        params.set('nsfw', '1');
      }
      const response = await fetch(`/api/comfyui/loras/search?${params}`);
      const data = (await response.json()) as {
        items?: CivitaiLoraSearchHit[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || 'Civitai search failed.');
      }
      setHits(data.items ?? []);
      if ((data.items ?? []).length === 0) {
        setError(
          baseModel
            ? `No LoRAs for “${q}” on ${baseModel}. Uncheck Match current model to search all bases.`
            : `No LoRAs for “${q}”.`
        );
      }
    } catch (err) {
      setHits([]);
      setError(err instanceof Error ? err.message : 'Civitai search failed.');
    } finally {
      setSearching(false);
    }
  }, [baseModel, includeNsfw, query]);

  const install = useCallback(
    async (hit: CivitaiLoraSearchHit) => {
      setBusyVersionId(hit.versionId);
      setError(null);
      try {
        const response = await fetch('/api/comfyui/loras/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            versionId: hit.versionId,
            filename: hit.filename,
            label: hit.name,
            bytes: hit.bytes ?? undefined,
          }),
        });
        const data = (await response.json()) as {
          job?: AssetJob;
          jobs?: AssetJob[];
          error?: string;
        };
        if (!response.ok || !data.job) {
          throw new Error(data.error || 'Download failed to start.');
        }
        setJobs(data.jobs ?? [data.job]);
        onStatus?.(`Downloading ${hit.filename}…`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Download failed to start.');
      } finally {
        setBusyVersionId(null);
      }
    },
    [onStatus]
  );

  const restart = useCallback(async () => {
    setRestarting(true);
    setError(null);
    const result = await restartComfyUi(comfyUrl?.trim() || undefined);
    setRestarting(false);
    if (!result.ok) {
      setError(result.error ?? 'Restart failed.');
      onStatus?.(result.error ?? 'ComfyUI restart failed.');
      return;
    }
    onStatus?.('ComfyUI restart requested. Wait a few seconds, then refresh inventory.');
    window.setTimeout(() => {
      void onRefreshInventory();
    }, 4000);
  }, [comfyUrl, onRefreshInventory, onStatus]);

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    onAddToLibraryRef.current = onAddToLibrary;
    onRefreshInventoryRef.current = onRefreshInventory;
    onStatusRef.current = onStatus;
    libraryFilenamesRef.current = libraryFilenames;
    comfyUrlRef.current = comfyUrl;
  }, [comfyUrl, libraryFilenames, onAddToLibrary, onRefreshInventory, onStatus]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (cancelled || pollInFlightRef.current) {
        return;
      }
      const active = jobsRef.current.filter(
        job =>
          job.assetId.startsWith('civitai:') &&
          (job.status === 'queued' || job.status === 'downloading' || job.status === 'verifying')
      );
      if (active.length === 0) {
        return;
      }
      pollInFlightRef.current = true;
      try {
        const response = await fetch(
          `/api/comfyui/assets?jobId=${encodeURIComponent(active[0]!.id)}`
        );
        const data = (await response.json()) as { jobs?: AssetJob[]; job?: AssetJob };
        if (cancelled || !response.ok) {
          return;
        }
        const nextJobs = data.jobs ?? (data.job ? [data.job] : []);
        setJobs(nextJobs);
        const finished = nextJobs.filter(
          job =>
            job.assetId.startsWith('civitai:') &&
            job.status === 'complete' &&
            !completedIdsRef.current.has(job.id)
        );
        for (const job of finished) {
          completedIdsRef.current.add(job.id);
          celebrateSystemTray('download');
          await fetchComfyLoraInventory({
            comfyUrl: comfyUrlRef.current?.trim() || undefined,
            forceRefresh: true,
          }).catch(() => null);
          await onRefreshInventoryRef.current();
          if (job.filename && !libraryFilenamesRef.current.has(job.filename.toLowerCase())) {
            onAddToLibraryRef.current(job.filename);
          }
          onStatusRef.current?.(
            `${job.filename} installed. Restart ComfyUI if it does not appear in inventory.`
          );
        }
        const failed = nextJobs.find(
          job =>
            active.some(activeJob => activeJob.id === job.id) && job.status === 'error' && job.error
        );
        if (failed?.error) {
          setError(failed.error);
        }
      } catch {
        // keep polling
      } finally {
        pollInFlightRef.current = false;
      }
    };
    scheduleAfterCommit(() => {
      void poll();
    });
    const timer = window.setInterval(() => void poll(), 750);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (civitaiJobs.some(job => ['queued', 'downloading', 'verifying'].includes(job.status))) {
      window.dispatchEvent(new CustomEvent(COMFY_ASSET_JOBS_UPDATED_EVENT));
    }
  }, [civitaiJobs]);

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border-default)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--text-muted)]">Search Civitai</p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={restarting}
          onClick={() => void restart()}
        >
          Restart ComfyUI
        </Button>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        Downloads into <code className="ui-inline-code">COMFYUI_ROOT/models/loras</code>. Gated
        models need <code className="ui-inline-code">CIVITAI_API_TOKEN</code>. Restart uses
        ComfyUI-Manager when installed.
      </p>
      <form
        className="space-y-2"
        onSubmit={event => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search LoRAs on Civitai…"
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={matchModel}
              onChange={event => setMatchModel(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
            Match current model
            {baseModel ? (
              <span className="text-[var(--text-muted)]">({baseModel})</span>
            ) : matchModel ? (
              <span className="text-[var(--text-muted)]">(no Civitai base mapping)</span>
            ) : null}
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={includeNsfw}
              onChange={event => setIncludeNsfw(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--bg-base)] accent-[var(--accent)]"
            />
            Include NSFW
          </label>
          <Button type="submit" size="sm" loading={searching} disabled={query.trim().length < 2}>
            Search
          </Button>
        </div>
      </form>
      {error ? <p className="text-xs ui-status-danger">{error}</p> : null}
      {civitaiJobs.length > 0 ? (
        <ul className="space-y-1">
          {civitaiJobs.slice(0, 6).map(job => (
            <li key={job.id} className="text-xs text-[var(--text-secondary)]">
              <span className="font-mono">{job.filename}</span>{' '}
              {job.status === 'complete'
                ? 'installed'
                : job.status === 'error'
                  ? (job.error ?? 'failed')
                  : jobProgressLabel(job)}
              {job.status === 'queued' ||
              job.status === 'downloading' ||
              job.status === 'verifying' ? (
                <div className="ui-progress-track mt-1">
                  <div
                    className="ui-progress-fill"
                    style={{ width: `${Math.min(100, Math.round(job.progress * 100))}%` }}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {hits.length > 0 ? (
        <ul className="ui-scroll-region sidebar-scroll max-h-72 space-y-2 overflow-y-auto">
          {hits.map(hit => {
            const job = jobs.find(entry => entry.assetId === `civitai:${hit.versionId}`);
            const inLibrary = libraryFilenames.has(hit.filename.toLowerCase());
            const downloading =
              job &&
              (job.status === 'queued' ||
                job.status === 'downloading' ||
                job.status === 'verifying');
            return (
              <li
                key={`${hit.modelId}-${hit.versionId}`}
                className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-[var(--bg-muted)]/80"
              >
                {hit.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={hit.previewUrl}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 shrink-0 rounded bg-[var(--bg-muted)]" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[var(--text-primary)]">{hit.name}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {hit.baseModel}
                    {hit.creator ? ` · ${hit.creator}` : ''}
                    {hit.bytes ? ` · ${formatBytes(hit.bytes)}` : ''}
                  </p>
                  <code className="block truncate text-2xs text-[var(--text-secondary)]">
                    {hit.filename}
                  </code>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={Boolean(downloading) || inLibrary}
                  loading={busyVersionId === hit.versionId || Boolean(downloading)}
                  onClick={() => void install(hit)}
                >
                  {inLibrary ? 'In library' : job?.status === 'complete' ? 'Installed' : 'Install'}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
