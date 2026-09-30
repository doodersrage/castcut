import { avoidedTokensRequestBody } from '@/lib/avoided-tokens';
import type { HistorySeedTool } from '@/lib/scene-hint-source';
import type { SharedToolSettings, VariationsToolCache } from '@/lib/settings-cache';

export type VariationTarget = NonNullable<VariationsToolCache['target']>;

export type CellOverrides = {
  variationStrength?: number;
  sportPresetId?: string;
  lockedLocation?: string;
};

export type VariationResult = {
  prompt: string;
  seed?: string;
  error?: string;
  rowLabel?: string;
  colLabel?: string;
};

export function variationsHistoryTool(target: VariationTarget): HistorySeedTool {
  switch (target) {
    case 'character':
      return 'character';
    case 'duo':
      return 'duo';
    case 'pet':
      return 'pet';
    case 'fantasy':
      return 'fantasy';
    case 'background':
      return 'background';
    default:
      return 'generate';
  }
}

export function variationEndpoint(target: VariationTarget): string {
  switch (target) {
    case 'character':
      return '/api/character';
    case 'duo':
      return '/api/duo';
    case 'pet':
      return '/api/pet';
    case 'fantasy':
      return '/api/fantasy';
    case 'background':
      return '/api/background';
    default:
      return '/api/generate';
  }
}

export function buildVariationRequestBody(
  target: VariationTarget,
  hints: string,
  shared: Pick<
    SharedToolSettings,
    | 'model'
    | 'detail'
    | 'alwaysIncludeClothing'
    | 'seedLlmWithIngredients'
    | 'lockedWardrobeId'
    | 'lockedLocation'
  >,
  toolSettings: VariationsToolCache,
  getRecentClothing: () => string[],
  getRecentLocations: () => string[],
  getBlocklist: () => string[],
  overrides: CellOverrides = {}
) {
  const avoidance = avoidedTokensRequestBody();
  const variationStrength = overrides.variationStrength ?? toolSettings.variationStrength ?? 65;
  const sportPresetId = overrides.sportPresetId ?? toolSettings.sportPresetId;
  const lockedLocation = overrides.lockedLocation ?? shared.lockedLocation;
  const portraitStyle = toolSettings.portraitStyle ?? 'action';

  if (target === 'generate') {
    return {
      input: hints,
      mode: 'positive' as const,
      model: shared.model,
      detail: shared.detail,
      variation: {
        enabled: true,
        strength: variationStrength,
      },
      alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
      seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
      recentClothing: getRecentClothing(),
      lockedWardrobeId: shared.lockedWardrobeId,
      lockedLocation,
      ...avoidance,
    };
  }

  if (target === 'background') {
    const settingType = overrides.lockedLocation ? `${hints}, ${overrides.lockedLocation}` : hints;
    return {
      model: shared.model,
      detail: shared.detail,
      settingType,
      recentLocations: getRecentLocations(),
      blockedLocations: getBlocklist(),
      ...avoidance,
    };
  }

  if (target === 'pet') {
    return {
      hints,
      model: shared.model,
      detail: shared.detail,
      portraitStyle,
      variationStrength,
      recentLocations: getRecentLocations(),
      blockedLocations: getBlocklist(),
      lockedLocation,
      ...avoidance,
    };
  }

  if (target === 'fantasy') {
    return {
      hints,
      model: shared.model,
      detail: shared.detail,
      portraitStyle,
      wildness: 65,
      variationStrength,
      recentLocations: getRecentLocations(),
      recentClothing: getRecentClothing(),
      blockedLocations: getBlocklist(),
      lockedLocation,
      lockedWardrobeId: shared.lockedWardrobeId,
      alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
      seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
      ...avoidance,
    };
  }

  if (target === 'character') {
    return {
      hints,
      model: shared.model,
      detail: shared.detail,
      portraitStyle,
      variationStrength,
      alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
      seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
      recentClothing: getRecentClothing(),
      lockedWardrobeId: shared.lockedWardrobeId,
      lockedLocation,
      blockedLocations: getBlocklist(),
      ...avoidance,
    };
  }

  return {
    hints,
    model: shared.model,
    detail: shared.detail,
    portraitStyle,
    variationStrength,
    sportPresetId,
    teamKit: false,
    alwaysIncludeClothing: shared.alwaysIncludeClothing === true,
    seedLlmWithIngredients: shared.seedLlmWithIngredients === true,
    recentClothing: getRecentClothing(),
    lockedWardrobeId: shared.lockedWardrobeId,
    lockedLocation,
    blockedLocations: getBlocklist(),
    ...avoidance,
  };
}
