'use client';

import { useEffect } from 'react';
import {
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from '@/lib/model/sampler-defaults';
import {
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from '@/lib/model/resolution-defaults';
import { type AnatomyGuardMode } from '@/lib/adult/anatomy-guard';
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from '@/lib/queue/quality-profile';
import { type RenderRealismMode } from '@/lib/engine/render-realism';
import {
  loadSettingsCache,
  saveSessionLoraSelectionNow,
  saveSharedSettings,
} from '@/lib/settings/cache';
import { isBrowserStorageReady } from '@/lib/storage/browser-storage';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import {
  resolveLoraIdsForModelSelection,
  setSessionLoraIdsForModel,
  setSessionLoraStrengthOverridesForModel,
} from '@/lib/model/lora-map';
import {
  normalizeSessionLoraStrengthOverrides,
  type SessionLoraStrengthOverrides,
} from '@/lib/lora/stack';
import type { UseSharedToolGenerationSettingsOptions } from '@/hooks/shared-tool/shared-tool-generation-settings-types';
import type { SharedToolGenerationSettingsCore } from '@/hooks/shared-tool/useSharedToolGenerationSettingsCore';
import { useSharedToolGenerationRecipes } from '@/hooks/shared-tool/useSharedToolGenerationRecipes';

export function useSharedToolGenerationSettingsPart2(
  options: UseSharedToolGenerationSettingsOptions,
  core: SharedToolGenerationSettingsCore
) {
  const { shared, toolId, onSharedSettingsChange } = options;
  const {
    storageReady,
    samplerPreset,
    setSamplerPreset,
    samplerOverrides,
    setSamplerOverrides,
    resolutionOrientation,
    setResolutionOrientation,
    resolutionSizeTier,
    setResolutionSizeTier,
    renderRealismMode,
    setRenderRealismMode,
    anatomyGuardMode,
    setAnatomyGuardMode,
    queueQualityProfile,
    setQueueQualityProfile,
    expandWildcards,
    setExpandWildcards,
    wildcardSeed,
    setWildcardSeed,
    wildcardPreview,
    setWildcardPreview,
    autoRetryOnOom,
    setAutoRetryOnOom,
    oomRetryDowngrade,
    setOomRetryDowngrade,
    lastLookRecipe,
    sessionActiveLoraIds,
    setSessionActiveLoraIds,
    sessionActiveLoraIdsByModel,
    setSessionActiveLoraIdsByModel,
    sessionLoraStrengthOverrides,
    setSessionLoraStrengthOverrides,
    sessionLoraStrengthOverridesByModel,
    setSessionLoraStrengthOverridesByModel,
  } = core;

  const { handleRecipesApplied, recipesShared } = useSharedToolGenerationRecipes(options, core);

  const handleSessionActiveLoraIdsChange = (ids: string[] | undefined) => {
    const modelId = shared.model;
    const baseShared = loadSettingsCache().shared;
    const nextByModel = setSessionLoraIdsForModel(
      baseShared.sessionActiveLoraIdsByModel,
      modelId,
      ids
    );
    const mirrored =
      ids !== undefined
        ? ids
        : resolveLoraIdsForModelSelection(modelId, {
            sessionActiveLoraIdsByModel: nextByModel,
            modelLoraMap: baseShared.modelLoraMap,
          });
    setSessionActiveLoraIds(mirrored);
    setSessionActiveLoraIdsByModel(nextByModel);
    const patch = {
      sessionActiveLoraIds: mirrored,
      sessionActiveLoraIdsByModel: nextByModel,
    };
    if (onSharedSettingsChange) {
      onSharedSettingsChange(patch);
    } else {
      void saveSessionLoraSelectionNow({
        ...baseShared,
        ...patch,
      }).then(() => {
        void import('@/lib/app/toast').then(({ pushAppToast }) => {
          pushAppToast({ text: 'Saved — LoRA session', tone: 'success', ttlMs: 1800 });
        });
      });
    }
  };

  const handleSessionLoraStrengthOverridesChange = (overrides: SessionLoraStrengthOverrides) => {
    const modelId = shared.model;
    const normalized = normalizeSessionLoraStrengthOverrides(overrides);
    const baseShared = loadSettingsCache().shared;
    const nextByModel = setSessionLoraStrengthOverridesForModel(
      baseShared.sessionLoraStrengthOverridesByModel,
      modelId,
      normalized
    );
    setSessionLoraStrengthOverrides(normalized);
    setSessionLoraStrengthOverridesByModel(nextByModel);
    const patch = {
      sessionLoraStrengthOverrides: normalized,
      sessionLoraStrengthOverridesByModel: nextByModel,
    };
    if (onSharedSettingsChange) {
      onSharedSettingsChange(patch);
    } else {
      void saveSessionLoraSelectionNow({
        ...baseShared,
        ...patch,
      });
    }
  };

  const handleSamplerPresetChange = (preset: ModelSamplerPresetTier) => {
    setSamplerPreset(preset);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelSamplerPreset: preset,
      },
      { notify: false }
    );
  };

  const handleSamplerOverridesChange = (overrides: ModelSamplerOverrideFields) => {
    setSamplerOverrides(overrides);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelSamplerOverrides: overrides,
      },
      { notify: false }
    );
  };

  const handleResolutionOrientationChange = (orientation: ResolutionOrientation) => {
    setResolutionOrientation(orientation);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelResolutionOrientation: orientation,
      },
      { notify: false }
    );
  };

  const handleResolutionSizeTierChange = (tier: ResolutionSizeTier) => {
    setResolutionSizeTier(tier);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        modelResolutionSizeTier: tier,
      },
      { notify: false }
    );
  };

  const handleRenderRealismModeChange = (mode: RenderRealismMode) => {
    setRenderRealismMode(mode);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        renderRealismMode: mode,
      },
      { notify: false }
    );
  };

  const handleAnatomyGuardModeChange = (mode: AnatomyGuardMode) => {
    setAnatomyGuardMode(mode);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        anatomyGuardMode: mode,
      },
      { notify: false }
    );
  };

  const handleQueueQualityProfileChange = (profile: QueueQualityProfile) => {
    setQueueQualityProfile(profile);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        queueQualityProfile: profile,
      },
      { notify: false }
    );
  };

  useEffect(() => {
    if (!storageReady) {
      return;
    }
    if (shared.useSystemWorkflows !== true) {
      return;
    }
    if (normalizeQueueQualityProfile(shared.queueQualityProfile) !== 'followSettings') {
      return;
    }
    scheduleAfterCommit(() => {
      if (!isBrowserStorageReady()) {
        return;
      }
      handleQueueQualityProfileChange('final');
    });
  }, [shared.queueQualityProfile, shared.useSystemWorkflows, storageReady]);

  const handleExpandWildcardsChange = (value: boolean) => {
    setExpandWildcards(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        expandWildcards: value,
      },
      { notify: false }
    );
  };

  const handleWildcardSeedChange = (value: string) => {
    setWildcardSeed(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        wildcardSeed: value.trim() || undefined,
      },
      { notify: false }
    );
  };

  const handleAutoRetryOnOomChange = (value: boolean) => {
    setAutoRetryOnOom(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        autoRetryOnOom: value,
      },
      { notify: false }
    );
  };

  const handleOomRetryDowngradeChange = (value: boolean) => {
    setOomRetryDowngrade(value);
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        oomRetryDowngrade: value,
      },
      { notify: false }
    );
  };

  const toolProfileOverride = toolId ? shared.toolQueueQualityProfiles?.[toolId] : undefined;

  const handleToolQueueQualityChange = (profile: QueueQualityProfile | undefined) => {
    if (!toolId) {
      return;
    }
    const current = { ...(loadSettingsCache().shared.toolQueueQualityProfiles ?? {}) };
    if (!profile) {
      delete current[toolId];
    } else {
      current[toolId] = profile;
    }
    const nextProfiles = Object.keys(current).length > 0 ? current : undefined;
    saveSharedSettings(
      {
        ...loadSettingsCache().shared,
        toolQueueQualityProfiles: nextProfiles,
      },
      { notify: false }
    );
    onSharedSettingsChange?.({ toolQueueQualityProfiles: nextProfiles });
  };

  return {
    samplerPreset,
    samplerOverrides,
    resolutionOrientation,
    resolutionSizeTier,
    renderRealismMode,
    anatomyGuardMode,
    queueQualityProfile,
    expandWildcards,
    wildcardSeed,
    wildcardPreview,
    setWildcardPreview,
    autoRetryOnOom,
    oomRetryDowngrade,
    lastLookRecipe,
    sessionActiveLoraIds,
    sessionActiveLoraIdsByModel,
    sessionLoraStrengthOverrides,
    sessionLoraStrengthOverridesByModel,
    setSessionActiveLoraIds,
    setSessionLoraStrengthOverrides,
    handleSessionActiveLoraIdsChange,
    handleSessionLoraStrengthOverridesChange,
    handleSamplerPresetChange,
    handleSamplerOverridesChange,
    handleResolutionOrientationChange,
    handleResolutionSizeTierChange,
    handleRenderRealismModeChange,
    handleAnatomyGuardModeChange,
    handleQueueQualityProfileChange,
    handleExpandWildcardsChange,
    handleWildcardSeedChange,
    handleAutoRetryOnOomChange,
    handleOomRetryDowngradeChange,
    toolProfileOverride,
    handleToolQueueQualityChange,
    handleRecipesApplied,
    recipesShared,
  };
}
