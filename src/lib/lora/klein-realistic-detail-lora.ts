import {
  createLoraLibraryEntryFromFilename,
  normalizeLoraLibrary,
  type LoraLibraryEntry,
} from './stack';
import { isKleinBaseModel } from '../model/sampler-defaults';
import { enrichLoraLibraryWithKleinUltraReal } from './klein-ultra-real-lora';

/** Stable Settings / model-map id for Klein Base realistic-detail LoRA. */
export const KLEIN_REALISTIC_DETAIL_LORA_ID = 'klein-realistic-detail';

/** Mid strength — stacks with Klein Ultra Real @ 0.8 (keep cumulative under ~1.5). */
export const KLEIN_REALISTIC_DETAIL_STRENGTH = 0.7;

/** Training tag from Flux2 Klein 9B Realistic Detail LoRA metadata. */
export const KLEIN_REALISTIC_DETAIL_TRIGGER = 'srx_detail';

const DETAIL_NAME_RE =
  /klein.*realistic\s*detail|realistic\s*detail.*klein|flux2?\s*klein.*detail/i;

export function loraFilenameLooksLikeKleinRealisticDetail(filename: string | undefined): boolean {
  const name = filename?.trim() ?? '';
  if (!name) {
    return false;
  }
  return DETAIL_NAME_RE.test(name);
}

export function pickKleinRealisticDetailFromInventory(
  loras: string[] | undefined | null
): string | undefined {
  const pool = (loras ?? []).map(name => name.trim()).filter(Boolean);
  const exact = pool.find(name => /flux2?\s*klein\s*9b\s*realistic\s*detail/i.test(name));
  if (exact) {
    return exact;
  }
  return pool.find(name => loraFilenameLooksLikeKleinRealisticDetail(name));
}

/** Prefix `srx_detail` when missing so the detail LoRA actually fires. */
export function ensureKleinRealisticDetailTriggerInPrompt(positive: string | undefined): string {
  const text = positive?.trim() ?? '';
  if (!text) {
    return KLEIN_REALISTIC_DETAIL_TRIGGER;
  }
  if (new RegExp(`\\b${KLEIN_REALISTIC_DETAIL_TRIGGER}\\b`, 'i').test(text)) {
    return text;
  }
  return `${KLEIN_REALISTIC_DETAIL_TRIGGER}, ${text}`;
}

function withDetailDefaults(entry: LoraLibraryEntry, filename: string): LoraLibraryEntry {
  return {
    ...entry,
    tokenValue: entry.tokenValue?.trim() || filename,
    strengthModel: KLEIN_REALISTIC_DETAIL_STRENGTH,
    strengthClip: KLEIN_REALISTIC_DETAIL_STRENGTH,
    enabled: true,
    triggerPhrase: entry.triggerPhrase?.trim() || KLEIN_REALISTIC_DETAIL_TRIGGER,
    label: entry.label.trim() || 'Klein Realistic Detail',
  };
}

export function ensureKleinRealisticDetailInLibrary(
  library: LoraLibraryEntry[] | undefined,
  detailFilename: string | undefined
): LoraLibraryEntry[] {
  const normalized = normalizeLoraLibrary(library);
  const filename = detailFilename?.trim();
  if (!filename) {
    return normalized;
  }

  const byId = normalized.find(entry => entry.id.trim() === KLEIN_REALISTIC_DETAIL_LORA_ID);
  if (byId) {
    return normalized.map(entry => {
      if (entry.id.trim() !== KLEIN_REALISTIC_DETAIL_LORA_ID) {
        return entry;
      }
      return {
        ...withDetailDefaults(entry, filename),
        id: KLEIN_REALISTIC_DETAIL_LORA_ID,
      };
    });
  }

  const byFilename = normalized.find(
    entry =>
      entry.tokenValue.trim().toLowerCase() === filename.toLowerCase() ||
      loraFilenameLooksLikeKleinRealisticDetail(entry.tokenValue)
  );
  if (byFilename) {
    return normalized.map(entry => {
      if (entry.id !== byFilename.id) {
        return entry;
      }
      return {
        ...withDetailDefaults(entry, filename),
        id: KLEIN_REALISTIC_DETAIL_LORA_ID,
        tokenValue: filename,
      };
    });
  }

  const created = createLoraLibraryEntryFromFilename(filename, normalized);
  return [
    ...normalized,
    {
      ...withDetailDefaults(created, filename),
      id: KLEIN_REALISTIC_DETAIL_LORA_ID,
      label: 'Klein Realistic Detail',
      tokenValue: filename,
    },
  ];
}

export function enrichLoraLibraryForKleinBaseModel(
  model: string | undefined,
  library: LoraLibraryEntry[] | undefined,
  availableLoras?: string[] | null
): LoraLibraryEntry[] {
  if (!isKleinBaseModel(model ?? '')) {
    return normalizeLoraLibrary(library);
  }
  const detail =
    pickKleinRealisticDetailFromInventory(availableLoras) ??
    normalizeLoraLibrary(library).find(entry =>
      loraFilenameLooksLikeKleinRealisticDetail(entry.tokenValue)
    )?.tokenValue;
  const withDetail = ensureKleinRealisticDetailInLibrary(library, detail);
  return enrichLoraLibraryWithKleinUltraReal(model, withDetail, availableLoras);
}
