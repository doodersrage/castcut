import {
  LOCATION_BLOCKLIST_KEY,
  PROMPT_HISTORY_KEY,
  saveLocationBlocklist,
} from '@/lib/prompt-history';
import { SCENE_PRESETS_KEY } from './scene-presets';
import { DEFAULT_SHARED_SETTINGS, SETTINGS_CACHE_KEY, saveSettingsCache } from './settings-cache';
import { COMFYUI_SETTINGS_KEY, resetComfyUiSettings } from './comfyui-settings';
import { clearComfyGallery, COMFYUI_GALLERY_KEY } from './comfyui-gallery';
import { COMFY_WORKFLOW_FILES_KEY, saveComfyWorkflowFiles } from './comfyui-workflow-files';
import { AVOIDED_TOKENS_KEY } from './avoided-tokens';
import { WEBHOOK_LOG_KEY } from './webhook-log';
import { COMFY_WORKFLOW_PRESETS_KEY } from './comfyui-workflow-presets';
import { USER_TEMPLATES_KEY } from './user-templates';

export function clearAllLocalPromptData(): void {
  if (typeof window === 'undefined') {
    return;
  }

  saveLocationBlocklist([]);
  saveSettingsCache({ shared: DEFAULT_SHARED_SETTINGS, tools: {} });
  resetComfyUiSettings();
  clearComfyGallery();
  saveComfyWorkflowFiles([]);
  for (const reset of localDataResets.values()) reset.clear();
}

/**
 * A feature's own local data, cleared by "Clear all local data" and listed with the keys
 * (Play: campaign, metrics, Look pack — play-features.ts). docs/architecture-boundaries.md.
 */
export type LocalDataReset = { keys: readonly string[]; clear: () => void };

const localDataResets = new Map<string, LocalDataReset>();

export function registerLocalDataReset(id: string, reset: LocalDataReset): void {
  localDataResets.set(id, reset);
}

/** Every key the reset copy lists: the shared ones and the features' own. */
export function localDataKeys(): string[] {
  return [...LOCAL_DATA_KEYS, ...[...localDataResets.values()].flatMap(reset => [...reset.keys])];
}

/** Legacy localStorage keys still referenced for diagnostics and reset UI copy. */
export const LOCAL_DATA_KEYS = [
  PROMPT_HISTORY_KEY,
  SETTINGS_CACHE_KEY,
  SCENE_PRESETS_KEY,
  USER_TEMPLATES_KEY,
  LOCATION_BLOCKLIST_KEY,
  COMFYUI_SETTINGS_KEY,
  COMFYUI_GALLERY_KEY,
  COMFY_WORKFLOW_FILES_KEY,
  COMFY_WORKFLOW_PRESETS_KEY,
  AVOIDED_TOKENS_KEY,
  WEBHOOK_LOG_KEY,
] as const;
