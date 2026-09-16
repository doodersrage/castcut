import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  DEFAULT_VIDEO_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
} from './comfy-models/client';
import {
  isComposeCapableModel,
  isEditCapableModel,
  isEditQueueTool,
  isImg2imgCapableModel,
  isInpaintModel,
} from './model-denoise-defaults';

const EDIT_TO_TXT2I: Partial<Record<ComfyImageModel, ComfyImageModel>> = {
  'qwen-image-edit': 'qwen-image-2512',
  'qwen-image-edit-2511': 'qwen-image-2512',
  'qwen-image-edit-2511-lightning-4': 'qwen-image-2512-lightning-4',
  'qwen-image-edit-2511-lightning-8': 'qwen-image-2512-lightning-8',
  'qwen-rapid-aio-edit': 'qwen-image-2512-lightning-8',
  'flux-inpaint': 'flux-dev',
};

const TXT2I_TO_EDIT: Partial<Record<ComfyImageModel, ComfyImageModel>> = {
  'qwen-image-2512': 'qwen-image-edit-2511',
  'qwen-image-2512-lightning-4': 'qwen-image-edit-2511-lightning-4',
  'qwen-image-2512-lightning-8': 'qwen-image-edit-2511-lightning-8',
  'qwen-rapid-aio-sfw': 'qwen-rapid-aio-edit',
  'qwen-rapid-aio-nsfw': 'qwen-rapid-aio-edit',
  'boogu-image': 'boogu-image-edit',
  'boogu-image-turbo': 'boogu-image-edit-turbo',
};

const DEFAULT_IMG2IMG_MODEL: ComfyImageModel = 'qwen-image-edit-2511-lightning-8';

/** Client-safe basename match — do not import comfy-asset-status (pulls node:fs). */
function inventoryListHasFilename(list: string[], filename: string): boolean {
  const trimmed = filename.trim();
  if (!trimmed) {
    return false;
  }
  const base = trimmed.split(/[/\\]/).pop() ?? trimmed;
  return list.some(entry => {
    const item = entry.trim();
    if (!item) {
      return false;
    }
    if (item === trimmed || item === base) {
      return true;
    }
    return item.endsWith(`/${base}`) || item.endsWith(`\\${base}`);
  });
}

function inferTxt2iCounterpart(model: ComfyImageModel | string): ComfyImageModel {
  const mapped = EDIT_TO_TXT2I[model as ComfyImageModel];
  if (mapped) {
    return mapped;
  }

  const id = model.toLowerCase();
  if (id.includes('lightning-4')) {
    return 'qwen-image-2512-lightning-4';
  }
  if (id.includes('lightning-8')) {
    return 'qwen-image-2512-lightning-8';
  }
  if (id.includes('qwen')) {
    return 'qwen-image-2512';
  }
  if (id.includes('flux')) {
    return 'flux-dev';
  }
  if (id.includes('sdxl')) {
    return 'sdxl-base';
  }
  return DEFAULT_COMFY_MODEL;
}

/** True for WAN Video / Hunyuan Video (`category: "video"`) models. */
export function isVideoModel(model: ComfyImageModel | string): boolean {
  return getComfyModelDefinition(model).category === 'video';
}

/**
 * Prefer the Video tool's last model, then a video shared model, else the
 * default WAN target. Avoids snapping back to wan-video on every /video load
 * when another tool left a still-image model in shared settings.
 */
export function resolvePreferredVideoModel(input: {
  toolModel?: string | null;
  sharedModel?: string | null;
  fallback?: ComfyImageModel;
}): ComfyImageModel {
  const tool = input.toolModel?.trim();
  if (tool && isVideoModel(tool)) {
    return tool as ComfyImageModel;
  }
  const shared = input.sharedModel?.trim();
  if (shared && isVideoModel(shared)) {
    return shared as ComfyImageModel;
  }
  return input.fallback ?? DEFAULT_VIDEO_MODEL;
}

/** Preferred Look (Moodboard) checkpoint — UltraReal Fine-Tune v4 when installed. */
export const LOOK_PREFERRED_MODEL: ComfyImageModel = 'flux-ultrareal-v4';

/** Registry / checkpoint-map weight for UltraReal Fine-Tune v4 (client-safe constant). */
const LOOK_PREFERRED_WEIGHT = 'ultrarealFineTune_v4.safetensors';

export function isUltraRealFineTuneAvailable(
  inventory?: { checkpoints?: string[]; unets?: string[] } | null
): boolean {
  if (!inventory) {
    return false;
  }
  return (
    inventoryListHasFilename(inventory.unets ?? [], LOOK_PREFERRED_WEIGHT) ||
    inventoryListHasFilename(inventory.checkpoints ?? [], LOOK_PREFERRED_WEIGHT)
  );
}

/**
 * Look defaults to UltraReal Fine-Tune v4 when that weight is in Comfy inventory.
 * Returns null when unavailable so callers keep the current shared model.
 */
export function resolvePreferredLookModel(input?: {
  inventory?: { checkpoints?: string[]; unets?: string[] } | null;
}): ComfyImageModel | null {
  return isUltraRealFineTuneAvailable(input?.inventory) ? LOOK_PREFERRED_MODEL : null;
}

/**
 * Outfit / Day remember the last model per tool. Stale T2I defaults (2512) must
 * not clobber an Edit-2511 pick when re-opening those tools.
 */
export function sanitizePreferEditToolModel(
  toolKey: string | undefined,
  model: ComfyImageModel | string | null | undefined
): ComfyImageModel | undefined {
  const id = String(model ?? '').trim();
  if (!id || !COMFY_MODEL_IDS.has(id)) {
    return undefined;
  }
  const key = (toolKey ?? '').trim();
  if (key !== 'fitting' && key !== 'day') {
    return id as ComfyImageModel;
  }
  if (isImg2imgCapableModel(id)) {
    return id as ComfyImageModel;
  }
  return resolvePreferredImg2imgModel({ current: id });
}

export function isAudioModel(model: ComfyImageModel | string): boolean {
  return getComfyModelDefinition(model).category === 'audio';
}

export function isMeshModel(model: ComfyImageModel | string): boolean {
  return getComfyModelDefinition(model).category === 'mesh';
}

/** System FLUX/Qwen scaffolds don't cover these tools — don't snap their models away. */
export function toolIgnoresSystemWorkflowSnap(tool?: string): boolean {
  return tool === 'audio' || tool === 'mesh' || tool === 'video';
}

export function isSceneGenerationModel(model: ComfyImageModel | string): boolean {
  const id = String(model);
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(id)) {
    return true;
  }

  const def = getComfyModelDefinition(model);
  if (!def) {
    return !/edit|inpaint|ip2p|pix2pix/i.test(id);
  }
  if (def.category === 'instruct-edit') {
    return false;
  }
  if (
    def.profile === 'qwen_edit' ||
    def.profile === 'qwen_edit_instruction' ||
    def.profile === 'instruct_pix2pix'
  ) {
    return false;
  }
  if (isInpaintModel(model)) {
    return false;
  }
  return !isEditCapableModel(model);
}

export function shouldUseSceneGenerationModel(tool?: string): boolean {
  return Boolean(tool && !isEditQueueTool(tool));
}

function normalizeModel(model: ComfyImageModel | string): ComfyImageModel {
  if (COMFY_MODEL_IDS.has(model as ComfyImageModel)) {
    return model as ComfyImageModel;
  }
  return DEFAULT_COMFY_MODEL;
}

function sameImg2imgFamily(current: string, candidate: string): boolean {
  const id = current.toLowerCase();
  const other = candidate.toLowerCase();
  if (id.includes('boogu')) {
    return other.includes('boogu');
  }
  if (id.includes('z-image')) {
    return other.includes('z-image');
  }
  if (id.includes('flux')) {
    return other.includes('flux-2-klein') || other.includes('klein');
  }
  if (id.includes('qwen') || id.includes('rapid-aio')) {
    return other.includes('qwen') || other.includes('rapid-aio');
  }
  return false;
}

function inferEditCounterpart(model: ComfyImageModel | string): ComfyImageModel {
  const normalized = normalizeModel(model);
  if (isImg2imgCapableModel(normalized)) {
    return normalized;
  }

  const mapped = TXT2I_TO_EDIT[normalized];
  if (mapped) {
    return mapped;
  }

  const id = normalized.toLowerCase();
  if (id.includes('lightning-4')) {
    return 'qwen-image-edit-2511-lightning-4';
  }
  if (id.includes('lightning-8')) {
    return 'qwen-image-edit-2511-lightning-8';
  }
  if (id.includes('rapid-aio')) {
    return 'qwen-rapid-aio-edit';
  }
  if (id.includes('boogu') && id.includes('turbo')) {
    return 'boogu-image-edit-turbo';
  }
  if (id.includes('boogu')) {
    return 'boogu-image-edit';
  }
  if (id.includes('qwen')) {
    return 'qwen-image-edit-2511-lightning-8';
  }
  return DEFAULT_IMG2IMG_MODEL;
}

/**
 * Snap a T2I (or unknown) pick onto an img2img/edit checkpoint in `allowed`.
 * Keeps the current model when it is already img2img-capable and listed.
 */
export function resolvePreferredImg2imgModel(input: {
  current?: string | null;
  allowed?: readonly ComfyImageModel[];
  fallback?: ComfyImageModel;
}): ComfyImageModel {
  const allowed = (input.allowed ?? []).filter(model => isImg2imgCapableModel(model));
  const pool = allowed.length > 0 ? [...allowed] : undefined;
  const current = input.current?.trim();

  if (current && pool?.includes(current as ComfyImageModel)) {
    return current as ComfyImageModel;
  }
  if (current && !pool && isImg2imgCapableModel(current)) {
    return current as ComfyImageModel;
  }

  const mapped = current ? inferEditCounterpart(current) : undefined;
  if (mapped && (!pool || pool.includes(mapped))) {
    return mapped;
  }

  if (current && pool) {
    const family = pool.find(model => sameImg2imgFamily(current, model));
    if (family) {
      return family;
    }
  }

  return pool?.[0] ?? input.fallback ?? mapped ?? DEFAULT_IMG2IMG_MODEL;
}

/** Edit/img2img counterpart for a T2I preset (e.g. 2512 Lightning → Edit-2511 Lightning). */
export function resolveEditCounterpartForImg2img(model: ComfyImageModel | string): ComfyImageModel {
  return inferEditCounterpart(normalizeModel(model));
}

/**
 * Queue uses the selected model as-is. Edit-2511 Lightning stays on its own
 * stack (and {{LORA_LIGHTNING}} overrides) — remapping Generate → 2512 broke
 * LoRA resolution when only the Edit LightX2V file is installed.
 */
export function resolveModelForQueueTool(
  model: ComfyImageModel | string,
  _tool?: string
): ComfyImageModel {
  void _tool;
  return normalizeModel(model);
}

/**
 * Prompt writing on Generate should use scene/T2I profiles — not edit-instruction
 * "Keep/Replace" templates — even when an edit checkpoint is selected for queueing.
 */
export function resolveModelForPromptGeneration(
  model: ComfyImageModel | string,
  tool?: string
): ComfyImageModel {
  const normalized = normalizeModel(model);

  if (!shouldUseSceneGenerationModel(tool)) {
    return normalized;
  }

  if (isSceneGenerationModel(normalized)) {
    return normalized;
  }

  return inferTxt2iCounterpart(normalized);
}

export type FilterModelsForQueueToolOptions = {
  /**
   * When true, show-all / override mode — keep edit models even on Generate.
   * Workflow-backed catalogs still prefer scene models when any exist.
   */
  includeEditModels?: boolean;
  /**
   * Roleplay From photo (and similar): show edit / img2img checkpoints only.
   * Ignored when `includeEditModels` is set (Show all).
   */
  preferEditModels?: boolean;
};

export function filterModelsForQueueTool(
  models: ComfyImageModel[],
  tool?: string,
  options?: FilterModelsForQueueToolOptions
): ComfyImageModel[] {
  // The Video tool only speaks to WAN/Hunyuan video graphs — never mix in
  // still-image checkpoints, even under the "show all" override.
  if (tool === 'video') {
    const video = models.filter(model => isVideoModel(model));
    return video.length > 0 ? video : models;
  }

  if (tool === 'audio') {
    const audio = models.filter(model => isAudioModel(model));
    return audio.length > 0 ? audio : models;
  }

  if (tool === 'mesh') {
    const mesh = models.filter(model => isMeshModel(model));
    return mesh.length > 0 ? mesh : models;
  }

  if (tool === 'compose') {
    const compose = models.filter(model => isComposeCapableModel(model));
    return compose.length > 0 ? compose : models;
  }

  if (tool === 'inpaint' || tool === 'outpaint') {
    const masked = models.filter(model => isInpaintModel(model) || isEditCapableModel(model));
    return masked.length > 0 ? masked : models;
  }

  if (options?.preferEditModels && !options?.includeEditModels) {
    // Never fall back to T2I/scene models — empty lets the picker rebuild from
    // the full edit-capable registry (Outfit/Day/From-photo first-run).
    return models.filter(model => isImg2imgCapableModel(model));
  }

  if (!shouldUseSceneGenerationModel(tool)) {
    return models;
  }
  if (options?.includeEditModels) {
    return models;
  }
  const scene = models.filter(model => isSceneGenerationModel(model));
  // Prefer scene models; only keep the full list if nothing scene-capable remains.
  return scene.length > 0 ? scene : models;
}

/** T2I counterpart for an edit/inpaint preset (e.g. Edit-2511 Lightning → 2512 Lightning). */
export function resolveTxt2iCounterpartForGenerate(
  model: ComfyImageModel | string
): ComfyImageModel {
  return inferTxt2iCounterpart(normalizeModel(model));
}

const EDIT_INSTRUCTION_LEAD = /^Keep (?:the )?(?:person|subject|figure(?:\s*1)?)\b.*?\.\s*/i;

const REPLACE_SCENE_LEAD = /^Replace the scene with\s+/i;

const MODEL_LABEL_ECHO =
  /\b(?:from\s+)?Qwen-Image-Edit(?:-[\w-]+)?(?:\s+Lightning\s*\(\d+-step\))?(?:\s+format)?\.?\s*/gi;

export function stripEditInstructionLead(prompt: string, tool?: string): string {
  if (!shouldUseSceneGenerationModel(tool)) {
    return prompt;
  }

  let text = prompt.trim();
  if (!text) {
    return text;
  }

  text = text.replace(EDIT_INSTRUCTION_LEAD, '');
  text = text.replace(REPLACE_SCENE_LEAD, '');
  text = text.replace(MODEL_LABEL_ECHO, '');
  text = text.replace(/\bDETAIL LEVEL:[^.]*\.?\s*/gi, '');

  return text.trim();
}
