/**
 * Auto soft-pass after Day / Story stills — swap to a skin-friendlier model
 * so Rapid AIO plastic skin can be cleaned without rewriting pose.
 *
 * Default is Klein Base img2img (visible texture change). Qwen Edit stays an
 * option for pose-locked passes; UltraReal soft-pass remaps to Edit (Comfy unpack bugs).
 */

import type { ComfyGalleryEntry } from './comfyui-gallery';
import type { ComfyUiSettings } from './comfyui-settings';
import { galleryEntrySupportsRefine } from './gallery-entry-actions';
import { normalizeComfyModel } from './comfy-models';

/** Klein Base img2img — stronger skin rematerialization than Edit keep-everything. */
export const DEFAULT_PLAY_SKIN_REFINE_MODEL = 'flux-2-klein-9b';

export const PLAY_SKIN_REFINE_MODEL_OPTIONS = [
  { id: 'flux-2-klein-9b', label: 'Klein 9B Base (recommended)' },
  { id: 'qwen-image-edit-2511', label: 'Qwen Image Edit 2511 (pose-locked)' },
  { id: 'qwen-image-edit', label: 'Qwen Image Edit' },
  { id: 'flux-ultrareal-v4', label: 'UltraReal Fine-Tune v4' },
] as const;

export type PlaySkinRefineModelId = (typeof PLAY_SKIN_REFINE_MODEL_OPTIONS)[number]['id'];

/**
 * Soft-pass body for Gallery Skin refine — Gentle turbo wrap locks pose/hands/crotch
 * (Strong was morphing ambiguous pelvis regions into fused props). Kill oily/pepper
 * artifacts only; keep real landmarks (navel, moles) — do not beauty-filter the torso
 * blank or invent dense freckles (Klein often paints freckle storms when asked to “keep”
 * freckle clusters).
 */
export const PLAY_SKIN_REFINE_POSITIVE =
  'Rematerialize exposed skin on face, neck, chest, belly, arms, hands, and legs only. Kill oily wet plastic shine, CGI gloss, wax-figure smoothness, and beauty-filter porcelain. Replace pepper-grain noise, speckled dotted pores, and grainy skin artifacts with natural matte photographic skin — soft highlight rolloff, subtle subsurface scatter, light even micro-texture (not poreless porcelain). Do not invent or multiply freckles — match Image 1 freckle density exactly; leave clear skin clear. Keep every body landmark from Image 1: navel/belly button clearly indented, rib and ab relief, moles, scars, nipples, and skin folds — never erase, blur out, or fill in the navel; never blank or airbrush the midriff smooth. Copy hands, fingers, crotch, pelvis, any held props, wardrobe, body pose, camera framing, hair, and background exactly from Image 1 — never invent, merge, reshape, or replace anything between the thighs.';

export const PLAY_SKIN_REFINE_NEGATIVE =
  'oily plastic shine, wet skin gloss, shiny doll skin, plastic skin, waxy skin, airbrushed, porcelain skin, beauty filter, CGI, 3D render, poreless skin, silicone skin, gloss coat, heavy retouching, blank midriff, missing navel, erased belly button, featureless abdomen, smoothed-out belly button, filled-in navel, airbrushed torso, over-smoothed belly, pepper grain skin, speckled freckles, noise freckles, dense freckles, freckled chest, freckled torso, freckled belly, excess freckles, freckle storm, freckle overlay, constellation freckles, heavy freckling, dotted pores, grainy skin texture, oversharpened pores, film grain on skin, mottled noise, fused fingers, melted hands, morphing crotch, reinvented pelvis, invented sex toy, merged prop into skin, crotch blob, warped hands between thighs';

const SKIN_REFINE_MODEL_IDS = new Set<string>(
  PLAY_SKIN_REFINE_MODEL_OPTIONS.map(option => option.id)
);

export function normalizePlaySkinRefineModel(raw?: string | null): PlaySkinRefineModelId {
  const id = String(raw ?? '').trim();
  if (SKIN_REFINE_MODEL_IDS.has(id)) {
    return id as PlaySkinRefineModelId;
  }
  return DEFAULT_PLAY_SKIN_REFINE_MODEL;
}

/**
 * UltraReal Flux soft img2img still trips "too many values to unpack (expected 4)"
 * on some Comfy + custom-node stacks. Route UltraReal picks to Klein Base img2img.
 */
export function resolveSkinRefineQueueModel(raw?: string | null): string {
  const id = normalizePlaySkinRefineModel(raw);
  if (id === 'flux-ultrareal-v4') {
    return DEFAULT_PLAY_SKIN_REFINE_MODEL;
  }
  return id;
}

/** Always false — auto-after-still was removed; Skin refine is Gallery-only. */
export function isAutoSkinRefineEnabled(
  _settings?: Pick<ComfyUiSettings, 'autoSkinRefineOnPlayStill'> | null
): boolean {
  return false;
}

export function resolvePlaySkinRefineModel(
  settings: Pick<ComfyUiSettings, 'autoSkinRefineModel'> | null | undefined
): PlaySkinRefineModelId {
  return normalizePlaySkinRefineModel(settings?.autoSkinRefineModel);
}

/** Queue-time model — remaps broken UltraReal soft-pass to Edit. */
export function resolvePlaySkinRefineQueueModel(
  settings: Pick<ComfyUiSettings, 'autoSkinRefineModel'> | null | undefined
): string {
  return resolveSkinRefineQueueModel(resolvePlaySkinRefineModel(settings));
}

/** Child enhance passes must not chain another skin refine. */
export function galleryEntryIsPrimaryPlayStill(
  entry: Pick<ComfyGalleryEntry, 'tool' | 'derivedKind' | 'parentGalleryEntryId'>
): boolean {
  if (entry.parentGalleryEntryId) {
    return false;
  }
  const kind = entry.derivedKind;
  if (
    kind === 'soft-pass' ||
    kind === 'refine' ||
    kind === 'upscale' ||
    kind === 'moire-clean' ||
    kind === 'face-detail' ||
    kind === 'i2v'
  ) {
    return false;
  }
  const tool = String(entry.tool ?? '').trim();
  return tool === 'day' || tool === 'roleplay' || tool === 'image-prompt';
}

export function galleryEntryCanAutoSkinRefine(
  entry: Pick<
    ComfyGalleryEntry,
    | 'status'
    | 'tool'
    | 'derivedKind'
    | 'parentGalleryEntryId'
    | 'images'
    | 'sourceImageUrl'
    | 'comfyUrl'
  >,
  refineModel: string
): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  if (!galleryEntryIsPrimaryPlayStill(entry)) {
    return false;
  }
  return galleryEntrySupportsRefine(normalizeComfyModel(refineModel));
}

/**
 * @deprecated Auto-after-still skin refine removed — no-op.
 * Skin refine is Gallery-only (card menu / compare).
 */
export function maybeSchedulePlaySkinRefine(_promptId?: string | null): void {
  return;
}
