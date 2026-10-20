import { isFluxFineTuneCheckpointModel } from './checkpoint-map';
import { isKleinBaseModel } from './sampler-defaults';
import { KLEIN_REALISTIC_DETAIL_LORA_ID } from '../lora/klein-realistic-detail-lora';
import { KLEIN_ULTRA_REAL_LORA_ID } from '../lora/klein-ultra-real-lora';
import { ULTRAREAL_AMPLIFIER_LORA_ID } from '../lora/ultrareal-amplifier-lora';

/**
 * Per-model default LoRA library id lists.
 * Line format: modelId=loraId1,loraId2
 * Empty value (modelId=) means no LoRAs for that model.
 */

export type ModelLoraMap = Partial<Record<string, string>>;

/** Explicit session LoRA picks keyed by model id (including empty stacks). */
import type { SessionLoraStrengthOverrides } from '../lora/stack';
import { normalizeSessionLoraStrengthOverrides } from '../lora/stack';

export type SessionActiveLoraIdsByModel = Partial<Record<string, string[]>>;
export type SessionLoraStrengthOverridesByModel = Partial<
  Record<string, SessionLoraStrengthOverrides>
>;

/** Companion realism LoRAs that stay on even when the session stack was cleared. */
export function companionRealismLoraIdsForModel(model: string | undefined): string[] {
  if (isFluxFineTuneCheckpointModel(model)) {
    return [ULTRAREAL_AMPLIFIER_LORA_ID];
  }
  if (isKleinBaseModel(model ?? '')) {
    return [KLEIN_REALISTIC_DETAIL_LORA_ID, KLEIN_ULTRA_REAL_LORA_ID];
  }
  return [];
}

/** Merge companion realism LoRAs into a session/map id list.
 * Always force companions — a stale map that lists only one id must not
 * drop the other (e.g. Klein Detail without Ultra Real v4).
 */
export function mergeCompanionRealismLoraIds(
  model: string | undefined,
  ids: string[] | undefined,
  _modelLoraMap?: ModelLoraMap
): string[] {
  const base = [...(ids ?? [])];
  for (const id of companionRealismLoraIdsForModel(model)) {
    if (!base.includes(id)) {
      base.push(id);
    }
  }
  return base;
}

/** No curated suggestions — users define ids from their LoRA library.
 * UltraReal Fine-Tune pairs with Danrisi Realism Amplifier (auto-seeded into the library).
 * Klein Base pairs with Realistic Detail + Ultra Real v4 skin LoRA (auto-seeded when installed).
 */
export const SUGGESTED_MODEL_LORA_MAP: ModelLoraMap = {
  'flux-ultrareal-v4': 'ultrareal-amplifier',
  'flux-2-klein-9b': 'klein-realistic-detail,klein-ultra-real-v4',
  'flux-2-klein': 'klein-realistic-detail,klein-ultra-real-v4',
};

export function formatModelLoraMap(map: ModelLoraMap | undefined): string {
  if (!map) {
    return '';
  }
  return Object.entries(map)
    .filter(([modelId]) => Boolean(modelId?.trim()))
    .map(([modelId, value]) => `${modelId.trim()}=${(value ?? '').trim()}`)
    .join('\n');
}

export function parseModelLoraMap(text: string): ModelLoraMap {
  const map: ModelLoraMap = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.includes('=') ? '=' : ':';
    const index = trimmed.indexOf(separator);
    if (index <= 0) {
      continue;
    }
    const modelId = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (modelId) {
      // Preserve empty values — they mean an explicit empty LoRA stack.
      map[modelId] = value;
    }
  }
  return map;
}

/**
 * Resolve mapped default LoRA library ids for a model.
 * - `undefined` if the map has no key for the model
 * - `[]` if the key exists with an empty value
 * - otherwise the comma-separated id list
 */
export function resolveModelDefaultLoraIds(
  model: string | undefined,
  map: ModelLoraMap | undefined
): string[] | undefined {
  const modelId = model?.trim();
  if (!modelId || !map || !Object.prototype.hasOwnProperty.call(map, modelId)) {
    return undefined;
  }
  const raw = (map[modelId] ?? '').trim();
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);
}

export function hasSessionLoraIdsForModel(
  byModel: SessionActiveLoraIdsByModel | undefined,
  model: string | undefined
): boolean {
  const modelId = model?.trim();
  return Boolean(modelId && byModel && Object.prototype.hasOwnProperty.call(byModel, modelId));
}

/** Write or clear a per-model session LoRA pick. */
/**
 * Overlay wins per model (including empty stacks). Models only in `base` are kept.
 * Preferring the longer list used to "heal" sync gaps, but it also resurrected
 * LoRAs the user had unchecked in Compose after job/refresh.
 */
export function mergeSessionLoraIdsByModel(
  base: SessionActiveLoraIdsByModel | undefined,
  overlay: SessionActiveLoraIdsByModel | undefined
): SessionActiveLoraIdsByModel {
  if (!overlay || Object.keys(overlay).length === 0) {
    return { ...(base ?? {}) };
  }
  const result: SessionActiveLoraIdsByModel = { ...(base ?? {}) };
  for (const [model, ids] of Object.entries(overlay)) {
    if (!Array.isArray(ids)) {
      continue;
    }
    result[model] = ids;
  }
  return result;
}

export function setSessionLoraIdsForModel(
  byModel: SessionActiveLoraIdsByModel | undefined,
  model: string,
  ids: string[] | undefined
): SessionActiveLoraIdsByModel {
  const modelId = model.trim();
  const next: SessionActiveLoraIdsByModel = { ...byModel };
  if (!modelId) {
    return next;
  }
  if (ids === undefined) {
    delete next[modelId];
  } else {
    next[modelId] = ids;
  }
  return next;
}

export function hasSessionLoraStrengthOverridesForModel(
  byModel: SessionLoraStrengthOverridesByModel | undefined,
  model: string | undefined
): boolean {
  const modelId = model?.trim();
  return Boolean(modelId && byModel && Object.prototype.hasOwnProperty.call(byModel, modelId));
}

export function setSessionLoraStrengthOverridesForModel(
  byModel: SessionLoraStrengthOverridesByModel | undefined,
  model: string,
  overrides: SessionLoraStrengthOverrides | undefined
): SessionLoraStrengthOverridesByModel {
  const modelId = model.trim();
  const next: SessionLoraStrengthOverridesByModel = { ...(byModel ?? {}) };
  if (!modelId) {
    return next;
  }
  const normalized = normalizeSessionLoraStrengthOverrides(overrides);
  if (Object.keys(normalized).length === 0) {
    delete next[modelId];
  } else {
    next[modelId] = normalized;
  }
  return next;
}

export function resolveEffectiveSessionLoraStrengthOverrides(
  model: string | undefined,
  legacyGlobal: SessionLoraStrengthOverrides | undefined,
  byModel?: SessionLoraStrengthOverridesByModel
): SessionLoraStrengthOverrides {
  const modelId = model?.trim();
  if (modelId && byModel && Object.prototype.hasOwnProperty.call(byModel, modelId)) {
    return normalizeSessionLoraStrengthOverrides(byModel[modelId]);
  }
  const byModelEmpty = !byModel || Object.keys(byModel).length === 0;
  if (byModelEmpty && legacyGlobal) {
    return normalizeSessionLoraStrengthOverrides(legacyGlobal);
  }
  return {};
}

export type ResolveEffectiveSessionLoraIdsOptions = {
  sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel;
  /**
   * Legacy global session pick. Used only when this model has no per-model entry
   * and the by-model map is empty (migration / recipes).
   */
  sessionActiveLoraIds?: string[];
};

/**
 * Preference order for the active model:
 * 1. Per-model session picks (when that model has a stored key)
 * 2. Settings model LoRA map
 * 3. Empty stack (system default when untouched)
 *
 * Legacy global `sessionActiveLoraIds` is only used when the by-model store is
 * still empty (pre-migration); loadSettingsCache seeds the current model once.
 */
export function resolveEffectiveSessionLoraIds(
  sessionActiveLoraIds: string[] | undefined,
  model: string | undefined,
  modelLoraMap: ModelLoraMap | undefined,
  sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel
): string[] | undefined {
  const modelId = model?.trim();
  if (hasSessionLoraIdsForModel(sessionActiveLoraIdsByModel, modelId)) {
    return mergeCompanionRealismLoraIds(
      modelId,
      sessionActiveLoraIdsByModel![modelId!] ?? [],
      modelLoraMap
    );
  }

  const fromMap = resolveModelDefaultLoraIds(modelId, modelLoraMap);
  if (fromMap !== undefined) {
    return mergeCompanionRealismLoraIds(modelId, fromMap, modelLoraMap);
  }

  const byModelEmpty =
    !sessionActiveLoraIdsByModel || Object.keys(sessionActiveLoraIdsByModel).length === 0;
  if (sessionActiveLoraIds !== undefined && byModelEmpty) {
    return mergeCompanionRealismLoraIds(modelId, sessionActiveLoraIds, modelLoraMap);
  }

  // Untouched model: still attach mapped companion realism LoRAs when present.
  return mergeCompanionRealismLoraIds(modelId, [], modelLoraMap);
}

/** Resolve which LoRA ids to show/apply when switching to a model. */
export function resolveLoraIdsForModelSelection(
  model: string | undefined,
  options: {
    sessionActiveLoraIdsByModel?: SessionActiveLoraIdsByModel;
    modelLoraMap?: ModelLoraMap;
    sessionActiveLoraIds?: string[];
  }
): string[] | undefined {
  return resolveEffectiveSessionLoraIds(
    options.sessionActiveLoraIds,
    model,
    options.modelLoraMap,
    options.sessionActiveLoraIdsByModel
  );
}
