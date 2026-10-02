'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ComfyPackImportControl from '@/components/ComfyPackImportControl';
import { Button } from '@/components/ui/Button';
import { fetchComfyObjectInfoCached } from '@/lib/comfyui-object-info-cache';
import { auditWorkflowNodeTypes } from '@/lib/workflow-node-type-audit';
import { loadComfyWorkflowFiles } from '@/lib/comfyui-workflow-files';
import { loadSettingsCache } from '@/lib/settings-cache';
import { resolveWorkflowForModelSelection } from '@/lib/model-workflow-map';
import type { ComfyImageModel } from '@/lib/comfy-models/client';
import type { PackImportResult } from '@/lib/workflow-pack-import';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { resolveQueueFailureHref } from '@/lib/queue-failure-playbook';
import { settingsComfyUiSectionHref } from '@/lib/settings-comfyui-nav';

type MediaKind = 'audio' | 'mesh' | 'video' | 'controlnet';

type MediaScaffoldReadyPanelProps = {
  kind: MediaKind;
  /** Ensure scaffold / maps before auditing. */
  ensureScaffold?: () => Promise<void> | void;
  onImported?: (summary: string, result: PackImportResult) => void;
  className?: string;
};

/**
 * Pack import + missing-node smoke check for Audio / Mesh / Video / ControlNet tools.
 */
export default function MediaScaffoldReadyPanel({
  kind,
  ensureScaffold,
  onImported,
  className = '',
}: MediaScaffoldReadyPanelProps) {
  const [status, setStatus] = useState<string | null>(null);
  const [statusHref, setStatusHref] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const preferKind = kind === 'controlnet' ? undefined : kind;

  const runAudit = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    setStatusHref(undefined);
    try {
      await ensureScaffold?.();
      const objectInfo = await fetchComfyObjectInfoCached({ forceRefresh: false });
      const available = objectInfo?.nodeTypes;
      if (!available?.size) {
        const message = 'Could not read ComfyUI object_info — is Comfy reachable?';
        setStatus(message);
        setStatusHref(resolveQueueFailureHref(message) ?? settingsComfyUiSectionHref('connection'));
        return;
      }

      const shared = loadSettingsCache().shared;
      const files = loadComfyWorkflowFiles();
      const workflowId = resolveWorkflowForModelSelection(shared.model as ComfyImageModel, {
        map: shared.modelWorkflowMap,
        workflowFiles: files,
        tool: kind,
      });
      const workflowJson =
        (workflowId ? files.find(file => file.id === workflowId)?.workflowJson : undefined) ||
        files.find(file => file.id === shared.selectedWorkflowFileId)?.workflowJson;
      if (!workflowJson?.trim()) {
        // System workflows build the graph at queue time — nothing in the library to audit, and
        // Queue works. Saying "no workflow selected yet" here sent people to import a pack.
        if (shared.useSystemWorkflows === true) {
          setStatus(`Ready — the system ${kind} workflow is used for this model.`);
          return;
        }
        const message = `No ${kind} workflow selected yet — import a pack below or enable system workflows.`;
        setStatus(message);
        setStatusHref(settingsComfyUiSectionHref('workflow-map'));
        return;
      }

      const issues = auditWorkflowNodeTypes({
        workflowJson,
        knownNodeTypes: available,
      });
      if (issues.length === 0) {
        setStatus('Ready — required node types are installed.');
        return;
      }
      const missing = issues
        .map(issue => issue.message.match(/“([^”]+)”/)?.[1])
        .filter(Boolean) as string[];
      const message = `Missing ${issues.length} node type(s)${
        missing.length ? `: ${missing.slice(0, 6).join(', ')}` : ''
      }${missing.length > 6 ? '…' : ''}. Import a matching pack or install custom nodes.`;
      setStatus(message);
      setStatusHref(issues[0]?.href ?? settingsComfyUiSectionHref('workflow-map'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scaffold check failed.';
      setStatus(message);
      setStatusHref(resolveQueueFailureHref(message));
    } finally {
      setBusy(false);
    }
  }, [ensureScaffold, kind]);

  useEffect(() => {
    let cancelled = false;
    scheduleAfterCommit(() => {
      if (!cancelled) {
        void runAudit();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [runAudit]);

  return (
    <div
      className={`space-y-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--surface)_90%,transparent)] p-4 ${className}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-[var(--text-primary)]">Pack & node check</p>
          <p className="text-xs text-[var(--text-muted)]">
            Import an API-format pack, then smoke-check that required nodes exist in ComfyUI.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          loading={busy}
          loadingLabel="Checking…"
          onClick={() => void runAudit()}
        >
          Re-check
        </Button>
      </div>
      <ComfyPackImportControl
        preferKind={preferKind}
        compact
        onImported={(summary, result) => {
          setStatus(summary);
          onImported?.(summary, result);
          void runAudit();
        }}
      />
      {status ? (
        <p className="text-xs text-[var(--text-secondary)]" role="status">
          {status}
          {statusHref ? (
            <>
              {' '}
              <Link
                href={statusHref}
                className="text-[var(--accent-text)] underline-offset-2 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-ring)]"
              >
                Open Settings
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
