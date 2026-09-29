import type { CustomWorkflowToken } from './comfyui-config';
import {
  DEFAULT_CHECKPOINT_TOKEN,
  DEFAULT_UNET_TOKEN,
  DEFAULT_VAE_TOKEN,
} from './model-checkpoint-map';
import { LIGHTNING_LORA_TOKEN } from './workflow-lora-patch';
import { loadComfyWorkflowPresets, type ComfyWorkflowPreset } from './comfyui-workflow-presets';
import { readBrowserValue, writeBrowserValue } from './browser-storage';

export const COMFY_WORKFLOW_FILES_KEY = 'comfyui-workflow-files-v1';

/** Common per-workflow token slots shown in the library editor. */
export const WORKFLOW_TOKEN_FIELDS = [
  {
    token: DEFAULT_CHECKPOINT_TOKEN,
    label: 'Checkpoint',
    hint: 'Full checkpoint for CheckpointLoader (e.g. Rapid AIO).',
  },
  {
    token: DEFAULT_UNET_TOKEN,
    label: 'UNET',
    hint: 'diffusion_models UNET for UNETLoader (e.g. qwen_image_2512_bf16.safetensors).',
  },
  {
    token: DEFAULT_VAE_TOKEN,
    label: 'VAE',
    hint: 'Optional VAE filename override for this workflow.',
  },
  {
    token: LIGHTNING_LORA_TOKEN,
    label: 'Lightning LoRA',
    hint: 'LightX2V / Lightning LoRA .safetensors for {{LORA_LIGHTNING}}.',
  },
] as const;

export type ComfyWorkflowFile = {
  id: string;
  name: string;
  filename?: string;
  workflowJson: string;
  createdAt: number;
  /** Timestamp of last Optimize all / optimize copy pass. */
  lastOptimizedAt?: number;
  /** Content hash after last optimize — drift detection in health audit. */
  lastOptimizedHash?: string;
  /** Model id used for the last optimize enrich pass. */
  lastOptimizedModel?: string;
  /** Quality profile used for the last optimize enrich pass. */
  lastOptimizedProfile?: import('./queue-quality-profile').QueueQualityProfile;
  /**
   * Per-workflow token overrides ({{CHECKPOINT}}, {{LORA_LIGHTNING}}, …).
   * Beat Settings custom tokens for the same key; loader tokens also beat the
   * global model checkpoint map when this workflow is selected.
   */
  customTokens?: CustomWorkflowToken[];
};

export function normalizeWorkflowCustomTokens(
  tokens?: CustomWorkflowToken[] | null
): CustomWorkflowToken[] {
  if (!tokens?.length) {
    return [];
  }
  const byToken = new Map<string, CustomWorkflowToken>();
  for (const entry of tokens) {
    const token = entry.token?.trim() ?? '';
    const value = entry.value?.trim() ?? '';
    if (!token || !value) {
      continue;
    }
    byToken.set(token, { token, value });
  }
  return [...byToken.values()];
}

/** Later lists win on duplicate token keys. */
export function mergeCustomWorkflowTokens(
  ...lists: Array<CustomWorkflowToken[] | undefined | null>
): CustomWorkflowToken[] {
  const byToken = new Map<string, CustomWorkflowToken>();
  for (const list of lists) {
    for (const entry of normalizeWorkflowCustomTokens(list)) {
      byToken.set(entry.token, entry);
    }
  }
  return [...byToken.values()];
}

export function getWorkflowTokenValue(
  tokens: CustomWorkflowToken[] | undefined,
  token: string
): string {
  const match = normalizeWorkflowCustomTokens(tokens).find(entry => entry.token === token.trim());
  return match?.value ?? '';
}

/**
 * Pull {{LORA_LIGHTNING}} from any library workflow that already has it set —
 * used when the queued file is missing the override but another mapped file has it.
 */
export function collectLightningLoraTokenFromWorkflowLibrary(
  model?: string
): CustomWorkflowToken | undefined {
  const files = loadComfyWorkflowFiles();
  const preferred: string[] = [];
  const fallback: string[] = [];

  for (const file of files) {
    const value = getWorkflowTokenValue(file.customTokens, LIGHTNING_LORA_TOKEN).trim();
    if (!value) {
      continue;
    }
    const modelId = model?.trim().toLowerCase() ?? '';
    const modelWantsEdit = /edit/.test(modelId);
    const loraIsEdit = /edit/.test(value.toLowerCase());
    if (!modelId || modelWantsEdit === loraIsEdit) {
      preferred.push(value);
    } else {
      fallback.push(value);
    }
  }

  const value = preferred[0] ?? fallback[0];
  if (!value) {
    return undefined;
  }
  return { token: LIGHTNING_LORA_TOKEN, value };
}

export function setWorkflowTokenValue(
  tokens: CustomWorkflowToken[] | undefined,
  token: string,
  value: string
): CustomWorkflowToken[] {
  const key = token.trim();
  if (!key) {
    return normalizeWorkflowCustomTokens(tokens);
  }
  const next = normalizeWorkflowCustomTokens(tokens).filter(entry => entry.token !== key);
  const trimmed = value.trim();
  if (trimmed) {
    next.push({ token: key, value: trimmed });
  }
  return next;
}

function migratePresetsToFilesIfEmpty(): void {
  const existing = loadComfyWorkflowFilesRaw();
  if (existing.length > 0) {
    return;
  }

  const presets = loadComfyWorkflowPresets();
  if (presets.length === 0) {
    return;
  }

  saveComfyWorkflowFilesRaw(presets.map(preset => presetToWorkflowFile(preset)));
}

function loadComfyWorkflowFilesRaw(): ComfyWorkflowFile[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    return readBrowserValue<ComfyWorkflowFile[]>(COMFY_WORKFLOW_FILES_KEY) ?? [];
  } catch {
    return [];
  }
}

/** Past this many files Workflow health suggests cleaning up (large libraries slow sync). */
export const WORKFLOW_LIBRARY_LARGE_COUNT = 60;

/** Fired (same tab) after the workflow library is saved — map table, health, list refresh. */
export const COMFY_WORKFLOW_FILES_UPDATED_EVENT = 'comfy-workflow-files-updated';

function saveComfyWorkflowFilesRaw(files: ComfyWorkflowFile[]): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Never truncate: a silent slice(0, 32) here dropped the oldest workflows on the 33rd import,
  // and on restore / server pull of a larger library. Size is surfaced by Workflow health.
  writeBrowserValue(COMFY_WORKFLOW_FILES_KEY, files);
  // Test stubs of window may lack dispatchEvent.
  if (typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new Event(COMFY_WORKFLOW_FILES_UPDATED_EVENT));
  }
}

function presetToWorkflowFile(preset: ComfyWorkflowPreset): ComfyWorkflowFile {
  return {
    id: preset.id,
    name: preset.name,
    workflowJson: preset.workflowJson,
    createdAt: preset.createdAt,
    customTokens: normalizeWorkflowCustomTokens(preset.customTokens),
  };
}

export function loadComfyWorkflowFiles(): ComfyWorkflowFile[] {
  migratePresetsToFilesIfEmpty();
  return loadComfyWorkflowFilesRaw().map(file => ({
    ...file,
    customTokens: normalizeWorkflowCustomTokens(file.customTokens),
  }));
}

export function saveComfyWorkflowFiles(files: ComfyWorkflowFile[]): void {
  saveComfyWorkflowFilesRaw(
    files.map(file => ({
      ...file,
      customTokens: normalizeWorkflowCustomTokens(file.customTokens),
    }))
  );
}

export function findComfyWorkflowFile(id: string): ComfyWorkflowFile | undefined {
  return loadComfyWorkflowFiles().find(entry => entry.id === id);
}

export function upsertComfyWorkflowFile(
  file: Omit<ComfyWorkflowFile, 'id' | 'createdAt'> & {
    id?: string;
    createdAt?: number;
  }
): ComfyWorkflowFile {
  const next: ComfyWorkflowFile = {
    id: file.id ?? crypto.randomUUID(),
    createdAt: file.createdAt ?? Date.now(),
    name: file.name.trim(),
    filename: file.filename?.trim() || undefined,
    workflowJson: file.workflowJson.trim(),
    lastOptimizedAt: file.lastOptimizedAt,
    lastOptimizedHash: file.lastOptimizedHash,
    lastOptimizedModel: file.lastOptimizedModel,
    lastOptimizedProfile: file.lastOptimizedProfile,
    customTokens: normalizeWorkflowCustomTokens(file.customTokens),
  };

  const files = loadComfyWorkflowFiles();
  const index = files.findIndex(entry => entry.id === next.id);
  if (index >= 0) {
    files[index] = next;
  } else {
    files.unshift(next);
  }

  saveComfyWorkflowFiles(files);
  return next;
}

export function deleteComfyWorkflowFile(id: string): void {
  saveComfyWorkflowFiles(loadComfyWorkflowFiles().filter(entry => entry.id !== id));
}

export function workflowFileNameFromPath(filename: string): string {
  return filename.replace(/\.api\.json$/i, '').replace(/\.json$/i, '') || filename;
}

/** User-facing label — prefers the saved display name over the import filename. */
export function workflowFileDisplayName(
  file: Pick<ComfyWorkflowFile, 'name' | 'filename'>
): string {
  const name = file.name.trim();
  if (name) {
    return name;
  }
  return file.filename?.trim() || 'Workflow';
}

/** Original import filename when it differs from the display name. */
export function workflowFileSourceFilename(
  file: Pick<ComfyWorkflowFile, 'name' | 'filename'>
): string | undefined {
  const filename = file.filename?.trim();
  const name = file.name.trim();
  if (!filename || filename === name) {
    return undefined;
  }
  return filename;
}
