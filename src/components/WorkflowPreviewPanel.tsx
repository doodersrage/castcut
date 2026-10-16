'use client';

import { useState } from 'react';
import { Button, Skeleton, Spinner } from '@/components/ui/Button';
import { collectMissingNodeTypesFromIssues } from '@/lib/workflow-node-type-audit';
import { requestComfyManagerInstall } from '@/lib/comfyui-manager-install-client';
import { resolveSelectedWorkflowRuntime } from '@/lib/comfyui-runtime';

type WorkflowPreviewPanelProps = {
  loading?: boolean;
  error?: string | null;
  preview?: {
    workflowSource?: string;
    replacements?: {
      positive: number;
      negative: number;
      params?: Record<string, number>;
      custom?: Record<string, number>;
    };
    resolvedParams?: {
      seed: string;
      width: string;
      height: string;
      cfg: string;
      steps: string;
    };
    snippets?: Array<{ path: string; value: string }>;
    workflowJson?: string;
    truncated?: boolean;
    preflightIssues?: Array<{ severity: 'error' | 'warn'; message: string; classType?: string }>;
    queueOptimizeChanges?: string[];
  } | null;
};

export default function WorkflowPreviewPanel({
  loading,
  error,
  preview,
}: WorkflowPreviewPanelProps) {
  const [installStatus, setInstallStatus] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  if (loading) {
    return (
      <div
        className="ui-surface space-y-3 p-4"
        role="status"
        aria-label="Building workflow preview"
      >
        <div className="flex items-center gap-2">
          <Spinner size="sm" />
          <Skeleton className="ui-skeleton-title flex-1" />
        </div>
        <Skeleton className="ui-skeleton-row w-full" />
        <Skeleton className="ui-skeleton-row w-5/6" />
        <Skeleton className="ui-skeleton-block w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="ui-alert-danger type-caption">{error}</p>;
  }

  if (!preview) {
    return null;
  }

  const missingNodeTypes = collectMissingNodeTypesFromIssues(preview.preflightIssues ?? []);

  return (
    <div className="ui-surface space-y-3 p-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 type-caption">
        <span>
          Source:{' '}
          <span className="text-[var(--text-primary)]">{preview.workflowSource ?? 'unknown'}</span>
        </span>
        {preview.replacements && (
          <span>
            Replacements:{' '}
            <span className="text-[var(--text-primary)]">
              {preview.replacements.positive} positive
              {preview.replacements.negative > 0
                ? ` · ${preview.replacements.negative} negative`
                : ''}
              {preview.replacements.params && Object.keys(preview.replacements.params).length > 0
                ? ` · params ${Object.entries(preview.replacements.params)
                    .map(([key, count]) => `${key}:${count}`)
                    .join(', ')}`
                : ''}
              {preview.replacements.custom && Object.keys(preview.replacements.custom).length > 0
                ? ` · custom ${Object.entries(preview.replacements.custom)
                    .map(([token, count]) => `${token}:${count}`)
                    .join(', ')}`
                : ''}
            </span>
          </span>
        )}
        {preview.resolvedParams && (
          <span>
            Params:{' '}
            <span className="type-code !bg-transparent !p-0 text-[var(--tint-info-text)]">
              seed={preview.resolvedParams.seed} · {preview.resolvedParams.width}×
              {preview.resolvedParams.height} · cfg {preview.resolvedParams.cfg} · steps{' '}
              {preview.resolvedParams.steps}
            </span>
          </span>
        )}
      </div>

      {preview.queueOptimizeChanges && preview.queueOptimizeChanges.length > 0 ? (
        <ul className="space-y-1.5">
          <p className="type-caption text-[var(--text-muted)]">Queue graph enrich</p>
          {preview.queueOptimizeChanges.map(message => (
            <li
              key={message}
              className="type-caption rounded-[var(--radius-md)] border border-[var(--accent-border)] bg-[var(--accent-muted)] px-3 py-2 text-[var(--accent-text)]"
            >
              {message}
            </li>
          ))}
        </ul>
      ) : null}

      {preview.preflightIssues && preview.preflightIssues.length > 0 ? (
        <ul className="space-y-1.5">
          {preview.preflightIssues.map(issue => (
            <li
              key={issue.message}
              className={
                issue.severity === 'error'
                  ? 'type-caption rounded-[var(--radius-md)] border border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)] px-3 py-2 text-[var(--tint-danger-text)]'
                  : 'type-caption rounded-[var(--radius-md)] border border-[var(--tint-warning-border)] bg-[var(--tint-warning-bg)] px-3 py-2 text-[var(--tint-warning-text)]'
              }
            >
              {issue.message}
            </li>
          ))}
        </ul>
      ) : null}

      {missingNodeTypes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            loading={installing}
            loadingLabel="Installing missing nodes"
            onClick={() => {
              setInstalling(true);
              setInstallStatus('Installing missing custom nodes…');
              void requestComfyManagerInstall({
                nodeTypes: missingNodeTypes,
                comfyUrl: resolveSelectedWorkflowRuntime()?.apiUrl,
                restart: true,
              })
                .then(result => {
                  setInstallStatus(result.message || 'Install finished.');
                })
                .finally(() => setInstalling(false));
            }}
          >
            Install missing nodes
          </Button>
          {installStatus ? (
            <p className="type-caption text-[var(--text-muted)]">{installStatus}</p>
          ) : null}
        </div>
      ) : null}

      {preview.snippets && preview.snippets.length > 0 && (
        <ul className="space-y-1 type-caption">
          {preview.snippets.map(snippet => (
            <li key={`${snippet.path}-${snippet.value.slice(0, 24)}`}>
              <span className="type-code text-[var(--accent-text)]">{snippet.path}</span>
              <span className="text-[var(--text-muted)]"> → </span>
              <span className="type-code !bg-transparent !p-0 text-[var(--tint-success-text)]">
                {snippet.value}
              </span>
            </li>
          ))}
        </ul>
      )}

      {preview.workflowJson && (
        <pre className="type-code max-h-72 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--bg-muted)] p-3 !text-[var(--text-secondary)]">
          {preview.workflowJson}
          {preview.truncated ? '\n… (truncated)' : ''}
        </pre>
      )}
    </div>
  );
}
