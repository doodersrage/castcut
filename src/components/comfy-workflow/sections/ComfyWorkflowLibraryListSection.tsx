'use client';

import { workflowFileDisplayName } from '@/lib/comfyui-workflow-files';
import { inferModelsFromWorkflowLabel } from '@/lib/workflow-category-defaults';
import type { ComfyWorkflowFile } from '@/lib/comfyui-workflow-files';
import type { ComfyWorkflowLibraryViewModel } from '@/hooks/useComfyWorkflowLibrary';
import { EmptyState } from '@/components/ui/ViewState';
import { useEffect, useMemo, useState } from 'react';
import { SETTINGS_CACHE_UPDATED_EVENT, loadSettingsCache } from '@/lib/settings-cache';
import { readCachedComfyObjectInfoModels } from '@/lib/comfyui-object-info-cache';
import { isWorkflowFileUnused, workflowLibraryUsage } from '@/lib/workflow-library-usage';
import { ComfyWorkflowServerListSection } from '@/components/comfy-workflow/sections/ComfyWorkflowServerListSection';
import {
  ComfyWorkflowEditPanel,
  ComfyWorkflowImportedRow,
} from '@/components/comfy-workflow/sections/ComfyWorkflowImportedListSection';

type Props = ComfyWorkflowLibraryViewModel;

export function ComfyWorkflowLibraryListSection(props: Props) {
  const {
    placeholderTokens,
    files,
    serverFiles,
    selectedId,
    editingId,
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
    selectFile,
    startEdit,
    persistEditingTokens,
    assignInferredModels,
    cancelEdit,
    saveEdit,
    optimizeAndSaveCopy,
    previewOptimizeCopy,
    optimizePreviewSummary,
    cloneAndBindWorkflow,
    removeFile,
    copyBindingHints,
    applyBindings,
  } = props;

  // What each file is for: pins, the Send selection, and system-workflow auto picks.
  // Pins change from the map table and health remaps, not only from this list.
  const [settingsTick, setSettingsTick] = useState(0);
  useEffect(() => {
    const signature = () => {
      const shared = loadSettingsCache().shared;
      return JSON.stringify([shared.modelWorkflowMap ?? {}, shared.useSystemWorkflows === true]);
    };
    let last = signature();
    const bump = () => {
      const next = signature();
      if (next === last) return;
      last = next;
      setSettingsTick(tick => tick + 1);
    };
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, bump);
    return () => window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, bump);
  }, []);
  const usage = useMemo(() => {
    void settingsTick;
    const shared = loadSettingsCache().shared;
    return workflowLibraryUsage({
      files,
      shared: {
        modelWorkflowMap: shared.modelWorkflowMap,
        useSystemWorkflows: shared.useSystemWorkflows,
        selectedWorkflowFileId: selectedId ?? undefined,
      },
      inventory: readCachedComfyObjectInfoModels(),
    });
  }, [files, selectedId, settingsTick]);
  const unusedCount = files.filter(file => isWorkflowFileUnused(usage.get(file.id))).length;

  return (
    <>
      <ComfyWorkflowServerListSection
        serverFiles={serverFiles}
        selectedId={selectedId ?? null}
        selectFile={selectFile}
      />

      <div className="space-y-2">
        <p className="type-overline">
          Imported workflow files ({files.length})
          {unusedCount > 0 ? (
            <span
              className="ml-2 normal-case tracking-normal text-[var(--text-muted)]"
              data-testid="workflow-library-unused-count"
            >
              · {unusedCount} unused (not pinned, selected, or auto-picked)
            </span>
          ) : null}
        </p>
        {files.length === 0 ? (
          <EmptyState
            branded
            icon="catalog"
            title="No workflow files yet"
            description="Export workflows from ComfyUI (Save → API format) and import them here to bind tokens and queue from Studio tools."
          />
        ) : (
          <ul className="ui-list">
            {files.map((file: ComfyWorkflowFile) => {
              const active = selectedId === file.id;
              const isEditing = editingId === file.id;
              const displayName = workflowFileDisplayName(file);
              const inferredModels = inferModelsFromWorkflowLabel({
                name: file.name,
                filename: file.filename,
              });
              return (
                <ComfyWorkflowImportedRow
                  key={file.id}
                  file={file}
                  active={active}
                  isEditing={isEditing}
                  displayName={displayName}
                  inferredModels={inferredModels}
                  usage={usage.get(file.id)}
                  selectFile={selectFile}
                  startEdit={startEdit}
                  cancelEdit={cancelEdit}
                  removeFile={removeFile}
                  assignInferredModels={assignInferredModels}
                  editPanel={
                    <ComfyWorkflowEditPanel
                      file={file}
                      displayName={displayName}
                      placeholderTokens={placeholderTokens}
                      editingName={editingName}
                      setEditingName={setEditingName}
                      editingJson={editingJson}
                      setEditingJson={setEditingJson}
                      editingTokens={editingTokens}
                      editError={editError}
                      setEditError={setEditError}
                      bindingPreview={bindingPreview}
                      editingValidation={editingValidation}
                      editingNodeMappings={editingNodeMappings}
                      editingGraphInspect={editingGraphInspect}
                      persistEditingTokens={persistEditingTokens}
                      cancelEdit={cancelEdit}
                      saveEdit={saveEdit}
                      optimizeAndSaveCopy={optimizeAndSaveCopy}
                      previewOptimizeCopy={previewOptimizeCopy}
                      optimizePreviewSummary={optimizePreviewSummary}
                      cloneAndBindWorkflow={cloneAndBindWorkflow}
                      copyBindingHints={copyBindingHints}
                      applyBindings={applyBindings}
                    />
                  }
                />
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Server env: set <code className="ui-inline-code">COMFYUI_WORKFLOW_DIR</code> or{' '}
        <code className="ui-inline-code">COMFYUI_WORKFLOW_PATHS</code> to expose additional JSON
        files from disk.
      </p>
    </>
  );
}
