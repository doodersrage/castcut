import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import { loadComfyUiSettings, saveComfyUiSettings, type ComfyUiSettings } from './comfyui-settings';

export type SettingsBrowserPresetId = 'iterate' | 'keeper' | 'lab';

export type SettingsBrowserPreset = {
  id: SettingsBrowserPresetId;
  label: string;
  description: string;
  /** Patch applied to shared queue/session settings. */
  shared: Partial<SharedToolSettings>;
  /** Patch applied to ComfyUI auto-improve (mutate/seed/upscale/refine) flags. */
  comfyUi: Partial<ComfyUiSettings>;
};

export const SETTINGS_BROWSER_PRESETS: SettingsBrowserPreset[] = [
  {
    id: 'iterate',
    label: 'Iterate',
    description:
      'Fast draft loop — Fast queueing, no Best hold, VRAM guard on. Calm auto-improve: upscale keepers on 4–5★, no auto mutate/seed spam.',
    shared: {
      queueQualityProfile: 'draft',
      sessionQueueMode: 'iterate',
      holdMaxUntilIdle: false,
      vramGuardEnabled: true,
    },
    comfyUi: {
      autoRefineOnLowRating: true,
      autoMutateOnHighRating: false,
      autoSeedExperimentOnHighRating: false,
      autoSeedExperimentOnFavorite: false,
      autoRequeueFinalOnHighRating: true,
      autoRequeueMaxOnFiveStar: false,
      autoImg2imgRefineOnFiveStar: false,
    },
  },
  {
    id: 'keeper',
    label: 'Keeper',
    description:
      'Production renders — Good queueing, VRAM guard on. Balanced auto-improve: Good/Best upscale plus seed experiments on high ratings.',
    shared: {
      queueQualityProfile: 'final',
      sessionQueueMode: 'keeper',
      holdMaxUntilIdle: false,
      vramGuardEnabled: true,
    },
    comfyUi: {
      autoRefineOnLowRating: true,
      autoMutateOnHighRating: true,
      autoSeedExperimentOnHighRating: true,
      autoSeedExperimentOnFavorite: false,
      autoRequeueFinalOnHighRating: true,
      autoRequeueMaxOnFiveStar: true,
      autoImg2imgRefineOnFiveStar: false,
    },
  },
  {
    id: 'lab',
    label: 'Lab',
    description:
      'Best-quality experiments — Best queueing, hold until idle, VRAM guard on. Aggressive auto-improve: mutate/seed/img2img refine on every high rating.',
    shared: {
      queueQualityProfile: 'max',
      sessionQueueMode: 'off',
      holdMaxUntilIdle: true,
      vramGuardEnabled: true,
    },
    comfyUi: {
      autoRefineOnLowRating: true,
      autoMutateOnHighRating: true,
      autoSeedExperimentOnHighRating: true,
      autoSeedExperimentOnFavorite: true,
      autoRequeueFinalOnHighRating: true,
      autoRequeueMaxOnFiveStar: true,
      autoImg2imgRefineOnFiveStar: true,
    },
  },
];

export function getSettingsBrowserPreset(
  id: string | undefined
): SettingsBrowserPreset | undefined {
  return SETTINGS_BROWSER_PRESETS.find(preset => preset.id === id);
}

/**
 * Loads the current browser shared/ComfyUI settings, patches in the preset, and
 * saves both back via settings-cache + comfyui-settings. No-op (returns false)
 * for an unknown id or outside the browser.
 */
export function applySettingsBrowserPreset(id: string): boolean {
  const preset = getSettingsBrowserPreset(id);
  if (!preset || typeof window === 'undefined') {
    return false;
  }

  const shared = loadSettingsCache().shared;
  saveSharedSettings({ ...shared, ...preset.shared });

  const comfyUi = loadComfyUiSettings();
  saveComfyUiSettings({ ...comfyUi, ...preset.comfyUi });

  return true;
}
