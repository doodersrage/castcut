import type { ComfyImageModel } from './comfy-models/client';
import { COMFY_IMAGE_MODELS } from './comfy-models/client';
import type { ComfyWorkflowFile } from './comfyui-workflow-files';
import {
  suggestWorkflowDefaultsByCategory,
  workflowRequiresInputImage,
  rankWorkflowFilesForModel,
  workflowLabelImpliesLightning,
} from './workflow-category-defaults';
import type { SharedToolSettings } from './settings-cache';
import { isEditQueueTool } from './model-denoise-defaults';
import { isQwenLightningModel } from './model-sampling-patch';
import { workflowGraphIsVideo } from './workflow-graph-kind';

export type ModelWorkflowMap = Record<string, string>;

const ALL_MODELS = COMFY_IMAGE_MODELS.map(entry => entry.id);

/** When any member is available, keep sibling presets selectable (e.g. vanilla + Lightning). */
export const MODEL_FAMILY_GROUPS: readonly (readonly ComfyImageModel[])[] = [
  ['qwen-image-2512', 'qwen-image-2512-lightning-4', 'qwen-image-2512-lightning-8'],
  ['qwen-image-edit-2511', 'qwen-image-edit-2511-lightning-4', 'qwen-image-edit-2511-lightning-8'],
  ['qwen-rapid-aio-edit', 'qwen-rapid-aio-edit-nsfw', 'qwen-rapid-aio-sfw', 'qwen-rapid-aio-nsfw'],
  [
    'flux-2-klein',
    'flux-2-klein-4b-distilled',
    'flux-2-klein-9b',
    'flux-2-klein-9b-distilled',
    'flux-2-klein-9b-kv',
  ],
  ['flux-dev', 'flux-ultrareal-v4'],
  ['z-image', 'z-image-turbo'],
  ['boogu-image', 'boogu-image-turbo'],
  ['boogu-image-edit', 'boogu-image-edit-turbo'],
  ['wan-video', 'wan-video-rapid-aio', 'wan-video-lightning-4'],
  ['hunyuan-video', 'hunyuan-video-1.5'],
  ['ltx-video', 'ltx-video-2'],
  ['sd3-medium', 'sd3-large', 'sd3.5-large', 'auraflow'],
  ['sdxl', 'sdxl-refiner', 'ssd-1b', 'segmind-vega'],
  ['hidream', 'hidream-o1'],
  ['pixart-alpha', 'pixart-sigma'],
  ['lumina2'],
  ['sd15-instruct-pix2pix', 'sdxl-instruct-pix2pix'],
];

/** Sibling presets in the same family (vanilla + Lightning, Rapid AIO, Klein, …). */
export function modelsInSameFamily(model: ComfyImageModel | string): ComfyImageModel[] {
  const id = String(model).trim() as ComfyImageModel;
  for (const family of MODEL_FAMILY_GROUPS) {
    if (family.includes(id)) {
      return [...family];
    }
  }
  return ALL_MODELS.includes(id) ? [id] : [];
}

function expandSupportedModelFamilies(supported: Set<ComfyImageModel>): void {
  for (const family of MODEL_FAMILY_GROUPS) {
    if (!family.some(id => supported.has(id))) {
      continue;
    }
    for (const id of family) {
      if (ALL_MODELS.includes(id)) {
        supported.add(id);
      }
    }
  }
}

export type SupportedModelsSource =
  'disabled' | 'override' | 'available_workflows' | 'empty_fallback';

export function resolveWorkflowForModel(
  model: ComfyImageModel,
  map?: ModelWorkflowMap
): string | undefined {
  if (!map) {
    return undefined;
  }

  return map[model]?.trim() || undefined;
}

/** Explicit map entry first, then filename-based default for the model family. */
export function resolveWorkflowForModelSelection(
  model: ComfyImageModel,
  options?: {
    map?: ModelWorkflowMap;
    workflowFiles?: Array<
      Pick<ComfyWorkflowFile, 'id' | 'name' | 'filename'> &
        Partial<Pick<ComfyWorkflowFile, 'workflowJson'>>
    >;
    /** Precomputed from suggestWorkflowDefaultsByCategory to avoid repeat work. */
    suggestedMap?: ModelWorkflowMap;
    /** When set to a generate-style tool, skips edit/inpaint workflows that need {{INPUT_IMAGE}}. */
    tool?: string;
  }
): string | undefined {
  const editTool = isEditQueueTool(options?.tool);
  const videoTool = options?.tool === 'video';
  const files = (options?.workflowFiles ?? []) as ComfyWorkflowFile[];
  const fileById = new Map(files.map(file => [file.id, file]));

  const acceptWorkflow = (workflowId?: string): string | undefined => {
    const id = workflowId?.trim();
    if (!id) {
      return undefined;
    }
    const file = fileById.get(id);
    if (videoTool && file?.workflowJson && !workflowGraphIsVideo(file.workflowJson)) {
      return undefined;
    }
    if (!file || editTool || !workflowRequiresInputImage(file.workflowJson)) {
      return id;
    }
    return undefined;
  };

  const ranked = files.length
    ? rankWorkflowFilesForModel(model, files).filter(entry => {
        if (!editTool && workflowRequiresInputImage(entry.file.workflowJson)) {
          return false;
        }
        if (videoTool && !workflowGraphIsVideo(entry.file.workflowJson)) {
          return false;
        }
        return true;
      })
    : [];
  const bestRankedId = ranked[0]?.file.id;

  const fromMap = acceptWorkflow(resolveWorkflowForModel(model, options?.map));
  if (fromMap) {
    const mappedFile = fileById.get(fromMap);
    const bestFile = bestRankedId ? fileById.get(bestRankedId) : undefined;
    // Stale map from a bad "Suggested: qwen-image-2512" assign: Lightning model
    // pinned to a non-Lightning-labeled file while a Lightning workflow exists.
    if (
      mappedFile &&
      bestFile &&
      bestRankedId &&
      bestRankedId !== fromMap &&
      isQwenLightningModel(model) &&
      !workflowLabelImpliesLightning(mappedFile) &&
      workflowLabelImpliesLightning(bestFile)
    ) {
      return bestRankedId;
    }
    // Same stale pattern when vanilla + Lightning share one map id and a
    // better Lightning-specific file ranks higher for this Lightning model.
    if (
      mappedFile &&
      bestFile &&
      bestRankedId &&
      bestRankedId !== fromMap &&
      isQwenLightningModel(model) &&
      workflowLabelImpliesLightning(bestFile) &&
      (ranked[0]?.score ?? 0) >= (rankWorkflowFilesForModel(model, [mappedFile])[0]?.score ?? 0) + 4
    ) {
      return bestRankedId;
    }
    return fromMap;
  }

  const suggested =
    options?.suggestedMap ??
    (files.length > 0 ? suggestWorkflowDefaultsByCategory(files) : undefined);
  const fromSuggested = acceptWorkflow(suggested?.[model]);
  if (fromSuggested) {
    return fromSuggested;
  }

  return bestRankedId;
}

export function suggestWorkflowMapForFiles(
  workflowFiles?: Array<Pick<ComfyWorkflowFile, 'id' | 'name' | 'filename'>>
): ModelWorkflowMap {
  if (!workflowFiles?.length) {
    return {};
  }
  return suggestWorkflowDefaultsByCategory(workflowFiles as ComfyWorkflowFile[]);
}

/** Assign one workflow file id to specific models (skips existing unless overwrite). */
export function assignWorkflowToInferredModels(
  workflowFileId: string,
  models: Array<ComfyImageModel | string>,
  currentMap?: ModelWorkflowMap,
  overwrite = false
): ModelWorkflowMap {
  const workflowId = workflowFileId.trim();
  if (!workflowId || models.length === 0) {
    return { ...(currentMap ?? {}) };
  }

  const next: ModelWorkflowMap = { ...(currentMap ?? {}) };
  for (const model of models) {
    const modelId = model.trim();
    if (!modelId) {
      continue;
    }
    if (overwrite || !next[modelId]?.trim()) {
      next[modelId] = workflowId;
    }
  }
  return next;
}

export function patchSharedForModelChange(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  workflowFiles?: Array<Pick<ComfyWorkflowFile, 'id' | 'name' | 'filename'>>
): Partial<SharedToolSettings> {
  const patch: Partial<SharedToolSettings> = { model };
  const workflowId = resolveWorkflowForModelSelection(model, {
    map: shared.modelWorkflowMap,
    workflowFiles,
  });
  if (workflowId) {
    patch.selectedWorkflowFileId = workflowId;
  }
  return patch;
}

/** Models that have a resolvable workflow from the map and/or imported workflow files. */
export function modelsSupportedByAvailableWorkflows(input: {
  map?: ModelWorkflowMap;
  workflowFiles?: Array<Pick<ComfyWorkflowFile, 'id' | 'name' | 'filename'>>;
  suggestedMap?: ModelWorkflowMap;
  currentModel: ComfyImageModel;
  limitEnabled?: boolean;
  showAllOverride?: boolean;
}): { models: ComfyImageModel[]; source: SupportedModelsSource } {
  if (input.showAllOverride) {
    return { models: ALL_MODELS, source: 'override' };
  }

  if (input.limitEnabled === false) {
    return { models: ALL_MODELS, source: 'disabled' };
  }

  const files = input.workflowFiles ?? [];
  const availableWorkflowIds = new Set(files.map(file => file.id.trim()).filter(Boolean));
  const supported = new Set<ComfyImageModel>();

  const suggested =
    input.suggestedMap ??
    (files.length > 0 ? suggestWorkflowDefaultsByCategory(files as ComfyWorkflowFile[]) : {});

  if (files.length > 0) {
    for (const modelId of Object.keys(suggested)) {
      if (ALL_MODELS.includes(modelId as ComfyImageModel)) {
        supported.add(modelId as ComfyImageModel);
      }
    }
  }

  if (input.map) {
    for (const [modelId, workflowId] of Object.entries(input.map)) {
      const normalizedWorkflowId = workflowId?.trim();
      if (!normalizedWorkflowId || !ALL_MODELS.includes(modelId as ComfyImageModel)) {
        continue;
      }
      if (availableWorkflowIds.size === 0 || availableWorkflowIds.has(normalizedWorkflowId)) {
        supported.add(modelId as ComfyImageModel);
      }
    }
  }

  if (supported.size === 0) {
    const noCatalog = files.length === 0 && !input.map;
    return { models: ALL_MODELS, source: noCatalog ? 'disabled' : 'empty_fallback' };
  }

  expandSupportedModelFamilies(supported);

  const models = [...supported];
  if (!models.includes(input.currentModel)) {
    models.unshift(input.currentModel);
  }

  return { models, source: 'available_workflows' };
}

export function supportedModelsFilterHint(
  source: SupportedModelsSource,
  visibleCount: number
): string | null {
  switch (source) {
    case 'available_workflows':
      return `Showing ${visibleCount} model${visibleCount === 1 ? '' : 's'} with a workflow in your library or assignment map.`;
    case 'empty_fallback':
      return 'No workflow-to-model matches found — showing all models.';
    case 'override':
      return 'Showing all models (manual override).';
    default:
      return null;
  }
}
