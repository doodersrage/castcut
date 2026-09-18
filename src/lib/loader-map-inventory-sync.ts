import type { ComfyUiModelLists } from './comfyui-object-info';
import {
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  SUGGESTED_MODEL_VAE_MAP,
  type ModelCheckpointMap,
  type ModelVaeMap,
} from './model-checkpoint-map';
import type { ModelControlNetMap } from './model-controlnet-map';
import { pickQwenPoseControlNetFilename } from './model-controlnet-map';
import { qwenUnetFamiliesCompatible } from './model-loader-precision';
import { SUGGESTED_MODEL_UPSCALE_MAP, type ModelUpscaleMap } from './model-upscale-map';
import { isVideoCheckpointMapKey, pickVideoCheckpointFromInventory } from './video-checkpoint-pick';

function buildSuggestedControlNetMap(controlNets: string[]): ModelControlNetMap {
  const qwenCn = pickQwenPoseControlNetFilename(controlNets);
  const suggested: ModelControlNetMap = {};
  if (qwenCn) {
    suggested.default = qwenCn;
    for (const key of Object.keys(SUGGESTED_MODEL_CHECKPOINT_MAP)) {
      if (/^qwen-/i.test(key)) {
        suggested[key] = qwenCn;
      }
    }
  } else if (controlNets[0]) {
    suggested.default = controlNets[0];
  }
  return suggested;
}

export type LoaderMapInventorySyncInput = {
  models: ComfyUiModelLists;
  checkpointMap?: ModelCheckpointMap;
  vaeMap?: ModelVaeMap;
  upscaleMap?: ModelUpscaleMap;
  controlNetMap?: ModelControlNetMap;
  /**
   * When true, rewrite map values missing from inventory to a near-miss
   * installed filename (fp8↔bf16, renamed stems). Empty upscale inventory
   * clears unusable upscale keys.
   */
  healMissing?: boolean;
};

export type LoaderMapInventorySyncResult = {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelUpscaleMap: ModelUpscaleMap;
  modelControlNetMap: ModelControlNetMap;
  filledCheckpointKeys: string[];
  filledVaeKeys: string[];
  filledUpscaleKeys: string[];
  filledControlNetKeys: string[];
  healedCheckpointKeys: string[];
  healedVaeKeys: string[];
  healedUpscaleKeys: string[];
  healedControlNetKeys: string[];
  clearedUpscaleKeys: string[];
};

function trimFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function loaderStemWithoutPrecision(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '')
    .replace(/[-_]?(bf16|fp16|fp8_scaled|fp8|e4m3fn|q[2-8]_k[_-][a-z]|q[2-8]_0)/gi, '');
}

/** Closest installed filename for a suggested stem (exact → stem includes). */
export function matchInventoryFilename(
  preferred: string | undefined,
  inventory: string[]
): string | undefined {
  const trimmed = preferred?.trim();
  if (!trimmed || inventory.length === 0) {
    return undefined;
  }
  const exact = inventory.find(entry => entry === trimmed);
  if (exact) {
    return exact;
  }
  const lower = trimmed.toLowerCase();
  const exactCi = inventory.find(entry => entry.toLowerCase() === lower);
  if (exactCi) {
    return exactCi;
  }
  const stem = lower.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '');
  return inventory.find(entry => {
    if (!qwenUnetFamiliesCompatible(trimmed, entry)) {
      return false;
    }
    const entryLower = entry.toLowerCase();
    const entryStem = entryLower.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '');
    return entryLower.includes(stem) || stem.includes(entryStem);
  });
}

/**
 * Exact/stem match, then precision-stripped near-miss (fp8↔bf16, GGUF quant).
 */
export function matchInventoryFilenameNearMiss(
  preferred: string | undefined,
  inventory: string[]
): string | undefined {
  const close = matchInventoryFilename(preferred, inventory);
  if (close) {
    return close;
  }
  const trimmed = preferred?.trim();
  if (!trimmed || inventory.length === 0) {
    return undefined;
  }
  const baseStem = loaderStemWithoutPrecision(trimmed);
  if (!baseStem) {
    return undefined;
  }
  return inventory.find(entry => {
    if (!qwenUnetFamiliesCompatible(trimmed, entry)) {
      return false;
    }
    const entryStem = loaderStemWithoutPrecision(entry);
    return entryStem === baseStem || entryStem.includes(baseStem) || baseStem.includes(entryStem);
  });
}

/** True when ComfyUI UNETLoader / UnetLoaderGGUF can load this filename. */
export function isFilenameInUnetLoaderList(filename: string, unets: string[]): boolean {
  return Boolean(matchInventoryFilename(filename.trim(), unets));
}

/**
 * UNETLoader reads models/unet/ (or diffusion_models/) only — not checkpoints/.
 * Returns a user-facing hint when the weight is missing or in the wrong folder.
 */
export function unetLoaderPlacementMessage(
  filename: string,
  models: Pick<ComfyUiModelLists, 'unets' | 'checkpoints'>
): string | undefined {
  const trimmed = filename.trim();
  if (!trimmed || isFilenameInUnetLoaderList(trimmed, models.unets)) {
    return undefined;
  }
  if (isFilenameInUnetLoaderList(trimmed, models.checkpoints)) {
    return `“${trimmed}” is in ComfyUI checkpoints/ but UNETLoader only reads models/unet/ or models/diffusion_models/. Move or symlink the file there, then restart ComfyUI.`;
  }
  return `“${trimmed}” is not in ComfyUI’s UNET list. Flux fine-tunes must live under models/unet/ or models/diffusion_models/ (not checkpoints/).`;
}

function fillAndHealMapKeys(input: {
  current?: Record<string, string | undefined>;
  suggested: Record<string, string | undefined>;
  inventory: string[];
  healMissing?: boolean;
  /** Drop keys that cannot resolve when inventory is known empty. */
  clearWhenEmpty?: boolean;
}): {
  map: Record<string, string>;
  filledKeys: string[];
  healedKeys: string[];
  clearedKeys: string[];
} {
  const map: Record<string, string> = {};
  const filledKeys: string[] = [];
  const healedKeys: string[] = [];
  const clearedKeys: string[] = [];
  const inventoryEmpty = input.inventory.length === 0;

  for (const [key, value] of Object.entries(input.current ?? {})) {
    const trimmed = trimFilename(value);
    if (!trimmed) {
      continue;
    }
    if (!input.healMissing) {
      map[key] = trimmed;
      continue;
    }
    if (inventoryEmpty) {
      if (input.clearWhenEmpty) {
        clearedKeys.push(key);
      } else {
        map[key] = trimmed;
      }
      continue;
    }
    const installed = matchInventoryFilenameNearMiss(trimmed, input.inventory);
    if (installed) {
      map[key] = installed;
      if (installed !== trimmed) {
        healedKeys.push(key);
      }
      continue;
    }
    const fromSuggested = matchInventoryFilenameNearMiss(input.suggested[key], input.inventory);
    if (fromSuggested) {
      map[key] = fromSuggested;
      healedKeys.push(key);
      continue;
    }
    // Video suggested stems (official T2V) often cannot near-miss to Rapid AIO
    // packs — family-pick an installed WAN/Hunyuan/LTX weight instead of keeping
    // a filename ComfyUI will reject.
    if (isVideoCheckpointMapKey(key)) {
      const fromFamily = pickVideoCheckpointFromInventory(key, input.inventory);
      if (fromFamily) {
        map[key] = fromFamily;
        if (fromFamily !== trimmed) {
          healedKeys.push(key);
        }
        continue;
      }
    }
    // Keep stale value when heal cannot find a replacement (user may install later).
    map[key] = trimmed;
  }

  for (const [key, preferred] of Object.entries(input.suggested)) {
    if (trimFilename(map[key])) {
      continue;
    }
    if (inventoryEmpty) {
      continue;
    }
    const matched = matchInventoryFilenameNearMiss(preferred, input.inventory);
    if (matched) {
      map[key] = matched;
      filledKeys.push(key);
      continue;
    }
    if (isVideoCheckpointMapKey(key)) {
      const fromFamily = pickVideoCheckpointFromInventory(key, input.inventory);
      if (fromFamily) {
        map[key] = fromFamily;
        filledKeys.push(key);
      }
    }
  }

  return { map, filledKeys, healedKeys, clearedKeys };
}

/**
 * Fill empty loader-map keys from live ComfyUI inventory using curated suggest
 * stems. With `healMissing`, also rewrite values missing from inventory.
 */
export function syncLoaderMapsFromInventory(
  input: LoaderMapInventorySyncInput
): LoaderMapInventorySyncResult {
  const checkpointInventory = [...new Set([...input.models.unets, ...input.models.checkpoints])];
  const healMissing = input.healMissing === true;

  const checkpoint = fillAndHealMapKeys({
    current: input.checkpointMap,
    suggested: SUGGESTED_MODEL_CHECKPOINT_MAP,
    inventory: checkpointInventory,
    healMissing,
  });
  const vae = fillAndHealMapKeys({
    current: input.vaeMap,
    suggested: SUGGESTED_MODEL_VAE_MAP,
    inventory: input.models.vaes,
    healMissing,
  });
  const upscale = fillAndHealMapKeys({
    current: input.upscaleMap,
    suggested: SUGGESTED_MODEL_UPSCALE_MAP,
    inventory: input.models.upscaleModels,
    healMissing,
    clearWhenEmpty: healMissing,
  });

  const controlNetSuggested = buildSuggestedControlNetMap(input.models.controlNets);
  const controlNet = fillAndHealMapKeys({
    current: input.controlNetMap,
    suggested: controlNetSuggested,
    inventory: input.models.controlNets,
    healMissing,
  });

  return {
    modelCheckpointMap: checkpoint.map,
    modelVaeMap: vae.map,
    modelUpscaleMap: upscale.map,
    modelControlNetMap: controlNet.map,
    filledCheckpointKeys: checkpoint.filledKeys,
    filledVaeKeys: vae.filledKeys,
    filledUpscaleKeys: upscale.filledKeys,
    filledControlNetKeys: controlNet.filledKeys,
    healedCheckpointKeys: checkpoint.healedKeys,
    healedVaeKeys: vae.healedKeys,
    healedUpscaleKeys: upscale.healedKeys,
    healedControlNetKeys: controlNet.healedKeys,
    clearedUpscaleKeys: upscale.clearedKeys,
  };
}

export function formatInventorySyncMessage(result: LoaderMapInventorySyncResult): string {
  const filled =
    result.filledCheckpointKeys.length +
    result.filledVaeKeys.length +
    result.filledUpscaleKeys.length +
    result.filledControlNetKeys.length;
  const healed =
    result.healedCheckpointKeys.length +
    result.healedVaeKeys.length +
    result.healedUpscaleKeys.length +
    result.healedControlNetKeys.length;
  const cleared = result.clearedUpscaleKeys.length;

  if (filled === 0 && healed === 0 && cleared === 0) {
    return 'No map keys needed inventory updates.';
  }

  const parts: string[] = [];
  if (filled) {
    parts.push(`filled ${filled}`);
  }
  if (healed) {
    parts.push(`healed ${healed}`);
  }
  if (cleared) {
    parts.push(`cleared ${cleared} missing upscale`);
  }
  return `Updated loader maps from ComfyUI inventory (${parts.join(', ')}).`;
}

/** True when sync changed any persisted map values. */
export function loaderMapsChanged(
  before: {
    checkpointMap?: ModelCheckpointMap;
    vaeMap?: ModelVaeMap;
    upscaleMap?: ModelUpscaleMap;
    controlNetMap?: ModelControlNetMap;
  },
  after: LoaderMapInventorySyncResult
): boolean {
  const same = (a?: Record<string, string | undefined>, b?: Record<string, string | undefined>) =>
    JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});
  return !(
    same(before.checkpointMap, after.modelCheckpointMap) &&
    same(before.vaeMap, after.modelVaeMap) &&
    same(before.upscaleMap, after.modelUpscaleMap) &&
    same(before.controlNetMap, after.modelControlNetMap)
  );
}
