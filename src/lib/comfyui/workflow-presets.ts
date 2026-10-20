import type { WorkflowParamValues, CustomWorkflowToken } from './config';
import { DEFAULT_NEGATIVE_TOKEN, DEFAULT_POSITIVE_TOKEN } from './config';
import { readBrowserValue, writeBrowserValue } from '../storage/browser-storage';

export const COMFY_WORKFLOW_PRESETS_KEY = 'comfyui-workflow-presets-v1';

export type ComfyWorkflowPreset = {
  id: string;
  name: string;
  createdAt: number;
  apiUrl?: string;
  workflowJson: string;
  positiveToken?: string;
  negativeToken?: string;
  queueParams?: WorkflowParamValues;
  customTokens?: CustomWorkflowToken[];
};

export function loadComfyWorkflowPresets(): ComfyWorkflowPreset[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return readBrowserValue<ComfyWorkflowPreset[]>(COMFY_WORKFLOW_PRESETS_KEY) ?? [];
  } catch {
    return [];
  }
}

export function saveComfyWorkflowPresets(presets: ComfyWorkflowPreset[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  writeBrowserValue(COMFY_WORKFLOW_PRESETS_KEY, presets);
}

export function upsertComfyWorkflowPreset(
  preset: Omit<ComfyWorkflowPreset, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  }
): ComfyWorkflowPreset {
  const next: ComfyWorkflowPreset = {
    id: preset.id ?? crypto.randomUUID(),
    createdAt: preset.createdAt ?? Date.now(),
    name: preset.name.trim(),
    apiUrl: preset.apiUrl?.trim() || undefined,
    workflowJson: preset.workflowJson.trim(),
    positiveToken: preset.positiveToken?.trim() || DEFAULT_POSITIVE_TOKEN,
    negativeToken: preset.negativeToken?.trim() || DEFAULT_NEGATIVE_TOKEN,
    queueParams: preset.queueParams,
    customTokens: preset.customTokens,
  };

  const presets = loadComfyWorkflowPresets();
  const index = presets.findIndex(entry => entry.id === next.id);
  if (index >= 0) {
    presets[index] = next;
  } else {
    presets.unshift(next);
  }

  saveComfyWorkflowPresets(presets.slice(0, 24));
  return next;
}

export function findComfyWorkflowPreset(id: string): ComfyWorkflowPreset | undefined {
  return loadComfyWorkflowPresets().find(entry => entry.id === id);
}

export function deleteComfyWorkflowPreset(id: string): void {
  saveComfyWorkflowPresets(loadComfyWorkflowPresets().filter(entry => entry.id !== id));
}
