import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import { loadComfyUiSettings, saveComfyUiSettings, type ComfyUiSettings } from './comfyui/settings';
import { loadWebhookSettings, saveWebhookSettings, type WebhookSettings } from './webhook-settings';
import {
  loadScheduledBatchConfig,
  saveScheduledBatchConfig,
  type ScheduledBatchConfig,
} from './scheduled-batch';
import { exportAvoidedTokenList, saveAvoidedTokens } from './avoided-tokens';
import { loadSessionRecipes, saveSessionRecipes, type SessionRecipe } from './session-recipes';
import {
  loadNsfwPresetPrefs,
  loadUserNsfwGeneratorPresets,
  saveNsfwPresetPrefs,
  saveUserNsfwGeneratorPresets,
  type NsfwPresetPrefs,
  type UserNsfwGeneratorPreset,
} from './user-nsfw-generator-presets';

export const SETTINGS_BUNDLE_VERSION = 2;

/**
 * Lightweight "settings only" export/import — no history, gallery, presets, or
 * workflow library. See `studio-backup.ts` for the full studio backup.
 */
export type SettingsBundleV1 = {
  version: 1;
  exportedAt: string;
  shared: SharedToolSettings;
  comfyUiSettings?: ComfyUiSettings;
  webhookSettings?: WebhookSettings;
  scheduledBatch?: ScheduledBatchConfig;
  avoidedTokens?: string[];
};

export type SettingsBundleV2 = Omit<SettingsBundleV1, 'version'> & {
  version: 2;
  sessionRecipes?: SessionRecipe[];
  userNsfwGeneratorPresets?: UserNsfwGeneratorPreset[];
  nsfwPresetPrefs?: NsfwPresetPrefs;
};

export type SettingsBundle = SettingsBundleV1 | SettingsBundleV2;

export function exportSettingsBundle(): SettingsBundleV2 {
  return {
    version: SETTINGS_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    shared: loadSettingsCache().shared,
    comfyUiSettings: loadComfyUiSettings(),
    webhookSettings: loadWebhookSettings(),
    scheduledBatch: loadScheduledBatchConfig(),
    avoidedTokens: exportAvoidedTokenList(),
    sessionRecipes: loadSessionRecipes(),
    userNsfwGeneratorPresets: loadUserNsfwGeneratorPresets(),
    nsfwPresetPrefs: loadNsfwPresetPrefs(),
  };
}

export function parseSettingsBundle(json: string): SettingsBundle {
  const parsed = JSON.parse(json) as Partial<SettingsBundle> | null;
  if (
    !parsed ||
    (parsed.version !== 1 && parsed.version !== SETTINGS_BUNDLE_VERSION) ||
    !parsed.shared ||
    typeof parsed.shared !== 'object'
  ) {
    throw new Error('Invalid settings bundle file.');
  }
  return parsed as SettingsBundle;
}

export function importSettingsBundle(data: SettingsBundle): void {
  if (data.version !== 1 && data.version !== SETTINGS_BUNDLE_VERSION) {
    throw new Error('Unsupported settings bundle version.');
  }

  const cache = loadSettingsCache();
  saveSharedSettings({ ...cache.shared, ...data.shared });

  if (data.comfyUiSettings) {
    saveComfyUiSettings({ ...loadComfyUiSettings(), ...data.comfyUiSettings });
  }
  if (data.webhookSettings) {
    saveWebhookSettings({ ...loadWebhookSettings(), ...data.webhookSettings });
  }
  if (data.scheduledBatch) {
    saveScheduledBatchConfig({
      ...loadScheduledBatchConfig(),
      ...data.scheduledBatch,
    });
  }
  if (data.avoidedTokens) {
    saveAvoidedTokens(data.avoidedTokens);
  }

  if (data.version === SETTINGS_BUNDLE_VERSION) {
    if (data.sessionRecipes) {
      saveSessionRecipes(data.sessionRecipes);
    }
    if (data.userNsfwGeneratorPresets) {
      saveUserNsfwGeneratorPresets(data.userNsfwGeneratorPresets);
    }
    if (data.nsfwPresetPrefs) {
      saveNsfwPresetPrefs(data.nsfwPresetPrefs);
    }
  }
}

export function downloadSettingsBundle(): void {
  const payload = JSON.stringify(exportSettingsBundle(), null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `prompt-studio-settings-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
