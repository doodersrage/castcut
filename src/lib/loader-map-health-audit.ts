import { getComfyModelDefinition } from './comfy-models';
import type { ComfyUiModelLists } from './comfyui-object-info';
import { buildLoraFilenameMapFromCustomTokens } from './workflow-lora-patch';
import {
  isFilenameInUnetLoaderList,
  matchInventoryFilename,
  unetLoaderPlacementMessage,
} from './loader-map-inventory-sync';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import { SUGGESTED_MODEL_CHECKPOINT_MAP } from './model-checkpoint-map';
import type { WorkflowHealthIssue } from './workflow-health-audit';

function modelUsesUnetLoaderGraph(model: string): boolean {
  if (isQwenRapidAioModel(model)) {
    return false;
  }
  const def = getComfyModelDefinition(model);
  if (!def) {
    return false;
  }
  return def.category === 'flux' || def.category === 'qwen' || def.category === 'sd3';
}

function filenameInList(filename: string, list: string[]): boolean {
  const trimmed = filename.trim();
  if (!trimmed || list.length === 0) {
    return false;
  }
  return Boolean(matchInventoryFilename(trimmed, list) ?? list.includes(trimmed));
}

function isSuggestedCheckpointDefault(model: string, filename: string): boolean {
  const suggested = SUGGESTED_MODEL_CHECKPOINT_MAP[model]?.trim();
  return Boolean(suggested && suggested === filename.trim());
}

export function auditLoaderMapsAgainstComfyUi(input: {
  checkpointMap: Partial<Record<string, string>>;
  vaeMap: Partial<Record<string, string>>;
  upscaleMap: Partial<Record<string, string>>;
  controlNetMap?: Partial<Record<string, string>>;
  customTokens?: Array<{ token: string; value: string }>;
  models: ComfyUiModelLists;
}): WorkflowHealthIssue[] {
  const issues: WorkflowHealthIssue[] = [];
  // Families you never installed keep their curated default file name — one note for all.
  const notInstalled: string[] = [];
  const canValidateCheckpoints =
    input.models.checkpoints.length > 0 || input.models.unets.length > 0;

  for (const [model, filename] of Object.entries(input.checkpointMap)) {
    if (!filename?.trim() || !canValidateCheckpoints) {
      continue;
    }
    const inCheckpoint = filenameInList(filename, input.models.checkpoints);
    const inUnet = isFilenameInUnetLoaderList(filename, input.models.unets);
    if (inUnet) {
      continue;
    }
    if (!inCheckpoint && isSuggestedCheckpointDefault(model, filename)) {
      notInstalled.push(model);
      continue;
    }
    if (modelUsesUnetLoaderGraph(model)) {
      const placement = unetLoaderPlacementMessage(filename, input.models);
      if (placement) {
        issues.push({
          workflowId: 'loader-map',
          workflowName: 'Checkpoint map',
          severity: 'error',
          message: `${model} → ${placement}`,
        });
      }
      continue;
    }
    if (!inCheckpoint) {
      issues.push({
        workflowId: 'loader-map',
        workflowName: 'Checkpoint map',
        severity: 'error',
        message: `${model} → “${filename}” not found in ComfyUI checkpoints or UNET list.`,
      });
    }
  }
  if (notInstalled.length > 0) {
    issues.push({
      workflowId: 'loader-map',
      workflowName: 'Checkpoint map',
      severity: 'warn',
      message: `${notInstalled.length} model${notInstalled.length === 1 ? '' : 's'} not installed (${notInstalled.join(', ')}) — their default files aren't in ComfyUI. Fine unless you want to use them: Settings → Models → Get models.`,
    });
  }

  for (const [model, filename] of Object.entries(input.vaeMap)) {
    if (!filename?.trim() || input.models.vaes.length === 0) {
      continue;
    }
    if (!filenameInList(filename, input.models.vaes)) {
      issues.push({
        workflowId: 'loader-map',
        workflowName: 'VAE map',
        severity: 'error',
        message: `${model} → “${filename}” not found in ComfyUI VAE list.`,
      });
    }
  }

  for (const [model, filename] of Object.entries(input.upscaleMap)) {
    if (!filename?.trim() || input.models.upscaleModels.length === 0) {
      continue;
    }
    if (!filenameInList(filename, input.models.upscaleModels)) {
      issues.push({
        workflowId: 'loader-map',
        workflowName: 'Upscale map',
        severity: 'warn',
        message: `${model} → “${filename}” not in ComfyUI upscale models — Max neural upscale falls back to Lanczos.`,
      });
    }
  }

  if (input.controlNetMap && input.models.controlNets.length > 0) {
    for (const [model, filename] of Object.entries(input.controlNetMap)) {
      if (!filename?.trim()) {
        continue;
      }
      if (!filenameInList(filename, input.models.controlNets)) {
        issues.push({
          workflowId: 'loader-map',
          workflowName: 'ControlNet map',
          severity: 'error',
          message: `${model} → “${filename}” not found in ComfyUI ControlNet list.`,
        });
      }
    }
  }

  if (input.customTokens && input.models.loras.length > 0) {
    const loraMap = buildLoraFilenameMapFromCustomTokens(input.customTokens);
    for (const [token, filename] of Object.entries(loraMap)) {
      if (!filename?.trim()) {
        continue;
      }
      if (!filenameInList(filename, input.models.loras)) {
        issues.push({
          workflowId: 'loader-map',
          workflowName: 'LoRA tokens',
          severity: 'warn',
          message: `${token} → “${filename}” not found in ComfyUI LoRA list.`,
        });
      }
    }
  }

  return issues;
}
