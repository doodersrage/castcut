/**
 * Director: open it on a Gallery still from anywhere (the Gallery card menu's still tool). The
 * host Play mounts app-wide (components/director/DirectorGalleryHost.tsx) listens for it.
 */

export const DIRECTOR_OPEN_EVENT = 'castcut-open-director';

export type DirectorOpenRequest = {
  entryId: string;
  stillUrl: string;
  prompt?: string;
  characterId?: string;
  /** The entry's tool, for filing the new clip beside it. */
  tool?: string;
};

export function openDirector(request: DirectorOpenRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<DirectorOpenRequest>(DIRECTOR_OPEN_EVENT, { detail: request })
  );
}
