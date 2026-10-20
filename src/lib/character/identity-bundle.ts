import type { SharedToolSettings } from '../settings/cache';
import type { NegativeProfile } from '../prompt/negative-profiles';

export type CharacterIdentityBundle = {
  version: 1;
  exportedAt: string;
  name: string;
  hints?: string;
  model?: string;
  detail?: SharedToolSettings['detail'];
  lockedWardrobeId?: string;
  lockedLocation?: string;
  lockedVariationSeed?: string;
  alwaysIncludeClothing?: boolean;
  negativeProfileId?: string;
  loraTriggerPhrases?: string[];
  characterPreset?: Record<string, unknown>;
  notes?: string;
  /** Pinned appearance block (SharedToolSettings.activeCharacterDescriptor). */
  descriptor?: string;
  /**
   * Portable IP-Adapter reference (see ipadapter-workflow-patch.ts) — the
   * workflow-token-based counterpart to this bundle's prompt-merge fields above.
   */
  ipAdapterImageFilename?: string;
  ipAdapterStrength?: number;
  ipAdapterModelFilename?: string;
};

export function buildCharacterIdentityBundle(input: {
  name: string;
  shared: SharedToolSettings;
  hints?: string;
  negativeProfileId?: string;
  loraTriggerPhrases?: string[];
  characterPreset?: Record<string, unknown>;
  notes?: string;
}): CharacterIdentityBundle {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    name: input.name.trim(),
    hints: input.hints?.trim() || undefined,
    model: input.shared.model,
    detail: input.shared.detail,
    lockedWardrobeId: input.shared.lockedWardrobeId,
    lockedLocation: input.shared.lockedLocation,
    lockedVariationSeed: input.shared.lockedVariationSeed,
    alwaysIncludeClothing: input.shared.alwaysIncludeClothing,
    negativeProfileId: input.negativeProfileId,
    loraTriggerPhrases: input.loraTriggerPhrases?.filter(Boolean),
    characterPreset: input.characterPreset,
    notes: input.notes?.trim() || undefined,
    descriptor: input.shared.activeCharacterDescriptor?.trim() || undefined,
    ipAdapterImageFilename: input.shared.ipAdapterImageFilename?.trim() || undefined,
    ipAdapterStrength: input.shared.ipAdapterStrength,
    ipAdapterModelFilename: input.shared.ipAdapterModelFilename?.trim() || undefined,
  };
}

export function applyCharacterIdentityBundle(
  bundle: CharacterIdentityBundle
): Partial<SharedToolSettings> & {
  hints?: string;
  negativeProfileId?: string;
  loraTriggerPhrases?: string[];
} {
  // Omit undefined keys so applying a character without a saved model/detail
  // does not wipe the live session (`{ ...shared, model: undefined }`).
  const patch: Partial<SharedToolSettings> & {
    hints?: string;
    negativeProfileId?: string;
    loraTriggerPhrases?: string[];
  } = {};
  if (bundle.model) {
    patch.model = bundle.model as SharedToolSettings['model'];
  }
  if (bundle.detail) {
    patch.detail = bundle.detail;
  }
  if (bundle.lockedWardrobeId !== undefined) {
    patch.lockedWardrobeId = bundle.lockedWardrobeId;
  }
  if (bundle.lockedLocation !== undefined) {
    patch.lockedLocation = bundle.lockedLocation;
  }
  if (bundle.lockedVariationSeed !== undefined) {
    patch.lockedVariationSeed = bundle.lockedVariationSeed;
  }
  if (bundle.alwaysIncludeClothing !== undefined) {
    patch.alwaysIncludeClothing = bundle.alwaysIncludeClothing;
  }
  if (bundle.hints !== undefined) {
    patch.hints = bundle.hints;
  }
  if (bundle.negativeProfileId !== undefined) {
    patch.negativeProfileId = bundle.negativeProfileId;
  }
  if (bundle.descriptor !== undefined) {
    patch.activeCharacterDescriptor = bundle.descriptor;
  }
  if (bundle.ipAdapterImageFilename !== undefined) {
    patch.ipAdapterImageFilename = bundle.ipAdapterImageFilename;
  }
  if (bundle.ipAdapterStrength !== undefined) {
    patch.ipAdapterStrength = bundle.ipAdapterStrength;
  }
  if (bundle.ipAdapterModelFilename !== undefined) {
    patch.ipAdapterModelFilename = bundle.ipAdapterModelFilename;
  }
  if (bundle.loraTriggerPhrases !== undefined) {
    patch.loraTriggerPhrases = bundle.loraTriggerPhrases;
  }
  return patch;
}

export function parseCharacterIdentityBundle(raw: string): CharacterIdentityBundle {
  const parsed = JSON.parse(raw) as CharacterIdentityBundle;
  if (!parsed || parsed.version !== 1 || !parsed.name?.trim()) {
    throw new Error('Invalid character identity bundle.');
  }
  return parsed;
}

export function downloadCharacterIdentityBundle(bundle: CharacterIdentityBundle): void {
  const payload = JSON.stringify(bundle, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `character-${bundle.name.replace(/\s+/g, '-').slice(0, 40)}-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function negativeProfileFromBundle(
  bundle: CharacterIdentityBundle,
  profiles: NegativeProfile[]
): NegativeProfile | undefined {
  if (!bundle.negativeProfileId) {
    return undefined;
  }
  return profiles.find(entry => entry.id === bundle.negativeProfileId);
}
