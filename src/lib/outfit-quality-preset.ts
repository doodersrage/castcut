import { renderQualityLabel, type RenderQuality } from './render-quality';
import type { QueueQualityProfile } from './queue-quality-profile';
import { renderQualityFromProfile } from './render-quality';

/**
 * Outfit's one Quality control, in Day's vocabulary: Fast / Balanced / Best. A preset is a
 * render quality (the Engine's Good / Best, written to the `fitting` tool queue profile) plus
 * the two try-on switches that used to sit under the action row. The preset is never stored —
 * it is read back from the switches, and shows as Custom when they match none (an Advanced
 * edit).
 */

export type OutfitQualityPreset = 'fast' | 'balanced' | 'best';

export type OutfitQualityPresetChoice = OutfitQualityPreset | 'custom';

export type OutfitQualityChecks = {
  /** Each finished try-on is followed by a back view beside it. */
  frontBack: boolean;
  /** Face match + a vision read of the outfit on every Compare card. */
  autoReview: boolean;
};

export type OutfitQualitySettings = OutfitQualityChecks & { renderQuality: RenderQuality };

export const OUTFIT_QUALITY_PRESETS: Record<OutfitQualityPreset, OutfitQualitySettings> = {
  // A quick look at a kit: Good render, front only, nothing scored.
  fast: { renderQuality: 'good', frontBack: false, autoReview: false },
  // The default (Outfit's old defaults): Good render, turned around once it lands.
  balanced: { renderQuality: 'good', frontBack: true, autoReview: false },
  // Best render, front and back, and every try-on scored so Keep is picked with numbers.
  best: { renderQuality: 'best', frontBack: true, autoReview: true },
};

export const DEFAULT_OUTFIT_QUALITY_PRESET: OutfitQualityPreset = 'balanced';

export const OUTFIT_QUALITY_PRESET_OPTIONS: Array<{
  id: OutfitQualityPreset;
  label: string;
  hint: string;
}> = [
  {
    id: 'fast',
    label: 'Fast',
    hint: 'Good render, front only, no review — a quick look at a kit.',
  },
  { id: 'balanced', label: 'Balanced', hint: 'Good render · Front and back.' },
  {
    id: 'best',
    label: 'Best',
    hint: 'Best render · Front and back · Auto-review try-ons — needs ComfyUI_FaceAnalysis and a vision model.',
  },
];

export function outfitQualityPresetSettings(preset: OutfitQualityPreset): OutfitQualitySettings {
  return { ...OUTFIT_QUALITY_PRESETS[preset] };
}

/** The preset these settings spell, or Custom when they match none. */
export function deriveOutfitQualityPreset(
  settings: OutfitQualitySettings
): OutfitQualityPresetChoice {
  for (const preset of ['fast', 'balanced', 'best'] as const) {
    const candidate = OUTFIT_QUALITY_PRESETS[preset];
    if (
      candidate.renderQuality === settings.renderQuality &&
      candidate.frontBack === settings.frontBack &&
      candidate.autoReview === settings.autoReview
    ) {
      return preset;
    }
  }
  return 'custom';
}

export function outfitQualityPresetLabel(choice: OutfitQualityPresetChoice): string {
  if (choice === 'custom') return 'Custom';
  return OUTFIT_QUALITY_PRESET_OPTIONS.find(option => option.id === choice)?.label ?? choice;
}

/** Outfit's quality settings as stored: the tool switches plus the `fitting` queue profile. */
export function outfitQualitySettingsOf(
  tool: { tryOnFrontBack?: boolean; autoReviewTryOns?: boolean },
  fittingProfile: QueueQualityProfile | undefined
): OutfitQualitySettings {
  return {
    renderQuality: renderQualityFromProfile(fittingProfile),
    // Front and back has always been on unless switched off.
    frontBack: tool.tryOnFrontBack !== false,
    autoReview: tool.autoReviewTryOns === true,
  };
}

/** The tool-settings patch (the two switches) a preset writes — one write, not two. */
export function outfitQualityChecksPatch(settings: OutfitQualitySettings): {
  tryOnFrontBack: boolean;
  autoReviewTryOns: boolean;
} {
  return { tryOnFrontBack: settings.frontBack, autoReviewTryOns: settings.autoReview };
}

/** "Good render · Front and back" — what the next try-on will do. */
export function outfitQualitySummary(settings: OutfitQualitySettings): string {
  const parts = [`${renderQualityLabel(settings.renderQuality)} render`];
  if (settings.frontBack) parts.push('Front and back');
  if (settings.autoReview) parts.push('Auto-review try-ons');
  return parts.join(' · ');
}
