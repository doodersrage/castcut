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
  /** "24 GB card → Max size · Final quality". */
  label: string;
};

const SIZE_LABEL: Record<ResolutionSizeTier, string> = {
  small: 'Small size',
  medium: 'Medium size',
  max: 'Max size',
};
const QUALITY_LABEL: Record<GpuSettingsSuggestion['qualityProfile'], string> = {
  draft: 'Draft quality',
  final: 'Final quality',
  max: 'Max quality',
};

/** Suggestion for a card with `totalBytes` of VRAM, or null when unknown. */
export function gpuSettingsSuggestion(
  totalBytes: number | null | undefined
): GpuSettingsSuggestion | null {
  if (typeof totalBytes !== 'number' || !Number.isFinite(totalBytes) || totalBytes <= 0) {
    return null;
  }
  const totalGb = Math.round(totalBytes / 1e9);
  const [sizeTier, qualityProfile]: [ResolutionSizeTier, GpuSettingsSuggestion['qualityProfile']] =
    totalGb < 10
      ? ['small', 'draft']
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
