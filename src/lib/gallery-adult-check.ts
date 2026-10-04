/**
 * The adult-appearance gate's mark on a gallery entry (adult-appearance-gate.ts). An adult Day /
 * Story still is registered `pending`; until the gate passes it, and for good once the gate
 * withholds it, the entry is hidden everywhere: the Gallery grid, films, exports and sync (the
 * server deletes its row and keeps none of its text). Pure — shared by client and server.
 */

import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export type GalleryAdultCheckState =
  /** Queued as an adult still; not checked yet. Hidden. */
  | 'pending'
  /** The vision model read every person as clearly adult. */
  | 'passed'
  /** No vision model configured — allowed unchecked. */
  | 'unchecked'
  /** Did not read as clearly adult. Hidden for good. */
  | 'withheld';

export type GalleryAdultCheck = {
  state: GalleryAdultCheckState;
  /** This take used the stronger age sentence (the one requeue after a withheld take). */
  strong?: boolean;
  /** Why it was withheld / passed, in a few words. */
  reason?: string;
  at: number;
};

type WithAdultCheck = { adultCheck?: GalleryAdultCheck | null };

/** Pending or withheld: never shown, filmed, exported or synced. */
export function isGalleryEntryHidden(entry: WithAdultCheck | null | undefined): boolean {
  const state = entry?.adultCheck?.state;
  return state === 'pending' || state === 'withheld';
}

export function isGalleryEntryWithheld(entry: WithAdultCheck | null | undefined): boolean {
  return entry?.adultCheck?.state === 'withheld';
}

/** The entries that may be shown, filmed or exported. */
export function withoutHiddenGalleryEntries<T extends WithAdultCheck>(entries: readonly T[]): T[] {
  return entries.filter(entry => !isGalleryEntryHidden(entry));
}

/**
 * What a sync push sends: hidden entries go as a bare stub (id, prompt id, the mark) so the
 * server deletes any copy it holds — never their prompt, images or URLs.
 */
export function galleryEntriesForSync(entries: readonly ComfyGalleryEntry[]): ComfyGalleryEntry[] {
  return entries.map(entry =>
    isGalleryEntryHidden(entry)
      ? {
          id: entry.id,
          promptId: entry.promptId,
          prompt: '',
          comfyUrl: '',
          status: entry.status,
          queuedAt: entry.queuedAt,
          ...(entry.completedAt ? { completedAt: entry.completedAt } : {}),
          images: [],
          adultCheck: entry.adultCheck,
        }
      : entry
  );
}

/**
 * A job made from a hidden entry's picture (soft pass, refine, upscale, clip) is hidden too: a
 * withheld parent makes it withheld, a pending one pending (the gate checks it when it lands).
 * A fresh render that only names the entry as its lineage (a variation, text-to-video) is not.
 */
export function inheritedAdultCheck(
  parent: WithAdultCheck | null | undefined,
  derivedKind?: ComfyGalleryEntry['derivedKind'],
  now = Date.now()
): GalleryAdultCheck | undefined {
  if (derivedKind === 'variation' || derivedKind === 't2v') return undefined;
  const state = parent?.adultCheck?.state;
  if (state === 'withheld')
    return { state: 'withheld', reason: 'derived from a withheld still', at: now };
  if (state === 'pending') return { state: 'pending', strong: parent?.adultCheck?.strong, at: now };
  return undefined;
}
