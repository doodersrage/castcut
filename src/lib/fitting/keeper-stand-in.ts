/**
 * A posed Keep's standing picture.
 *
 * Outfit can render a try-on in a custom pose (sitting, kneeling, arms up). Kept, that picture was
 * Day's Image 1 and her outfit reference — and Day's stills held its pose (a sitting Keep sat
 * through the day). Keep of a posed try-on therefore also renders her standing, front on, in the
 * same outfit: the posed picture stays her kept still (Gallery, Wardrobe), the standing one is
 * what Day and Story start from once it lands. Until then (or if it fails) the posed one is used.
 *
 * The render is an ordinary ComfyUI job: its prompt id is stored on the look, so it is found in
 * the gallery wherever the app is open — nothing waits on it.
 */

import type { CharacterKeeperStandIn, CharacterLook } from '@/lib/character/os';
import type { ComfyGalleryEntry } from '@/lib/gallery/comfyui-gallery-entry';

/** The try-on prompt's custom-pose lines (room.ts withFittingCustomPose, starters.ts poseFirstLine). */
const POSED_TRY_ON_RE = /\bPOSE: Image \d is a pose map\b|\bPOSE FIRST:/;

/** The completed gallery entry of a stand-in (by its entry, else its job), or null. */
export function keeperStandInEntry(
  standIn: CharacterKeeperStandIn | null | undefined,
  gallery: readonly ComfyGalleryEntry[] | null | undefined
): ComfyGalleryEntry | null {
  if (!standIn || !gallery?.length) return null;
  const entryId = standIn.entryId?.trim();
  const promptId = standIn.promptId?.trim();
  const entry =
    (entryId ? gallery.find(item => item.id === entryId) : undefined) ??
    (promptId ? gallery.find(item => item.promptId === promptId) : undefined);
  return entry?.status === 'completed' ? entry : null;
}

/** True when the stand-in's job is known to have failed. */
export function keeperStandInFailed(
  standIn: CharacterKeeperStandIn | null | undefined,
  gallery: readonly ComfyGalleryEntry[] | null | undefined
): boolean {
  if (!standIn) return false;
  if (standIn.failed) return true;
  const promptId = standIn.promptId?.trim();
  if (!promptId) return false;
  return gallery?.find(item => item.promptId === promptId)?.status === 'error';
}

/**
 * True when a kept gallery entry is a posed try-on: its prompt carries the custom-pose lines, or
 * it is a pass (the shoe pass, a fix) made from one.
 */
export function galleryEntryIsPosedTryOn(
  entry: ComfyGalleryEntry | null | undefined,
  gallery: readonly ComfyGalleryEntry[] | null | undefined
): boolean {
  const seen = new Set<string>();
  let current = entry ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (POSED_TRY_ON_RE.test(current.prompt ?? '')) return true;
    const parent = current.parentGalleryEntryId?.trim();
    current = parent ? (gallery?.find(item => item.id === parent) ?? null) : null;
  }
  return false;
}

/** The look's newest kept try-on that is in the gallery (as Day picks it, day/plate.ts). */
export function latestKeeperEntry(
  look: Pick<CharacterLook, 'keeperEntryIds'> | null | undefined,
  gallery: readonly ComfyGalleryEntry[] | null | undefined
): ComfyGalleryEntry | null {
  const ids = (look?.keeperEntryIds ?? []).map(id => id.trim()).filter(Boolean);
  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const entry = gallery?.find(item => item.id === ids[index] && item.status === 'completed');
    if (entry) return entry;
  }
  return null;
}

export type KeeperStandInState =
  /** The Keep is not posed: it is her standing picture already. */
  | 'not-needed'
  /** A posed Keep with no standing picture (kept before this existed): offered, one tap. */
  | 'offer'
  | 'rendering'
  | 'ready'
  | 'failed';

export type KeeperStandInStatus = {
  keeperEntryId: string;
  state: KeeperStandInState;
  /** The standing picture, when it is ready. */
  imageUrl?: string;
};

/**
 * Where the look's newest Keep stands: not posed, posed without a standing picture, or its
 * standing picture rendering / ready / failed. Null when the look has no Keep in the gallery.
 */
export function keeperStandInStatus(input: {
  look: Pick<CharacterLook, 'keeperEntryIds' | 'keeperStandIns'> | null | undefined;
  gallery: readonly ComfyGalleryEntry[] | null | undefined;
  /** The landed entry's picture (gallery view URL). */
  pictureOf: (entry: ComfyGalleryEntry) => string | null | undefined;
}): KeeperStandInStatus | null {
  const keeper = latestKeeperEntry(input.look, input.gallery);
  if (!keeper) return null;
  const standIn = input.look?.keeperStandIns?.[keeper.id];
  if (standIn) {
    const landed = keeperStandInEntry(standIn, input.gallery);
    const imageUrl = landed ? input.pictureOf(landed)?.trim() || standIn.imageUrl : undefined;
    if (landed && imageUrl) return { keeperEntryId: keeper.id, state: 'ready', imageUrl };
    if (keeperStandInFailed(standIn, input.gallery)) {
      return { keeperEntryId: keeper.id, state: 'failed' };
    }
    return { keeperEntryId: keeper.id, state: 'rendering' };
  }
  return {
    keeperEntryId: keeper.id,
    state: galleryEntryIsPosedTryOn(keeper, input.gallery) ? 'offer' : 'not-needed',
  };
}

/** One line for Outfit under the Keep, or null when there is nothing to say. */
export function keeperStandInLine(state: KeeperStandInState | null | undefined): string | null {
  switch (state) {
    case 'rendering':
      return 'Rendering her standing in this outfit — Day and Story use the posed picture until it is ready.';
    case 'ready':
      return 'Day and Story start from her standing picture in this outfit.';
    case 'failed':
      return "The standing picture didn't render — Day and Story use the posed picture.";
    case 'offer':
      return 'This Keep is posed, and Day and Story start from it — make a standing picture of her in this outfit for them.';
    default:
      return null;
  }
}

/**
 * The same, short, for Day's status strip (where Day says what it starts from): Keep jumps to
 * Day, so the standing render is usually still running there — and its failure needs a retry
 * there, not only back on Outfit.
 */
export function keeperStandInDayLine(state: KeeperStandInState | null | undefined): string | null {
  switch (state) {
    case 'rendering':
      return 'Rendering her standing in the kept outfit — Day uses the posed Keep until it is ready.';
    case 'ready':
      return 'Day starts from her standing picture in the kept outfit.';
    case 'failed':
      return "Her standing picture didn't render — Day uses the posed Keep.";
    case 'offer':
      return 'The kept outfit is posed, and Day starts from that pose — make a standing picture.';
    default:
      return null;
  }
}
