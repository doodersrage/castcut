import { isLtx25Model } from '../video/ltx25-renderer';
import { poseProfileForModel } from '../pose/pose-model-profile';
import {
  COMFY_MODEL_IDS,
  DEFAULT_COMFY_MODEL,
  DEFAULT_VIDEO_MODEL,
  getComfyModelDefinition,
  type ComfyImageModel,
} from '../comfy-models/client';
import {
  isComposeCapableModel,
  isEditCapableModel,
  isEditQueueTool,
  isImg2imgCapableModel,
  isInpaintModel,
} from '../model/denoise-defaults';

const EDIT_TO_TXT2I: Partial<Record<ComfyImageModel, ComfyImageModel>> = {
  'qwen-image-edit': 'qwen-image-2512',
  'qwen-image-edit-2511': 'qwen-image-2512',
  'qwen-image-edit-2511-lightning-4': 'qwen-image-2512-lightning-4',
  'qwen-image-edit-2511-lightning-8': 'qwen-image-2512-lightning-8',
  'qwen-rapid-aio-edit': 'qwen-image-2512-lightning-8',
  'qwen-rapid-aio-edit-nsfw': 'qwen-rapid-aio-nsfw',
  'flux-inpaint': 'flux-dev',
};

const TXT2I_TO_EDIT: Partial<Record<ComfyImageModel, ComfyImageModel>> = {
  'qwen-image-2512': 'qwen-image-edit-2511',
  'qwen-image-2512-lightning-4': 'qwen-image-edit-2511-lightning-4',
  'qwen-image-2512-lightning-8': 'qwen-image-edit-2511-lightning-8',
  'qwen-rapid-aio-sfw': 'qwen-rapid-aio-edit',
  'qwen-rapid-aio-nsfw': 'qwen-rapid-aio-edit-nsfw',
  'boogu-image': 'boogu-image-edit',
  'boogu-image-turbo': 'boogu-image-edit-turbo',
};

const DEFAULT_IMG2IMG_MODEL: ComfyImageModel = 'qwen-image-edit-2511-lightning-8';

/** The edit tools' default engine when installed (resolvePreferredImg2imgModel). */
export const DEFAULT_EDIT_ENGINE: ComfyImageModel = 'qwen-image-2.1-edit-turbo-8';

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
  if (id.startsWith('qwen-image-2.1')) {
    return 'qwen-image-2512';
  }
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

/** A text-to-image model for `current`: itself when it makes pictures from words, else its counterpart. */
export function resolveTxt2iModel(current?: string | null): ComfyImageModel {
  const id = current?.trim();
  if (!id) return 'qwen-image-2512';
  if (!isImg2imgCapableModel(id) && !isVideoModel(id)) return id as ComfyImageModel;
  return inferTxt2iCounterpart(id);
}

/**
 * The engine for a picture made from words alone (Cut's generated shots): a Qwen-Image 2.1 setup
 * stays on 2.1 Turbo (its edit engines render without a picture; there is no 2.1 text-only
 * entry, and its 2512 counterpart is usually not installed), else the text-to-image counterpart.
 */
export function cutGenerateModel(current?: string | null): ComfyImageModel {
  const id = current?.trim().toLowerCase() ?? '';
  // Fibo 2.0 Edit Turbo needs a picture to edit too (its encode takes at least one).
  if (id.startsWith('qwen-image-2.1') || id === 'fibo-2-edit-turbo') return DEFAULT_EDIT_ENGINE;
  return resolveTxt2iModel(current);
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
  // Scene runs Day's engine on one shot (day/scenes.ts).
  if (key !== 'fitting' && key !== 'day' && key !== 'scene') {
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

/** Tools that only queue still images — a video / audio / 3D model there cannot run. */
const STILL_IMAGE_TOOLS = new Set([
  'background',
  'character',
  'controlnet',
  'day',
  'fantasy',
  'fitting',
  'format',
  'generate',
  'imageCompose',
  'imagePrompt',
  'inpaint',
  'lint',
  'logo',
  'moodboard',
  'negative',
  'nsfwGenerator',
  'outpaint',
  'pet',
  'promptEditor',
  'refine',
  'roleplay',
  'scene',
  'topics',
  'variations',
]);

/**
 * A still-image tool must not pick up a video / audio / 3D model — from its own stale memory
 * or from the shared model another tool (Video, Audio, Mesh) left behind. Returns the model to
 * use instead, or the model unchanged.
 */
export function stillImageToolModel(
  toolKey: string | undefined,
  model: ComfyImageModel | string
): ComfyImageModel {
  if (
    STILL_IMAGE_TOOLS.has((toolKey ?? '').trim()) &&
    (isVideoModel(model) || isAudioModel(model) || isMeshModel(model))
  ) {
    return DEFAULT_COMFY_MODEL;
  }
  return model as ComfyImageModel;
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
  if (id.includes('rapid-aio')) {
    return other.includes('rapid-aio');
  }
  if (id.includes('qwen')) {
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
    if (id.includes('nsfw')) {
      return 'qwen-rapid-aio-edit-nsfw';
    }
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

  // The out-of-the-box pick (qwen-image-2512) opens the edit tools on Qwen-Image 2.1 Turbo when
  // it is installed — 2026-10-17 rematch, the same 38 Day beats through the app: beats shown tied
  // with Edit 2511 (23/24 Everyday each), the Cast's face much closer (median distance 0.24 vs
  // 0.53, closer on 30/38), ~20 s vs ~28 s. Not installed: Edit 2511 as before.
  if (current === 'qwen-image-2512' && pool?.includes(DEFAULT_EDIT_ENGINE)) {
    return DEFAULT_EDIT_ENGINE;
  }

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

/** Prefer Rapid AIO Edit NSFW when Day/Story heat needs the NSFW merge. */
export function resolveRapidAioEditModel(options?: {
  nsfw?: boolean;
  current?: string | null;
}): ComfyImageModel {
  const current = options?.current?.trim().toLowerCase() ?? '';
  if (options?.nsfw) {
    if (current === 'qwen-rapid-aio-edit-nsfw' || current === 'qwen-rapid-aio-nsfw') {
      return 'qwen-rapid-aio-edit-nsfw';
    }
    if (current.includes('rapid-aio')) {
      return 'qwen-rapid-aio-edit-nsfw';
    }
    return 'qwen-rapid-aio-edit-nsfw';
  }
  if (current === 'qwen-rapid-aio-edit' || current === 'qwen-rapid-aio-sfw') {
    return 'qwen-rapid-aio-edit';
  }
  if (current.includes('rapid-aio') && !current.includes('nsfw')) {
    return 'qwen-rapid-aio-edit';
  }
  return 'qwen-rapid-aio-edit';
}

/**
 * Day/Story plate queues: snap T2I → Edit, then force Rapid AIO **Edit NSFW**
 * on adult nude beats (SFW cannot deliver NSFW bare-skin stills). Beach bias from
 * NSFW merges is fought with indoor SETTING-first edit leads + 4–6 step caps —
 * not by swapping to SFW.
 *
 * Clothed moods (Suggestive / Vacation / Sport / Everyday) must snap **off**
 * leftover Edit NSFW — that merge invents mid-sex duo doggy from kneeling /
 * look-back stills even when the prompt bans partners.
 */
export function resolveAdultNudePlateQueueModel(
  model: ComfyImageModel | string,
  options?: { adultNude?: boolean; installed?: (modelId: string) => boolean }
): ComfyImageModel {
  // A clothed-only engine's nude still queues on its adult engine (Story's nude plates).
  const adultEngine = clothedOnlyAdultEngine(model, {
    adultNude: options?.adultNude === true,
    installed: options?.installed,
  });
  if (adultEngine) return resolveAdultNudePlateQueueModel(adultEngine, options);
  // An engine that rides another graph (Qwen-Image 2.1) keeps its own id — the queue maps it.
  if (poseProfileForModel(String(model)).graphBaseModel) return model;
  const resolved = resolveModelForQueueTool(model, 'image-prompt');
  const haystack = `${String(model)} ${resolved}`.toLowerCase();
  if (!options?.adultNude) {
    if (haystack.includes('rapid-aio') && haystack.includes('nsfw')) {
      return resolveRapidAioEditModel({ nsfw: false, current: resolved });
    }
    return resolved;
  }
  if (!haystack.includes('rapid-aio')) {
    return resolved;
  }
  return resolveRapidAioEditModel({ nsfw: true, current: resolved });
}

/** Edit/img2img counterpart for a T2I preset (e.g. 2512 Lightning → Edit-2511 Lightning). */
export function resolveEditCounterpartForImg2img(model: ComfyImageModel | string): ComfyImageModel {
  return inferEditCounterpart(normalizeModel(model));
}

/**
 * The engine a clothed-only engine's nude still renders on (first installed of its
 * `adultEngines`, else the last — Rapid AIO NSFW, which its graph is built on). Null otherwise.
 */
export function clothedOnlyAdultEngine(
  model: ComfyImageModel | string,
  options: { adultNude: boolean; installed?: (modelId: string) => boolean }
): ComfyImageModel | null {
  const profile = poseProfileForModel(String(model));
  if (!options.adultNude || !profile.clothedOnly || !profile.adultEngines?.length) return null;
  return (profile.adultEngines.find(id => COMFY_MODEL_IDS.has(id) && options.installed?.(id)) ??
    profile.adultEngines[profile.adultEngines.length - 1]) as ComfyImageModel;
}

/** The card line for a nude still moved off a clothed-only engine. */
export function clothedOnlyHandOffNote(
  picked: string | null | undefined,
  rendered: string | null | undefined
): string | undefined {
  if (!picked || !rendered || picked === rendered) return undefined;
  if (!poseProfileForModel(picked).clothedOnly) return undefined;
  const name = (id: string) => getComfyModelDefinition(id)?.label?.replace(/\s*\(.*\)$/, '') ?? id;
  return `Rendered on ${name(rendered)} — ${name(picked)} doesn't do nude stills`;
}

/**
 * The engine one Day still renders on. A picked engine with an `adultEngine` (Qwen Edit 2511)
 * hands its adult nude stills to that engine, and one with a `clothedDuoEngine` (Qwen-Image 2.1)
 * its clothed two-person stills — for this still only; the picked engine stays picked. No
 * hand-off when the other engine is not installed (or the inventory is unknown).
 */
export function resolveDayStillModel(
  model: ComfyImageModel | string,
  options: {
    adultNude: boolean;
    /** A clothed still with two people in it (see pose-model-profile: clothedDuoEngine). */
    clothedDuo?: boolean;
    /** A nude two-person still whose bodies are joined (see pose-model-profile: penetrationEngine). */
    penetrationDuo?: boolean;
    installed?: (modelId: string) => boolean;
    /** False: no hand-off, the picked engine renders ("Pick the best engine per pose" off). */
    handOffs?: boolean;
    /**
     * A one-person custom pose the picked engine can't draw (custom-pose-engine.ts:
     * customPoseOffPlate) — see pose-model-profile: customPoseEngines.
     */
    customPoseOffPlate?: boolean;
  }
): ComfyImageModel {
  const picked = normalizeModel(model);
  // A clothed-only engine (Fibo 2.0) never renders a nude still: the adult engine does, hand-offs
  // on or off, and that engine's own hand-offs apply (2.1 Turbo's sex-pose duo → Rapid NSFW).
  const clothedOnlyEngine = clothedOnlyAdultEngine(picked, options);
  if (clothedOnlyEngine) return resolveDayStillModel(clothedOnlyEngine, options);
  if (options.handOffs === false) return picked;
  // Qwen-Image 2.1 hands penetration duos to Rapid AIO NSFW — the whole still, so it gets Rapid's
  // two-person pose map and recipe (2.1 sat her beside him on lap / kneeling beats, 0/8).
  const sexEngine = poseProfileForModel(picked).penetrationEngine;
  if (
    options.penetrationDuo &&
    options.adultNude &&
    sexEngine &&
    COMFY_MODEL_IDS.has(sexEngine) &&
    options.installed?.(sexEngine)
  ) {
    return sexEngine as ComfyImageModel;
  }
  const duoEngine = poseProfileForModel(picked).clothedDuoEngine;
  if (
    options.clothedDuo &&
    !options.adultNude &&
    duoEngine &&
    COMFY_MODEL_IDS.has(duoEngine) &&
    options.installed?.(duoEngine)
  ) {
    return duoEngine as ComfyImageModel;
  }
  const adultEngine = poseProfileForModel(picked).adultEngine;
  if (
    options.adultNude &&
    adultEngine &&
    COMFY_MODEL_IDS.has(adultEngine) &&
    options.installed?.(adultEngine)
  ) {
    return adultEngine as ComfyImageModel;
  }
  // A custom pose off the plate (lying, a plank, a back view): Edit 2511 → Noct-Q, else Turbo.
  if (options.customPoseOffPlate && !options.adultNude) {
    const engine = poseProfileForModel(picked).customPoseEngines?.find(
      id => COMFY_MODEL_IDS.has(id) && options.installed?.(id)
    );
    if (engine) return engine as ComfyImageModel;
  }
  return picked;
}

/**
 * Queue uses the selected model as-is for Generate / T2I tools.
 * Edit queue tools (Day/Outfit/Story photo, Refine, Compose, …) snap T2I
 * picks (e.g. Qwen 2512) onto their Edit counterpart — otherwise Image 1–3
 * never apply and stills can dump the magenta pose-guide schematic.
 */
export function resolveModelForQueueTool(
  model: ComfyImageModel | string,
  tool?: string
): ComfyImageModel {
  const normalized = normalizeModel(model);
  // Qwen-Image 2.1 queues on the Rapid AIO edit graph (its recipes, pose maps and the explicit
  // fallback); the runtime then converts the sampler to 2.1 (qwen-image-21-renderer.ts).
  const graphBase = poseProfileForModel(normalized).graphBaseModel;
  if (graphBase) return graphBase;
  // LTX-2.5 queues on the WAN clip graph; the runtime converts it (ltx25-renderer.ts).
  if (isLtx25Model(normalized)) return DEFAULT_VIDEO_MODEL;
  if (isEditQueueTool(tool) && !isImg2imgCapableModel(normalized)) {
    return inferEditCounterpart(normalized);
  }
  return normalized;
}

/**
 * The model a queued take records: the engine asked for when it rides another graph (Qwen-Image
 * 2.1 queues on Rapid AIO's; the runtime renders 2.1), else the model queued. M6 D11: 2.1 takes
 * were recorded as Rapid AIO, so the Gallery named the wrong engine and a replay ran on Rapid.
 */
export function queuedTakeModel(
  requested: ComfyImageModel | string,
  queued: ComfyImageModel
): ComfyImageModel {
  const normalized = normalizeModel(requested);
  return poseProfileForModel(normalized).graphBaseModel === queued ? normalized : queued;
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
