import type { ComfyGalleryEntry } from './comfyui-gallery';
import { resolveGalleryOutputImageUrl } from './gallery-output-upscale';
import { isQwenRapidAioModel } from './model-denoise-defaults';
import { isQwenLightningModel } from './model-sampling-patch';
import {
  normalizeQueueQualityProfile,
  profileSkipsOutputUpscaleForModel,
  type QueueQualityProfile,
} from './queue-quality-profile';

/** Gallery Upscale is for models that benefit from Lanczos/neural — not distilled ones. */
export function galleryEntrySupportsUpscale(
  model?: string,
  qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>
): boolean {
  if (isQwenLightningModel(model) || isQwenRapidAioModel(model)) {
    return false;
  }
  // Klein Base / Turbo distilled: Final/Max image-space enlarge is a no-op (scale 1).
  if (qualityProfile && profileSkipsOutputUpscaleForModel(qualityProfile, { model })) {
    return false;
  }
  return true;
}

/**
 * True when another Final/Max enhance would be redundant.
 * Max may still bump a Final keeper or Final upscale/moire child.
 */
export function galleryEntryAlreadyEnrichedForUpscale(
  entry: Pick<ComfyGalleryEntry, 'derivedKind' | 'queueQualityProfile'>,
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>
): boolean {
  const stored = normalizeQueueQualityProfile(entry.queueQualityProfile);
  if (stored === 'max') {
    return true;
  }
  if (stored === 'final') {
    return qualityProfile === 'final';
  }
  // Upscale/moire children without a stored Final/Max profile still count as
  // Final-enriched — allow Max bump, block another Final pass.
  if (entry.derivedKind === 'upscale' || entry.derivedKind === 'moire-clean') {
    return qualityProfile === 'final';
  }
  return false;
}

/** True when requesting Max on a Final (or Final-tier derivative) keeper. */
export function galleryEntryIsFinalToMaxBump(
  entry: Pick<ComfyGalleryEntry, 'derivedKind' | 'queueQualityProfile'>,
  qualityProfile: Extract<QueueQualityProfile, 'final' | 'max'>
): boolean {
  if (qualityProfile !== 'max') {
    return false;
  }
  if (galleryEntryAlreadyEnrichedForUpscale(entry, 'max')) {
    return false;
  }
  const stored = normalizeQueueQualityProfile(entry.queueQualityProfile);
  return (
    stored === 'final' || entry.derivedKind === 'upscale' || entry.derivedKind === 'moire-clean'
  );
}

/** Img2img refine: skip Lightning; Rapid AIO T2I uses moiré clean instead. */
export function galleryEntrySupportsRefine(model?: string): boolean {
  if (isQwenLightningModel(model)) {
    return false;
  }
  // Rapid AIO Edit keeps refine; SFW/NSFW polish path is moiré clean.
  if (/^qwen-rapid-aio-(sfw|nsfw)$/i.test(String(model ?? ''))) {
    return false;
  }
  return true;
}

/** Moiré clean is the Rapid AIO polish path (blur / mild Max resample). */
export function galleryEntrySupportsMoireClean(model?: string): boolean {
  return isQwenRapidAioModel(model);
}

/** Face detail is an img2img-style requeue — same constraint as refine (no Lightning pass-through). */
export function galleryEntrySupportsFaceDetail(model?: string): boolean {
  return !isQwenLightningModel(model);
}

export function canUpscaleGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    | 'status'
    | 'images'
    | 'sourceImageUrl'
    | 'comfyUrl'
    | 'model'
    | 'derivedKind'
    | 'queueQualityProfile'
  >,
  qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>
): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  if (!galleryEntrySupportsUpscale(entry.model, qualityProfile)) {
    return false;
  }
  if (qualityProfile && galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)) {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

/** Soft second pass uses the same model gates as refine (no Lightning / Rapid T2I). */
export function galleryEntrySupportsSoftSecondPass(model?: string): boolean {
  return galleryEntrySupportsRefine(model);
}

export function canSoftSecondPassGalleryEntry(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images' | 'sourceImageUrl' | 'comfyUrl' | 'model'>
): boolean {
  if (!galleryEntrySupportsSoftSecondPass(entry.model)) {
    return false;
  }
  if (entry.status !== 'completed') {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

/**
 * Soft skin-fix on a Settings skin model (UltraReal / Klein / Edit).
 * Parent may be Rapid AIO — eligibility follows the refine model, not the parent.
 */
export function canSkinRefineGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    'status' | 'images' | 'sourceImageUrl' | 'comfyUrl' | 'derivedKind'
  >,
  refineModel?: string | null
): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  if (entry.derivedKind === 'i2v') {
    return false;
  }
  if (!resolveGalleryOutputImageUrl(entry)) {
    return false;
  }
  const model = String(refineModel ?? 'flux-2-klein-9b').trim() || 'flux-2-klein-9b';
  return galleryEntrySupportsRefine(model);
}

export function canRefineGalleryEntry(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images' | 'sourceImageUrl' | 'comfyUrl' | 'model'>
): boolean {
  if (!galleryEntrySupportsRefine(entry.model)) {
    return false;
  }
  if (entry.status !== 'completed') {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

export function canFaceDetailGalleryEntry(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images' | 'sourceImageUrl' | 'comfyUrl' | 'model'>
): boolean {
  if (!galleryEntrySupportsFaceDetail(entry.model)) {
    return false;
  }
  if (entry.status !== 'completed') {
    return false;
  }
  if (!resolveGalleryOutputImageUrl(entry)) {
    return false;
  }
  // Prefer a library FaceDetailer; otherwise allow the action when Impact Pack
  // may be installed (queue path auto-inserts when object_info confirms it).
  return true;
}

/** Anatomy repair opens Inpaint with a pre-filled limb-fix prompt — mask required. */
export function galleryEntrySupportsAnatomyRepair(model?: string): boolean {
  return galleryEntrySupportsRefine(model);
}

export function canAnatomyRepairGalleryEntry(
  entry: Pick<ComfyGalleryEntry, 'status' | 'images' | 'sourceImageUrl' | 'comfyUrl' | 'model'>
): boolean {
  if (!galleryEntrySupportsAnatomyRepair(entry.model)) {
    return false;
  }
  if (entry.status !== 'completed') {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}

export function canMoireCleanGalleryEntry(
  entry: Pick<
    ComfyGalleryEntry,
    | 'status'
    | 'images'
    | 'sourceImageUrl'
    | 'comfyUrl'
    | 'model'
    | 'derivedKind'
    | 'queueQualityProfile'
  >,
  qualityProfile?: Extract<QueueQualityProfile, 'final' | 'max'>
): boolean {
  if (entry.status !== 'completed') {
    return false;
  }
  if (!galleryEntrySupportsMoireClean(entry.model)) {
    return false;
  }
  if (qualityProfile && galleryEntryAlreadyEnrichedForUpscale(entry, qualityProfile)) {
    return false;
  }
  return Boolean(resolveGalleryOutputImageUrl(entry));
}
