import {
  createLoraLibraryEntryFromFilename,
  normalizeLoraLibrary,
  type LoraLibraryEntry,
} from './stack';
import { isKleinBaseModel } from '../model/sampler-defaults';

/** Stable Settings / model-map id for Klein-trained Ultra Real v4 skin LoRA. */
export const KLEIN_ULTRA_REAL_LORA_ID = 'klein-ultra-real-v4';

/**
 * Skin-texture companion for Klein Base (`ultra_real_v4.safetensors`, base
 * flux2_klein_9b). Prefer the upper mid of the 0.5–0.8 band for plastic skin.
 */
export const KLEIN_ULTRA_REAL_STRENGTH = 0.8;

const ULTRA_REAL_NAME_RE = /^ultra[_ -]?real[_ -]?v\d+/i;

export function loraFilenameLooksLikeKleinUltraReal(filename: string | undefined): boolean {
  const name = filename?.trim() ?? '';
  if (!name) {
    return false;
  }
  // Exclude UltraReal Fine-Tune amplifiers / Canopus UltraRealism packs.
  if (/amplifier|canopus|ultrareal\s*photo|ultrarealism|ultrareal.?fine.?tune/i.test(name)) {
    return false;
  }
  return ULTRA_REAL_NAME_RE.test(name.replace(/\.safetensors$/i, ''));
}

export function pickKleinUltraRealFromInventory(
  loras: string[] | undefined | null
): string | undefined {
  const pool = (loras ?? []).map(name => name.trim()).filter(Boolean);
  const exact = pool.find(name => /^ultra_real_v4\.safetensors$/i.test(name));
  if (exact) {
    return exact;
  }
  return pool.find(name => loraFilenameLooksLikeKleinUltraReal(name));
}

function withUltraRealDefaults(entry: LoraLibraryEntry, filename: string): LoraLibraryEntry {
  return {
    ...entry,
    tokenValue: entry.tokenValue?.trim() || filename,
    strengthModel: KLEIN_ULTRA_REAL_STRENGTH,
    strengthClip: KLEIN_ULTRA_REAL_STRENGTH,
    enabled: true,
    triggerPhrase: entry.triggerPhrase?.trim() || '',
    label: entry.label.trim() || 'Klein Ultra Real v4',
  };
}

export function ensureKleinUltraRealInLibrary(
  library: LoraLibraryEntry[] | undefined,
  ultraRealFilename: string | undefined
): LoraLibraryEntry[] {
  const normalized = normalizeLoraLibrary(library);
  const filename = ultraRealFilename?.trim();
  if (!filename) {
    return normalized;
  }

  const byId = normalized.find(entry => entry.id.trim() === KLEIN_ULTRA_REAL_LORA_ID);
  if (byId) {
    return normalized.map(entry => {
      if (entry.id.trim() !== KLEIN_ULTRA_REAL_LORA_ID) {
        return entry;
      }
      return {
        ...withUltraRealDefaults(entry, filename),
        id: KLEIN_ULTRA_REAL_LORA_ID,
      };
    });
  }

  const byFilename = normalized.find(
    entry =>
      entry.tokenValue.trim().toLowerCase() === filename.toLowerCase() ||
      loraFilenameLooksLikeKleinUltraReal(entry.tokenValue)
  );
  if (byFilename) {
    return normalized.map(entry => {
      if (entry.id !== byFilename.id) {
        return entry;
      }
      return {
        ...withUltraRealDefaults(entry, filename),
        id: KLEIN_ULTRA_REAL_LORA_ID,
        tokenValue: filename,
      };
    });
  }

  const created = createLoraLibraryEntryFromFilename(filename, normalized);
  return [
    ...normalized,
    {
      ...withUltraRealDefaults(created, filename),
      id: KLEIN_ULTRA_REAL_LORA_ID,
      label: 'Klein Ultra Real v4',
      tokenValue: filename,
    },
  ];
}

export function enrichLoraLibraryWithKleinUltraReal(
  model: string | undefined,
  library: LoraLibraryEntry[] | undefined,
  availableLoras?: string[] | null
): LoraLibraryEntry[] {
  if (!isKleinBaseModel(model ?? '')) {
    return normalizeLoraLibrary(library);
  }
  const ultra =
    pickKleinUltraRealFromInventory(availableLoras) ??
    normalizeLoraLibrary(library).find(entry =>
      loraFilenameLooksLikeKleinUltraReal(entry.tokenValue)
    )?.tokenValue;
  return ensureKleinUltraRealInLibrary(library, ultra);
}
