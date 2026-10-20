import type { ComfyImageModel } from '../comfy-models/client';
import type { ComfyWorkflowFile } from '../comfyui/workflow-files';
import { inferModelsFromWorkflowLabel } from './category-defaults';
import type { ModelWorkflowMap } from '../model-workflow-map';
import { loadSettingsCache } from '../settings-cache';

/** Pick the best model id to run optimize/enrich heuristics for a library workflow file. */
export function resolveOptimizeModelForWorkflowFile(
  file: Pick<ComfyWorkflowFile, 'id' | 'name' | 'filename'>,
  fallbackModel?: string,
  modelWorkflowMap?: ModelWorkflowMap
): ComfyImageModel | string {
  const map = modelWorkflowMap ?? loadSettingsCache().shared.modelWorkflowMap ?? {};
  const assignedModels = Object.entries(map)
    .filter(([, workflowId]) => workflowId === file.id)
    .map(([modelId]) => modelId);

  if (assignedModels.length > 0) {
    return assignedModels[0]!;
  }

  const inferred = inferModelsFromWorkflowLabel({
    name: file.name,
    filename: file.filename,
  });
  if (inferred.length > 0) {
    return inferred[0]!;
  }

  return fallbackModel ?? loadSettingsCache().shared.model;
}
