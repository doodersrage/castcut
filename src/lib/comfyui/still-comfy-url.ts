/**
 * Day / Story stills are shown from durable gallery copies (`/api/gallery/media/<id>`), but the
 * ComfyUI utility checks (face match, pose detect, Face finish) need the ComfyUI output itself.
 * The gallery entry for the still's prompt still records that output — map back to it.
 */

type GalleryImageRef = { filename?: string; subfolder?: string; type?: string };

/** Already a ComfyUI view URL (the proxy or ComfyUI's own /view). */
export function isComfyViewUrl(url: string | null | undefined): boolean {
  return /\/view\?[^#]*\bfilename=/.test(String(url ?? ''));
}

export function comfyViewUrlForStill(
  still: { imageUrl?: string | null; promptId?: string | null },
  gallery: ReadonlyArray<{ promptId?: string | null; images?: GalleryImageRef[] | null }>
): string | null {
  const imageUrl = still.imageUrl?.trim() || '';
  if (isComfyViewUrl(imageUrl)) return imageUrl;
  const promptId = still.promptId?.trim();
  if (!promptId) return null;
  const image = gallery.find(entry => entry.promptId === promptId)?.images?.[0];
  if (!image?.filename) return null;
  const params = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? '',
    type: image.type || 'output',
  });
  return `/api/comfyui/view?${params.toString()}`;
}
