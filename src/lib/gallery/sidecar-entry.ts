import type { ComfyGalleryEntry } from './comfyui-gallery';
import { GALLERY_DERIVED_KIND_FILTERS } from './derived-kind';
import {
  readSidecarOutputImage,
  sidecarNegativePrompt,
  sidecarRequeueContext,
  sidecarOutputViewUrl,
  type PromptSidecar,
} from '../prompt/sidecar';

/** Build a pseudo gallery entry from an imported sidecar for upscale/refine actions. */
export function galleryEntryFromSidecar(sidecar: PromptSidecar): ComfyGalleryEntry | null {
  const context = sidecarRequeueContext(sidecar);
  const outputImage = readSidecarOutputImage(sidecar);
  const sourceImageUrl = context.sourceImageUrl?.trim() ?? sidecarOutputViewUrl(sidecar);
  if (!outputImage && !sourceImageUrl) {
    return null;
  }

  const comfyUrl =
    typeof sidecar.metadata?.comfyUrl === 'string'
      ? sidecar.metadata.comfyUrl.trim().replace(/\/+$/, '')
      : 'http://127.0.0.1:8188';

  const galleryEntryId =
    typeof sidecar.metadata?.galleryEntryId === 'string'
      ? sidecar.metadata.galleryEntryId.trim()
      : undefined;

  // Sourced from the canonical GALLERY_DERIVED_KIND_FILTERS list (rather than a hand-copied
  // set of literals) so this whitelist can't silently drift out of sync with it again — it
  // was previously missing 'moire-clean', 'face-detail', and 't2v'.
  const rawDerivedKind = sidecar.metadata?.derivedKind;
  const derivedKind = (GALLERY_DERIVED_KIND_FILTERS as readonly string[]).includes(
    rawDerivedKind as string
  )
    ? (rawDerivedKind as ComfyGalleryEntry['derivedKind'])
    : undefined;

  return {
    id: galleryEntryId ?? `sidecar-${Date.now()}`,
    promptId:
      typeof sidecar.metadata?.promptId === 'string'
        ? sidecar.metadata.promptId.trim()
        : 'sidecar-import',
    prompt: sidecar.positive,
    negativePrompt: sidecarNegativePrompt(sidecar),
    tool: sidecar.tool,
    model: sidecar.model,
    queueParams: context.queueParams,
    sourceImageUrl,
    maskImageUrl: context.maskImageUrl,
    queueQualityProfile: context.queueQualityProfile,
    parentGalleryEntryId:
      typeof sidecar.metadata?.parentGalleryEntryId === 'string'
        ? sidecar.metadata.parentGalleryEntryId.trim()
        : undefined,
    characterId:
      typeof sidecar.metadata?.characterId === 'string'
        ? sidecar.metadata.characterId.trim()
        : undefined,
    lookId:
      typeof sidecar.metadata?.lookId === 'string' ? sidecar.metadata.lookId.trim() : undefined,
    derivedKind,
    comfyUrl,
    status: 'completed',
    queuedAt: Date.now(),
    images: outputImage ? [outputImage] : [],
  };
}
