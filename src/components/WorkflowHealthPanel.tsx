'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  COMFY_WORKFLOW_FILES_UPDATED_EVENT,
  loadComfyWorkflowFiles,
  upsertComfyWorkflowFile,
} from '@/lib/comfyui-workflow-files';
import {
  auditWorkflowLibraryHealth,
  dispatchWorkflowHealthSelect,
  summarizeWorkflowLibraryHealth,
} from '@/lib/workflow-health-audit';
import { auditLoaderMapsAgainstComfyUi } from '@/lib/loader-map-health-audit';
import { SETTINGS_CACHE_UPDATED_EVENT, loadSettingsCache } from '@/lib/settings-cache';
import { loadComfyUiSettings, mergeLoraLibraryIntoCustomTokens } from '@/lib/comfyui-settings';
import { resolveComfyUiRuntime } from '@/lib/comfyui-runtime';
import type { ComfyUiModelLists } from '@/lib/comfyui-object-info';
import { auditDualClipNodesInWorkflow } from '@/lib/workflow-queue-loader-preflight';
import { auditLoaderFilenamesInWorkflow } from '@/lib/workflow-loader-filename-audit';
import { applyLoaderMapRepairs, suggestLoaderMapRepairs } from '@/lib/workflow-loader-map-repair';
import { saveSharedSettings } from '@/lib/settings-cache';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { queueTestWorkflowFile, workflowNeedsQueueTest } from '@/lib/workflow-health-queue-test';
import { resolveOptimizeModelForWorkflowFile } from '@/lib/workflow-optimize-model';
import type { WorkflowHealthIssue } from '@/lib/workflow-health-audit';

type WorkflowHealthPanelProps = {
  refreshKey?: number;
  onStatus?: (message: string) => void;
};

function workflowFileLoaderIssues(
  files: ReturnType<typeof loadComfyWorkflowFiles>,
  models: ComfyUiModelLists
) {
  return files.flatMap(file => {
    const dualClip = auditDualClipNodesInWorkflow({
      workflowJson: file.workflowJson,
      models,
    }).map(issue => ({
      workflowId: file.id,
      workflowName: file.name,
      severity: issue.severity,
      message: issue.message,
      action: 'optimize-workflow' as const,
    }));

    const loaders = auditLoaderFilenamesInWorkflow({
      workflowJson: file.workflowJson,
      models,
    }).map(issue => ({
      workflowId: file.id,
      workflowName: file.name,
      severity: issue.severity,
      message: issue.message,
      action:
        issue.severity === 'error' ? ('optimize-workflow' as const) : ('open-workflow' as const),
    }));

    return [...dualClip, ...loaders];
  });
}

/** The map the static audit reads — other settings saves don't re-run it. */
function workflowMapSignature(): string {
  return JSON.stringify(loadSettingsCache().shared.modelWorkflowMap ?? {});
}

export default function WorkflowHealthPanel({
  refreshKey: externalRefreshKey = 0,
  onStatus,
}: WorkflowHealthPanelProps) {
  // Re-check by itself (debounced) so imports, scaffolds and remaps are checked without pressing
  // anything. A library save re-runs everything; a workflow-map change only the cheap static
  // audit. Settings events never re-run the queue test: it resolves runtimes the way the queue
  // does, which can save loader maps, and re-running on that save looped every few seconds.
  const [filesKey, setFilesKey] = useState(0);
  const [mapKey, setMapKey] = useState(0);
  const mapRef = useRef<string | null>(null);
  useEffect(() => {
    mapRef.current = workflowMapSignature();
    let filesTimer: number | undefined;
    let mapTimer: number | undefined;
    const onFiles = () => {
      window.clearTimeout(filesTimer);
      filesTimer = window.setTimeout(() => setFilesKey(key => key + 1), 1200);
    };
    const onSettings = () => {
      const next = workflowMapSignature();
      if (next === mapRef.current) return;
      mapRef.current = next;
      window.clearTimeout(mapTimer);
      mapTimer = window.setTimeout(() => setMapKey(key => key + 1), 600);
    };
    window.addEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, onFiles);
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    return () => {
      window.clearTimeout(filesTimer);
      window.clearTimeout(mapTimer);
      window.removeEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, onFiles);
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, onSettings);
    };
  }, []);
  /** Heavy checks (queue test, ComfyUI loader audit): explicit refresh or a library change. */
  const refreshKey = externalRefreshKey + filesKey;
  const [loaderIssues, setLoaderIssues] = useState<
    ReturnType<typeof auditLoaderMapsAgainstComfyUi>
  >([]);
  const [loaderStatus, setLoaderStatus] = useState<string | null>(null);
  const [comfyModels, setComfyModels] = useState<ComfyUiModelLists | null>(null);
  const [queueIssues, setQueueIssues] = useState<WorkflowHealthIssue[]>([]);
  const [queueStatus, setQueueStatus] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [fixTick, setFixTick] = useState(0);

  const applyFix = (issue: WorkflowHealthIssue) => {
    const file = loadComfyWorkflowFiles().find(entry => entry.id === issue.workflowId);
    if (!file || !issue.fix) return;
    const { token, value, name } = issue.fix;
    upsertComfyWorkflowFile({
      ...file,
      ...(name ? { name } : {}),
      customTokens: (file.customTokens ?? []).map(entry =>
        entry.token.trim() === token ? { ...entry, value } : entry
      ),
    });
    setFixTick(tick => tick + 1);
    onStatus?.(`“${file.name}” now uses ${value}${name ? ` (renamed “${name}”)` : ''}.`);
  };

  const applyRemap = (issue: WorkflowHealthIssue) => {
    if (!issue.remap) return;
    const { model, workflowId, workflowName } = issue.remap;
    const shared = loadSettingsCache().shared;
    const nextMap = { ...(shared.modelWorkflowMap ?? {}) };
    if (workflowId) nextMap[model] = workflowId;
    else delete nextMap[model];
    saveSharedSettings({ ...shared, modelWorkflowMap: nextMap });
    setFixTick(tick => tick + 1);
    onStatus?.(
      workflowId
        ? `${model} now uses “${workflowName ?? workflowId}”.`
        : `${model} is unmapped — its tool builds a fresh scaffold on first use.`
    );
  };

  // Build each model workflow the way a queue would and preflight it — library JSON is a
  // template, so this is what says whether it will actually run.
  useEffect(() => {
    void refreshKey;
    let cancelled = false;
    scheduleAfterCommit(() => {
      const shared = loadSettingsCache().shared;
      const targets = loadComfyWorkflowFiles().filter(workflowNeedsQueueTest);
      if (targets.length === 0) return;
      void (async () => {
        const found: WorkflowHealthIssue[] = [];
        for (const [index, file] of targets.entries()) {
          if (cancelled) return;
          setQueueStatus(`Queue-testing workflows ${index + 1}/${targets.length}…`);
          const model = resolveOptimizeModelForWorkflowFile(
            file,
            undefined,
            shared.modelWorkflowMap
          );
          try {
            found.push(...(await queueTestWorkflowFile(file, model)));
          } catch (error) {
            found.push({
              workflowId: file.id,
              workflowName: file.name,
              severity: 'error',
              message: `[${model}] Queue test failed: ${error instanceof Error ? error.message : 'unknown error'}`,
              action: 'open-workflow',
            });
          }
        }
        if (cancelled) return;
        setQueueIssues(found);
        setQueueStatus(
          `Queue-tested ${targets.length} model workflow${targets.length === 1 ? '' : 's'}${
            found.length ? '' : ' — all build and pass preflight'
          }.`
        );
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const report = useMemo(() => {
    void refreshKey;
    void fixTick;
    void mapKey;
    const shared = loadSettingsCache().shared;
    return auditWorkflowLibraryHealth({
      workflowFiles: loadComfyWorkflowFiles(),
      modelWorkflowMap: shared.modelWorkflowMap,
      checkpointMap: shared.modelCheckpointMap as Partial<Record<string, string>> | undefined,
    });
  }, [refreshKey, fixTick, mapKey]);

  useEffect(() => {
    void refreshKey;
    const runtime = resolveComfyUiRuntime();
    const comfyUrl = runtime?.apiUrl?.trim();
    const params = comfyUrl ? `?comfyUrl=${encodeURIComponent(comfyUrl)}` : '';
    scheduleAfterCommit(() => {
      setLoaderStatus('Checking loader maps against ComfyUI…');
    });

    void fetch(`/api/comfyui/object-info${params}`)
      .then(async response => {
        if (!response.ok) {
          setLoaderIssues([]);
          setLoaderStatus('ComfyUI offline — loader map filenames not verified.');
          return;
        }
        const data = (await response.json()) as {
          models?: ComfyUiModelLists;
        };
        if (!data.models) {
          setLoaderIssues([]);
          setComfyModels(null);
          setLoaderStatus(null);
          return;
        }
        setComfyModels(data.models);
        const shared = loadSettingsCache().shared;
        const settings = mergeLoraLibraryIntoCustomTokens(loadComfyUiSettings());
        const checkpointMap = { ...(shared.modelCheckpointMap ?? {}) };
        const vaeMap = { ...(shared.modelVaeMap ?? {}) };
        const upscaleMap = { ...(shared.modelUpscaleMap ?? {}) };
        const controlNetMap = { ...(shared.modelControlNetMap ?? {}) };
        const mapIssues = auditLoaderMapsAgainstComfyUi({
          checkpointMap: checkpointMap as Record<string, string>,
          vaeMap: vaeMap as Record<string, string>,
          upscaleMap: upscaleMap as Record<string, string>,
          controlNetMap: controlNetMap as Record<string, string>,
          customTokens: settings.customTokens,
          models: data.models,
        });
        const workflowIssues = workflowFileLoaderIssues(loadComfyWorkflowFiles(), data.models);
        const issues = [...mapIssues, ...workflowIssues];
        setLoaderIssues(issues);
        setLoaderStatus(
          issues.length === 0
            ? 'Loader maps and workflow filenames match ComfyUI.'
            : `${issues.length} loader note(s) from ComfyUI.`
        );
      })
      .catch(() => {
        setLoaderIssues([]);
        setLoaderStatus('Could not verify loader maps against ComfyUI.');
      });
  }, [refreshKey]);

  const allIssues = [...report.issues, ...queueIssues, ...loaderIssues].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1
  );
  const summary = summarizeWorkflowLibraryHealth({
    ...report,
    issues: allIssues,
    healthy: Math.max(0, report.scanned - new Set(allIssues.map(issue => issue.workflowId)).size),
  });
  const topIssues = showAll ? allIssues : allIssues.slice(0, 8);
  const loaderMapRepairs = useMemo(() => {
    if (!comfyModels) {
      return [];
    }
    const shared = loadSettingsCache().shared;
    return suggestLoaderMapRepairs({
      checkpointMap: { ...(shared.modelCheckpointMap ?? {}) } as Record<string, string>,
      vaeMap: { ...(shared.modelVaeMap ?? {}) } as Record<string, string>,
      upscaleMap: { ...(shared.modelUpscaleMap ?? {}) } as Record<string, string>,
      controlNetMap: { ...(shared.modelControlNetMap ?? {}) } as Record<string, string>,
      models: comfyModels,
    });
    // refreshKey isn't read in the body — it's the caller's manual "force refresh"
    // trigger prop (see the `void refreshKey;` acknowledgments elsewhere in this
    // file), so it's kept despite the warning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comfyModels, refreshKey]);

  const applyLoaderMapRepairSuggestions = () => {
    if (loaderMapRepairs.length === 0) {
      onStatus?.('No loader map repairs suggested.');
      return;
    }
    const shared = loadSettingsCache().shared;
    const repaired = applyLoaderMapRepairs(
      {
        checkpointMap: { ...(shared.modelCheckpointMap ?? {}) } as Record<string, string>,
        vaeMap: { ...(shared.modelVaeMap ?? {}) } as Record<string, string>,
        upscaleMap: { ...(shared.modelUpscaleMap ?? {}) } as Record<string, string>,
        controlNetMap: { ...(shared.modelControlNetMap ?? {}) } as Record<string, string>,
      },
      loaderMapRepairs
    );
    saveSharedSettings({
      ...shared,
      modelCheckpointMap: repaired.checkpointMap,
      modelVaeMap: repaired.vaeMap,
      modelUpscaleMap: repaired.upscaleMap,
      modelControlNetMap: repaired.controlNetMap,
    });
    onStatus?.(`Applied ${repaired.applied} closest-match loader map repair(s).`);
  };

  return (
    <div className="mb-4 space-y-3 rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/30 p-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-[var(--text-primary)]">Workflow library health</p>
        <p className="text-xs text-[var(--text-muted)]">{summary}</p>
        {queueStatus ? <p className="text-xs text-[var(--text-muted)]">{queueStatus}</p> : null}
        {loaderStatus ? <p className="text-xs text-[var(--text-muted)]">{loaderStatus}</p> : null}
        {loaderMapRepairs.length > 0 ? (
          <button
            type="button"
            onClick={applyLoaderMapRepairSuggestions}
            className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-1.5 text-xs text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)]"
          >
            Apply {loaderMapRepairs.length} suggested loader map repair
            {loaderMapRepairs.length === 1 ? '' : 's'}
          </button>
        ) : null}
      </div>
      {topIssues.length > 0 ? (
        <ul className="space-y-2">
          {topIssues.map(issue => (
            <li
              key={`${issue.workflowId}-${issue.workflowName}-${issue.message}`}
              className={`rounded-xl border px-3 py-2 text-xs ${
                issue.severity === 'error'
                  ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] text-[var(--tint-danger-text)]'
                  : 'border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] text-[var(--tint-warning-text)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p>
                  <span className="font-medium">{issue.workflowName}</span>
                  <span className="text-[var(--text-muted)]"> — </span>
                  {issue.message}
                </p>
                {issue.workflowId !== 'loader-map' && issue.action ? (
                  <div className="flex shrink-0 gap-1">
                    {issue.remap ? (
                      <button
                        type="button"
                        onClick={() => applyRemap(issue)}
                        data-testid="workflow-health-remap"
                        className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)]"
                      >
                        {issue.remap.workflowId
                          ? `Use “${issue.remap.workflowName ?? issue.remap.workflowId}”`
                          : 'Unmap'}
                      </button>
                    ) : null}
                    {issue.fix ? (
                      <button
                        type="button"
                        onClick={() => applyFix(issue)}
                        data-testid="workflow-health-fix"
                        className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)]"
                      >
                        Use {issue.fix.value.replace(/\.(safetensors|ckpt|gguf)$/i, '')}
                      </button>
                    ) : null}
                    {issue.workflowId === 'model-map' ? null : (
                      <button
                        type="button"
                        onClick={() => {
                          dispatchWorkflowHealthSelect(issue.workflowId, 'open-workflow');
                          onStatus?.(`Opened workflow “${issue.workflowName}” in library.`);
                        }}
                        className="rounded-lg border border-[var(--border-default)]/70 px-2 py-0.5 text-[10px] text-[var(--text-secondary)] transition hover:border-[var(--border-default)] hover:text-[var(--text-primary)]"
                      >
                        Open
                      </button>
                    )}
                    {issue.action === 'optimize-workflow' ? (
                      <button
                        type="button"
                        onClick={() => {
                          dispatchWorkflowHealthSelect(issue.workflowId, 'optimize-workflow');
                          onStatus?.(`Optimizing “${issue.workflowName}”…`);
                        }}
                        className="rounded-lg border border-[var(--accent-border)] bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] text-[var(--accent-text)] transition hover:border-[var(--accent-border)] hover:bg-[var(--accent-muted)]"
                      >
                        Optimize
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
          {allIssues.length > 8 ? (
            <li>
              <button
                type="button"
                onClick={() => setShowAll(value => !value)}
                className="type-caption ui-text-link"
                data-testid="workflow-health-show-all"
              >
                {showAll ? 'Show fewer' : `Show all ${allIssues.length}`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="text-xs text-[var(--tint-success-text)]">
          Placeholders and loader maps look ready. Run Optimize all after importing new community
          JSON so queue hash-skip stays warm.
        </p>
      )}
    </div>
  );
}
