'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ToolSection } from '@/components/ui/ToolPageShell';
import { Button } from '@/components/ui/Button';
import TaskRequirementsCard from '@/components/TaskRequirementsCard';
import { confirmAction } from '@/components/ui/ConfirmDialog';
import { formatBytes } from '@/lib/model/files';
import { COMFY_NODE_PACKS } from '@/lib/comfyui/node-pack-catalog';
import { requestComfyManagerInstall } from '@/lib/comfyui/manager-install-client';
import type { ComfyInstallJob, ComfyInstallReport } from '@/lib/comfyui/install-report';
import { loadSettingsCache } from '@/lib/settings/cache';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';

export type SettingsComfySetupPanelProps = {
  comfyUrl?: string;
  setStatus: (status: string | null) => void;
};

const PACK_STATE_WORDS: Record<string, string> = {
  loaded: 'Loaded',
  'not-loading': 'Installed, not loading',
  missing: 'Not installed',
  unknown: 'Not found',
};

function query(comfyUrl?: string): string {
  return comfyUrl?.trim() ? `comfyUrl=${encodeURIComponent(comfyUrl.trim())}` : '';
}

async function post(body: Record<string, unknown>, comfyUrl?: string) {
  const response = await fetch('/api/comfyui/install', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ...(comfyUrl?.trim() ? { comfyUrl: comfyUrl.trim() } : {}) }),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
    error?: string;
  };
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-3"
      data-testid={`comfy-setup-step-${n}`}
    >
      <h3 className="text-sm font-medium text-[var(--text-primary)]">
        <span className="mr-1.5 text-[var(--text-muted)]">{n}.</span>
        {title}
        {done ? <span className="ml-2 type-caption text-[var(--text-muted)]">✓ done</span> : null}
      </h3>
      {children}
    </section>
  );
}

/**
 * Switching ComfyUI: a new install (or a first one) brought up to the app in one place. Which
 * install this is and its folders; the app's kept pictures put into it, and — same machine — the
 * previous install's input and output folders copied over; model downloads pointed at the folder
 * this ComfyUI reads (COMFYUI_ROOT still named the old install after a switch); the node packs,
 * with why one installs but does not load; then a restart and a fresh check. Built from the
 * problems of a real switch (2026-10-24).
 */
export default function SettingsComfySetupPanel({
  comfyUrl,
  setStatus,
}: SettingsComfySetupPanelProps) {
  const [report, setReport] = useState<ComfyInstallReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [job, setJob] = useState<ComfyInstallJob | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const poll = useRef<number>(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/comfyui/install?${query(comfyUrl)}`, {
        cache: 'no-store',
      });
      const data = (await response.json()) as ComfyInstallReport & { error?: string };
      if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
      setReport(data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not ask ComfyUI.');
    } finally {
      setLoading(false);
    }
  }, [comfyUrl]);

  useEffect(() => {
    scheduleAfterCommit(() => void load());
    return () => window.clearInterval(poll.current);
  }, [load]);

  const follow = (started: ComfyInstallJob) => {
    setJob(started);
    window.clearInterval(poll.current);
    poll.current = window.setInterval(async () => {
      const response = await fetch(`/api/comfyui/install?jobId=${encodeURIComponent(started.id)}`, {
        cache: 'no-store',
      }).catch(() => null);
      if (!response?.ok) return;
      const next = (await response.json()) as ComfyInstallJob;
      setJob(next);
      if (next.status !== 'running') {
        window.clearInterval(poll.current);
        void load();
      }
    }, 1500);
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNote(null);
    try {
      await action();
    } catch (actionError) {
      setNote(actionError instanceof Error ? actionError.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  const restorePictures = () =>
    run(async () =>
      follow((await post({ action: 'restore-pictures' }, comfyUrl)) as ComfyInstallJob)
    );

  const copyFolders = () =>
    run(async () => {
      const prev = report?.previous;
      const files = (prev?.input?.files ?? 0) + (prev?.output?.files ?? 0);
      const bytes = (prev?.input?.bytes ?? 0) + (prev?.output?.bytes ?? 0);
      const ok = await confirmAction({
        title: `Copy ${files.toLocaleString()} files (${formatBytes(bytes)}) from the previous install?`,
        body: 'Everything in its input and output folders is copied into this install’s. Nothing is overwritten or deleted — a file this install already has is kept as it is.',
        confirmLabel: 'Copy',
      });
      if (!ok) return;
      follow((await post({ action: 'copy-folders' }, comfyUrl)) as ComfyInstallJob);
    });

  const chooseRoot = (root: string | null) =>
    run(async () => {
      await post({ action: 'use-root', root }, comfyUrl);
      setStatus(
        root
          ? `Model downloads now go to ${root}/models.`
          : 'Model downloads use COMFYUI_ROOT again.'
      );
      await load();
    });

  const installPack = (nodeTypes: readonly string[]) =>
    run(async () => {
      const result = await requestComfyManagerInstall({ nodeTypes: [...nodeTypes], comfyUrl });
      setNote(result.message);
      await load();
    });

  const restart = () =>
    run(async () => {
      const ok = await confirmAction({
        title: 'Restart ComfyUI?',
        body: 'It stops any render in progress (refused while its queue has jobs). Node packs installed since it started load after the restart.',
        confirmLabel: 'Restart',
      });
      if (!ok) return;
      const response = await fetch('/api/comfyui/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(comfyUrl?.trim() ? { comfyUrl: comfyUrl.trim() } : {}),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Restart failed (HTTP ${response.status}).`);
      setNote('ComfyUI is restarting — Check again in a minute.');
    });

  const markDone = () =>
    run(async () => {
      if (!report?.identity) return;
      await post({ action: 'done', identity: report.identity }, comfyUrl);
      setStatus('This ComfyUI is set up.');
      await load();
    });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNote('Copied.');
    } catch {
      setNote('Could not copy — select the text instead.');
    }
  };

  const shared = loadSettingsCache().shared;
  const info = report?.info;
  const prev = report?.previous;
  const prevCanCopy = Boolean(
    report?.local &&
    ((prev?.input?.readable && report.folders?.input?.writable) ||
      (prev?.output?.readable && report.folders?.output?.writable))
  );
  const downloadsOk = report?.downloads.matches !== false;
  const packsOk = report ? report.packs.every(pack => pack.state === 'loaded') : false;

  return (
    <ToolSection
      id="settings-comfyui-comfy-setup"
      title="Switching ComfyUI"
      description="A new ComfyUI install, set up for this app: pictures, model downloads and node packs in one place."
      data-testid="comfy-setup-card"
    >
      <div className="space-y-3">
        {error ? (
          <p className="text-sm text-[var(--warning)]" role="alert">
            {error}
          </p>
        ) : null}
        {report && !report.reachable ? (
          <p className="text-sm text-[var(--warning)]">
            ComfyUI is not answering at {report.url}. Start it (or fix the URL under Connection),
            then Check again.
          </p>
        ) : null}
        {report?.reachable && info ? (
          <div className="space-y-1" data-testid="comfy-setup-install">
            {report.isNew ? (
              <p
                className="rounded-[var(--radius-md)] bg-[var(--accent-muted)] px-2 py-1 text-sm text-[var(--text-primary)]"
                data-testid="comfy-setup-new"
              >
                {prev
                  ? `This is a different ComfyUI install than before (${prev.label}${prev.version ? ` ${prev.version}` : ''}). Go through the steps below, then mark it set up.`
                  : 'A ComfyUI install this app has not set up yet. Go through the steps below, then mark it set up.'}
              </p>
            ) : null}
            <p className="text-sm text-[var(--text-secondary)]">
              {report.label}
              {info.version ? ` ${info.version}` : ''}
              {info.python ? ` · Python ${info.python}` : ''}
              {info.gpu ? ` · ${info.gpu}` : ''} · {report.url}
            </p>
            {report.folders ? (
              <ul className="type-caption space-y-0.5 text-[var(--text-muted)]">
                {(['input', 'output', 'models'] as const).map(kind => {
                  const folder = report.folders?.[kind];
                  return folder ? (
                    <li key={kind}>
                      <span className="inline-block w-16">{kind}</span>
                      <code className="ui-inline-code">{folder.path}</code>
                      {!folder.exists ? ' (missing)' : !folder.writable ? ' (read-only here)' : ''}
                    </li>
                  ) : null;
                })}
              </ul>
            ) : (
              <p className="type-caption text-[var(--text-muted)]">
                ComfyUI runs on another machine: its folders can’t be checked from here.
              </p>
            )}
          </div>
        ) : null}

        {report?.reachable ? (
          <>
            <Step n={1} title="Bring your pictures">
              <p className="type-caption text-[var(--text-secondary)]">
                Cast plates, clothing and shoe photos, face crops and the renders your Cast uses
                live in ComfyUI’s folders.{' '}
                {report.kept.files > 0
                  ? `The app keeps its own copy of ${report.kept.files.toLocaleString()} of them (${formatBytes(report.kept.bytes)}).`
                  : 'The app holds no copies yet — it keeps them as you upload and use pictures.'}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || job?.status === 'running' || report.kept.files === 0}
                  onClick={() => void restorePictures()}
                  data-testid="comfy-setup-restore"
                >
                  Put the app’s copies into this ComfyUI
                </Button>
                {prevCanCopy ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busy || job?.status === 'running'}
                    onClick={() => void copyFolders()}
                    data-testid="comfy-setup-copy-folders"
                  >
                    Copy everything from the previous install (
                    {((prev?.input?.files ?? 0) + (prev?.output?.files ?? 0)).toLocaleString()}{' '}
                    files, {formatBytes((prev?.input?.bytes ?? 0) + (prev?.output?.bytes ?? 0))})
                  </Button>
                ) : null}
              </div>
              {prev && report.local && !prevCanCopy ? (
                <p className="type-caption text-[var(--text-muted)]">
                  The previous install’s folders aren’t readable from this app (another user owns
                  them, or they’re gone) — copy them by hand, or use the app’s copies above.
                </p>
              ) : null}
              {job ? (
                <p
                  className="type-caption text-[var(--text-secondary)]"
                  role="status"
                  data-testid="comfy-setup-job"
                >
                  {job.status === 'running'
                    ? `${job.kind === 'copy-folders' ? 'Copying' : 'Putting pictures back'}… ${job.done.toLocaleString()} of ${job.total.toLocaleString()}`
                    : job.status === 'completed'
                      ? `Done — ${job.copied.toLocaleString()} copied (${formatBytes(job.bytes)}), ${job.skipped.toLocaleString()} already there${job.failed ? `, ${job.failed} failed` : ''}.`
                      : `Stopped: ${job.error ?? 'error'}`}
                </p>
              ) : null}
            </Step>

            <Step n={2} title="Model downloads go where this ComfyUI looks" done={downloadsOk}>
              <p className="type-caption text-[var(--text-secondary)]">
                {report.downloads.root
                  ? `Downloads go to ${report.downloads.root}/models (${report.downloads.source === 'saved' ? 'chosen here' : report.downloads.source === 'detected' ? 'found from this ComfyUI' : 'COMFYUI_ROOT'}).`
                  : 'Downloads are off: no ComfyUI folder is set.'}{' '}
                {report.folders?.models
                  ? `This ComfyUI reads models from ${report.folders.models.path}.`
                  : ''}
              </p>
              {!downloadsOk && report.downloads.suggestedRoot ? (
                <p className="text-sm text-[var(--warning)]">
                  Those are different folders — a model downloaded now would land where this ComfyUI
                  never looks.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {report.downloads.suggestedRoot &&
                report.downloads.root !== report.downloads.suggestedRoot ? (
                  <Button
                    size="sm"
                    variant={downloadsOk ? 'secondary' : 'primary'}
                    disabled={busy}
                    onClick={() => void chooseRoot(report.downloads.suggestedRoot!)}
                    data-testid="comfy-setup-use-root"
                  >
                    Download into {report.downloads.suggestedRoot}
                  </Button>
                ) : null}
                {report.downloads.source === 'saved' && report.downloads.envRoot ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void chooseRoot(null)}
                  >
                    Back to COMFYUI_ROOT ({report.downloads.envRoot})
                  </Button>
                ) : null}
              </div>
            </Step>

            <Step n={3} title="Node packs" done={packsOk}>
              <ul className="space-y-2">
                {report.packs.map(pack => {
                  const nodeTypes =
                    COMFY_NODE_PACKS.find(entry => entry.id === pack.id)?.nodeTypes ?? [];
                  return (
                    <li
                      key={pack.id}
                      className="space-y-1"
                      data-testid={`comfy-setup-pack-${pack.id}`}
                    >
                      <p className="text-sm text-[var(--text-primary)]">
                        {pack.label}{' '}
                        <span
                          className={`type-caption ${pack.state === 'loaded' ? 'text-[var(--text-muted)]' : 'text-[var(--warning)]'}`}
                        >
                          — {PACK_STATE_WORDS[pack.state]}
                        </span>
                        <span className="type-caption block text-[var(--text-muted)]">
                          for {pack.usedFor}
                        </span>
                      </p>
                      {pack.state === 'not-loading' ? (
                        <p className="type-caption text-[var(--text-secondary)]">
                          It’s in ComfyUI’s custom_nodes but didn’t load — ComfyUI’s log names the
                          error.{pack.fix ? ' Usually a Python package is missing:' : ''}
                        </p>
                      ) : null}
                      {pack.fix && pack.state !== 'loaded' ? (
                        <div className="space-y-1">
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-muted)]/40 p-2 font-mono text-xs">
                            {pack.fix.command}
                          </pre>
                          <p className="type-caption text-[var(--text-muted)]">{pack.fix.note}</p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void copy(pack.fix!.command)}
                          >
                            Copy
                          </Button>
                        </div>
                      ) : null}
                      {pack.state === 'missing' || pack.state === 'unknown' ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void installPack(nodeTypes)}
                          data-testid={`comfy-setup-install-${pack.id}`}
                        >
                          Install with ComfyUI Manager
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <p className="type-caption text-[var(--text-muted)]">
                The Castcut nodes (below) are optional and run the app’s checks inside the job.
                Workflow health lists any other node a workflow is missing.
              </p>
            </Step>

            <Step n={4} title="Models and packs this app uses">
              <TaskRequirementsCard
                task="This app"
                testId="comfy-setup-requirements"
                input={{
                  model: shared.model,
                  animate: true,
                  faceFinish: true,
                  autoReview: true,
                }}
              />
              <p className="type-caption text-[var(--text-muted)]">
                Nothing listed here means everything your settings use is installed.
              </p>
            </Step>
          </>
        ) : null}

        {note ? (
          <p className="type-caption text-[var(--text-secondary)]" role="status">
            {note}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={loading || busy}
            onClick={() => void load()}
          >
            {loading ? 'Checking…' : 'Check again'}
          </Button>
          {report?.reachable ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => void restart()}
              data-testid="comfy-setup-restart"
            >
              Restart ComfyUI
            </Button>
          ) : null}
          {report?.reachable && report.isNew ? (
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => void markDone()}
              data-testid="comfy-setup-done"
            >
              This install is set up
            </Button>
          ) : null}
        </div>
      </div>
    </ToolSection>
  );
}
