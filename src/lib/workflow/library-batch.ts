import type { WorkflowPlaceholderTokens } from '../comfyui/config';
import {
  loadComfyWorkflowFiles,
  upsertComfyWorkflowFile,
  type ComfyWorkflowFile,
} from '../comfyui/workflow-files';
import { loadSettingsCache } from '../settings-cache';
import { resolveQueueParams } from '../queue-params-settings';
import { optimizeWorkflowForQueue } from './queue-optimizer';
import { resolveOptimizeModelForWorkflowFile } from './optimize-model';
import { normalizeQueueQualityProfile } from '../queue-quality-profile';

export type OptimizeAllWorkflowsResult = {
  updated: number;
  skipped: number;
  warnings: string[];
  files: ComfyWorkflowFile[];
  modelsUsed: string[];
};

export type OptimizeWorkflowFileResult = {
  ok: boolean;
  file?: ComfyWorkflowFile;
  message: string;
};

function optimizeWorkflowFileRecord(input: {
  file: ComfyWorkflowFile;
  tokens: WorkflowPlaceholderTokens;
  fallbackModel: string;
  perWorkflowModel: boolean;
  modelWorkflowMap?: import('../model-workflow-map').ModelWorkflowMap;
  queueQualityProfile?: import('../queue-quality-profile').QueueQualityProfile;
  workflowSdxlRefinerEnrich?: boolean;
  workflowNeuralUpscalePolish?: boolean;
  workflowSharpenAfterUpscale?: boolean;
}): {
  file: ComfyWorkflowFile;
  updated: boolean;
  skipped: boolean;
  warning?: string;
  optimizeModel: string;
} {
  const sourceJson = input.file.workflowJson.trim();
  if (!sourceJson) {
    return {
      file: input.file,
      updated: false,
      skipped: true,
      warning: `Skipped “${input.file.name}” — empty JSON.`,
      optimizeModel: input.fallbackModel,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(sourceJson) as Record<string, unknown>;
  } catch {
    return {
      file: input.file,
      updated: false,
      skipped: true,
      warning: `Skipped “${input.file.name}” — invalid JSON.`,
      optimizeModel: input.fallbackModel,
    };
  }

  const optimizeModel =
    input.perWorkflowModel === false
      ? input.fallbackModel
      : resolveOptimizeModelForWorkflowFile(
          input.file,
          input.fallbackModel,
          input.modelWorkflowMap
        );

  const queueParams = resolveQueueParams({
    model: optimizeModel,
    qualityProfile: input.queueQualityProfile,
  });

  const result = optimizeWorkflowForQueue({
    workflow: parsed,
    tokens: input.tokens,
    model: optimizeModel,
    qualityProfile: input.queueQualityProfile,
    upscaleModelFilename: queueParams.upscaleModelFilename,
    refinerCheckpointFilename: queueParams.refinerCheckpointFilename,
    enrichSdxlRefiner: input.workflowSdxlRefinerEnrich !== false,
    enrichNeuralPolish: input.workflowNeuralUpscalePolish !== false,
    enrichSharpen: input.workflowSharpenAfterUpscale === true,
  });

  const nextJson = result.workflowJson;
  if (nextJson === sourceJson && result.bindingChanges.length === 0) {
    return {
      file: input.file,
      updated: false,
      skipped: true,
      optimizeModel: String(optimizeModel),
    };
  }

  const saved = upsertComfyWorkflowFile({
    id: input.file.id,
    createdAt: input.file.createdAt,
    name: input.file.name,
    filename: input.file.filename,
    workflowJson: nextJson,
    customTokens: input.file.customTokens,
    lastOptimizedAt: Date.now(),
    lastOptimizedHash: result.contentHash,
    lastOptimizedModel: String(optimizeModel),
    lastOptimizedProfile: normalizeQueueQualityProfile(input.queueQualityProfile),
  });

  const warning =
    result.audit.warnings.length > 0
      ? `“${input.file.name}” (${optimizeModel}): ${result.audit.warnings.length} review note(s) after optimize.`
      : undefined;

  return {
    file: saved,
    updated: true,
    skipped: false,
    warning,
    optimizeModel: String(optimizeModel),
  };
}

export function optimizeWorkflowFileInLibrary(input: {
  fileId: string;
  tokens: WorkflowPlaceholderTokens;
  model?: string;
}): OptimizeWorkflowFileResult {
  const shared = loadSettingsCache().shared;
  const fallbackModel = input.model ?? shared.model;
  const file = loadComfyWorkflowFiles().find(entry => entry.id === input.fileId);
  if (!file) {
    return { ok: false, message: 'Workflow not found in library.' };
  }

  const outcome = optimizeWorkflowFileRecord({
    file,
    tokens: input.tokens,
    fallbackModel,
    perWorkflowModel: true,
    modelWorkflowMap: shared.modelWorkflowMap,
    queueQualityProfile: shared.queueQualityProfile,
    workflowSdxlRefinerEnrich: shared.workflowSdxlRefinerEnrich,
    workflowNeuralUpscalePolish: shared.workflowNeuralUpscalePolish,
    workflowSharpenAfterUpscale: shared.workflowSharpenAfterUpscale,
  });

  if (outcome.skipped && !outcome.updated) {
    return {
      ok: true,
      file: outcome.file,
      message:
        outcome.warning ??
        `“${file.name}” unchanged — already optimized for ${outcome.optimizeModel}.`,
    };
  }

  return {
    ok: true,
    file: outcome.file,
    message: `Optimized “${file.name}” for ${outcome.optimizeModel}.${outcome.warning ? ` ${outcome.warning}` : ''}`,
  };
}

export function optimizeAllWorkflowsInLibrary(input: {
  tokens: WorkflowPlaceholderTokens;
  model?: string;
  /** When true (default), optimize each file with its inferred/assigned model. */
  perWorkflowModel?: boolean;
}): OptimizeAllWorkflowsResult {
  const shared = loadSettingsCache().shared;
  const fallbackModel = input.model ?? shared.model;
  const files = loadComfyWorkflowFiles();
  const warnings: string[] = [];
  let updated = 0;
  let skipped = 0;
  const saved: ComfyWorkflowFile[] = [];
  const modelsUsed = new Set<string>();

  for (const file of files) {
    const outcome = optimizeWorkflowFileRecord({
      file,
      tokens: input.tokens,
      fallbackModel,
      perWorkflowModel: input.perWorkflowModel !== false,
      modelWorkflowMap: shared.modelWorkflowMap,
      queueQualityProfile: shared.queueQualityProfile,
      workflowSdxlRefinerEnrich: shared.workflowSdxlRefinerEnrich,
      workflowNeuralUpscalePolish: shared.workflowNeuralUpscalePolish,
      workflowSharpenAfterUpscale: shared.workflowSharpenAfterUpscale,
    });

    modelsUsed.add(outcome.optimizeModel);
    saved.push(outcome.file);

    if (outcome.updated) {
      updated += 1;
    } else if (outcome.skipped) {
      skipped += 1;
    }

    if (outcome.warning) {
      warnings.push(outcome.warning);
    }
  }

  return {
    updated,
    skipped,
    warnings,
    files: saved,
    modelsUsed: [...modelsUsed],
  };
}
