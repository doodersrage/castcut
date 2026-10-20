import type { ComfyImageModel } from '../comfy-models/client';
import {
  COMFY_IMAGE_MODELS,
  DEFAULT_COMFY_MODEL,
  getComfyModelDefinition,
} from '../comfy-models/client';
import type {
  ComfyUiRuntimeConfig,
  CustomWorkflowToken,
  WorkflowParamValues,
} from '../comfyui/config';
import type { ComfyUiModelLists } from '../comfyui/object-info';
import { readCachedComfyObjectInfoModels } from '../comfyui/object-info-cache';
import { resolveSelectedWorkflowRuntime } from '../comfyui/runtime';
import type { ComfyWorkflowFile } from '../comfyui/workflow-files';
import { pickVideoCheckpointFromInventory } from '../video/ensure-video-workflow';
import { resolveWorkflowForModel } from '../model/workflow-map';
import {
  syncLoaderMapsFromInventory,
  matchInventoryFilename,
  matchInventoryFilenameNearMiss,
} from './loader-map-inventory-sync';
import {
  filenameMatchesPrecisionTier,
  precisionHintFromFilename,
  qwenDualClipFilename,
  qwenUnetFamiliesCompatible,
  type LoaderPrecisionTier,
} from '../model/loader-precision';
import {
  isVaeFilenameIncompatibleWithModel,
  SUGGESTED_MODEL_CHECKPOINT_MAP,
  suggestedVaeFilenameForModel,
  SUGGESTED_MODEL_VAE_MAP,
  resolveLoaderFilenamesForModel,
  type ModelCheckpointMap,
  type ModelVaeMap,
} from '../model/checkpoint-map';
import {
  DEFAULT_MODEL_SAMPLER_PRESET_TIER,
  isKleinBaseModel,
  isKleinDistilledModel,
  isLightningModelId,
  normalizeModelSamplerPresetTier,
  resolveModelSamplerParams,
} from '../model/sampler-defaults';
import {
  isEditCapableModel,
  isEditQueueTool,
  isFluxKleinModel,
  isQwenRapidAioModel,
  isZImageModel,
  isZImageImg2imgQueueTool,
  isBooguEditModel,
  isBooguImageModel,
} from '../model/denoise-defaults';
import { maybeRewriteRapidAioWorkflowLoaders } from './rapid-aio-checkpoint';
import { isLightningDistilledModel, resolveModelSamplingParams } from './model-sampling-patch';
import {
  DEFAULT_RESOLUTION_ORIENTATION,
  DEFAULT_RESOLUTION_SIZE_TIER,
  normalizeResolutionOrientation,
  normalizeResolutionSizeTier,
  resolveModelResolutionParams,
} from '../model/resolution-defaults';
import {
  normalizeQueueQualityProfile,
  resolveEffectiveResolutionSizeTier,
  resolveEffectiveSamplerPreset,
} from '../queue/quality-profile';
import type { SharedToolSettings } from '../settings/cache';
import { DEFAULT_VIDEO_TOOL_CACHE, loadSettingsCache, loadToolSettings } from '../settings/cache';
import {
  formatPackLoaderMisses,
  inspectPackLoadersInInventory,
  looksLikeEditPackGraph,
  looksLikeImg2imgPackGraph,
  looksLikeMultiRefEditPackGraph,
  packInventoryFitness,
  packLoadersAvailableInInventory,
  pickLightningLoraFromInventory,
  softRepairPackLoadersFromInventory,
} from './system-workflow-pack-loaders';
import { rankWorkflowFilesForModel, scoreWorkflowGraphStructure } from './category-defaults';
import { workflowHasLoraLoader } from './lightning-queue';
import { lightningLoraMatchesModel } from './lora-patch';
import { workflowGraphIsVideo } from './graph-kind';
import { buildWorkflowScaffoldForModel, fluxKleinDualClipFilename } from './scaffold';
import { isFluxKlein9BVariant } from './scaffold-flux';
import { extractWorkflowStackFingerprint, workflowStackMatchesModel } from './stack-fingerprint';

export {
  formatPackLoaderMisses,
  inspectPackLoadersInInventory,
  looksLikeEditPackGraph,
  looksLikeImg2imgPackGraph,
  looksLikeMultiRefEditPackGraph,
  packInventoryFitness,
  packLoadersAvailableInInventory,
  pickLightningLoraFromInventory,
  softRepairPackLoadersFromInventory,
} from './system-workflow-pack-loaders';
export type { PackLoaderInspection, PackLoaderMiss } from './system-workflow-pack-loaders';

/** Minimum rank score before a library graph can beat the built-in scaffold. */
export const SYSTEM_WORKFLOW_MIN_PACK_SCORE = 6;

/**
 * Absolute floor when graph structure strongly matches the model family
 * (lets poorly named official packs still beat scaffolds).
 */
export const SYSTEM_WORKFLOW_STRUCTURE_MIN_PACK_SCORE = 4;

/** True when system workflows should resolve packs/scaffolds for this model. */
export function usesSystemWorkflowPath(
  shared: Pick<SharedToolSettings, 'useSystemWorkflows'>,
  model: ComfyImageModel | string
): boolean {
  return shared.useSystemWorkflows === true && isSystemWorkflowSupportedModel(model);
}

/**
 * When system workflows are on, limit the picker to FLUX/Qwen/video (default).
 * Hybrid mode (`systemWorkflowsLimitPicker: false`) keeps all models and falls
 * back to mapped/manual workflows for unsupported families.
 */
export function shouldLimitSystemWorkflowPicker(
  shared: Pick<SharedToolSettings, 'useSystemWorkflows' | 'systemWorkflowsLimitPicker'>
): boolean {
  return shared.useSystemWorkflows === true && shared.systemWorkflowsLimitPicker !== false;
}

/**
 * Models with a dedicated system scaffold (not the generic checkpoint fallback).
 * FLUX, Qwen, SD3/SDXL, Z-Image, Boogu, OmniGen2, Lumina2, HiDream, video, and instruct-edit.
 */
export function isSystemWorkflowSupportedModel(model: ComfyImageModel | string): boolean {
  const category = getComfyModelDefinition(model)?.category;
  if (
    category === 'flux' ||
    category === 'qwen' ||
    category === 'video' ||
    category === 'instruct-edit' ||
    category === 'sd3' ||
    category === 'sdxl'
  ) {
    return true;
  }
  if (
    isZImageModel(model) ||
    isBooguEditModel(model) ||
    isBooguImageModel(model) ||
    model === 'omnigen2' ||
    model === 'lumina2' ||
    model === 'hidream' ||
    model === 'hidream-o1'
  ) {
    return true;
  }
  return false;
}

export function listSystemWorkflowSupportedModels(): ComfyImageModel[] {
  return COMFY_IMAGE_MODELS.filter(entry => isSystemWorkflowSupportedModel(entry.id)).map(
    entry => entry.id
  );
}

export function resolveSystemWorkflowFallbackModel(
  current?: ComfyImageModel | string
): ComfyImageModel {
  if (current && isSystemWorkflowSupportedModel(current)) {
    return current as ComfyImageModel;
  }
  if (isSystemWorkflowSupportedModel(DEFAULT_COMFY_MODEL)) {
    return DEFAULT_COMFY_MODEL;
  }
  return listSystemWorkflowSupportedModels()[0] ?? DEFAULT_COMFY_MODEL;
}

export type SystemWorkflowSource = 'pack' | 'scaffold';

export type SystemWorkflowResolveResult = {
  workflowJson: string;
  source: SystemWorkflowSource;
  workflowFileId?: string;
  workflowLabel?: string;
  queueParams: WorkflowParamValues;
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelUpscaleMap?: SharedToolSettings['modelUpscaleMap'];
  customTokens?: CustomWorkflowToken[];
};

function looksLikeAppScaffoldLabel(file: Pick<ComfyWorkflowFile, 'name' | 'filename'>): boolean {
  const haystack = `${file.name} ${file.filename ?? ''}`.toLowerCase();
  return /scaffold|starter graph|prompt.?studio.?template/.test(haystack);
}

function isVideoModel(model: ComfyImageModel | string): boolean {
  return getComfyModelDefinition(model)?.category === 'video';
}

function looksLikeVideoPackGraph(workflowJson: string): boolean {
  return workflowGraphIsVideo(workflowJson);
}

function isLtxVideoModel(model: ComfyImageModel | string): boolean {
  return /ltx/i.test(String(model));
}

/** Prefer an inventory filename whose precision matches the resolved UNET tier. */
export function matchInventoryFilenamePreferTier(
  preferred: string | undefined,
  pool: string[],
  tier?: LoaderPrecisionTier
): string | undefined {
  if (!preferred?.trim() || pool.length === 0) {
    return undefined;
  }
  if (!tier) {
    return matchInventoryFilename(preferred, pool);
  }

  const lower = preferred.trim().toLowerCase();
  const stem = lower.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '');
  const related = pool.filter(entry => {
    if (!qwenUnetFamiliesCompatible(preferred.trim(), entry)) {
      return false;
    }
    const entryLower = entry.toLowerCase();
    const entryStem = entryLower.replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '');
    return entryLower === lower || entryLower.includes(stem) || stem.includes(entryStem);
  });
  if (related.length === 0) {
    return matchInventoryFilename(preferred, pool);
  }

  const tierMatched = related.find(name => filenameMatchesPrecisionTier(name, tier));
  if (tierMatched) {
    return tierMatched;
  }
  return related.find(name => name.toLowerCase() === lower) ?? related[0];
}

function pickPoolFilenamePreferTier(
  pool: string[],
  patterns: RegExp[],
  tier?: LoaderPrecisionTier
): string | undefined {
  const matched = pool.filter(name => patterns.some(re => re.test(name)));
  if (matched.length === 0) {
    return undefined;
  }
  if (!tier) {
    return matched[0];
  }
  return matched.find(name => filenameMatchesPrecisionTier(name, tier)) ?? matched[0];
}

function weightDtypeForUnetFilename(filename: string): string {
  if (precisionHintFromFilename(filename) === 'fp8') {
    return 'fp8_e4m3fn';
  }
  return 'default';
}

function loaderStemWithoutPrecision(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.(safetensors|ckpt|pt|pth|bin|gguf)$/i, '')
    .replace(/[-_]?(bf16|fp16|fp8_scaled|fp8|e4m3fn|q[2-8]_k[_-][a-z]|q[2-8]_0)/gi, '');
}

function filterBooguUnetInventoryForModel(
  model: ComfyImageModel | string,
  pool: string[]
): string[] {
  const id = String(model ?? '')
    .trim()
    .toLowerCase();
  if (!id.startsWith('boogu-image')) {
    return pool;
  }
  const wantsTurbo = id.includes('turbo');
  const wantsEdit = id.includes('edit');
  const filtered = pool.filter(name => {
    const lower = name.toLowerCase();
    if (!/boogu_image/.test(lower)) {
      return false;
    }
    if (wantsTurbo !== /turbo/.test(lower)) {
      return false;
    }
    if (wantsEdit !== /edit/.test(lower)) {
      return false;
    }
    return true;
  });
  return filtered.length > 0 ? filtered : pool;
}

function resolveInventoryUnetForModel(
  model: ComfyImageModel,
  inventory: ComfyUiModelLists
): string | undefined {
  const pool = filterBooguUnetInventoryForModel(
    model,
    filterKleinUnetInventoryForModel(model, inventory.unets)
  );
  const preferred =
    SUGGESTED_MODEL_CHECKPOINT_MAP[model] ?? getComfyModelDefinition(model)?.unetHint;
  const matched = matchInventoryFilename(preferred, pool);
  if (matched) {
    return matched;
  }
  if (!preferred?.trim() || pool.length === 0) {
    return undefined;
  }
  const baseStem = loaderStemWithoutPrecision(preferred);
  if (!baseStem) {
    return undefined;
  }
  return pool.find(entry => {
    if (!qwenUnetFamiliesCompatible(preferred, entry)) {
      return false;
    }
    const entryStem = loaderStemWithoutPrecision(entry);
    return entryStem === baseStem || entryStem.includes(baseStem) || baseStem.includes(entryStem);
  });
}

/** Klein Base must never soft-bind distilled / non-base weights (causes CGI fry). */
function filterKleinUnetInventoryForModel(
  model: ComfyImageModel | string,
  pool: string[]
): string[] {
  const id = String(model ?? '');
  if (isKleinBaseModel(id)) {
    const baseOnly = pool.filter(
      name => /klein/i.test(name) && /base/i.test(name) && !/distill/i.test(name)
    );
    return baseOnly.length > 0 ? baseOnly : pool;
  }
  if (isKleinDistilledModel(id)) {
    const distilled = pool.filter(
      name =>
        /klein/i.test(name) &&
        (/distill/i.test(name) || (!/base/i.test(name) && /(9b|4b)/i.test(name)))
    );
    return distilled.length > 0 ? distilled : pool;
  }
  return pool;
}

function looksLikeI2vPackGraph(workflowJson: string): boolean {
  return /WanImageToVideo|WanCameraImageToVideo|HunyuanImageToVideo|LTXVImgToVideo/.test(
    workflowJson
  );
}

function packHasBoundLoaders(workflowJson: string): boolean {
  const fingerprint = extractWorkflowStackFingerprint(workflowJson);
  return fingerprint.family !== 'unknown' && fingerprint.family !== 'other' && !fingerprint.isMixed;
}

function isPlaceholderFilename(value: string): boolean {
  return /^\{\{[A-Z0-9_]+\}\}$/.test(value.trim());
}

/** Stem/precision-adjacent match when exact inventory match fails. */
export function matchNearMissInventoryFilename(
  preferred: string | undefined,
  pool: string[],
  tier?: LoaderPrecisionTier
): string | undefined {
  if (!preferred?.trim() || pool.length === 0) {
    return undefined;
  }
  const close = matchInventoryFilenamePreferTier(preferred, pool, tier);
  if (close) {
    return close;
  }
  const baseStem = loaderStemWithoutPrecision(preferred);
  if (!baseStem) {
    return undefined;
  }
  const related = pool.filter(entry => {
    if (!qwenUnetFamiliesCompatible(preferred.trim(), entry)) {
      return false;
    }
    const entryStem = loaderStemWithoutPrecision(entry);
    return entryStem === baseStem || entryStem.includes(baseStem) || baseStem.includes(entryStem);
  });
  if (related.length === 0) {
    return undefined;
  }
  if (tier) {
    return related.find(name => filenameMatchesPrecisionTier(name, tier)) ?? related[0];
  }
  return related[0];
}

export type PickPackOptions = {
  /** Prefer Wan/Hunyuan/LTX I2V packs when an init image is configured. */
  preferI2v?: boolean;
  /** Prefer edit/inpaint/IP-Adapter packs for edit-capable models. */
  preferEdit?: boolean;
  /** Active queue tool — drives preferEdit for compose/refine/inpaint/… */
  tool?: string;
  /** Prefer multi-LoadImage edit packs (Compose transfer). */
  preferMultiRef?: boolean;
};

/**
 * Prefer a library / pack graph that scores well for the model; otherwise null
 * (caller falls back to a built-in scaffold).
 */
export function pickPackWorkflowForModel(
  model: ComfyImageModel,
  workflowFiles: ComfyWorkflowFile[],
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions
): { file: ComfyWorkflowFile; score: number } | null {
  if (workflowFiles.length === 0) {
    return null;
  }

  const pickOptions = resolvePickPackOptions(model, options);

  const candidates: { file: ComfyWorkflowFile; score: number }[] = [];
  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  for (const entry of ranked) {
    // Sorted descending — once below the absolute structure floor, stop.
    if (entry.score < SYSTEM_WORKFLOW_STRUCTURE_MIN_PACK_SCORE) {
      break;
    }

    const json = entry.file.workflowJson ?? '';
    const structureBonus = scoreWorkflowGraphStructure(json, model);
    const minScore =
      structureBonus >= 4 || (isVideoModel(model) && looksLikeI2vPackGraph(json))
        ? SYSTEM_WORKFLOW_STRUCTURE_MIN_PACK_SCORE
        : SYSTEM_WORKFLOW_MIN_PACK_SCORE;
    if (entry.score < minScore) {
      continue;
    }

    if (looksLikeAppScaffoldLabel(entry.file)) {
      continue;
    }

    if (!json.trim()) {
      continue;
    }

    const wantVideo = isVideoModel(model) || pickOptions.tool === 'video';
    if (wantVideo && !looksLikeVideoPackGraph(json)) {
      continue;
    }

    const fingerprint = extractWorkflowStackFingerprint(json);
    if (fingerprint.isMixed) {
      continue;
    }

    // Near-miss loaders (fp8↔bf16, renamed CLIP) count as available after soft-repair.
    // Style LoRAs and plain-T2I ControlNet/Upscale/CLIPVision may soft-drop (stripped at repair).
    if (!packLoadersAvailableInInventory(json, inventory, model)) {
      continue;
    }

    // Image stacks: require fingerprint match when the graph has concrete loaders.
    if (!isVideoModel(model) && packHasBoundLoaders(json)) {
      if (!workflowStackMatchesModel(fingerprint, model)) {
        continue;
      }
    }

    if (isLightningDistilledModel(model)) {
      try {
        const parsed = JSON.parse(json) as Record<string, unknown>;
        const hasLightningToken = json.includes('{{LORA_LIGHTNING}}');
        if (!workflowHasLoraLoader(parsed) && !hasLightningToken) {
          continue;
        }
      } catch {
        continue;
      }
    }

    // Rapid AIO is checkpoint-only — skip UNET-shaped Lightning/Qwen packs.
    if (isQwenRapidAioModel(model)) {
      const hasUnet = /UNETLoader|UnetLoaderGGUF/.test(json);
      const hasCheckpoint = /CheckpointLoader(?:Simple)?/.test(json);
      if (hasUnet && !hasCheckpoint) {
        continue;
      }
    }

    const i2vGraph = looksLikeI2vPackGraph(json);
    const videoPack = wantVideo && looksLikeVideoPackGraph(json);
    const videoBoundPack =
      wantVideo &&
      looksLikeVideoPackGraph(json) &&
      packHasBoundLoaders(json) &&
      entry.score >= SYSTEM_WORKFLOW_STRUCTURE_MIN_PACK_SCORE;
    const videoI2vPack =
      isVideoModel(model) && i2vGraph && entry.score >= SYSTEM_WORKFLOW_STRUCTURE_MIN_PACK_SCORE;
    const boundPack = packHasBoundLoaders(json) && entry.score >= 8;
    const strongStructure =
      structureBonus >= 4 &&
      packHasBoundLoaders(json) &&
      entry.score >= SYSTEM_WORKFLOW_STRUCTURE_MIN_PACK_SCORE;
    const strongName = entry.score >= 12;
    const ltxI2vPack = isLtxVideoModel(model) && /LTXVImgToVideo/.test(json);
    if (
      videoPack ||
      videoBoundPack ||
      videoI2vPack ||
      ltxI2vPack ||
      boundPack ||
      strongStructure ||
      strongName
    ) {
      candidates.push({
        file: entry.file,
        score: entry.score + Math.min(structureBonus, 8),
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  // Prefer I2V / multi-ref edit / edit graphs before inventory fitness re-rank.
  if (pickOptions.preferI2v) {
    const i2vCandidates = candidates.filter(entry =>
      looksLikeI2vPackGraph(entry.file.workflowJson ?? '')
    );
    if (i2vCandidates.length > 0) {
      if (inventory) {
        const byFitness = [...i2vCandidates].sort((a, b) => {
          const fitA = packInventoryFitness(a.file.workflowJson ?? '', inventory, model);
          const fitB = packInventoryFitness(b.file.workflowJson ?? '', inventory, model);
          if (fitB !== fitA) {
            return fitB - fitA;
          }
          return b.score - a.score;
        });
        return byFitness[0] ?? null;
      }
      return i2vCandidates[0] ?? null;
    }
  }
  if (pickOptions.preferMultiRef) {
    const multiRefs = candidates.filter(entry =>
      looksLikeMultiRefEditPackGraph(entry.file.workflowJson ?? '')
    );
    if (multiRefs.length > 0) {
      if (inventory) {
        const byFitness = [...multiRefs].sort((a, b) => {
          const fitA = packInventoryFitness(a.file.workflowJson ?? '', inventory, model);
          const fitB = packInventoryFitness(b.file.workflowJson ?? '', inventory, model);
          if (fitB !== fitA) {
            return fitB - fitA;
          }
          return b.score - a.score;
        });
        return byFitness[0] ?? null;
      }
      return multiRefs[0] ?? null;
    }
    // Compose needs multi-ref; skip single-ref edit packs → scaffold.
    if (pickOptions.tool === 'compose') {
      return null;
    }
  }
  // Klein Compose must use img2img edit graphs — never a plain T2I pack.
  if (pickOptions.tool === 'compose' && isFluxKleinModel(model)) {
    const img2img = candidates.filter(entry =>
      looksLikeImg2imgPackGraph(entry.file.workflowJson ?? '')
    );
    if (img2img.length === 0) {
      return null;
    }
    if (inventory) {
      const byFitness = [...img2img].sort((a, b) => {
        const fitA = packInventoryFitness(a.file.workflowJson ?? '', inventory, model);
        const fitB = packInventoryFitness(b.file.workflowJson ?? '', inventory, model);
        if (fitB !== fitA) {
          return fitB - fitA;
        }
        return b.score - a.score;
      });
      return byFitness[0] ?? null;
    }
    return img2img[0] ?? null;
  }
  // Z-Image Refine / Compose / Image → Prompt — img2img packs, not Qwen multi-ref.
  if (isZImageModel(model) && isZImageImg2imgQueueTool(pickOptions.tool)) {
    const img2img = candidates.filter(entry =>
      looksLikeImg2imgPackGraph(entry.file.workflowJson ?? '')
    );
    if (img2img.length === 0) {
      return null;
    }
    if (inventory) {
      const byFitness = [...img2img].sort((a, b) => {
        const fitA = packInventoryFitness(a.file.workflowJson ?? '', inventory, model);
        const fitB = packInventoryFitness(b.file.workflowJson ?? '', inventory, model);
        if (fitB !== fitA) {
          return fitB - fitA;
        }
        return b.score - a.score;
      });
      return byFitness[0] ?? null;
    }
    return img2img[0] ?? null;
  }
  if (pickOptions.preferEdit) {
    const edit = candidates.find(entry => looksLikeEditPackGraph(entry.file.workflowJson ?? ''));
    if (edit) {
      return edit;
    }
  }

  // Re-rank survivors by how cleanly they match installed loaders.
  if (inventory) {
    const byFitness = [...candidates].sort((a, b) => {
      const fitA = packInventoryFitness(a.file.workflowJson ?? '', inventory, model);
      const fitB = packInventoryFitness(b.file.workflowJson ?? '', inventory, model);
      if (fitB !== fitA) {
        return fitB - fitA;
      }
      return b.score - a.score;
    });
    return byFitness[0] ?? null;
  }

  return candidates[0] ?? null;
}

/** Soft-bind scaffold CLIP/VAE/UNET filenames + pick Lightning LoRA from inventory. */
export function softBindScaffoldFromInventory(
  workflowJson: string,
  model: ComfyImageModel,
  inventory?: ComfyUiModelLists | null
): {
  workflowJson: string;
  lightningLora?: string;
} {
  if (!inventory) {
    return { workflowJson };
  }

  let graph: Record<string, unknown>;
  try {
    graph = JSON.parse(workflowJson) as Record<string, unknown>;
  } catch {
    return { workflowJson };
  }

  if (isQwenRapidAioModel(model)) {
    const rewritten = maybeRewriteRapidAioWorkflowLoaders(
      graph,
      model,
      SUGGESTED_MODEL_CHECKPOINT_MAP[model]
    );
    graph = rewritten.workflow;
  }

  const category = getComfyModelDefinition(model)?.category;
  const clipPool = inventory.clips;
  const vaePool = inventory.vaes;
  const checkpointPool =
    inventory.checkpoints.length > 0
      ? inventory.checkpoints
      : [...inventory.unets, ...inventory.checkpoints];
  const resolvedUnet = resolveInventoryUnetForModel(model, inventory);
  const videoPool = [...inventory.checkpoints, ...inventory.unets];
  const resolvedCheckpoint =
    (isVideoModel(model) ? pickVideoCheckpointFromInventory(model, videoPool) : undefined) ??
    matchNearMissInventoryFilename(SUGGESTED_MODEL_CHECKPOINT_MAP[model], checkpointPool) ??
    resolvedUnet;
  const unetTier = resolvedUnet
    ? precisionHintFromFilename(resolvedUnet)
    : resolvedCheckpoint
      ? precisionHintFromFilename(resolvedCheckpoint)
      : undefined;
  const kleinDual = isFluxKleinModel(model) ? fluxKleinDualClipFilename(model) : undefined;

  for (const node of Object.values(graph)) {
    if (!node || typeof node !== 'object') {
      continue;
    }
    const record = node as {
      class_type?: string;
      inputs?: Record<string, unknown>;
      _meta?: { title?: string };
    };
    if (!record.inputs) {
      continue;
    }
    const classType = record.class_type ?? '';

    if ((classType === 'UNETLoader' || classType === 'UnetLoaderGGUF') && resolvedUnet) {
      const isGguf = /\.gguf$/i.test(resolvedUnet);
      if (isGguf) {
        record.class_type = 'UnetLoaderGGUF';
        // GGUF loader has no weight_dtype input.
        delete record.inputs.weight_dtype;
      } else if (classType === 'UNETLoader' || classType === 'UnetLoaderGGUF') {
        record.class_type = 'UNETLoader';
        if ('weight_dtype' in record.inputs || classType === 'UNETLoader') {
          record.inputs.weight_dtype = weightDtypeForUnetFilename(resolvedUnet);
        }
      }
      // Bind concrete names and {{UNET}} placeholders when inventory has the file.
      if (typeof record.inputs.unet_name === 'string') {
        if (
          isPlaceholderFilename(record.inputs.unet_name) ||
          !matchInventoryFilename(record.inputs.unet_name, inventory.unets)
        ) {
          if (resolvedUnet) {
            record.inputs.unet_name = resolvedUnet;
          }
        } else {
          const near = matchNearMissInventoryFilename(
            record.inputs.unet_name,
            inventory.unets,
            unetTier
          );
          if (near) {
            record.inputs.unet_name = near;
          }
        }
      }
    }

    if (
      (classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader') &&
      resolvedCheckpoint
    ) {
      if (typeof record.inputs.ckpt_name === 'string') {
        if (
          isPlaceholderFilename(record.inputs.ckpt_name) ||
          !matchNearMissInventoryFilename(record.inputs.ckpt_name, checkpointPool)
        ) {
          record.inputs.ckpt_name = resolvedCheckpoint;
        } else {
          const near = matchNearMissInventoryFilename(
            record.inputs.ckpt_name,
            checkpointPool,
            unetTier
          );
          if (near) {
            record.inputs.ckpt_name = near;
          }
        }
      }
    }

    if (classType === 'VAELoader' && typeof record.inputs.vae_name === 'string') {
      const suggested = suggestedVaeFilenameForModel(model);
      if (suggested && isVaeFilenameIncompatibleWithModel(model, record.inputs.vae_name)) {
        const compatiblePool = vaePool.filter(name => {
          if (/flux2-vae/i.test(suggested)) {
            return /flux2-vae/i.test(name);
          }
          if (/qwen.*vae/i.test(suggested)) {
            return /qwen.*vae/i.test(name);
          }
          if (/ae\.safetensors/i.test(suggested)) {
            return /ae\.safetensors/i.test(name);
          }
          return name.toLowerCase() === suggested.toLowerCase();
        });
        const fixed = matchNearMissInventoryFilename(
          suggested,
          compatiblePool.length > 0 ? compatiblePool : vaePool,
          unetTier
        );
        if (fixed) {
          record.inputs.vae_name = fixed;
          continue;
        }
      }
      const matched = matchInventoryFilenamePreferTier(record.inputs.vae_name, vaePool, unetTier);
      if (matched) {
        record.inputs.vae_name = matched;
      } else if (isPlaceholderFilename(record.inputs.vae_name)) {
        const fromInventory = matchNearMissInventoryFilename(
          suggested ?? SUGGESTED_MODEL_VAE_MAP.default,
          vaePool,
          unetTier
        );
        if (fromInventory) {
          record.inputs.vae_name = fromInventory;
        }
      }
    }

    if (classType === 'CLIPLoader' && typeof record.inputs.clip_name === 'string') {
      if (kleinDual) {
        // Klein must use CLIPLoader type flux2 + size-matched Qwen3 encoder.
        record.inputs.type = 'flux2';
        const matched =
          matchInventoryFilenamePreferTier(record.inputs.clip_name, clipPool, unetTier) ??
          matchInventoryFilenamePreferTier(kleinDual, clipPool, unetTier) ??
          pickPoolFilenamePreferTier(
            clipPool,
            isFluxKlein9BVariant(model)
              ? [/qwen_3_8b/i, /flux2-klein-9b/i]
              : [/qwen_3_4b/i, /flux2-klein-4b/i],
            unetTier
          );
        if (matched) {
          record.inputs.clip_name = matched;
        }
      } else {
        const matched = matchInventoryFilenamePreferTier(
          record.inputs.clip_name,
          clipPool,
          unetTier
        );
        if (matched) {
          record.inputs.clip_name = matched;
        } else if (category === 'qwen') {
          const suggestedClip =
            resolveLoaderFilenamesForModel(model, {
              precisionTier: unetTier,
            }).dualClip ?? qwenDualClipFilename(unetTier ?? 'bf16');
          const fromSuggested = matchInventoryFilenamePreferTier(suggestedClip, clipPool, unetTier);
          const fallback =
            fromSuggested ??
            pickPoolFilenamePreferTier(clipPool, [/qwen_2\.5_vl|qwen.*vl_7b/i], unetTier);
          if (fallback) {
            record.inputs.clip_name = fallback;
          }
        }
      }
    }

    if (classType === 'DualCLIPLoader') {
      if (kleinDual) {
        // Legacy DualCLIP Klein scaffolds → CLIPLoader type flux2 (official Comfy layout).
        const matched =
          matchInventoryFilenamePreferTier(kleinDual, clipPool, unetTier) ??
          pickPoolFilenamePreferTier(
            clipPool,
            isFluxKlein9BVariant(model)
              ? [/qwen_3_8b/i, /flux2-klein-9b/i]
              : [/qwen_3_4b/i, /flux2-klein-4b/i],
            unetTier
          );
        record.class_type = 'CLIPLoader';
        record.inputs = {
          clip_name: matched ?? kleinDual,
          type: 'flux2',
        };
        if (record._meta && typeof record._meta === 'object') {
          (record._meta as { title?: string }).title = 'CLIPLoader (FLUX.2 Klein)';
        }
      } else {
        // Flux.1 DualCLIP: clip_name1 must stay CLIP-L, clip_name2 must stay T5-XXL.
        // Broad stem matching can otherwise cross-wire slots → soft/blurry decode.
        const clipL =
          matchInventoryFilenamePreferTier('clip_l.safetensors', clipPool, unetTier) ??
          pickPoolFilenamePreferTier(
            clipPool,
            [/^clip_l[\._-]/i, /clip_l\.safetensors/i],
            unetTier
          );
        const t5 =
          matchInventoryFilenamePreferTier('t5xxl_fp16.safetensors', clipPool, unetTier) ??
          pickPoolFilenamePreferTier(
            clipPool,
            [/t5xxl_fp16/i, /t5xxl(?!.*fp8)/i, /t5xxl/i],
            unetTier
          ) ??
          pickPoolFilenamePreferTier(clipPool, [/t5xxl/i], unetTier);

        if (typeof record.inputs.clip_name1 === 'string') {
          const current1 = record.inputs.clip_name1;
          if (
            isPlaceholderFilename(current1) ||
            /t5xxl|umt5/i.test(current1) ||
            !matchInventoryFilename(current1, clipPool)
          ) {
            if (clipL) {
              record.inputs.clip_name1 = clipL;
            }
          } else {
            const matched = matchInventoryFilenamePreferTier(
              current1,
              clipPool.filter(name => /clip_l/i.test(name) && !/t5/i.test(name)),
              unetTier
            );
            if (matched) {
              record.inputs.clip_name1 = matched;
            } else if (clipL) {
              record.inputs.clip_name1 = clipL;
            }
          }
        }

        if (typeof record.inputs.clip_name2 === 'string') {
          const current2 = record.inputs.clip_name2;
          if (
            isPlaceholderFilename(current2) ||
            /clip_l/i.test(current2) ||
            !matchInventoryFilename(current2, clipPool)
          ) {
            if (t5) {
              record.inputs.clip_name2 = t5;
            }
          } else {
            // Prefer fp16 T5 when available (author: fp16 >> fp8 for Flux fine-tunes).
            const t5Pool = clipPool.filter(name => /t5xxl/i.test(name));
            const matched =
              matchInventoryFilenamePreferTier('t5xxl_fp16.safetensors', t5Pool, unetTier) ??
              matchInventoryFilenamePreferTier(current2, t5Pool, unetTier) ??
              t5;
            if (matched) {
              record.inputs.clip_name2 = matched;
            }
          }
        }

        if (typeof record.inputs.type === 'string' || record.inputs.type == null) {
          record.inputs.type = 'flux';
        }
      }
    }
  }

  const lightningLora =
    isLightningDistilledModel(model) || isLightningModelId(model)
      ? pickLightningLoraFromInventory(model, inventory.loras)
      : undefined;

  return {
    workflowJson: JSON.stringify(graph, null, 2),
    lightningLora,
  };
}

/** Seed queue params from family sampler + resolution presets for the active profile. */
export function buildSystemWorkflowQueueParams(
  model: ComfyImageModel,
  shared: SharedToolSettings
): WorkflowParamValues {
  const profile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const presetTier = resolveEffectiveSamplerPreset(
    normalizeModelSamplerPresetTier(shared.modelSamplerPreset ?? DEFAULT_MODEL_SAMPLER_PRESET_TIER),
    profile,
    { model }
  );
  const orientation = normalizeResolutionOrientation(
    shared.modelResolutionOrientation ?? DEFAULT_RESOLUTION_ORIENTATION
  );
  const sizeTier = resolveEffectiveResolutionSizeTier(
    normalizeResolutionSizeTier(shared.modelResolutionSizeTier ?? DEFAULT_RESOLUTION_SIZE_TIER),
    profile
  );

  return {
    ...resolveModelSamplerParams(model, presetTier),
    ...resolveModelResolutionParams(model, orientation, sizeTier),
    ...resolveModelSamplingParams(model, presetTier),
  };
}

/**
 * Inventory-aware loader maps for system queues. Does not persist to settings —
 * only enriches the runtime payload for this request.
 */
export function resolveSystemLoaderMaps(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  inventory?: ComfyUiModelLists | null
): {
  modelCheckpointMap: ModelCheckpointMap;
  modelVaeMap: ModelVaeMap;
  modelUpscaleMap?: SharedToolSettings['modelUpscaleMap'];
} {
  const models = inventory ?? readCachedComfyObjectInfoModels();
  let modelCheckpointMap: ModelCheckpointMap = {
    ...(shared.modelCheckpointMap ?? {}),
  };
  let modelVaeMap: ModelVaeMap = { ...(shared.modelVaeMap ?? {}) };
  let modelUpscaleMap = shared.modelUpscaleMap;

  if (models) {
    const synced = syncLoaderMapsFromInventory({
      models,
      checkpointMap: modelCheckpointMap,
      vaeMap: modelVaeMap,
      upscaleMap: modelUpscaleMap,
      controlNetMap: shared.modelControlNetMap,
      healMissing: true,
    });
    modelCheckpointMap = synced.modelCheckpointMap;
    modelVaeMap = synced.modelVaeMap;
    modelUpscaleMap = synced.modelUpscaleMap;

    if (isVideoModel(model)) {
      const pool = [...models.checkpoints, ...models.unets];
      const current = modelCheckpointMap[model]?.trim();
      // Suggested T2V stems often linger in the map after settings merge even when
      // only Rapid AIO / I2V packs are installed — heal to an installed video weight.
      if (!current || !matchInventoryFilenameNearMiss(current, pool)) {
        const picked = pickVideoCheckpointFromInventory(model, pool);
        if (picked) {
          modelCheckpointMap = { ...modelCheckpointMap, [model]: picked };
        }
      }
    }

    // Soft-fill this model from suggestions matched to live inventory.
    if (!modelCheckpointMap[model]?.trim()) {
      const matched = matchInventoryFilename(SUGGESTED_MODEL_CHECKPOINT_MAP[model], [
        ...models.unets,
        ...models.checkpoints,
      ]);
      if (matched) {
        modelCheckpointMap = { ...modelCheckpointMap, [model]: matched };
      }
    }
    if (!modelVaeMap[model]?.trim()) {
      const matched = matchInventoryFilename(
        SUGGESTED_MODEL_VAE_MAP[model] ?? SUGGESTED_MODEL_VAE_MAP.default,
        models.vaes
      );
      if (matched) {
        modelVaeMap = { ...modelVaeMap, [model]: matched };
      }
    }
  } else {
    // No inventory yet — still seed suggested stems so placeholders can bind.
    if (!modelCheckpointMap[model]?.trim() && SUGGESTED_MODEL_CHECKPOINT_MAP[model]) {
      modelCheckpointMap = {
        ...modelCheckpointMap,
        [model]: SUGGESTED_MODEL_CHECKPOINT_MAP[model]!,
      };
    }
    if (!modelVaeMap[model]?.trim()) {
      const suggested = SUGGESTED_MODEL_VAE_MAP[model] ?? SUGGESTED_MODEL_VAE_MAP.default;
      if (suggested) {
        modelVaeMap = { ...modelVaeMap, [model]: suggested };
      }
    }
  }

  return { modelCheckpointMap, modelVaeMap, modelUpscaleMap };
}

export type SystemWorkflowChoiceReason =
  | 'pack'
  | 'pack-repaired'
  | 'i2v-pack'
  | 'edit-pack'
  | 'cold-start'
  | 'missing-loaders'
  | 'no-worthy-pack';

export type SystemWorkflowChoiceDescription = {
  source: SystemWorkflowSource;
  label: string;
  reason: SystemWorkflowChoiceReason;
  /** Full Graph: line for UI. */
  display: string;
};

/** True when Video tool has an I2V init image configured. */
export function videoInitImageConfigured(): boolean {
  try {
    const video = loadToolSettings('video', DEFAULT_VIDEO_TOOL_CACHE);
    return Boolean(video.initImageUrl?.trim());
  } catch {
    return false;
  }
}

/** True when a shared IP-Adapter / source reference image is configured. */
export function editSourceImageConfigured(): boolean {
  try {
    const shared = loadSettingsCache().shared;
    return Boolean(shared.ipAdapterImageUrl?.trim() || shared.ipAdapterImageFilename?.trim());
  } catch {
    return false;
  }
}

function resolvePreferI2v(model: ComfyImageModel, options?: PickPackOptions): boolean {
  if (options?.preferI2v != null) {
    return options.preferI2v;
  }
  return isVideoModel(model) && videoInitImageConfigured();
}

function resolvePreferEdit(model: ComfyImageModel, options?: PickPackOptions): boolean {
  if (options?.preferEdit != null) {
    return options.preferEdit;
  }
  if (isEditQueueTool(options?.tool)) {
    return true;
  }
  return isEditCapableModel(model) && editSourceImageConfigured();
}

function resolvePreferMultiRef(model: ComfyImageModel, options?: PickPackOptions): boolean {
  if (options?.preferMultiRef != null) {
    return options.preferMultiRef;
  }
  // Klein / Z-Image img2img tools — not Qwen multi-ref encode packs.
  if (isFluxKleinModel(model) || isZImageModel(model)) {
    return false;
  }
  return options?.tool === 'compose';
}

/** Resolved pack-pick flags for a model/tool (exported for tests). */
export function resolvePickPackOptions(
  model: ComfyImageModel,
  options?: PickPackOptions
): PickPackOptions {
  return {
    preferI2v: resolvePreferI2v(model, options),
    preferEdit: resolvePreferEdit(model, options),
    preferMultiRef: resolvePreferMultiRef(model, options),
    tool: options?.tool,
  };
}

export function describeSystemWorkflowChoice(
  model: ComfyImageModel,
  workflowFiles: ComfyWorkflowFile[],
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions
): SystemWorkflowChoiceDescription {
  if (!inventory) {
    return {
      source: 'scaffold',
      label: 'Built-in scaffold',
      reason: 'cold-start',
      display: 'Built-in scaffold · waiting for Comfy inventory',
    };
  }

  const pickOptions = resolvePickPackOptions(model, options);
  const preferI2v = Boolean(pickOptions.preferI2v);
  const preferEdit = Boolean(pickOptions.preferEdit);
  const preferMultiRef = Boolean(pickOptions.preferMultiRef);
  const pack = pickPackWorkflowForModel(model, workflowFiles, inventory, pickOptions);
  if (pack) {
    const json = pack.file.workflowJson ?? '';
    const repaired = softRepairPackLoadersFromInventory(json, model, inventory);
    const label = pack.file.name.trim() || pack.file.filename?.trim() || pack.file.id;
    const isI2v = preferI2v && looksLikeI2vPackGraph(json);
    if (isI2v) {
      return {
        source: 'pack',
        label,
        reason: 'i2v-pack',
        display: `Pack · ${label} (I2V)`,
      };
    }
    const isMultiRef = preferMultiRef && looksLikeMultiRefEditPackGraph(json);
    if (isMultiRef) {
      return {
        source: 'pack',
        label,
        reason: 'edit-pack',
        display: `Pack · ${label} (Compose multi-ref)`,
      };
    }
    const isEdit = preferEdit && looksLikeEditPackGraph(json);
    if (isEdit) {
      return {
        source: 'pack',
        label,
        reason: 'edit-pack',
        display: `Pack · ${label} (edit)`,
      };
    }
    if (
      repaired.repaired > 0 ||
      repaired.droppedLoras.length > 0 ||
      repaired.droppedSecondaries.length > 0
    ) {
      const notes: string[] = [];
      if (repaired.droppedLoras.length > 0) {
        notes.push(`dropped ${repaired.droppedLoras.length} LoRA`);
      }
      if (repaired.droppedSecondaries.length > 0) {
        notes.push(`stripped ${repaired.droppedSecondaries.length} secondary`);
      }
      const dropNote = notes.length > 0 ? ` · ${notes.join(' · ')}` : '';
      return {
        source: 'pack',
        label,
        reason: 'pack-repaired',
        display: `Pack · ${label} (inventory soft-bound${dropNote})`,
      };
    }
    return {
      source: 'pack',
      label,
      reason: 'pack',
      display: `Pack · ${label}`,
    };
  }

  const ranked = rankWorkflowFilesForModel(model, workflowFiles);
  let firstMissingDetail = '';
  const hasLoaderBlockedPack = ranked.some(entry => {
    if (entry.score < SYSTEM_WORKFLOW_MIN_PACK_SCORE) {
      return false;
    }
    if (looksLikeAppScaffoldLabel(entry.file)) {
      return false;
    }
    const json = entry.file.workflowJson ?? '';
    if (!json.trim()) {
      return false;
    }
    try {
      const fingerprint = extractWorkflowStackFingerprint(json);
      if (fingerprint.isMixed) {
        return false;
      }
    } catch {
      return false;
    }
    const inspection = inspectPackLoadersInInventory(json, inventory, model);
    if (!inspection.ok) {
      if (!firstMissingDetail) {
        firstMissingDetail = formatPackLoaderMisses(inspection.missing);
      }
      return true;
    }
    return false;
  });

  if (hasLoaderBlockedPack) {
    const detail = firstMissingDetail ? ` · missing ${firstMissingDetail}` : '';
    return {
      source: 'scaffold',
      label: 'Built-in scaffold',
      reason: 'missing-loaders',
      display: `Built-in scaffold · pack loaders not installed${detail}`,
    };
  }

  if (isLtxVideoModel(model)) {
    return {
      source: 'scaffold',
      label: 'Built-in scaffold',
      reason: 'no-worthy-pack',
      display: 'Built-in scaffold · Checkpoint T2V only — LTX I2V needs a library pack',
    };
  }
  if (isVideoModel(model)) {
    const hasVideoCkpt = Boolean(inventory.checkpoints.some(name => /wan|hunyuan|ltx/i.test(name)));
    const hasVideoUnet = Boolean(inventory.unets.some(name => /wan|hunyuan|ltx/i.test(name)));
    let honesty = 'Checkpoint T2V only — prefer a WAN/Hunyuan/LTX pack';
    if (!hasVideoCkpt && hasVideoUnet) {
      honesty = 'no video checkpoint mapped — prefer a UNET-based video pack';
    } else if (preferI2v) {
      honesty =
        'Checkpoint T2V scaffold with init image — auto-wires Wan/Hunyuan I2V when possible; import an I2V pack for best motion quality';
    }
    return {
      source: 'scaffold',
      label: 'Built-in scaffold',
      reason: 'no-worthy-pack',
      display: `Built-in scaffold · ${honesty}`,
    };
  }
  if (preferMultiRef) {
    return {
      source: 'scaffold',
      label: 'Built-in scaffold',
      reason: 'no-worthy-pack',
      display: 'Built-in scaffold · Compose figures (no multi-ref pack)',
    };
  }
  if (preferEdit) {
    return {
      source: 'scaffold',
      label: 'Built-in scaffold',
      reason: 'no-worthy-pack',
      display: 'Built-in scaffold · edit path (no edit pack)',
    };
  }

  return {
    source: 'scaffold',
    label: 'Built-in scaffold',
    reason: 'no-worthy-pack',
    display: 'Built-in scaffold',
  };
}

export function resolveSystemWorkflowForModel(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  workflowFiles: ComfyWorkflowFile[],
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions
): SystemWorkflowResolveResult {
  const models = inventory ?? readCachedComfyObjectInfoModels();
  const loaders = resolveSystemLoaderMaps(model, shared, models);
  const queueParams = buildSystemWorkflowQueueParams(model, shared);
  const pickOptions = resolvePickPackOptions(model, options);
  const wantVideo = isVideoModel(model) || pickOptions.tool === 'video';

  // Explicit Settings / library "Assign to model" wins over auto pack scoring
  // unless the assignment is a still-image graph on a clip queue.
  const mappedId = resolveWorkflowForModel(model, shared.modelWorkflowMap)?.trim();
  if (mappedId) {
    const mappedFile = workflowFiles.find(file => file.id === mappedId);
    const runtime = resolveSelectedWorkflowRuntime(mappedId);
    const mappedJson = (mappedFile?.workflowJson ?? runtime?.workflowJson)?.trim();
    if (mappedJson && !(wantVideo && !workflowGraphIsVideo(mappedJson))) {
      const repaired = softRepairPackLoadersFromInventory(mappedJson, model, models);
      const customTokens = softFillLightningTokenForGraph(
        model,
        repaired.workflowJson,
        [...(runtime?.customTokens ?? [])],
        models
      );
      return {
        workflowJson: repaired.workflowJson,
        source: 'pack',
        workflowFileId: mappedId,
        workflowLabel: mappedFile?.name.trim() || mappedFile?.filename?.trim() || mappedId,
        queueParams,
        ...loaders,
        ...(customTokens.length ? { customTokens } : {}),
      };
    }
  }

  const pack = pickPackWorkflowForModel(model, workflowFiles, models, pickOptions);

  if (pack) {
    const runtime = resolveSelectedWorkflowRuntime(pack.file.id);
    if (runtime?.workflowJson?.trim()) {
      const repaired = softRepairPackLoadersFromInventory(runtime.workflowJson, model, models);
      const customTokens = softFillLightningTokenForGraph(
        model,
        repaired.workflowJson,
        [...(runtime.customTokens ?? [])],
        models
      );
      return {
        workflowJson: repaired.workflowJson,
        source: 'pack',
        workflowFileId: pack.file.id,
        workflowLabel: pack.file.name.trim() || pack.file.filename?.trim() || pack.file.id,
        queueParams,
        ...loaders,
        ...(customTokens.length ? { customTokens } : {}),
      };
    }
  }

  const scaffold = buildWorkflowScaffoldForModel(model, undefined, {
    tool: pickOptions.tool,
  });
  const bound = softBindScaffoldFromInventory(scaffold.json, model, models);
  const customTokens: CustomWorkflowToken[] = [];
  if (bound.lightningLora) {
    customTokens.push({
      token: '{{LORA_LIGHTNING}}',
      value: bound.lightningLora,
    });
  }

  const choice = describeSystemWorkflowChoice(model, workflowFiles, models, pickOptions);

  return {
    workflowJson: bound.workflowJson,
    source: 'scaffold',
    workflowLabel: choice.display,
    queueParams,
    ...loaders,
    ...(customTokens.length ? { customTokens } : {}),
  };
}

function hasMatchingBoundLightningToken(
  tokens: CustomWorkflowToken[],
  model: ComfyImageModel
): boolean {
  return tokens.some(
    entry =>
      entry.token.trim() === '{{LORA_LIGHTNING}}' &&
      entry.value.trim() &&
      lightningLoraMatchesModel(entry.value, model)
  );
}

/** Soft-fill {{LORA_LIGHTNING}} on pack graphs from live inventory when unset or wrong-family. */
function softFillLightningTokenForGraph(
  model: ComfyImageModel,
  workflowJson: string,
  tokens: CustomWorkflowToken[],
  inventory?: ComfyUiModelLists | null
): CustomWorkflowToken[] {
  if (!isLightningDistilledModel(model) && !isLightningModelId(model)) {
    return tokens;
  }
  if (hasMatchingBoundLightningToken(tokens, model)) {
    return tokens;
  }
  if (!workflowJson.includes('{{LORA_LIGHTNING}}')) {
    return tokens;
  }
  const picked = inventory?.loras?.length
    ? pickLightningLoraFromInventory(model, inventory.loras)
    : undefined;
  if (!picked) {
    return tokens;
  }
  return [
    ...tokens.filter(entry => entry.token.trim() !== '{{LORA_LIGHTNING}}'),
    { token: '{{LORA_LIGHTNING}}', value: picked },
  ];
}

/** Merge system-workflow resolution into a queue runtime config. */
export function applySystemWorkflowToRuntime(
  model: ComfyImageModel,
  shared: SharedToolSettings,
  workflowFiles: ComfyWorkflowFile[],
  baseFlags: ComfyUiRuntimeConfig,
  inventory?: ComfyUiModelLists | null,
  options?: PickPackOptions
): ComfyUiRuntimeConfig {
  const resolved = resolveSystemWorkflowForModel(model, shared, workflowFiles, inventory, options);
  const profile = normalizeQueueQualityProfile(shared.queueQualityProfile);
  const isDraft = profile === 'draft';
  const isMax = profile === 'max';
  const isFinalOrMax = profile === 'final' || isMax;

  return {
    ...baseFlags,
    workflowJson: resolved.workflowJson,
    workflowFileId: resolved.workflowFileId,
    queueParams: resolved.queueParams,
    modelCheckpointMap: resolved.modelCheckpointMap,
    modelVaeMap: resolved.modelVaeMap,
    ...(resolved.modelUpscaleMap ? { modelUpscaleMap: resolved.modelUpscaleMap } : {}),
    ...(resolved.customTokens?.length
      ? {
          customTokens: [...(baseFlags.customTokens ?? []), ...resolved.customTokens],
        }
      : {}),
    queueQualityProfile: profile,
    systemWorkflowSource: resolved.source,
    systemWorkflowLabel: resolved.workflowLabel,
    syncWorkflowLoadersToModel: true,
    workflowQueueOptimize: true,
    // Draft stays lean (no enrich); Final/Max turn polish on.
    workflowGraphEnrich: !isDraft && shared.workflowGraphEnrich !== false,
    workflowSdxlRefinerEnrich: isFinalOrMax || shared.workflowSdxlRefinerEnrich !== false,
    workflowNeuralUpscalePolish: isMax || shared.workflowNeuralUpscalePolish !== false,
    workflowSharpenAfterUpscale: isMax
      ? shared.workflowSharpenAfterUpscale !== false
      : shared.workflowSharpenAfterUpscale === true,
  };
}
