import type { ComfyUiModelLists } from '../comfyui/object-info';
import {
  isFilenameInUnetLoaderList,
  unetLoaderPlacementMessage,
} from './loader-map-inventory-sync';

export type WorkflowLoaderFilenameIssue = {
  severity: 'error' | 'warn';
  message: string;
};

const PLACEHOLDER_PATTERN = /^\{\{[A-Z0-9_]+\}\}$/;

const CHECKPOINT_LOADER_TYPES = new Set(['CheckpointLoaderSimple', 'CheckpointLoader']);
const UNET_LOADER_TYPES = new Set(['UNETLoader', 'UnetLoaderGGUF']);
const LORA_LOADER_TYPES = new Set([
  'LoraLoader',
  'LoraLoaderModelOnly',
  'Power Lora Loader (rgthree)',
]);
const CONTROLNET_LOADER_TYPES = new Set(['ControlNetLoader', 'DiffControlNetLoader']);

function filenameInList(filename: string, list: string[]): boolean {
  const trimmed = filename.trim();
  return Boolean(trimmed && list.length > 0 && list.includes(trimmed));
}

function isBindablePlaceholder(value: string): boolean {
  return PLACEHOLDER_PATTERN.test(value.trim());
}

function auditFilenameField(
  issues: WorkflowLoaderFilenameIssue[],
  input: {
    label: string;
    filename: string;
    list: string[];
    fallbackList?: string[];
  }
): void {
  const trimmed = input.filename.trim();
  if (!trimmed || isBindablePlaceholder(trimmed)) {
    return;
  }
  if (input.list.length === 0 && (!input.fallbackList || input.fallbackList.length === 0)) {
    return;
  }
  const found =
    filenameInList(trimmed, input.list) ||
    (input.fallbackList ? filenameInList(trimmed, input.fallbackList) : false);
  if (!found) {
    issues.push({
      severity: 'error',
      message: `${input.label} “${trimmed}” not found in ComfyUI — update the workflow or run Optimize all.`,
    });
  }
}

export function auditLoaderFilenamesInWorkflow(input: {
  workflowJson?: string;
  workflow?: Record<string, unknown> | null;
  models: ComfyUiModelLists;
}): WorkflowLoaderFilenameIssue[] {
  let workflow = input.workflow ?? null;
  if (!workflow) {
    if (!input.workflowJson?.trim()) {
      return [];
    }
    try {
      workflow = JSON.parse(input.workflowJson) as Record<string, unknown>;
    } catch {
      return [];
    }
  }

  const issues: WorkflowLoaderFilenameIssue[] = [];

  for (const node of Object.values(workflow)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    const classType = record.class_type ?? '';
    const inputs = record.inputs;
    if (!inputs) {
      continue;
    }

    if (CHECKPOINT_LOADER_TYPES.has(classType) && typeof inputs.ckpt_name === 'string') {
      auditFilenameField(issues, {
        label: 'Checkpoint',
        filename: inputs.ckpt_name,
        list: input.models.checkpoints,
      });
    }

    if (UNET_LOADER_TYPES.has(classType) && typeof inputs.unet_name === 'string') {
      const unetName = inputs.unet_name.trim();
      if (unetName && !isBindablePlaceholder(unetName)) {
        if (!isFilenameInUnetLoaderList(unetName, input.models.unets)) {
          const placement = unetLoaderPlacementMessage(unetName, input.models);
          issues.push({
            severity: 'error',
            message:
              placement ??
              `UNET “${unetName}” not found in ComfyUI — update the workflow or run Optimize all.`,
          });
        }
      }
    }

    if (classType === 'VAELoader' && typeof inputs.vae_name === 'string') {
      auditFilenameField(issues, {
        label: 'VAE',
        filename: inputs.vae_name,
        list: input.models.vaes,
      });
    }

    if (
      (classType === 'UpscaleModelLoader' || classType === 'UpscaleModel') &&
      typeof inputs.model_name === 'string'
    ) {
      auditFilenameField(issues, {
        label: 'Upscale model',
        filename: inputs.model_name,
        list: input.models.upscaleModels,
      });
    }

    if (LORA_LOADER_TYPES.has(classType) && typeof inputs.lora_name === 'string') {
      auditFilenameField(issues, {
        label: 'LoRA',
        filename: inputs.lora_name,
        list: input.models.loras,
      });
    }

    if (CONTROLNET_LOADER_TYPES.has(classType) && typeof inputs.control_net_name === 'string') {
      auditFilenameField(issues, {
        label: 'ControlNet',
        filename: inputs.control_net_name,
        list: input.models.controlNets,
      });
    }

    if (classType === 'DualCLIPLoader') {
      for (const field of ['clip_name1', 'clip_name2'] as const) {
        const filename = typeof inputs[field] === 'string' ? inputs[field] : '';
        if (filename) {
          auditFilenameField(issues, {
            label: `DualCLIPLoader ${field}`,
            filename,
            list: input.models.clips,
          });
        }
      }
    }

    if (classType === 'CLIPLoader' && typeof inputs.clip_name === 'string') {
      auditFilenameField(issues, {
        label: 'CLIPLoader clip_name',
        filename: inputs.clip_name,
        list: input.models.clips,
      });
    }
  }

  return issues;
}
