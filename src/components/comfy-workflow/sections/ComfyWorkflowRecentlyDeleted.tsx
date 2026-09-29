'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  COMFY_WORKFLOW_FILES_UPDATED_EVENT,
  loadDeletedComfyWorkflowFiles,
  restoreDeletedComfyWorkflowFile,
  type DeletedComfyWorkflowFile,
} from '@/lib/comfyui-workflow-files';
import { scheduleAfterCommit } from '@/lib/schedule-after-commit';
import { loadSettingsCache, saveSharedSettings } from '@/lib/settings-cache';

/** Deleted workflows stay here for 30 days — one click puts one back with its id and tokens. */
export function ComfyWorkflowRecentlyDeleted({
  onStatus,
}: {
  onStatus?: (message: string) => void;
}) {
  const [entries, setEntries] = useState<DeletedComfyWorkflowFile[]>([]);
  useEffect(() => {
    const refresh = () => setEntries(loadDeletedComfyWorkflowFiles());
    scheduleAfterCommit(refresh);
    window.addEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, refresh);
    return () => window.removeEventListener(COMFY_WORKFLOW_FILES_UPDATED_EVENT, refresh);
  }, []);
  if (entries.length === 0) return null;
  return (
    <details
      className="rounded-xl border border-[var(--border-subtle)] px-3 py-2"
      data-testid="workflow-recently-deleted"
    >
      <summary className="type-caption cursor-pointer text-[var(--text-secondary)]">
        Recently deleted ({entries.length}) — kept for 30 days
      </summary>
      <ul className="mt-2 divide-y divide-[var(--border-subtle)]/70">
        {entries.map(entry => (
          <li
            key={entry.file.id}
            className="flex flex-wrap items-center justify-between gap-2 py-1.5"
          >
            <span className="text-xs text-[var(--text-primary)]">
              {entry.file.name}
              <span className="ml-2 text-[10px] text-[var(--text-muted)]">
                deleted {new Date(entry.deletedAt).toLocaleString()}
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const restored = restoreDeletedComfyWorkflowFile(entry.file.id);
                if (!restored) return;
                // Put back the pins the delete removed, unless something else took them since.
                const shared = loadSettingsCache().shared;
                const map = { ...(shared.modelWorkflowMap ?? {}) };
                const repinned = (restored.unpinned ?? []).filter(model => !map[model]?.trim());
                if (repinned.length > 0) {
                  for (const model of repinned) map[model] = restored.file.id;
                  saveSharedSettings({ ...shared, modelWorkflowMap: map });
                }
                onStatus?.(
                  `Restored “${restored.file.name}”${repinned.length ? ` and re-pinned ${repinned.join(', ')}` : ''}.`
                );
              }}
            >
              Restore
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}
