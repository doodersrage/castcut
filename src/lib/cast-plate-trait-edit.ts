import type { CastPlatePrepareOptions } from '@/lib/cast-plate-prepare';

/** Cast home saved look traits (hair, makeup…): the app-wide watcher edits the plate to match. */
export const CAST_PLATE_TRAIT_EDIT_EVENT = 'castcut:plate-trait-edit';

export type CastPlateTraitEditRequest = {
  characterId: string;
  lookId: string;
  options: CastPlatePrepareOptions;
};

export function requestCastPlateTraitEdit(request: CastPlateTraitEditRequest): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CAST_PLATE_TRAIT_EDIT_EVENT, { detail: request }));
}
