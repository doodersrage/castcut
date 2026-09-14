import { clearLookPack, LOOK_PACK_KEY } from './look-pack';
import { clearPlayCampaignState, PLAY_CAMPAIGN_KEY } from './play-campaign';
import { PLAY_METRICS_KEY, savePlayMetrics } from './play-metrics';
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
  clearPlayCampaignState();
  clearLookPack();
  savePlayMetrics({ version: 1 });
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
  PLAY_CAMPAIGN_KEY,
  PLAY_METRICS_KEY,
  LOOK_PACK_KEY,
] as const;
