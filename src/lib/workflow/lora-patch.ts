import type { WorkflowDirectPatchCounts } from './direct-patch';
import { isBooguTurboModel, isZImageTurboModel } from '../model-denoise-defaults';

const LORA_LOADER_TYPES = new Set([
  'LoraLoader',
  'LoraLoaderModelOnly',
  'Power Lora Loader (rgthree)',
]);

/**
 * True for stock LoRA loaders and ComfyUI-Custom-Scripts variants such as
 * `LoraLoader|pysssss` (class_type uses `|` for the UI extension id).
 */
export function isLoraLoaderClassType(classType: string | undefined | null): boolean {
  const raw = (classType ?? '').trim();
  if (!raw) {
    return false;
  }
  if (raw === 'Power Lora Loader (rgthree)') {
    return true;
  }
  if (LORA_LOADER_TYPES.has(raw)) {
    return true;
  }
  const base = raw.split('|')[0]?.trim() ?? '';
  return base === 'LoraLoader' || base === 'LoraLoaderModelOnly';
}

function isUnresolvedWorkflowPlaceholder(value: unknown): boolean {
  return typeof value === 'string' && /^\{\{[A-Z0-9_-]+\}\}$/.test(value.trim());
}

export function isConcreteLoraFilename(value: unknown): boolean {
  return (
    typeof value === 'string' &&
    /\.safetensors$/i.test(value.trim()) &&
    !isUnresolvedWorkflowPlaceholder(value)
  );
}

const LIGHTNING_LORA_FILENAME_HINT = /lightning|lightx2v/i;

export const LIGHTNING_LORA_TOKEN = '{{LORA_LIGHTNING}}';

/** Library ids like LIGHTNING-2 become {{LORA_LIGHTNING-2}} — still lightning slots. */
export function isLightningFamilyLoraToken(token: string): boolean {
  const trimmed = token.trim();
  return (
    trimmed === LIGHTNING_LORA_TOKEN ||
    /^\{\{LORA_LIGHTNING[\w-]*\}\}$/i.test(trimmed) ||
    /^\{\{LORA_.*(LIGHTNING|LIGHTX2V).*\}\}$/i.test(trimmed)
  );
}

export const LORA_PLACEHOLDER_TOKEN_PATTERN = /^\{\{LORA_[A-Z0-9_-]+\}\}$/;

/** Preferred WAN 2.2 Lightning LoRA for 4-step video scaffolds. */
export const WAN_LIGHTNING_LOW_NOISE_LORA = 'Wan2.2-Lightning-low_noise_model.safetensors';

export function loraFilenameImpliesLightning(filename: string): boolean {
  return LIGHTNING_LORA_FILENAME_HINT.test(filename.trim());
}

export function loraNameImpliesLightning(
  loraName: unknown,
  loraFilenames: Record<string, string> = {}
): boolean {
  if (typeof loraName !== 'string' || !loraName.trim()) {
    return false;
  }
  const trimmed = loraName.trim();
  // Unresolved placeholders only count once mapped to a concrete Lightning file.
  if (isUnresolvedWorkflowPlaceholder(trimmed)) {
    const mapped = loraFilenames[trimmed]?.trim();
    return Boolean(mapped && loraFilenameImpliesLightning(mapped));
  }
  return loraFilenameImpliesLightning(trimmed);
}

/** True for Lightning LoRA slots, including unresolved {{LORA_LIGHTNING}} placeholders. */
export function loraNameIsLightningSlot(
  loraName: unknown,
  loraFilenames: Record<string, string> = {}
): boolean {
  if (typeof loraName === 'string') {
    const trimmed = loraName.trim();
    if (isLightningFamilyLoraToken(trimmed)) {
      return true;
    }
  }
  return loraNameImpliesLightning(loraName, loraFilenames);
}

export function resolveLoraLoaderFilename(
  loraName: unknown,
  loraFilenames: Record<string, string>
): string | null {
  if (typeof loraName !== 'string' || !loraName.trim()) {
    return null;
  }
  const trimmed = loraName.trim();
  if (isUnresolvedWorkflowPlaceholder(trimmed)) {
    return loraFilenames[trimmed]?.trim() ?? null;
  }
  return trimmed;
}

function shouldPatchLoraField(
  current: unknown,
  nextValue: string | undefined
): nextValue is string {
  if (!nextValue?.trim()) {
    return false;
  }
  if (typeof current === 'string') {
    return isUnresolvedWorkflowPlaceholder(current) || current.trim() === '';
  }
  return current == null;
}

/** Patch unresolved {{LORA_*}} placeholders on LoRA loader nodes. */
export function patchLoraNodesInWorkflow(
  workflow: Record<string, unknown>,
  loraFilenames: Record<string, string>
): { workflow: Record<string, unknown>; patched: WorkflowDirectPatchCounts } {
  const next = structuredClone(workflow);
  let patchedCount = 0;

  for (const node of Object.values(next)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
    };
    if (!isLoraLoaderClassType(record.class_type) || !record.inputs) {
      continue;
    }

    for (const [field, value] of Object.entries(record.inputs)) {
      if (typeof value !== 'string' || !isUnresolvedWorkflowPlaceholder(value)) {
        continue;
      }
      const filename = loraFilenames[value.trim()];
      if (filename && shouldPatchLoraField(value, filename)) {
        record.inputs[field] = filename;
        patchedCount += 1;
      }
    }

    if (
      'lora_name' in record.inputs &&
      typeof record.inputs.lora_name === 'string' &&
      isUnresolvedWorkflowPlaceholder(record.inputs.lora_name)
    ) {
      const token = record.inputs.lora_name.trim();
      const filename = loraFilenames[token];
      if (filename && shouldPatchLoraField(record.inputs.lora_name, filename)) {
        record.inputs.lora_name = filename;
        patchedCount += 1;
      }
    }
  }

  return {
    workflow: next,
    patched: patchedCount > 0 ? { lora: patchedCount } : {},
  };
}

export function listLoraBindTokens(
  customTokens: Array<{ token: string; value: string }>
): string[] {
  return customTokens.map(entry => entry.token.trim()).filter(token => token.startsWith('{{LORA_'));
}

export function buildLoraFilenameMapFromCustomTokens(
  customTokens: Array<{ token: string; value: string }> = []
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const entry of customTokens) {
    const token = entry.token.trim();
    const value = entry.value?.trim();
    if (token.startsWith('{{LORA_') && value) {
      map[token] = value;
    }
  }
  return map;
}

function scoreLightningLoraCandidate(name: string, model?: string): number {
  const modelId = model?.trim().toLowerCase() ?? '';
  const wantsWan = /wan/.test(modelId);
  const wantsEdit = /edit/.test(modelId);
  const wants2511 = /2511/.test(modelId);
  const want4 = /lightning-4|lightning_4/.test(modelId);
  const want8 = /lightning-8|lightning_8/.test(modelId);
  const lower = name.toLowerCase();
  let score = 1;

  if (wantsWan) {
    if (lower === WAN_LIGHTNING_LOW_NOISE_LORA.toLowerCase()) {
      score += 30;
    }
    if (/wan/.test(lower)) {
      score += 10;
    }
    if (/low[_\s-]?noise/.test(lower)) {
      score += 8;
    }
    if (/qwen|lightx2v|2512|2511/.test(lower) && !/wan/.test(lower)) {
      score -= 20;
    }
    if (want4 && /(4[\s-]?step|4steps)/i.test(lower)) {
      score += 2;
    }
    return score;
  }

  if (/wan/.test(lower) && /lightning/.test(lower)) {
    score -= 15;
  }
  if (wantsEdit && /edit/.test(lower)) {
    score += 4;
  }
  if (!wantsEdit && !/edit/.test(lower)) {
    score += 3;
  }
  if (wantsEdit && !/edit/.test(lower)) {
    score -= 5;
  }
  if (!wantsEdit && /edit/.test(lower)) {
    score -= 5;
  }
  if (wants2511 && /2511/.test(lower)) {
    score += 2;
  }
  if (want4 && /(4[\s-]?step|4steps)/i.test(lower)) {
    score += 2;
  }
  if (want8 && /(8[\s-]?step|8steps)/i.test(lower)) {
    score += 2;
  }
  if (/lightx2v/.test(lower)) {
    score += 1;
  }
  return score;
}

function pickPreferredLightningLora(candidates: string[], model?: string): string | undefined {
  if (candidates.length === 0) {
    return undefined;
  }
  const ranked = [...candidates]
    .map(name => ({ name, score: scoreLightningLoraCandidate(name, model) }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.name;
}

/**
 * Score Lightning LoRAs in inventory for the active model (edit vs t2i, 4 vs 8 step).
 * Single source used by pack soft-repair and queue `{{LORA_LIGHTNING}}` resolution.
 */
export function pickLightningLoraFromInventory(
  model: string | undefined,
  loras: string[]
): string | undefined {
  if (!loras.length) {
    return undefined;
  }
  const candidates = loras
    .map(name => name.trim())
    .filter(name => name && loraFilenameImpliesLightning(name));
  return pickPreferredLightningLora(candidates, model);
}

function inferLightningLoraFilenameFromTokens(
  customTokens: Array<{ token: string; value: string }>,
  model?: string
): string | undefined {
  const modelId = model?.trim().toLowerCase() ?? '';
  const stepMatch =
    modelId.includes('lightning-8') || modelId.includes('lightning_8')
      ? /\b8[\s-]?step|8steps/i
      : modelId.includes('lightning-4') || modelId.includes('lightning_4')
        ? /\b4[\s-]?step|4steps/i
        : undefined;

  const fromLightningTokens: string[] = [];
  for (const entry of customTokens) {
    const token = entry.token.trim();
    const value = entry.value?.trim();
    if (!value || !isLightningFamilyLoraToken(token)) {
      continue;
    }
    if (loraFilenameImpliesLightning(value)) {
      if (!stepMatch || stepMatch.test(value)) {
        fromLightningTokens.push(value);
      }
    }
  }
  const preferredToken = pickPreferredLightningLora(fromLightningTokens, model);
  if (preferredToken) {
    return preferredToken;
  }

  const fromAny: string[] = [];
  for (const entry of customTokens) {
    const value = entry.value?.trim();
    if (!value || !loraFilenameImpliesLightning(value)) {
      continue;
    }
    if (!stepMatch || stepMatch.test(value)) {
      fromAny.push(value);
    }
  }
  return pickPreferredLightningLora(fromAny, model);
}

/** Prefer step-matched LightX2V files from ComfyUI's loras inventory. */
export function inferLightningLoraFromInventory(
  availableLoras: string[] | undefined,
  model?: string
): string | undefined {
  return pickLightningLoraFromInventory(model, availableLoras ?? []);
}

export function lightningLoraMatchesModel(filename: string, model?: string): boolean {
  if (!loraFilenameImpliesLightning(filename)) {
    return false;
  }
  const modelId = model?.trim().toLowerCase() ?? '';
  if (!modelId) {
    return true;
  }
  const lower = filename.toLowerCase();
  if (/wan/.test(modelId)) {
    // Prefer WAN Lightning LoRAs; reject obvious Qwen/LightX2V packs.
    if (/qwen|lightx2v|2512|2511/.test(lower) && !/wan/.test(lower)) {
      return false;
    }
    return /wan/.test(lower) || /low[_\s-]?noise/.test(lower);
  }
  if (/wan/.test(lower) && /lightning/.test(lower)) {
    return false;
  }
  const modelWantsEdit = /edit/.test(modelId);
  const loraIsEdit = /edit/.test(lower);
  return modelWantsEdit === loraIsEdit;
}

function pickCanonicalLightningLoraFilename(
  map: Record<string, string>,
  customTokens: Array<{ token: string; value: string }>,
  model?: string,
  availableLoras?: string[]
): string | undefined {
  const existing = map[LIGHTNING_LORA_TOKEN]?.trim();
  if (existing && lightningLoraMatchesModel(existing, model)) {
    return existing;
  }

  const inferred = inferLightningLoraFilenameFromTokens(customTokens, model);
  if (inferred && lightningLoraMatchesModel(inferred, model)) {
    return inferred;
  }

  const fromInventory = inferLightningLoraFromInventory(availableLoras, model);
  if (fromInventory && lightningLoraMatchesModel(fromInventory, model)) {
    return fromInventory;
  }

  return undefined;
}

/** True for natively distilled turbo stacks that must not resolve Lightning LoRA slots. */
export function isNativeTurboModel(model?: string | null): boolean {
  return isBooguTurboModel(model) || isZImageTurboModel(model);
}

/** Resolve {{LORA_LIGHTNING}} and alias {{LORA_LIGHTNING-2}} / library variants. */
export function buildLightningLoraFilenameMap(
  customTokens: Array<{ token: string; value: string }> = [],
  model?: string,
  availableLoras?: string[]
): Record<string, string> {
  const map = buildLoraFilenameMapFromCustomTokens(customTokens);
  if (isNativeTurboModel(model)) {
    for (const token of Object.keys(map)) {
      if (isLightningFamilyLoraToken(token)) {
        delete map[token];
      }
    }
    return map;
  }
  const canonical = pickCanonicalLightningLoraFilename(map, customTokens, model, availableLoras);

  if (canonical) {
    map[LIGHTNING_LORA_TOKEN] = canonical;
    for (const entry of customTokens) {
      const token = entry.token.trim();
      if (!isLightningFamilyLoraToken(token)) {
        continue;
      }
      const value = entry.value?.trim();
      if (value && lightningLoraMatchesModel(value, model)) {
        map[token] = canonical;
      }
    }
  } else {
    delete map[LIGHTNING_LORA_TOKEN];
  }

  return map;
}

/**
 * Rewrite concrete Lightning LoRA filenames that don't match the selected model
 * family (Edit-2511 vs T2I 2512). Wrong-family LoRAs cause worm/melt artifacts.
 */
export function alignLightningLoraFamilyInWorkflow(
  workflow: Record<string, unknown>,
  model?: string,
  loraFilenames: Record<string, string> = {}
): { workflow: Record<string, unknown>; realignedNodeIds: string[] } {
  const preferred = loraFilenames[LIGHTNING_LORA_TOKEN]?.trim();
  if (!preferred || !lightningLoraMatchesModel(preferred, model)) {
    return { workflow, realignedNodeIds: [] };
  }

  const next = structuredClone(workflow) as Record<
    string,
    { class_type?: string; inputs?: Record<string, unknown> }
  >;
  const realignedNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(next)) {
    if (!node?.inputs || !isLoraLoaderClassType(node.class_type)) {
      continue;
    }
    if (node.class_type === 'Power Lora Loader (rgthree)') {
      for (const [key, value] of Object.entries(node.inputs)) {
        if (!/^lora_/i.test(key) || !value || typeof value !== 'object') {
          continue;
        }
        const slot = value as { on?: boolean; lora?: unknown };
        if (slot.on === false) {
          continue;
        }
        const current = slot.lora;
        if (typeof current !== 'string' || !current.trim()) {
          continue;
        }
        if (isUnresolvedWorkflowPlaceholder(current)) {
          continue;
        }
        if (!loraFilenameImpliesLightning(current)) {
          continue;
        }
        if (lightningLoraMatchesModel(current, model)) {
          continue;
        }
        slot.lora = preferred;
        realignedNodeIds.push(`${nodeId}:${key}`);
      }
      continue;
    }
    const current = node.inputs.lora_name;
    if (typeof current !== 'string' || !current.trim()) {
      continue;
    }
    if (isUnresolvedWorkflowPlaceholder(current)) {
      continue;
    }
    if (!loraFilenameImpliesLightning(current)) {
      continue;
    }
    if (lightningLoraMatchesModel(current, model)) {
      continue;
    }
    node.inputs.lora_name = preferred;
    realignedNodeIds.push(nodeId);
  }

  return { workflow: next, realignedNodeIds };
}
