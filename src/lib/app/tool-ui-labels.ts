import { variationStrengthLabel } from '../variation/settings';

export const SCENE_HINTS_LABEL = 'Scene hints (optional)';
export const SHOT_SCALE_LABEL = 'Shot scale';
export const ROLL_VARIATION_LABEL = 'Roll variation';
export const CONCEPT_WILDNESS_LABEL = 'Concept wildness';
export const SCENE_WILDNESS_LABEL = 'Scene wildness';
export const TOPIC_VARIETY_LABEL = 'Topic variety';
export const RANDOMIZE_INGREDIENTS_LABEL = 'Randomize ingredients';
export const PINNED_VARIATION_SEED_LABEL = 'Pinned variation seed';
export const THEME_HINT_LABEL = 'Theme hint (optional)';
export const DESCRIPTION_PRESET_LABEL = 'Description preset';
export const DESCRIPTION_FOCUS_LABEL = 'Description focus';
export const EXTRA_HINTS_LABEL = 'Extra hints (optional)';

export const SUBJECT_SHOT_SCALE_OPTIONS = [
  { label: 'Portrait', value: 'portrait' },
  { label: 'Full body', value: 'full-body' },
  { label: 'Action', value: 'action' },
] as const;

export const FANTASY_SHOT_SCALE_OPTIONS = [
  ...SUBJECT_SHOT_SCALE_OPTIONS,
  { label: 'Wide', value: 'wide' },
] as const;

export type SubjectShotScale = (typeof SUBJECT_SHOT_SCALE_OPTIONS)[number]['value'];
export type FantasyShotScale = (typeof FANTASY_SHOT_SCALE_OPTIONS)[number]['value'];

export function rollVariationLabel(strength: number): string {
  return variationStrengthLabel(strength);
}

export function conceptWildnessLabel(strength: number): string {
  if (strength <= 25) {
    return 'Grounded';
  }
  if (strength <= 50) {
    return 'Mixed';
  }
  if (strength <= 75) {
    return 'Strange';
  }
  return 'Surreal';
}

export function sceneWildnessLabel(strength: number): string {
  if (strength <= 25) {
    return 'Safe';
  }
  if (strength <= 50) {
    return 'Balanced';
  }
  if (strength <= 75) {
    return 'Bold';
  }
  return 'Wild';
}

export function topicVarietyLabel(strength: number): string {
  if (strength <= 25) {
    return 'Focused';
  }
  if (strength <= 50) {
    return 'Varied';
  }
  if (strength <= 75) {
    return 'Diverse';
  }
  return 'Exploratory';
}
