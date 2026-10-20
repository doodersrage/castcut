'use client';

import { useEffect, useState } from 'react';
import ModalPortal from '@/components/ui/ModalPortal';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import WorkflowPreviewPanel from '@/components/WorkflowPreviewPanel';
import { Spinner } from '@/components/ui/Button';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery';
import type { WorkflowParamValues } from '@/lib/comfyui/config';
import {
  formatWorkflowParamValue,
  loadGalleryWorkflowView,
  workflowParamDisplayRows,
  type GalleryWorkflowView,
} from '@/lib/gallery/workflow-view';
import {
  formatQueueQualityProfileLabel,
  formatQueueQualityProfileHint,
} from '@/lib/queue-quality-profile';
import { loadSettingsCache } from '@/lib/settings-cache';
import { normalizeModelSamplerPresetTier } from '@/lib/model-sampler-defaults';
import { normalizeResolutionSizeTier } from '@/lib/model-resolution-defaults';
import {
  formatRenderDuration,
  resolveGalleryRenderDurationMs,
} from '@/lib/comfyui/render-duration';

type GalleryWorkflowModalProps = {
  entry: ComfyGalleryEntry;
  onClose: () => void;
};

function ParamGrid({
  label,
  params,
}: {
  label: string;
  params: WorkflowParamValues | Record<string, string | number | undefined>;
}) {
  const rows = workflowParamDisplayRows(params);

  return (
    <div className="space-y-2">
      <h3
        className={`type-caption font-medium rounded-xl border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 backdrop-blur-xs text-[var(--accent-text)] px-3 py-1.5 tracking-wider`}
      >
        {label}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(row => (
          <div
            key={row.key}
            className="rounded-xl border-[var(--border-subtle)]/60 bg-[var(--bg-base)]/70 px-3 py-2 backdrop-blur-xs"
          >
            <dt className="type-caption text-[var(--accent-text)]">{row.key}</dt>
            <dd
              className="type-code mt-0.5 truncate text-sm text-[var(--tint-success-text)]"
              title={formatWorkflowParamValue(row.value)}
            >
              {formatWorkflowParamValue(row.value)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function GalleryWorkflowModal({ entry, onClose }: GalleryWorkflowModalProps) {
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<GalleryWorkflowView | null>(null);

  useEffect(() => {
    let cancelled = false;
    scheduleAfterCommit(() => {
      setLoading(true);
    });
    void loadGalleryWorkflowView(entry).then(result => {
      if (!cancelled) {
        setView(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const historyParams = view?.history?.extractedParams;
  const previewParams = view?.preview?.resolvedParams;
  const shared = loadSettingsCache().shared;
  const qualityProfile = entry.queueQualityProfile;
  const qualityHint =
    qualityProfile && qualityProfile !== 'followSettings'
      ? formatQueueQualityProfileHint(
          qualityProfile,
          normalizeModelSamplerPresetTier(shared.modelSamplerPreset),
          normalizeResolutionSizeTier(shared.modelResolutionSizeTier)
        )
      : null;
  const renderDurationLabel = formatRenderDuration(resolveGalleryRenderDurationMs(entry));

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-[var(--bg-base)]/85 p-4 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label="Gallery workflow configuration"
        onClick={event => {
          if (event.target === event.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="my-4 w-full max-w-5xl rounded-2xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)] shadow-[0_24px_80px_-24px_rgba(0,0,0,0.9)]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)]/80 px-5 py-4">
            <div className="min-w-0 space-y-1">
              <h2 className="text-lg font-medium text-[var(--text-primary)]">
                Workflow configuration
              </h2>
              <p className="type-caption truncate text-[var(--text-muted)]">
                {entry.tool ?? 'gallery'} · {entry.model ?? 'unknown model'} · prompt{' '}
                {entry.promptId.slice(0, 12)}
                {renderDurationLabel ? ` · render ${renderDurationLabel}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--border-subtle)]/70 bg-[var(--bg-base)]/60 backdrop-blur-xs transition hover:bg-[var(--accent-muted)] hover:border-[var(--accent-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)] text-[var(--accent-text)]`}
            >
              Close
            </button>
          </div>

          <div className="space-y-5 px-5 py-5">
            {loading ? (
              <div
                className="flex items-center gap-2 py-8 text-sm text-[var(--text-muted)]"
                role="status"
              >
                <Spinner size="sm" />
                Loading workflow data…
              </div>
            ) : (
              <>
                {qualityProfile ? (
                  <div className="rounded-xl border border-[var(--accent-border)] bg-[var(--accent-muted)] px-4 py-3">
                    <p className="type-caption text-[var(--text-muted)]">Queue quality profile</p>
                    <p className="mt-1 text-sm text-[var(--accent-text)]">
                      {formatQueueQualityProfileLabel(qualityProfile)}
                    </p>
                    {qualityHint ? (
                      <p className="mt-1 type-caption text-[var(--text-muted)]">{qualityHint}</p>
                    ) : null}
                  </div>
                ) : null}

                {view?.storedParams ? (
                  <ParamGrid
                    label="Stored job params (from gallery entry)"
                    params={view.storedParams}
                  />
                ) : null}

                {historyParams ? (
                  <ParamGrid label="Params extracted from ComfyUI history" params={historyParams} />
                ) : view?.historyError ? (
                  <p className="type-caption text-[var(--text-muted)]">
                    ComfyUI history: {view.historyError}
                  </p>
                ) : null}

                {previewParams ? (
                  <ParamGrid
                    label="Resolved preview params (current workflow settings)"
                    params={previewParams}
                  />
                ) : null}

                {entry.sourceImageUrl || entry.maskImageUrl ? (
                  <div className="space-y-2">
                    <h3 className="type-caption font-medium text-[var(--text-muted)]">
                      Re-queue image URLs (stored on gallery entry)
                    </h3>
                    <dl className="grid gap-2">
                      {entry.sourceImageUrl ? (
                        <div className="rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2">
                          <dt className="type-caption text-[var(--text-muted)]">sourceImageUrl</dt>
                          <dd
                            className="type-code mt-0.5 truncate text-sm text-[var(--tint-success-text)]"
                            title={entry.sourceImageUrl}
                          >
                            {entry.sourceImageUrl}
                          </dd>
                        </div>
                      ) : null}
                      {entry.maskImageUrl ? (
                        <div className="rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/50 px-3 py-2">
                          <dt className="type-caption text-[var(--text-muted)]">maskImageUrl</dt>
                          <dd
                            className="type-code mt-0.5 truncate text-sm text-[var(--tint-warning-text)]"
                            title={entry.maskImageUrl}
                          >
                            {entry.maskImageUrl}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>
                ) : null}

                {view?.history?.nodeInputs && view.history.nodeInputs.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="type-caption font-medium text-[var(--text-muted)]">
                      Node inputs from ComfyUI history
                    </h3>
                    <div className="ui-table-shell max-h-56 overflow-auto">
                      <table className="ui-table">
                        <thead>
                          <tr>
                            <th>Node</th>
                            <th>Type</th>
                            <th>Input</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {view.history.nodeInputs.map(row => (
                            <tr
                              key={`${row.nodeId}-${row.input}-${String(row.value).slice(0, 24)}`}
                            >
                              <td className="ui-table-accent type-code">{row.nodeId}</td>
                              <td className="text-[var(--text-muted)]">{row.classType ?? '—'}</td>
                              <td className="type-code text-[var(--tint-info-text)]">
                                {row.input}
                              </td>
                              <td className="type-code max-w-[16rem] truncate text-[var(--tint-success-text)]">
                                {String(row.value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {view?.history?.workflowJson ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="type-caption font-medium text-[var(--text-muted)]">
                        ComfyUI workflow JSON (from history)
                      </h3>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(view.history?.workflowJson ?? '')
                            .catch(() => undefined);
                        }}
                        className={`ui-btn-ghost ui-btn-sm text-xs rounded-xl border border-[var(--tint-success-border)] bg-[var(--tint-success-bg)] backdrop-blur-xs transition hover:bg-[var(--tint-success-bg)] hover:border-[var(--tint-success-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tint-success-border)] text-[var(--tint-success-text)]`}
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="type-code max-h-80 overflow-auto rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/70 p-4 text-[var(--text-secondary)]">
                      {view.history.workflowJson}
                      {view.history.truncated ? '\n… (truncated)' : ''}
                    </pre>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <h3 className="type-caption font-medium text-[var(--text-muted)]">
                    Reconstructed workflow preview
                  </h3>
                  <p className="type-caption text-[var(--text-muted)]">
                    Built from your current workflow settings plus this entry&apos;s prompt and
                    params. May differ from the original job if settings changed since queue time.
                  </p>
                  <WorkflowPreviewPanel
                    loading={false}
                    error={view?.previewError}
                    preview={view?.preview ?? null}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
