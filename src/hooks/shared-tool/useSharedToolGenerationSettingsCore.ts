'use client';

import { useEffect, useState } from 'react';
import {
  normalizeModelSamplerPresetTier,
  type ModelSamplerOverrideFields,
  type ModelSamplerPresetTier,
} from '@/lib/model/sampler-defaults';
import {
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  type ResolutionOrientation,
  type ResolutionSizeTier,
} from '@/lib/model/resolution-defaults';
import { normalizeAnatomyGuardMode, type AnatomyGuardMode } from '@/lib/adult/anatomy-guard';
import {
  normalizeQueueQualityProfile,
  type QueueQualityProfile,
} from '@/lib/queue/quality-profile';
import { normalizeRenderRealismMode, type RenderRealismMode } from '@/lib/engine/render-realism';
import { SETTINGS_CACHE_UPDATED_EVENT } from '@/lib/settings/cache';
import {
  latestGenerateLookRecipe,
  SESSION_RECIPES_UPDATED_EVENT,
  type SessionRecipe,
} from '@/lib/prompt/session-recipes';
import { scheduleAfterCommit } from '@/lib/batch/schedule-after-commit';
import { isBrowserStorageReady, whenBrowserStorageReady } from '@/lib/storage/browser-storage';
import {
  resolveEffectiveSessionLoraStrengthOverrides,
  resolveLoraIdsForModelSelection,
  type SessionActiveLoraIdsByModel,
  type SessionLoraStrengthOverridesByModel,
} from '@/lib/model/lora-map';
import type { SessionLoraStrengthOverrides } from '@/lib/lora/stack';
import type { UseSharedToolGenerationSettingsOptions } from '@/hooks/shared-tool/shared-tool-generation-settings-types';

export function useSharedToolGenerationSettingsCore({
  shared,
}: Pick<UseSharedToolGenerationSettingsOptions, 'shared'>) {
  const [storageReady, setStorageReady] = useState(() => isBrowserStorageReady());

  useEffect(() => {
    if (storageReady) {
      return;
    }
    let cancelled = false;
    void whenBrowserStorageReady().then(() => {
      if (!cancelled) {
        setStorageReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageReady]);

  const [samplerPreset, setSamplerPreset] = useState<ModelSamplerPresetTier>(() =>
    normalizeModelSamplerPresetTier(shared.modelSamplerPreset)
  );
  const [samplerOverrides, setSamplerOverrides] = useState<ModelSamplerOverrideFields>(
    () => shared.modelSamplerOverrides ?? {}
  );
  const [resolutionOrientation, setResolutionOrientation] = useState<ResolutionOrientation>(() =>
    normalizeResolutionOrientation(shared.modelResolutionOrientation)
  );
  const [resolutionSizeTier, setResolutionSizeTier] = useState<ResolutionSizeTier>(() =>
    normalizeResolutionSizeTier(shared.modelResolutionSizeTier)
  );
  const [renderRealismMode, setRenderRealismMode] = useState<RenderRealismMode>(() =>
    normalizeRenderRealismMode(shared.renderRealismMode)
  );
  const [anatomyGuardMode, setAnatomyGuardMode] = useState<AnatomyGuardMode>(() =>
    normalizeAnatomyGuardMode(shared.anatomyGuardMode)
  );
  const [queueQualityProfile, setQueueQualityProfile] = useState<QueueQualityProfile>(() =>
    normalizeQueueQualityProfile(shared.queueQualityProfile)
  );
  const [expandWildcards, setExpandWildcards] = useState(() => shared.expandWildcards !== false);
  const [wildcardSeed, setWildcardSeed] = useState(() => shared.wildcardSeed ?? '');
  const [wildcardPreview, setWildcardPreview] = useState<string | null>(null);
  const [autoRetryOnOom, setAutoRetryOnOom] = useState(() => shared.autoRetryOnOom !== false);
  const [lastLookRecipe, setLastLookRecipe] = useState<SessionRecipe | null>(() =>
    typeof window === 'undefined' ? null : latestGenerateLookRecipe()
  );
  const [oomRetryDowngrade, setOomRetryDowngrade] = useState(
    () => shared.oomRetryDowngrade !== false
  );
  const [sessionActiveLoraIds, setSessionActiveLoraIds] = useState<string[] | undefined>(undefined);
  const [sessionActiveLoraIdsByModel, setSessionActiveLoraIdsByModel] =
    useState<SessionActiveLoraIdsByModel>({});
  const [sessionLoraStrengthOverridesByModel, setSessionLoraStrengthOverridesByModel] =
    useState<SessionLoraStrengthOverridesByModel>({});
  const [sessionLoraStrengthOverrides, setSessionLoraStrengthOverrides] =
    useState<SessionLoraStrengthOverrides>(() =>
      resolveEffectiveSessionLoraStrengthOverrides(
        shared.model,
        shared.sessionLoraStrengthOverrides,
        shared.sessionLoraStrengthOverridesByModel
      )
    );

  useEffect(() => {
    const refresh = () => setLastLookRecipe(latestGenerateLookRecipe());
    refresh();
    window.addEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
    window.addEventListener(SESSION_RECIPES_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(SETTINGS_CACHE_UPDATED_EVENT, refresh);
      window.removeEventListener(SESSION_RECIPES_UPDATED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    scheduleAfterCommit(() => {
      setSamplerPreset(normalizeModelSamplerPresetTier(shared.modelSamplerPreset));
      setSamplerOverrides(shared.modelSamplerOverrides ?? {});
      setResolutionOrientation(normalizeResolutionOrientation(shared.modelResolutionOrientation));
      setResolutionSizeTier(normalizeResolutionSizeTier(shared.modelResolutionSizeTier));
      setRenderRealismMode(normalizeRenderRealismMode(shared.renderRealismMode));
      setAnatomyGuardMode(normalizeAnatomyGuardMode(shared.anatomyGuardMode));
      setQueueQualityProfile(normalizeQueueQualityProfile(shared.queueQualityProfile));
      setExpandWildcards(shared.expandWildcards !== false);
      setWildcardSeed(shared.wildcardSeed ?? '');
      setAutoRetryOnOom(shared.autoRetryOnOom !== false);
      setOomRetryDowngrade(shared.oomRetryDowngrade !== false);
      setSessionActiveLoraIdsByModel(shared.sessionActiveLoraIdsByModel ?? {});
      setSessionLoraStrengthOverridesByModel(shared.sessionLoraStrengthOverridesByModel ?? {});
      setSessionActiveLoraIds(
        resolveLoraIdsForModelSelection(shared.model, {
          sessionActiveLoraIdsByModel: shared.sessionActiveLoraIdsByModel,
          modelLoraMap: shared.modelLoraMap,
          sessionActiveLoraIds: shared.sessionActiveLoraIds,
        })
      );
      setSessionLoraStrengthOverrides(
        resolveEffectiveSessionLoraStrengthOverrides(
          shared.model,
          shared.sessionLoraStrengthOverrides,
          shared.sessionLoraStrengthOverridesByModel
        )
      );
    });
  }, [
    shared.modelSamplerPreset,
    shared.modelSamplerOverrides,
    shared.modelResolutionOrientation,
    shared.modelResolutionSizeTier,
    shared.renderRealismMode,
    shared.anatomyGuardMode,
    shared.queueQualityProfile,
    shared.showAllModelsOverride,
    shared.expandWildcards,
    shared.wildcardSeed,
    shared.autoRetryOnOom,
    shared.oomRetryDowngrade,
    shared.sessionActiveLoraIds,
    shared.sessionActiveLoraIdsByModel,
    shared.sessionLoraStrengthOverridesByModel,
    shared.sessionLoraStrengthOverrides,
    shared.modelLoraMap,
    shared.model,
  ]);

  return {
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
  };
}

export type SharedToolGenerationSettingsCore = ReturnType<
  typeof useSharedToolGenerationSettingsCore
>;
