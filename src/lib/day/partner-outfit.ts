/**
 * What a partner Cast wears on Day's two-person stills (2026-10-14): their active look's kept
 * outfit from Outfit — a kit's name, or a clothing photo's description — and their shoes. Before,
 * only a kit lock was said; a partner dressed from a clothing photo had nothing, so each still
 * dressed them anew.
 */

import { activeLook, type CharacterRecord } from '../character-os';
import { dayGarmentPromptName, dayOutfitPromptName } from './clothed-lead';

export function partnerOutfitWords(
  partner: CharacterRecord | null | undefined,
  kitLabel: (kitId: string) => string
): string | null {
  if (!partner) return null;
  const kept = activeLook(partner)?.keptOutfit;
  const kitId = kept?.wardrobeId?.trim() || partner.lockedWardrobeId?.trim() || '';
  const clothes = kitId
    ? dayOutfitPromptName(kitLabel(kitId)) || null
    : dayGarmentPromptName(kept?.customGarmentDescription) || null;
  if (!clothes) return null;
  const shoes = kept?.footwear?.trim();
  return shoes && !/barefoot/i.test(shoes) ? `${clothes}, with ${shoes}` : clothes;
}
