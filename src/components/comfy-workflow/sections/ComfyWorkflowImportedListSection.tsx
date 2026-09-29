'use client';

import {
  getWorkflowTokenValue,
  setWorkflowTokenValue,
  workflowFileDisplayName,
  workflowFileSourceFilename,
  WORKFLOW_TOKEN_FIELDS,
} from '@/lib/comfyui-workflow-files';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import type { ComfyWorkflowFile } from '@/lib/comfyui-workflow-files';
import type { WorkflowNodeMapping } from '@/lib/workflow-node-mapper';
import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';
import { Button } from '@/components/ui/Button';
import { SelectInput, TextInput, MonoTextArea } from '@/components/ui/Field';
import { ToolActionRow } from '@/components/ui/ToolPageShell';
import { workflowFileKind, type WorkflowKind } from '@/lib/workflow-kind';
import { isWorkflowFileUnused, type WorkflowFileUsage } from '@/lib/workflow-library-usage';

const WORKFLOW_KIND_LABEL: Record<WorkflowKind, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  mesh: '3D',
};

type Props = Pick<
  ComfyWorkflowLibraryViewModel,
  | 'placeholderTokens'
  | 'editingName'
  | 'setEditingName'
  | 'editingJson'
  | 'setEditingJson'
  | 'editingTokens'
  | 'editError'
  | 'setEditError'
  | 'bindingPreview'
  | 'editingValidation'
  | 'editingNodeMappings'
  | 'editingGraphInspect'
  | 'persistEditingTokens'
  | 'cancelEdit'
  | 'saveEdit'
  | 'optimizeAndSaveCopy'
  | 'previewOptimizeCopy'
  | 'optimizePreviewSummary'
  | 'cloneAndBindWorkflow'
  | 'copyBindingHints'
  | 'applyBindings'
> & {
  file: ComfyWorkflowFile;
  displayName: string;
};

export function ComfyWorkflowEditPanel({
  file,
  displayName,
  placeholderTokens,
  editingName,
  setEditingName,
  editingJson,
  setEditingJson,
  editingTokens,
  editError,
  setEditError,
  bindingPreview,
  editingValidation,
  editingNodeMappings,
  editingGraphInspect,
  persistEditingTokens,
  cancelEdit,
  saveEdit,
  optimizeAndSaveCopy,
  previewOptimizeCopy,
  optimizePreviewSummary,
  cloneAndBindWorkflow,
  copyBindingHints,
  applyBindings,
}: Props) {
  return (
    <div className="ui-surface-inset mx-4 mb-4 mt-0 space-y-3 border-t-0">
      <label className="block space-y-2">
        <span className="type-caption">Display name</span>
        <TextInput value={editingName} onChange={event => setEditingName(event.target.value)} />
      </label>
      <div className="space-y-3 rounded-xl border border-[var(--border-subtle)]/80 bg-[var(--bg-base)]/40 p-3">
        <div>
          <p className="type-caption text-[var(--text-secondary)]">Per-workflow token overrides</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Unique to this workflow. Beat Settings → LoRA library and the global checkpoint map when
            this file is selected for Send. Token overrides save as you type.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {WORKFLOW_TOKEN_FIELDS.map(field => (
            <label key={field.token} className="block space-y-1.5">
              <span className="type-caption">
                {field.label}{' '}
                <code className="text-[10px] text-[var(--accent-text)]">{field.token}</code>
              </span>
              <TextInput
                value={getWorkflowTokenValue(editingTokens, field.token)}
                onChange={event =>
                  persistEditingTokens(
                    setWorkflowTokenValue(editingTokens, field.token, event.target.value)
                  )
                }
                placeholder={field.hint}
                className="font-mono text-xs"
              />
            </label>
          ))}
        </div>
      </div>
      <label className="block space-y-2">
        <span className="type-caption">Workflow JSON (ComfyUI API format)</span>
        <MonoTextArea
          value={editingJson}
          onChange={event => {
            setEditingJson(event.target.value);
            setEditError(null);
          }}
          rows={14}
          spellCheck={false}
          className="text-[var(--tint-success-text)]"
        />
      </label>
      {editingGraphInspect?.ok ? (
        <div className="ui-surface-inset space-y-2">
          <p className="type-caption text-[var(--accent-text)]">
            Graph inspector · {editingGraphInspect.nodeCount} nodes
          </p>
          <p className="type-caption text-[var(--text-muted)]">
            {editingGraphInspect.classCounts
              .slice(0, 8)
              .map(
                (entry: { classType: string; count: number }) => `${entry.classType}×${entry.count}`
              )
              .join(' · ')}
            {editingGraphInspect.classCounts.length > 8
              ? ` · +${editingGraphInspect.classCounts.length - 8} more`
              : ''}
          </p>
          {editingGraphInspect.unresolvedTokens.length > 0 ? (
            <p className="type-caption text-[var(--tint-warning-text)]">
              Unresolved tokens: {editingGraphInspect.unresolvedTokens.slice(0, 12).join(' ')}
              {editingGraphInspect.unresolvedTokens.length > 12 ? '…' : ''}
            </p>
          ) : (
            <p className="type-caption text-[var(--text-muted)]">
              No {'{{TOKEN}}'} placeholders in this JSON.
            </p>
          )}
        </div>
      ) : null}
      {editError && <p className="text-xs ui-status-danger">{editError}</p>}
      {editingValidation && (
        <p className="text-xs text-[var(--text-muted)]">
          {editingValidation.ok ? (
            <>
              Placeholders: {editingValidation.placeholders?.positive ?? 0}×{' '}
              {placeholderTokens.positive}
              {(editingValidation.placeholders?.negative ?? 0) > 0
                ? ` · ${editingValidation.placeholders?.negative}× ${placeholderTokens.negative}`
                : ''}
              {(editingValidation.placeholders?.seed ?? 0) > 0
                ? ` · ${editingValidation.placeholders?.seed}× ${placeholderTokens.seed}`
                : ''}
              {(editingValidation.placeholders?.width ?? 0) > 0
                ? ` · ${editingValidation.placeholders?.width}× ${placeholderTokens.width}`
                : ''}
              {(editingValidation.placeholders?.height ?? 0) > 0
                ? ` · ${editingValidation.placeholders?.height}× ${placeholderTokens.height}`
                : ''}
              {(editingValidation.placeholders?.cfg ?? 0) > 0
                ? ` · ${editingValidation.placeholders?.cfg}× ${placeholderTokens.cfg}`
                : ''}
              {(editingValidation.placeholders?.steps ?? 0) > 0
                ? ` · ${editingValidation.placeholders?.steps}× ${placeholderTokens.steps}`
                : ''}
            </>
          ) : (
            <span className="text-[var(--tint-warning-text)]">{editingValidation.error}</span>
          )}
        </p>
      )}
      {editingNodeMappings.length > 0 ? (
        <div className="ui-surface-inset">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="type-caption text-[var(--accent-text)]">Suggested node bindings</p>
            <Button type="button" variant="ghost" size="sm" onClick={copyBindingHints}>
              Copy hints
            </Button>
            <Button type="button" variant="accent-outline" size="sm" onClick={applyBindings}>
              Apply bindings
            </Button>
          </div>
          {bindingPreview ? (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)]/60 p-2 text-[11px] text-[var(--text-muted)]">
              {bindingPreview}
            </pre>
          ) : null}
          <ul className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
            {editingNodeMappings.map((mapping: WorkflowNodeMapping) => (
              <li key={mapping.nodeId}>
                <span className="text-[var(--text-primary)]">{mapping.nodeId}</span> ·{' '}
                {mapping.classType}
                {mapping.suggestedBinding ? ` → ${mapping.suggestedBinding}` : ''}
                <span className="text-[var(--text-muted)]"> — {mapping.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ToolActionRow>
        <Button type="button" variant="primary" size="sm" onClick={saveEdit}>
          Save workflow
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={optimizeAndSaveCopy}>
          Optimize &amp; save copy
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={previewOptimizeCopy}>
          Preview optimize
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={cloneAndBindWorkflow}>
          Clone &amp; bind
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={cancelEdit}>
          Cancel
        </Button>
      </ToolActionRow>
      {optimizePreviewSummary ? (
        <p className="type-caption text-[var(--accent-text)]">{optimizePreviewSummary}</p>
      ) : null}
    </div>
  );
}

export function ComfyWorkflowImportedRow({
  file,
  active,
  isEditing,
  displayName,
  inferredModels,
  usage,
  selectFile,
  startEdit,
  cancelEdit,
  removeFile,
  assignInferredModels,
  editPanel,
}: {
  usage?: WorkflowFileUsage;
  file: ComfyWorkflowFile;
  active: boolean;
  isEditing: boolean;
  displayName: string;
  inferredModels: string[];
  selectFile: (id: string, name: string) => void;
  startEdit: (file: ComfyWorkflowFile) => void;
  cancelEdit: () => void;
  removeFile: (id: string) => void;
  assignInferredModels: (id: string, models: string[], overwrite: boolean) => void;
  editPanel: React.ReactNode;
}) {
  const sourceFilename = workflowFileSourceFilename(file);

  return (
    <li
      className="ui-list-row flex-col items-stretch !min-h-0 !items-start gap-0 !p-0"
      data-highlight={active ? 'true' : undefined}
    >
      <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="type-heading">
            {displayName}
            {active && (
              <span className="ml-2 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--accent-text)]">
                Active
              </span>
            )}
          </p>
          <p className="type-caption">
            {sourceFilename ? `${sourceFilename} · ` : ''}
            {new Date(file.createdAt).toLocaleString()} ·{' '}
            {(file.workflowJson.length / 1024).toFixed(1)} KB
            {file.customTokens && file.customTokens.length > 0
              ? ` · ${file.customTokens.length} token override${file.customTokens.length === 1 ? '' : 's'}`
              : ''}
          </p>
          <p
            className="type-caption mt-1 flex flex-wrap items-center gap-1.5"
            data-testid="workflow-usage"
          >
            <span className="rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-secondary)]">
              {WORKFLOW_KIND_LABEL[workflowFileKind(file)]}
            </span>
            {usage?.pinned.length ? (
              <span className="text-[var(--text-secondary)]">
                Pinned: {usage.pinned.join(', ')}
              </span>
            ) : null}
            {usage?.auto.length ? (
              <span className="text-[var(--text-muted)]">
                Auto-picked for{' '}
                {usage.auto.length <= 3
                  ? usage.auto.join(', ')
                  : `${usage.auto.slice(0, 3).join(', ')} +${usage.auto.length - 3}`}
              </span>
            ) : null}
            {isWorkflowFileUnused(usage) ? (
              <span className="text-[var(--tint-warning-text)]" data-testid="workflow-unused">
                Not used by any model right now
              </span>
            ) : null}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {inferredModels.length > 0 ? (
              <>
                <p className="type-caption text-[var(--accent-text)] opacity-80">
                  Suggested: {inferredModels.join(', ')}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => assignInferredModels(file.id, inferredModels, true)}
                >
                  Assign to models
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => assignInferredModels(file.id, inferredModels, false)}
                  title="Only fill models that have no mapping yet"
                >
                  Fill empty only
                </Button>
              </>
            ) : (
              <p className="type-caption text-[var(--text-muted)]">
                No model inferred from the name — assign manually:
              </p>
            )}
            <SelectInput
              aria-label={`Manually assign ${displayName} to a model`}
              className="max-w-[16rem] text-xs"
              defaultValue=""
              onChange={event => {
                const modelId = event.target.value.trim();
                if (!modelId) {
                  return;
                }
                assignInferredModels(file.id, [modelId], true);
                event.target.value = '';
              }}
            >
              <option value="">Assign to model…</option>
              {COMFY_IMAGE_MODELS.map(model => (
                <option key={model.id} value={model.id}>
                  {model.id}
                </option>
              ))}
            </SelectInput>
          </div>
        </div>
        <ToolActionRow>
          <Button
            type="button"
            variant={active ? 'accent-outline' : 'secondary'}
            size="sm"
            onClick={() => selectFile(file.id, displayName)}
          >
            {active ? 'Selected' : 'Use for Send'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => (isEditing ? cancelEdit() : startEdit(file))}
          >
            {isEditing ? 'Close' : 'Edit JSON'}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => removeFile(file.id)}>
            Delete
          </Button>
        </ToolActionRow>
      </div>
      {isEditing ? editPanel : null}
    </li>
  );
}
