import { loadSettingsCache, saveSharedSettings, type SharedToolSettings } from './settings-cache';
import { loadComfyUiSettings, saveComfyUiSettings, type ComfyUiSettings } from './comfyui-settings';
import { qualityForEveryToolPatch } from './tool-quality-profiles';

export type SettingsBrowserPresetId = 'everyday' | 'best';

/** Auto-improve on ratings — the Calm / Aggressive / Off chips in Settings → Auto-improve. */
export const AUTO_IMPROVE_MODES = {
  calm: {
    autoRequeueFinalOnHighRating: true,
    autoRequeueMaxOnFiveStar: false,
    autoImg2imgRefineOnFiveStar: false,
    autoMutateOnHighRating: false,
    autoSeedExperimentOnHighRating: false,
    autoRefineOnLowRating: true,
  },
  aggressive: {
    autoRequeueFinalOnHighRating: true,
    autoRequeueMaxOnFiveStar: true,
    autoImg2imgRefineOnFiveStar: false,
    autoMutateOnHighRating: false,
    autoSeedExperimentOnHighRating: false,
    autoRefineOnLowRating: true,
  },
  off: {
    autoRequeueFinalOnHighRating: false,
    autoRequeueMaxOnFiveStar: false,
    autoImg2imgRefineOnFiveStar: false,
    autoMutateOnHighRating: false,
    autoSeedExperimentOnHighRating: false,
    autoRefineOnLowRating: false,
  },
} satisfies Record<string, Partial<ComfyUiSettings>>;

export type SettingsBrowserPreset = {
  id: SettingsBrowserPresetId;
  label: string;
  description: string;
  /** Patch applied to shared queue/session settings (quality goes to every tool). */
  shared: Partial<SharedToolSettings>;
  /** One of the Auto-improve modes. */
  comfyUi: Partial<ComfyUiSettings>;
};

/**
 * Two bundles on top of Auto-improve. Iterate / Keeper / Lab collapsed: with Fast gone (it
 * always queued as Good) Iterate and Keeper only differed in auto-improve extras.
 */
export const SETTINGS_BROWSER_PRESETS: SettingsBrowserPreset[] = [
  {
    id: 'everyday',
    label: 'Everyday',
    description: 'Good quality on every tool, no Best hold, VRAM guard on, Calm auto-improve.',
    shared: {
      queueQualityProfile: 'final',
      sessionQueueMode: 'keeper',
      holdMaxUntilIdle: false,
      vramGuardEnabled: true,
    },
    comfyUi: AUTO_IMPROVE_MODES.calm,
  },
  {
    id: 'best',
    label: 'Best quality',
    description:
      'Best on every tool, held until ComfyUI is idle, VRAM guard on, Aggressive auto-improve.',
    shared: {
      queueQualityProfile: 'max',
      sessionQueueMode: 'off',
      holdMaxUntilIdle: true,
      vramGuardEnabled: true,
    },
    comfyUi: AUTO_IMPROVE_MODES.aggressive,
  },
];

/** Legacy ids from saved links / recipes. */
const LEGACY_PRESET_IDS: Record<string, SettingsBrowserPresetId> = {
  iterate: 'everyday',
  keeper: 'everyday',
  lab: 'best',
};

/** Shared patch for a preset: its fields plus its quality on every tool. */
export function settingsPresetSharedPatch(
  preset: SettingsBrowserPreset,
  shared: Pick<SharedToolSettings, 'toolQueueQualityProfiles'>
): Partial<SharedToolSettings> {
  return {
    ...preset.shared,
    ...(preset.shared.queueQualityProfile
      ? qualityForEveryToolPatch(shared.toolQueueQualityProfiles, preset.shared.queueQualityProfile)
      : {}),
  };
}

export function getSettingsBrowserPreset(
  id: string | undefined
): SettingsBrowserPreset | undefined {
  const resolved = id ? (LEGACY_PRESET_IDS[id] ?? id) : id;
  return SETTINGS_BROWSER_PRESETS.find(preset => preset.id === resolved);
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
  saveSharedSettings({ ...shared, ...settingsPresetSharedPatch(preset, shared) });

  const comfyUi = loadComfyUiSettings();
  saveComfyUiSettings({ ...comfyUi, ...preset.comfyUi });

  return true;
}
