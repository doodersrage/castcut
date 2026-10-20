import type { Dispatch, SetStateAction } from 'react';
import type {
  ModelSamplerOverrideFields,
  ModelSamplerPresetTier,
} from '@/lib/model/sampler-defaults';
import type { ResolutionOrientation, ResolutionSizeTier } from '@/lib/model/resolution-defaults';
import type { AnatomyGuardMode } from '@/lib/adult/anatomy-guard';
import type { QueueQualityProfile } from '@/lib/queue/quality-profile';
import type { RenderRealismMode } from '@/lib/engine/render-realism';
import type { SharedToolSettings } from '@/lib/settings/cache';
import type { SessionRecipe } from '@/lib/prompt/session-recipes';
import type {
  SessionActiveLoraIdsByModel,
  SessionLoraStrengthOverridesByModel,
} from '@/lib/model/lora-map';
import type { SessionLoraStrengthOverrides } from '@/lib/lora/stack';

export type UseSharedToolGenerationSettingsOptions = {
  shared: SharedToolSettings;
  toolId?: string;
  onModelChange: (model: SharedToolSettings['model']) => void;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
};

export type UseSharedToolGenerationSettingsResult = {
  samplerPreset: ModelSamplerPresetTier;
  samplerOverrides: ModelSamplerOverrideFields;
  resolutionOrientation: ResolutionOrientation;
  resolutionSizeTier: ResolutionSizeTier;
  renderRealismMode: RenderRealismMode;
  anatomyGuardMode: AnatomyGuardMode;
  queueQualityProfile: QueueQualityProfile;
  expandWildcards: boolean;
  wildcardSeed: string;
  wildcardPreview: string | null;
  setWildcardPreview: (value: string | null) => void;
  autoRetryOnOom: boolean;
  oomRetryDowngrade: boolean;
  lastLookRecipe: SessionRecipe | null;
  sessionActiveLoraIds: string[] | undefined;
  sessionActiveLoraIdsByModel: SessionActiveLoraIdsByModel;
  sessionLoraStrengthOverrides: SessionLoraStrengthOverrides;
  sessionLoraStrengthOverridesByModel: SessionLoraStrengthOverridesByModel;
  setSessionActiveLoraIds: Dispatch<SetStateAction<string[] | undefined>>;
  setSessionLoraStrengthOverrides: Dispatch<SetStateAction<SessionLoraStrengthOverrides>>;
  handleSessionActiveLoraIdsChange: (ids: string[] | undefined) => void;
  handleSessionLoraStrengthOverridesChange: (overrides: SessionLoraStrengthOverrides) => void;
  handleSamplerPresetChange: (preset: ModelSamplerPresetTier) => void;
  handleSamplerOverridesChange: (overrides: ModelSamplerOverrideFields) => void;
  handleResolutionOrientationChange: (orientation: ResolutionOrientation) => void;
  handleResolutionSizeTierChange: (tier: ResolutionSizeTier) => void;
  handleRenderRealismModeChange: (mode: RenderRealismMode) => void;
  handleAnatomyGuardModeChange: (mode: AnatomyGuardMode) => void;
  handleQueueQualityProfileChange: (profile: QueueQualityProfile) => void;
  handleExpandWildcardsChange: (value: boolean) => void;
  handleWildcardSeedChange: (value: string) => void;
  handleAutoRetryOnOomChange: (value: boolean) => void;
  handleOomRetryDowngradeChange: (value: boolean) => void;
  toolProfileOverride: QueueQualityProfile | undefined;
  handleToolQueueQualityChange: (profile: QueueQualityProfile | undefined) => void;
  handleRecipesApplied: (next: SharedToolSettings) => void;
  recipesShared: SharedToolSettings;
};
