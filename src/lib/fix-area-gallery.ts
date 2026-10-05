'use client';

/**
 * "Fix an area" and the Gallery: which ComfyUI picture a gallery still is, and the new entry a
 * used candidate becomes — a child of the original (derivedKind `fix-area`), so the original
 * stays in the Gallery as the alternate and nothing is lost.
 */

import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery-entry';
import type { FixAreaUseResult } from '@/lib/fix-area-client';
import { comfyImageViewUrl } from '@/lib/fix-area-client';

/** The ComfyUI view URL of a gallery still's image (null: not a ComfyUI still). */
export function galleryEntryComfyStillUrl(
  entry: Pick<ComfyGalleryEntry, 'images' | 'engineId' | 'status'>,
  imageIndex = 0
): string | null {
  if (entry.status !== 'completed') return null;
  if (entry.engineId && entry.engineId !== 'comfyui') return null;
  const image = entry.images?.[imageIndex];
  if (!image?.filename || !/\.(?:png|jpe?g|webp)$/i.test(image.filename)) return null;
  if (image.type !== 'output' && image.type !== 'input' && image.type !== 'temp') return null;
  return comfyImageViewUrl(image);
}

/** The gallery entry a used fix becomes (pure: the caller adds it). */
export function fixAreaGalleryEntryInput(
  parent: ComfyGalleryEntry,
  result: FixAreaUseResult,
  now: number = Date.now()
): Omit<ComfyGalleryEntry, 'id' | 'queuedAt' | 'images' | 'status'> & {
  status: 'completed';
  images: ComfyGalleryEntry['images'];
} {
  return {
    promptId: result.promptId,
    prompt: parent.prompt,
    ...(parent.negativePrompt ? { negativePrompt: parent.negativePrompt } : {}),
    ...(parent.tool ? { tool: parent.tool } : {}),
    ...(parent.model ? { model: parent.model } : {}),
    ...(parent.characterId ? { characterId: parent.characterId } : {}),
    ...(parent.lookId ? { lookId: parent.lookId } : {}),
    ...(parent.projectId ? { projectId: parent.projectId } : {}),
    comfyUrl: parent.comfyUrl,
    ...(parent.engineId ? { engineId: parent.engineId } : {}),
    parentGalleryEntryId: parent.id,
    derivedKind: 'fix-area',
    status: 'completed',
    completedAt: now,
    images: [result.image],
    statusMessage: result.text ? `Fixed area: ${result.text}` : 'Fixed area',
    // An adult still's fix passed the gate before it was offered.
    ...(parent.adultCheck
      ? { adultCheck: { state: result.adultCheck ?? 'passed', at: now, reason: 'fix candidate' } }
      : {}),
  };
}

/** Add the used fix to the Gallery (and copy it to durable storage). */
export async function recordFixAreaInGallery(
  parent: ComfyGalleryEntry | null | undefined,
  result: FixAreaUseResult
): Promise<ComfyGalleryEntry | null> {
  if (!parent) return null;
  const [{ addComfyGalleryEntry }, { persistCompletedGalleryMedia }] = await Promise.all([
    import('@/lib/comfyui-gallery'),
    import('@/lib/comfyui-gallery-client'),
  ]);
  const entry = addComfyGalleryEntry(fixAreaGalleryEntryInput(parent, result));
  void persistCompletedGalleryMedia(entry);
  return entry;
}

/** The gallery entry for a still, by its prompt id, else by its ComfyUI filename. */
export function findGalleryEntryForStill(
  gallery: readonly ComfyGalleryEntry[],
  still: { promptId?: string | null; comfyUrl?: string | null }
): ComfyGalleryEntry | null {
  const promptId = still.promptId?.trim();
  if (promptId) {
    const byPrompt = gallery.find(entry => entry.promptId === promptId);
    if (byPrompt) return byPrompt;
  }
  const filename = still.comfyUrl
    ? new URL(still.comfyUrl, 'http://local').searchParams.get('filename')
    : null;
  if (!filename) return null;
  return gallery.find(entry => entry.images?.some(image => image.filename === filename)) ?? null;
}
