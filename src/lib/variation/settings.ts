export type VariationSettings = {
  enabled: boolean;
  strength: number;
};

export const DEFAULT_VARIATION_SETTINGS: VariationSettings = {
  enabled: true,
  strength: 65,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeVariationSettings(
  value?: Partial<VariationSettings> | null
): VariationSettings {
  const enabled =
    typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_VARIATION_SETTINGS.enabled;

  const strength = clamp(
    typeof value?.strength === 'number' && Number.isFinite(value.strength)
      ? Math.round(value.strength)
      : DEFAULT_VARIATION_SETTINGS.strength,
    0,
    100
  );

  return {
    enabled,
    strength: enabled ? strength : 0,
  };
}

export function variationStrengthLabel(strength: number): string {
  if (strength <= 25) return 'Subtle';
  if (strength <= 50) return 'Light';
  if (strength <= 75) return 'Balanced';
  return 'Wild';
}
