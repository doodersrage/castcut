'use client';

import { useMemo } from 'react';
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from '@/lib/model-sampler-defaults';
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from '@/lib/model-resolution-defaults';
import type { SharedToolSettings } from '@/lib/settings-cache';
import { loadSettingsCache } from '@/lib/settings-cache';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
} from '@/lib/model-lora-map';
import { normalizeQueueQualityProfile } from '@/lib/queue-quality-profile';
import type { UseSharedToolGenerationSettingsOptions } from '@/hooks/shared-tool/shared-tool-generation-settings-types';
import type { SharedToolGenerationSettingsCore } from '@/hooks/shared-tool/useSharedToolGenerationSettingsCore';

export function useSharedToolGenerationRecipes(
  options: UseSharedToolGenerationSettingsOptions,
  core: SharedToolGenerationSettingsCore
) {
  const { shared, onModelChange, onSharedSettingsChange } = options;
  const {
    samplerPreset,
    setSamplerPreset,
    samplerOverrides,
    setSamplerOverrides,
    resolutionOrientation,
    setResolutionOrientation,
    resolutionSizeTier,
    setResolutionSizeTier,
    queueQualityProfile,
    setQueueQualityProfile,
    sessionActiveLoraIds,
    setSessionActiveLoraIds,
    sessionActiveLoraIdsByModel,
    setSessionActiveLoraIdsByModel,
    sessionLoraStrengthOverrides,
    setSessionLoraStrengthOverrides,
    sessionLoraStrengthOverridesByModel,
    setSessionLoraStrengthOverridesByModel,
  } = core;

  const handleRecipesApplied = (next: SharedToolSettings) => {
    setQueueQualityProfile(
      normalizeQueueQualityProfile(next.queueQualityProfile ?? queueQualityProfile)
    );
    setSamplerPreset(normalizeModelSamplerPresetTier(next.modelSamplerPreset ?? samplerPreset));
    setSamplerOverrides(next.modelSamplerOverrides ?? samplerOverrides);
    setResolutionOrientation(
      normalizeResolutionOrientation(next.modelResolutionOrientation ?? resolutionOrientation)
    );
    setResolutionSizeTier(
      normalizeResolutionSizeTier(next.modelResolutionSizeTier ?? resolutionSizeTier)
    );
    const nextByModel =
      next.sessionActiveLoraIds !== undefined
        ? setSessionLoraIdsForModel(
            next.sessionActiveLoraIdsByModel ??
              loadSettingsCache().shared.sessionActiveLoraIdsByModel,
            next.model,
            next.sessionActiveLoraIds
          )
        : (next.sessionActiveLoraIdsByModel ??
          loadSettingsCache().shared.sessionActiveLoraIdsByModel);
    setSessionActiveLoraIds(next.sessionActiveLoraIds);
    setSessionActiveLoraIdsByModel(nextByModel ?? {});
    const nextStrengthByModel =
      next.sessionLoraStrengthOverrides !== undefined
        ? setSessionLoraStrengthOverridesForModel(
            next.sessionLoraStrengthOverridesByModel ??
              loadSettingsCache().shared.sessionLoraStrengthOverridesByModel,
            next.model,
            next.sessionLoraStrengthOverrides
          )
        : (next.sessionLoraStrengthOverridesByModel ??
          loadSettingsCache().shared.sessionLoraStrengthOverridesByModel);
    const nextStrengthOverrides = resolveEffectiveSessionLoraStrengthOverrides(
      next.model,
      next.sessionLoraStrengthOverrides ?? loadSettingsCache().shared.sessionLoraStrengthOverrides,
      nextStrengthByModel
    );
    setSessionLoraStrengthOverridesByModel(nextStrengthByModel ?? {});
    setSessionLoraStrengthOverrides(nextStrengthOverrides);
    if (next.model !== shared.model) {
      onModelChange(next.model);
    }
    onSharedSettingsChange?.({
      model: next.model,
      queueQualityProfile: next.queueQualityProfile,
      sessionQueueMode: next.sessionQueueMode,
      sessionActiveLoraIds: next.sessionActiveLoraIds,
      sessionActiveLoraIdsByModel: nextByModel,
      sessionLoraStrengthOverrides: nextStrengthOverrides,
      sessionLoraStrengthOverridesByModel: nextStrengthByModel,
      modelSamplerPreset: next.modelSamplerPreset,
      modelSamplerOverrides: next.modelSamplerOverrides,
      modelResolutionOrientation: next.modelResolutionOrientation,
      modelResolutionSizeTier: next.modelResolutionSizeTier,
      editDenoiseStrength: next.editDenoiseStrength,
      sessionEmbeddingTokens: next.sessionEmbeddingTokens,
      ipAdapterImageFilename: next.ipAdapterImageFilename,
      ipAdapterImageFilenames: next.ipAdapterImageFilenames,
      ipAdapterComfyUrl: next.ipAdapterComfyUrl,
      ipAdapterSource: next.ipAdapterSource,
      ipAdapterStrength: next.ipAdapterStrength,
      identityKind: next.identityKind,
      toolQueueQualityProfiles: next.toolQueueQualityProfiles,
      toolQualityRecipes: next.toolQualityRecipes,
    });
  };

  const recipesShared = useMemo(
    () => ({
      ...shared,
      queueQualityProfile,
      modelResolutionOrientation: resolutionOrientation,
      modelResolutionSizeTier: resolutionSizeTier,
      sessionActiveLoraIds,
      sessionActiveLoraIdsByModel,
      sessionLoraStrengthOverrides,
      sessionLoraStrengthOverridesByModel,
      modelSamplerOverrides: samplerOverrides,
    }),
    [
      shared,
      queueQualityProfile,
      resolutionOrientation,
      resolutionSizeTier,
      sessionActiveLoraIds,
      sessionActiveLoraIdsByModel,
      sessionLoraStrengthOverrides,
      sessionLoraStrengthOverridesByModel,
      samplerOverrides,
    ]
  );

  return {
    handleRecipesApplied,
    recipesShared,
  };
}
