import {
  createLoraLibraryEntryFromFilename,
  normalizeLoraLibrary,
  type LoraLibraryEntry,
} from './stack';
import { isFluxFineTuneCheckpointModel } from '../model/checkpoint-map';

/** Stable Settings / model-map id for Danrisi Realism Amplifier. */
export const ULTRAREAL_AMPLIFIER_LORA_ID = 'ultrareal-amplifier';

/** Civitai tip: 0.5–0.7 amplifies realism; 0.9–1.0 goes Nokia/digicam.
 * Prefer mid-low of the band — 0.7 + d1g1cam pushes glossy contrast/overbake. */
export const ULTRAREAL_AMPLIFIER_STRENGTH = 0.55;

/** Official Realistic Amplifier trigger — must appear in the positive prompt. */
export const ULTRAREAL_AMPLIFIER_TRIGGER = 'd1g1cam';

const AMPLIFIER_NAME_RE =
  /realistic?\s*amplifier|realism\s*amplifier|amplifier.*ultrareal|ultrareal.*amplifier/i;

export function loraFilenameLooksLikeUltraRealAmplifier(filename: string | undefined): boolean {
  const name = filename?.trim() ?? '';
  if (!name) {
    return false;
  }
  // Explicitly exclude UltraRealPhoto / UltraRealism style LoRAs (author: overbakes).
  if (/ultrareal\s*photo|ultrarealism|canopus.*ultrareal/i.test(name)) {
    return false;
  }
  return AMPLIFIER_NAME_RE.test(name);
}

/** Prefer Danrisi Realistic Amplifier from ComfyUI loras/. */
export function pickUltraRealAmplifierFromInventory(
  loras: string[] | undefined | null
): string | undefined {
  const pool = (loras ?? []).map(name => name.trim()).filter(Boolean);
  const exact = pool.find(name => /realistic\s+amplifier\s+for\s+ultrareal/i.test(name));
  if (exact) {
    return exact;
  }
  return pool.find(name => loraFilenameLooksLikeUltraRealAmplifier(name));
}

/** Prefix `d1g1cam` when missing so the amplifier LoRA actually fires. */
export function ensureUltraRealAmplifierTriggerInPrompt(positive: string | undefined): string {
  const text = positive?.trim() ?? '';
  if (!text) {
    return ULTRAREAL_AMPLIFIER_TRIGGER;
  }
  if (new RegExp(`\\b${ULTRAREAL_AMPLIFIER_TRIGGER}\\b`, 'i').test(text)) {
    return text;
  }
  return `${ULTRAREAL_AMPLIFIER_TRIGGER}, ${text}`;
}

function withAmplifierDefaults(entry: LoraLibraryEntry, filename: string): LoraLibraryEntry {
  return {
    ...entry,
    tokenValue: entry.tokenValue?.trim() || filename,
    strengthModel: ULTRAREAL_AMPLIFIER_STRENGTH,
    strengthClip: ULTRAREAL_AMPLIFIER_STRENGTH,
    enabled: true,
    triggerPhrase: entry.triggerPhrase?.trim() || ULTRAREAL_AMPLIFIER_TRIGGER,
    label: entry.label.trim() || 'Realism Amplifier (UltraReal)',
  };
}

/**
 * Ensure the UltraReal amplifier exists in the LoRA library at the recommended
 * strength so model LoRA map id `ultrareal-amplifier` can resolve at queue time.
 */
export function ensureUltraRealAmplifierInLibrary(
  library: LoraLibraryEntry[] | undefined,
  amplifierFilename: string | undefined
): LoraLibraryEntry[] {
  const normalized = normalizeLoraLibrary(library);
  const filename = amplifierFilename?.trim();
  if (!filename) {
    return normalized;
  }

  const byId = normalized.find(entry => entry.id.trim() === ULTRAREAL_AMPLIFIER_LORA_ID);
  if (byId) {
    return normalized.map(entry => {
      if (entry.id.trim() !== ULTRAREAL_AMPLIFIER_LORA_ID) {
        return entry;
      }
      return {
        ...withAmplifierDefaults(entry, filename),
        id: ULTRAREAL_AMPLIFIER_LORA_ID,
      };
    });
  }

  const byFilename = normalized.find(
    entry =>
      entry.tokenValue.trim().toLowerCase() === filename.toLowerCase() ||
      loraFilenameLooksLikeUltraRealAmplifier(entry.tokenValue)
  );
  if (byFilename) {
    return normalized.map(entry => {
      if (entry.id !== byFilename.id) {
        return entry;
      }
      return {
        ...withAmplifierDefaults(entry, filename),
        id: ULTRAREAL_AMPLIFIER_LORA_ID,
        tokenValue: filename,
      };
    });
  }

  const created = createLoraLibraryEntryFromFilename(filename, normalized);
  return [
    ...normalized,
    {
      ...withAmplifierDefaults(created, filename),
      id: ULTRAREAL_AMPLIFIER_LORA_ID,
      label: 'Realism Amplifier (UltraReal)',
      tokenValue: filename,
    },
  ];
}

/** Enrich library for UltraReal queues when the amplifier is installed in ComfyUI. */
export function enrichLoraLibraryForUltraRealModel(
  model: string | undefined,
  library: LoraLibraryEntry[] | undefined,
  availableLoras?: string[] | null
): LoraLibraryEntry[] {
  if (!isFluxFineTuneCheckpointModel(model)) {
    return normalizeLoraLibrary(library);
  }
  const amplifier =
    pickUltraRealAmplifierFromInventory(availableLoras) ??
    normalizeLoraLibrary(library).find(entry =>
      loraFilenameLooksLikeUltraRealAmplifier(entry.tokenValue)
    )?.tokenValue;
  return ensureUltraRealAmplifierInLibrary(library, amplifier);
}
