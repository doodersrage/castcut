/** A card's "Use this pose…" asks the gallery's pose dialog host to open for an entry. */
export const GALLERY_USE_POSE_EVENT = 'castcut:gallery-use-pose';

export function requestGalleryUsePose(entryId: string): void {
  window.dispatchEvent(new CustomEvent(GALLERY_USE_POSE_EVENT, { detail: entryId }));
}
