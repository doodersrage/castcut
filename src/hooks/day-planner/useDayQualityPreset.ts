'use client';

import { useCallback, useMemo } from 'react';
import {
  dayQualityChecksPatch,
  dayQualityPresetSettings,
  dayQualitySettingsOf,
  dayQualitySummary,
  dayRenderQualityProfile,
  deriveDayQualityPreset,
  type DayQualityPreset,
  type DayQualityPresetChoice,
  type DayQualitySettings,
  type DayRenderQuality,
} from '@/lib/day-quality-preset';
import {
  loadSettingsCache,
  notifySettingsCacheUpdated,
  saveSharedSettings,
  type SharedToolSettings,
} from '@/lib/settings-cache';
import { type DayToolCache } from '@/lib/play-settings';

/**
 * Day's Quality preset, read from the check switches plus Day's queue quality profile (the
 * Engine's Good / Best for the `day` tool). Picking a preset writes the six switches in one
 * tool-settings write and, when it differs, the render quality in one shared write.
 */
export function useDayQualityPreset({
  shared,
  updateShared,
  toolSettings,
  updateToolSettings,
}: {
  shared: SharedToolSettings;
  updateShared: (partial: Partial<SharedToolSettings>) => void;
  toolSettings: DayToolCache;
  updateToolSettings: (partial: Partial<DayToolCache>) => void;
}): {
  settings: DayQualitySettings;
  preset: DayQualityPresetChoice;
  summary: string;
  setPreset: (next: DayQualityPreset) => void;
  renderQuality: DayRenderQuality;
  setRenderQuality: (next: DayRenderQuality) => void;
} {
  const dayProfile = shared.toolQueueQualityProfiles?.day;
  const settings = useMemo(
    () => dayQualitySettingsOf(toolSettings, dayProfile),
    [dayProfile, toolSettings]
  );

  const setRenderQuality = useCallback(
    (next: DayRenderQuality) => {
      // Same path as the Engine panel's Good / Best chips: the tool's entry beats the global.
      const profiles = {
        ...(loadSettingsCache().shared.toolQueueQualityProfiles ?? {}),
        day: dayRenderQualityProfile(next),
      };
      saveSharedSettings(
        { ...loadSettingsCache().shared, toolQueueQualityProfiles: profiles },
        { notify: false }
      );
      updateShared({ toolQueueQualityProfiles: profiles });
      // The Engine chip re-reads settings on this event.
      notifySettingsCacheUpdated();
    },
    [updateShared]
  );

  const setPreset = useCallback(
    (next: DayQualityPreset) => {
      const target = dayQualityPresetSettings(next);
      updateToolSettings(dayQualityChecksPatch(target));
      if (target.renderQuality !== settings.renderQuality) {
        setRenderQuality(target.renderQuality);
      }
    },
    [setRenderQuality, settings.renderQuality, updateToolSettings]
  );

  return {
    settings,
    preset: deriveDayQualityPreset(settings),
    summary: dayQualitySummary(settings),
    setPreset,
    renderQuality: settings.renderQuality,
    setRenderQuality,
  };
}
