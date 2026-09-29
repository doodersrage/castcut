/**
 * "Match this GPU": render size and default queue quality sized to the card ComfyUI reports,
 * instead of one-size defaults. Only settings still at their defaults are changed. Pure.
 */

import type { ResolutionSizeTier } from './model-resolution-defaults';
import type { QueueQualityProfile } from './queue-quality-profile';
import type { SharedToolSettings } from './settings-cache';

export type GpuSettingsSuggestion = {
  totalGb: number;
  sizeTier: ResolutionSizeTier;
  qualityProfile: Exclude<QueueQualityProfile, 'followSettings'>;
  /** "24 GB card → Max size · Good quality". */
  label: string;
};

const SIZE_LABEL: Record<ResolutionSizeTier, string> = {
  small: 'Small size',
  medium: 'Medium size',
  max: 'Max size',
};
const QUALITY_LABEL: Record<GpuSettingsSuggestion['qualityProfile'], string> = {
  draft: 'Fast quality',
  final: 'Good quality',
  max: 'Best quality',
};

/** Suggestion for a card with `totalBytes` of VRAM, or null when unknown. */
export function gpuSettingsSuggestion(
  totalBytes: number | null | undefined
): GpuSettingsSuggestion | null {
  if (typeof totalBytes !== 'number' || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return null;
  }
  // Binary GB, as cards are sold: a 24 GB 4090 reports 25.3e9 bytes ("25 GB" in decimal).
  const totalGb = Math.round(totalBytes / 2 ** 30);
  const [sizeTier, qualityProfile]: [ResolutionSizeTier, GpuSettingsSuggestion['qualityProfile']] =
    // Small canvas does the saving on small cards — Fast (draft) always queued as Good anyway.
    totalGb < 10
      ? ['small', 'final']
      : totalGb < 14
        ? ['small', 'final']
        : totalGb < 20
          ? ['medium', 'final']
          : totalGb < 40
            ? ['max', 'final']
            : ['max', 'max'];
  return {
    totalGb,
    sizeTier,
    qualityProfile,
    label: `${totalGb} GB card → ${SIZE_LABEL[sizeTier]} · ${QUALITY_LABEL[qualityProfile]}`,
  };
}

/**
 * Patch applying a suggestion — only to settings still at their defaults, so nothing the
 * player chose is overwritten. Empty when there's nothing to change.
 */
export function gpuSettingsPatch(
  shared: Partial<SharedToolSettings>,
  defaults: Partial<SharedToolSettings>,
  suggestion: GpuSettingsSuggestion
): Partial<SharedToolSettings> {
  const patch: Partial<SharedToolSettings> = {};
  const atDefault = (key: 'modelResolutionSizeTier' | 'queueQualityProfile') =>
    shared[key] === undefined || shared[key] === defaults[key];
  if (
    atDefault('modelResolutionSizeTier') &&
    shared.modelResolutionSizeTier !== suggestion.sizeTier
  ) {
    patch.modelResolutionSizeTier = suggestion.sizeTier;
  }
  if (
    atDefault('queueQualityProfile') &&
    shared.queueQualityProfile !== suggestion.qualityProfile
  ) {
    patch.queueQualityProfile = suggestion.qualityProfile;
  }
  return patch;
}

/**
 * The one-time automatic match for this card: the patch plus the values it replaces (for Undo).
 * Null when this card was already matched (or offered, before matching went automatic).
 */
export function gpuAutoMatchPlan(
  shared: Partial<SharedToolSettings>,
  defaults: Partial<SharedToolSettings>,
  suggestion: GpuSettingsSuggestion
): { patch: Partial<SharedToolSettings>; previous: Partial<SharedToolSettings> } | null {
  if (shared.gpuMatchAutoGb === suggestion.totalGb) {
    return null;
  }
  const changes = gpuSettingsPatch(shared, defaults, suggestion);
  const previous: Partial<SharedToolSettings> = {};
  for (const key of Object.keys(changes) as Array<keyof typeof changes>) {
    (previous as Record<string, unknown>)[key] = shared[key];
  }
  return { patch: { ...changes, gpuMatchAutoGb: suggestion.totalGb }, previous };
}
