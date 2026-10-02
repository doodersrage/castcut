'use client';

import type { ComfyWorkflowFile } from '@/lib/comfyui-workflow-files';
import { workflowFileDisplayName } from '@/lib/comfyui-workflow-files';
import type { ServerWorkflowOption } from '@/hooks/useComfyWorkflowSelection';

type ComfyWorkflowSelectorProps = {
  selectedId?: string;
  defaultLabel: string;
  localFiles: ComfyWorkflowFile[];
  serverFiles: ServerWorkflowOption[];
  onChange: (fileId: string | undefined) => void;
  compact?: boolean;
  helpText?: string;
};

export default function ComfyWorkflowSelector({
  selectedId,
  defaultLabel,
  localFiles,
  serverFiles,
  onChange,
  compact = false,
  helpText,
}: ComfyWorkflowSelectorProps) {
  const selectedExists =
    !selectedId ||
    localFiles.some(entry => entry.id === selectedId) ||
    serverFiles.some(entry => entry.id === selectedId);

  return (
    <div
      className={compact ? 'space-y-2' : 'space-y-3 border-t border-[var(--border-subtle)] pt-4'}
    >
      {!compact && (
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">ComfyUI workflow file</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            {helpText ??
              'Choose which workflow JSON to use when you Queue. URL, tokens, and queue params still come from Settings or server env.'}
          </p>
        </div>
      )}
      <select
        value={selectedId ?? ''}
        onChange={event => onChange(event.target.value || undefined)}
        className={
          compact
            ? 'min-w-[12rem] flex-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]'
            : 'w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)]'
        }
      >
        <option value="">{defaultLabel}</option>
        {serverFiles.length > 0 && (
          <optgroup label="Server workflow files">
            {serverFiles.map(entry => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </optgroup>
        )}
        {localFiles.length > 0 && (
          <optgroup label="Imported workflow files">
            {localFiles.map(entry => (
              <option key={entry.id} value={entry.id}>
                {workflowFileDisplayName(entry)}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {!selectedExists && (
        <p className="text-xs text-[var(--tint-warning-text)]">
          The selected workflow file was removed. Using {defaultLabel.toLowerCase()}.
        </p>
      )}
      {localFiles.length === 0 && serverFiles.length === 0 && !compact && (
        <p className="text-xs text-[var(--text-muted)]">
          Import workflow JSON files in Settings, or configure{' '}
          <code className="rounded bg-[var(--bg-muted)] px-1">COMFYUI_WORKFLOW_DIR</code> /
          <code className="rounded bg-[var(--bg-muted)] px-1">COMFYUI_WORKFLOW_PATHS</code> on the
          server.
        </p>
      )}
    </div>
  );
}
