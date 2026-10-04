'use client';

import { useCallback, useMemo } from 'react';
import { useToolRenderQuality } from '@/hooks/useToolRenderQuality';
import {
  deriveOutfitQualityPreset,
  outfitQualityChecksPatch,
  outfitQualityPresetSettings,
  outfitQualitySettingsOf,
  outfitQualitySummary,
  type OutfitQualityPreset,
  type OutfitQualityPresetChoice,
  type OutfitQualitySettings,
} from '@/lib/outfit-quality-preset';
import type { RenderQuality } from '@/lib/render-quality';
import type { FittingToolCache, SharedToolSettings } from '@/lib/settings-cache';

/**
 * Outfit's Quality preset, read from the two try-on switches plus the `fitting` queue quality
 * profile (the Engine's Good / Best). Picking a preset writes the switches in one tool-settings
 * write and, when it differs, the render quality in one shared write.
 */
export function useOutfitQualityPreset({
  shared,
  updateShared,
  toolSettings,
  updateToolSettings,
}: {
  shared: SharedToolSettings;
  updateShared: (partial: Partial<SharedToolSettings>) => void;
  toolSettings: FittingToolCache;
  updateToolSettings: (partial: Partial<FittingToolCache>) => void;
}): {
  settings: OutfitQualitySettings;
  preset: OutfitQualityPresetChoice;
  summary: string;
  setPreset: (next: OutfitQualityPreset) => void;
  renderQuality: RenderQuality;
  setRenderQuality: (next: RenderQuality) => void;
} {
  const fittingProfile = shared.toolQueueQualityProfiles?.fitting;
  const frontBack = toolSettings.tryOnFrontBack;
  const autoReview = toolSettings.autoReviewTryOns;
  const settings = useMemo(
    () =>
      outfitQualitySettingsOf(
        { tryOnFrontBack: frontBack, autoReviewTryOns: autoReview },
        fittingProfile
      ),
    [autoReview, fittingProfile, frontBack]
  );
  const setRenderQuality = useToolRenderQuality('fitting', updateShared);

  const setPreset = useCallback(
    (next: OutfitQualityPreset) => {
      const target = outfitQualityPresetSettings(next);
      updateToolSettings(outfitQualityChecksPatch(target));
      if (target.renderQuality !== settings.renderQuality) {
        setRenderQuality(target.renderQuality);
      }
    },
    [setRenderQuality, settings.renderQuality, updateToolSettings]
  );

  return {
    settings,
    preset: deriveOutfitQualityPreset(settings),
    summary: outfitQualitySummary(settings),
    setPreset,
    renderQuality: settings.renderQuality,
    setRenderQuality,
  };
}
