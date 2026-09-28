import { getComfyModelDefinition } from './comfy-models/client';
import { KLEIN_REALISTIC_DETAIL_LORA_ID } from './klein-realistic-detail-lora';
import { KLEIN_ULTRA_REAL_LORA_ID } from './klein-ultra-real-lora';
import type { LoraLibraryEntry } from './lora-stack';
import { loraFamilyForModel } from './lora-family-detect';
import { companionRealismLoraIdsForModel } from './model-lora-map';
import { ULTRAREAL_AMPLIFIER_LORA_ID } from './ultrareal-amplifier-lora';
import {
  classifyLoaderFilenameFamily,
  resolveModelStackFamily,
  type WorkflowStackFamily,
} from './workflow-stack-fingerprint';

export type LoraCompatFamily = WorkflowStackFamily | 'wan';

const KNOWN_COMPANION_IDS = new Set([
  KLEIN_REALISTIC_DETAIL_LORA_ID,
  KLEIN_ULTRA_REAL_LORA_ID,
  ULTRAREAL_AMPLIFIER_LORA_ID,
]);

export function resolveLoraFilterFamily(model?: string): LoraCompatFamily {
  const modelId = model?.trim() ?? '';
  if (!modelId) {
    return 'unknown';
  }
  const def = getComfyModelDefinition(modelId);
  if (def.id !== modelId) {
    return 'unknown';
  }
  if (def.category === 'video') {
    return 'wan';
  }
  return resolveModelStackFamily(modelId);
}

export function classifyLoraEntryFamily(entry: LoraLibraryEntry): LoraCompatFamily {
  const id = entry.id.trim();
  if (id === KLEIN_REALISTIC_DETAIL_LORA_ID || id === KLEIN_ULTRA_REAL_LORA_ID) {
    return 'flux-klein';
  }
  if (id === ULTRAREAL_AMPLIFIER_LORA_ID) {
    return 'flux';
  }

  const haystack = [entry.tokenValue, entry.label, entry.id].filter(Boolean).join(' ');
  const lower = haystack.toLowerCase();
  if (/klein|flux2-klein|flux-2-klein/.test(lower)) {
    return 'flux-klein';
  }
  if (/\bwan\b|wan2|wan-video|wan_video/.test(lower)) {
    return 'wan';
  }
  return classifyLoaderFilenameFamily(entry.tokenValue?.trim() || haystack);
}

function isAmbiguousFamily(family: LoraCompatFamily): boolean {
  return family === 'unknown' || family === 'other';
}

export function isLoraCompatibleWithModel(entry: LoraLibraryEntry, model?: string): boolean {
  const id = entry.id.trim();
  const companions = companionRealismLoraIdsForModel(model);
  if (companions.includes(id)) {
    return true;
  }
  if (KNOWN_COMPANION_IDS.has(id)) {
    return false;
  }

  // Scanned: the file says what it was trained for — match strictly. A scanned file that is
  // still unknown isn't offered by default (it used to count as compatible everywhere).
  if (entry.family && entry.familySource !== 'unreadable' && entry.familySource !== 'missing') {
    const wanted = loraFamilyForModel(model);
    if (!wanted) return true;
    return entry.family === wanted;
  }
  const modelFamily = resolveLoraFilterFamily(model);
  const loraFamily = classifyLoraEntryFamily(entry);
  if (isAmbiguousFamily(modelFamily) || isAmbiguousFamily(loraFamily)) {
    return true;
  }
  return loraFamily === modelFamily;
}

export function filterLorasForSelectedModel(
  entries: LoraLibraryEntry[],
  model?: string,
  options?: { alwaysIncludeIds?: Iterable<string>; showAll?: boolean }
): LoraLibraryEntry[] {
  if (options?.showAll) {
    return entries;
  }
  const alwaysInclude = new Set(
    [...(options?.alwaysIncludeIds ?? [])].map(id => id.trim()).filter(Boolean)
  );
  return entries.filter(
    entry => alwaysInclude.has(entry.id.trim()) || isLoraCompatibleWithModel(entry, model)
  );
}

export function loraModelFilterLabel(model?: string): string {
  const modelId = model?.trim() ?? '';
  if (!modelId) {
    return 'this model';
  }
  const def = getComfyModelDefinition(modelId);
  return def.id === modelId ? def.label : modelId;
}
