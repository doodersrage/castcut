'use client';

import { useMemo, useState } from 'react';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/registry';
import type { ComfyWorkflowFile } from '@/lib/comfyui-workflow-files';
import { modelWorkflowKind, workflowFileKind, type WorkflowKind } from '@/lib/workflow-kind';

const FACE_DETAILER_KEY = 'faceDetailer';

const KIND_LABEL: Record<WorkflowKind, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  mesh: '3D',
};

function modelLabel(model: string): string {
  if (model === FACE_DETAILER_KEY) return 'Face detail (Gallery)';
  return COMFY_IMAGE_MODELS.find(entry => entry.id === model)?.label ?? model;
}

export type MapRowStatus = { tone: 'ok'; text: string } | { tone: 'danger'; text: string };

/** Whether a map entry points at a workflow of the kind its model needs. */
export function mapRowStatus(
  model: string,
  workflowId: string,
  files: Pick<ComfyWorkflowFile, 'id' | 'name' | 'workflowJson'>[]
): MapRowStatus {
  const file = files.find(entry => entry.id === workflowId);
  if (!file) {
    return files.length === 0
      ? { tone: 'ok', text: 'Library loading…' }
      : { tone: 'danger', text: 'Workflow missing from library' };
  }
  const need = modelWorkflowKind(model);
  const have = workflowFileKind(file);
  if (need && need !== have) {
    return { tone: 'danger', text: `Needs ${KIND_LABEL[need]}, this is ${KIND_LABEL[have]}` };
  }
  return { tone: 'ok', text: KIND_LABEL[have] };
}

/**
 * The model → workflow map as a table: one row per pinned model with a workflow picker, a
 * kind check, and remove; models without a row use the automatic pick.
 */
export default function ModelWorkflowMapTable({
  map,
  files,
  disabled,
  automaticLabel,
  onChange,
}: {
  map: Record<string, string>;
  files: ComfyWorkflowFile[];
  disabled?: boolean;
  /** What happens for models with no row ("system workflow" vs "filename default"). */
  automaticLabel: string;
  /** One edit — the caller applies it to the latest saved map, not this (maybe stale) copy. */
  onChange: (model: string, workflowId: string | null) => void;
}) {
  const [addModel, setAddModel] = useState('');
  const rows = Object.entries(map).filter(([, id]) => id?.trim());
  const addable = useMemo(
    () =>
      [FACE_DETAILER_KEY, ...COMFY_IMAGE_MODELS.map(entry => entry.id)].filter(
        model => !(model in map)
      ),
    [map]
  );

  const setRow = (model: string, workflowId: string) => onChange(model, workflowId || null);

  const options = (model: string) => {
    const need = modelWorkflowKind(model);
    // Right kind first; the others stay pickable (hybrid graphs) but are labelled.
    const sorted = [...files].sort(
      (a, b) =>
        Number(workflowFileKind(b) === need) - Number(workflowFileKind(a) === need) ||
        a.name.localeCompare(b.name)
    );
    return sorted.map(file => {
      const kind = workflowFileKind(file);
      return (
        <option key={file.id} value={file.id}>
          {file.name}
          {need && kind !== need ? ` (${KIND_LABEL[kind]})` : ''}
        </option>
      );
    });
  };

  return (
    <div className="space-y-2" data-testid="model-workflow-map-table">
      {disabled && rows.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">Loading saved map…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-[var(--text-muted)]">
          No models pinned — every model uses {automaticLabel}.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]/70 rounded-xl border border-[var(--border-subtle)]">
          {rows.map(([model, workflowId]) => {
            const status = mapRowStatus(model, workflowId, files);
            return (
              <li
                key={model}
                className="flex flex-wrap items-center gap-2 px-3 py-2"
                data-testid="model-workflow-map-row"
              >
                <span className="min-w-[10rem] flex-1 text-xs text-[var(--text-primary)]">
                  {modelLabel(model)}
                  <span className="ml-1 font-mono text-[10px] text-[var(--text-muted)]">
                    {model}
                  </span>
                </span>
                <select
                  value={workflowId}
                  disabled={disabled}
                  aria-label={`Workflow for ${modelLabel(model)}`}
                  onChange={event => setRow(model, event.target.value)}
                  className="ui-input max-w-[16rem] py-1 text-xs"
                >
                  <option value="">Automatic ({automaticLabel})</option>
                  {files.some(file => file.id === workflowId) ? null : (
                    <option value={workflowId}>Missing: {workflowId.slice(0, 8)}…</option>
                  )}
                  {options(model)}
                </select>
                <span
                  className={`text-[10px] ${
                    status.tone === 'ok'
                      ? 'text-[var(--text-muted)]'
                      : 'ui-status-danger font-medium'
                  }`}
                  data-testid="model-workflow-map-status"
                >
                  {status.text}
                </span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setRow(model, '')}
                  className="type-caption ui-text-link"
                  aria-label={`Unpin ${modelLabel(model)}`}
                >
                  Unpin
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={addModel}
          disabled={disabled}
          aria-label="Model to pin"
          onChange={event => setAddModel(event.target.value)}
          className="ui-input max-w-[16rem] py-1 text-xs"
        >
          <option value="">Pin a model…</option>
          {addable.map(model => (
            <option key={model} value={model}>
              {modelLabel(model)}
            </option>
          ))}
        </select>
        {addModel ? (
          <select
            value=""
            disabled={disabled}
            aria-label={`Workflow for ${modelLabel(addModel)}`}
            onChange={event => {
              if (!event.target.value) return;
              setRow(addModel, event.target.value);
              setAddModel('');
            }}
            className="ui-input max-w-[16rem] py-1 text-xs"
          >
            <option value="">…to workflow</option>
            {options(addModel)}
          </select>
        ) : null}
      </div>
    </div>
  );
}
