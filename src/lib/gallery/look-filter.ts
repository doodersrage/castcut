/**
 * Filter one Cast's stills by look (Gallery with a Cast filter, Cast → Film & media). Each
 * still stores the look it was made in (`lookId`); stills from before looks were stamped, or
 * from a look since removed, group under "No look".
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

/** Filter value for stills with no (or a removed) look. */
export const GALLERY_NO_LOOK = '__none__';

export const GALLERY_NO_LOOK_LABEL = 'No look';

export type GalleryLookChip = { id: string; label: string; count: number };

/** The look group a still is in: its look when the Cast still has it, else GALLERY_NO_LOOK. */
export function galleryEntryLookKey(
  entry: Pick<ComfyGalleryEntry, 'lookId'>,
  knownLookIds: ReadonlySet<string>
): string {
  const id = entry.lookId?.trim() || '';
  return id && knownLookIds.has(id) ? id : GALLERY_NO_LOOK;
}

/** Whether a still is in the picked look group (no pick = every still). */
export function galleryEntryMatchesLook(
  entry: Pick<ComfyGalleryEntry, 'lookId'>,
  lookId: string | null | undefined,
  knownLookIds: ReadonlySet<string>
): boolean {
  const wanted = lookId?.trim();
  if (!wanted) {
    return true;
  }
  return galleryEntryLookKey(entry, knownLookIds) === wanted;
}

export function filterGalleryEntriesByLook<T extends Pick<ComfyGalleryEntry, 'lookId'>>(
  entries: readonly T[],
  lookId: string | null | undefined,
  knownLookIds: ReadonlySet<string>
): T[] {
  if (!lookId?.trim()) {
    return [...entries];
  }
  return entries.filter(entry => galleryEntryMatchesLook(entry, lookId, knownLookIds));
}

/**
 * One chip per look with stills (in the Cast's look order), then "No look" when some stills
 * have none. The picked look keeps its chip at 0 so it can be cleared. Fewer than two groups
 * means there is nothing to filter: callers hide the row (unless a pick is on).
 */
export function galleryLookChips(
  looks: ReadonlyArray<{ id: string; label: string }>,
  entries: ReadonlyArray<Pick<ComfyGalleryEntry, 'lookId'>>,
  selected?: string | null
): GalleryLookChip[] {
  const known = new Set(looks.map(look => look.id));
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const key = galleryEntryLookKey(entry, known);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const pick = selected?.trim() || '';
  const chips: GalleryLookChip[] = looks
    .map(look => ({ id: look.id, label: look.label, count: counts.get(look.id) ?? 0 }))
    .filter(chip => chip.count > 0 || chip.id === pick);
  const none = counts.get(GALLERY_NO_LOOK) ?? 0;
  if (none > 0 || pick === GALLERY_NO_LOOK) {
    chips.push({ id: GALLERY_NO_LOOK, label: GALLERY_NO_LOOK_LABEL, count: none });
  }
  return chips;
}
