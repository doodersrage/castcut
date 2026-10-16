import { comfyUiSettingsToRuntime, loadComfyUiSettings } from './comfyui-settings';
import { stripEmptyComfyUiRuntime, type ComfyUiRuntimeConfig } from './comfyui-config';
import { findComfyWorkflowFile, mergeCustomWorkflowTokens } from './comfyui-workflow-files';
import { loadSettingsCache, saveSharedSettings } from './settings-cache';

const SERVER_WORKFLOW_PREFIX = 'server:';

export function getSelectedWorkflowFileId(): string | undefined {
  const shared = loadSettingsCache().shared;
  return shared.selectedWorkflowFileId ?? shared.selectedWorkflowPresetId;
}

export function resolveSelectedWorkflowRuntime(
  fileId?: string | null
): ComfyUiRuntimeConfig | undefined {
  const settings = loadComfyUiSettings();
  const id = fileId === undefined ? getSelectedWorkflowFileId() : fileId;
  const baseRuntime = comfyUiSettingsToRuntime(settings);

  if (!id) {
    return baseRuntime;
  }

  if (id.startsWith(SERVER_WORKFLOW_PREFIX)) {
    return stripEmptyComfyUiRuntime({
      ...(baseRuntime ?? {}),
      workflowFileId: id.slice(SERVER_WORKFLOW_PREFIX.length),
    });
  }

  const file = findComfyWorkflowFile(id);
  if (!file) {
    return baseRuntime;
  }

  const workflowCustomTokens = file.customTokens ?? [];
  const customTokens = mergeCustomWorkflowTokens(baseRuntime?.customTokens, workflowCustomTokens);

  return stripEmptyComfyUiRuntime({
    ...(baseRuntime ?? {}),
    workflowJson: file.workflowJson,
    workflowOptimizedHash: file.lastOptimizedHash,
    workflowOptimizedModel: file.lastOptimizedModel,
    workflowOptimizedProfile: file.lastOptimizedProfile,
    customTokens: customTokens.length > 0 ? customTokens : undefined,
    workflowCustomTokens: workflowCustomTokens.length > 0 ? workflowCustomTokens : undefined,
  });
}

/** @deprecated Use resolveSelectedWorkflowRuntime */
export function resolveComfyUiRuntime(fileId?: string | null) {
  return resolveSelectedWorkflowRuntime(fileId);
}

export function clearSelectedWorkflowFileIfDeleted(deletedId: string): void {
  const cache = loadSettingsCache();
  const selected = cache.shared.selectedWorkflowFileId ?? cache.shared.selectedWorkflowPresetId;
  if (selected === deletedId) {
    saveSharedSettings({
      ...cache.shared,
      selectedWorkflowFileId: undefined,
      selectedWorkflowPresetId: undefined,
    });
  }
}

export function setSelectedWorkflowFileId(fileId: string | undefined): void {
  const cache = loadSettingsCache();
  saveSharedSettings({
    ...cache.shared,
    selectedWorkflowFileId: fileId,
    selectedWorkflowPresetId: undefined,
  });
}

export { SERVER_WORKFLOW_PREFIX };
