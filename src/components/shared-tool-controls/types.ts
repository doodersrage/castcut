import type { DetailLevel } from '@/lib/detail-level';
import type { SharedToolSettings } from '@/lib/settings-cache';

export type SharedToolControlsProps = {
  shared: SharedToolSettings;
  onModelChange: (model: SharedToolSettings['model']) => void;
  onDetailChange: (detail: DetailLevel) => void;
  detailHelp?: string;
  showWardrobeOption?: boolean;
  alwaysIncludeClothing?: boolean;
  onAlwaysIncludeClothingChange?: (value: boolean) => void;
  wardrobeHelp?: string;
  /** When false, LLM gets keywords/hints only (no location/wardrobe seeds). */
  seedLlmWithIngredients?: boolean;
  onSeedLlmWithIngredientsChange?: (value: boolean) => void;
  lockedWardrobeId?: string;
  lockedWardrobeLabel?: string;
  onClearLockedWardrobe?: () => void;
  lockedLocation?: string;
  onClearLockedLocation?: () => void;
  lockedVariationSeed?: string;
  onClearLockedVariationSeed?: () => void;
  autoFixRules?: boolean;
  onAutoFixRulesChange?: (value: boolean) => void;
  onWorkflowPresetChange?: (fileId: string | undefined) => void;
  activeCharacterDescriptor?: string;
  onActiveCharacterDescriptorChange?: (value: string) => void;
  recommendFromText?: string;
  /** Text used for wildcard expand preview (defaults to recommendFromText). */
  wildcardPreviewText?: string;
  /** When set, enables a per-tool queue quality override below the global profile. */
  toolId?: string;
  /**
   * The tool's own Quality preset owns Good / Best (Day): the Engine shows "Set by Quality:
   * <label>" in place of the chips, and the manual override lives with that preset.
   */
  qualitySetBy?: { label: string; hint?: string };
  /**
   * Roleplay From photo: limit the picker to edit / img2img checkpoints.
   * T2I models overbake a reference still.
   */
  preferEditModels?: boolean;
  onSharedSettingsChange?: (partial: Partial<SharedToolSettings>) => void;
  /**
   * Roleplay Play rail: engine + model + identity on the surface;
   * quality and LoRA under Advanced. Hides Generate-oriented blocks.
   */
  variant?: 'default' | 'roleplay';
};
