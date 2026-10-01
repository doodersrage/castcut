'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import type {
  AssetJob,
  AssetsResponse,
} from '@/components/settings/comfy-model-assets/comfy-model-assets-types';
import { loadComfyUiSettings } from '@/lib/comfyui-settings';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import { loadSettingsCache } from '@/lib/settings-cache';
import { COMFY_ASSET_JOBS_UPDATED_EVENT } from '@/lib/comfy-asset-events';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import {
  formatTaskBytes,
  missingTaskRequirements,
  runnableModelsFromMap,
  taskRequirements,
  type TaskAssetState,
  type TaskRequirementInput,
} from '@/lib/task-requirements';

const ACTIVE_JOB = new Set(['queued', 'downloading', 'verifying']);

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  return a.size === b.size && [...a].every(item => b.has(item));
}

/**
 * "This needs N files — Download all": the few weights and node packs the tool's current job
 * needs, checked against ComfyUI, fetched with one click through the same downloader as Settings.
 * Renders nothing when everything is installed (or ComfyUI can't be asked).
 */
export default function TaskRequirementsCard({
  task,
  input,
  testId = 'task-requirements',
}: {
  /** "this Day", "Animate"… — used in the heading. */
  task: string;
  input: TaskRequirementInput;
  testId?: string;
}) {
  const [runnableModels, setRunnableModels] = useState<Set<string> | null>(null);
  // Engine → Renderer is a global choice; read it here so every tool's card includes its files.
  const qwenRenderer = input.qwenRenderer ?? loadSettingsCache().shared.qwenRenderer;
  const requirements = useMemo(
    () => taskRequirements({ ...input, qwenRenderer, runnableModels: runnableModels ?? undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields are the identity
    [
      input.model,
      input.adult,
      input.animate,
      input.faceFinish,
      input.autoReview,
      qwenRenderer,
      runnableModels,
    ]
  );
  const [rows, setRows] = useState<TaskAssetState[] | null>(null);
  const [jobs, setJobs] = useState<AssetJob[]>([]);
  const [nodeTypes, setNodeTypes] = useState<Set<string> | null>(null);
  const [rootHint, setRootHint] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<number>(0);

  const comfyUrl = () => loadComfyUiSettings().apiUrl?.trim() || '';

  const load = useCallback(async (forceRefresh = false) => {
    try {
      const params = new URLSearchParams();
      if (comfyUrl()) params.set('comfyUrl', comfyUrl());
      if (forceRefresh) params.set('forceRefresh', '1');
      const response = await fetch(`/api/comfyui/assets?${params}`);
      const data = (await response.json()) as AssetsResponse;
      if (!response.ok) return;
      setRows(
        (data.rows ?? []).map(row => ({
          id: row.id,
          status: row.status,
          downloadable: row.downloadable,
          bytes: row.bytes,
        }))
      );
      setJobs(data.jobs ?? []);
      setRootHint(data.rootConfigured === false ? (data.rootHint ?? null) : null);
    } catch {
      // ComfyUI / the app API unreachable — the card stays hidden.
    }
    const info = await fetchComfyObjectInfoCached({ comfyUrl: comfyUrl() }).catch(() => null);
    setNodeTypes(info?.nodeTypes ?? null);
    // A model whose mapped checkpoint / UNet is installed needs nothing (see runnableModelsFromMap).
    const nextRunnable = runnableModelsFromMap(loadSettingsCache().shared.modelCheckpointMap, [
      ...(info?.models.checkpoints ?? []),
      ...(info?.models.unets ?? []),
    ]);
    // Keep the same Set when nothing changed — a fresh one re-derives `requirements`, which
    // re-ran this load in a loop (~250 API calls in 20 s, then 429s that blocked queueing).
    setRunnableModels(previous =>
      previous && sameMembers(previous, nextRunnable) ? previous : nextRunnable
    );
  }, []);

  const requirementsKey = `${requirements.assetIds.join(',')}|${requirements.nodePacks
    .map(pack => pack.label)
    .join(',')}`;
  useEffect(() => {
    if (requirementsKey === '|') return;
    scheduleAfterCommit(() => {
      void load();
    });
    const onJobs = () => void load();
    window.addEventListener(COMFY_ASSET_JOBS_UPDATED_EVENT, onJobs);
    return () => window.removeEventListener(COMFY_ASSET_JOBS_UPDATED_EVENT, onJobs);
  }, [load, requirementsKey]);

  const wanted = new Set(requirements.assetIds);
  const activeJobs = jobs.filter(job => wanted.has(job.assetId) && ACTIVE_JOB.has(job.status));
  const failedJobs = jobs.filter(job => wanted.has(job.assetId) && job.status === 'error');

  // Poll while our downloads run; re-check installed status when they finish.
  useEffect(() => {
    window.clearInterval(pollRef.current);
    if (activeJobs.length === 0) return;
    pollRef.current = window.setInterval(() => void load(true), 3000);
    return () => window.clearInterval(pollRef.current);
  }, [activeJobs.length, load]);

  if (!rows || !runnableModels || dismissed) return null;
  const missing = missingTaskRequirements(requirements, rows, nodeTypes);
  const pending = missing.assets.filter(row => !activeJobs.some(job => job.assetId === row.id));
  if (
    missing.assets.length === 0 &&
    missing.manual.length === 0 &&
    missing.nodePacks.length === 0
  ) {
    return null;
  }

  const downloadAll = async () => {
    setBusy(true);
    setStatus(null);
    try {
      for (const row of pending) {
        const response = await fetch('/api/comfyui/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ assetId: row.id }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error || 'Could not start the download.');
        }
      }
      if (missing.nodePacks.length > 0) {
        const response = await fetch('/api/comfyui/manager/install', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comfyUrl: comfyUrl() || undefined,
            nodeTypes: missing.nodePacks.flatMap(pack => [...pack.nodeTypes]),
          }),
        });
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          restartNeeded?: boolean;
        };
        setStatus(
          response.ok
            ? data.restartNeeded
              ? 'Node packs installed — restart ComfyUI to load them.'
              : 'Node packs installed.'
            : `Node packs: ${data.error || 'install failed'} — install them from ComfyUI Manager.`
        );
      }
      await load(true);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Could not start the downloads.');
    } finally {
      setBusy(false);
    }
  };

  const fileCount = missing.assets.length;
  const size = formatTaskBytes(missing.bytes);
  const parts = [
    fileCount ? `${fileCount} file${fileCount === 1 ? '' : 's'}${size ? ` (${size})` : ''}` : '',
    missing.nodePacks.length
      ? `${missing.nodePacks.length} node pack${missing.nodePacks.length === 1 ? '' : 's'}`
      : '',
  ].filter(Boolean);
  const progress = activeJobs.length
    ? Math.round(
        (activeJobs.reduce((sum, job) => sum + (job.progress ?? 0), 0) / activeJobs.length) * 100
      )
    : null;

  return (
    <div
      className="rounded-[var(--radius-lg)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3"
      role="status"
      data-testid={testId}
    >
      <p className="text-sm font-medium text-[var(--text-primary)]">
        {task} needs {parts.join(' and ') || 'a few files'} in ComfyUI
      </p>
      <p className="mt-0.5 type-caption text-[var(--text-secondary)]">
        {[...missing.assets.map(row => row.id), ...missing.nodePacks.map(pack => pack.label)]
          .join(' · ')
          .replace(/-/g, ' ')}
        {requirements.reasons.length ? ` — for ${requirements.reasons.join(', ')}.` : ''}
      </p>
      {missing.manual.length ? (
        <p className="mt-1 type-caption text-[var(--text-muted)]">
          Get by hand (not downloadable here): {missing.manual.map(row => row.id).join(', ')}
          {rootHint ? ` — ${rootHint}` : ''}
        </p>
      ) : null}
      {progress != null ? (
        <div className="mt-2" data-testid={`${testId}-progress`}>
          <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-muted)]">
            <div
              className="h-full rounded-full bg-[var(--accent)] transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 type-caption text-[var(--text-muted)]">
            Downloading {activeJobs.length} file{activeJobs.length === 1 ? '' : 's'} · {progress}%
          </p>
        </div>
      ) : null}
      {failedJobs.length ? (
        <p className="mt-1 type-caption text-[var(--tint-danger-text)]">
          {failedJobs[0]!.label}: {failedJobs[0]!.error || 'download failed'}
        </p>
      ) : null}
      {status ? <p className="mt-1 type-caption text-[var(--text-secondary)]">{status}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {pending.length || missing.nodePacks.length ? (
          <Button
            size="sm"
            variant="primary"
            disabled={busy || Boolean(rootHint && pending.length)}
            data-testid={`${testId}-download`}
            onClick={() => void downloadAll()}
          >
            {pending.length ? 'Download all' : 'Install node packs'}
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
          Not now
        </Button>
      </div>
    </div>
  );
}
