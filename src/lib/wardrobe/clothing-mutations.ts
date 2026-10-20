/**
 * Catalog-aware wardrobe mutations for gallery / auto-improve.
 */

import { buildClothingPickFilters, hintsFantasyWardrobe } from './clothing-tags';
import { pickRandomCharacterOutfit } from './clothing-catalog';
import { compactClothingScript } from './clothing-quality';
import { parseSettingHint } from '../prompt/hint-location';
import { inferSubjectGenderFromHints } from '../checks/distinct-people';
import type { SubjectGender } from '../variation/seed';
import type { ClothingPickFilters } from './clothing-tags';

export type WardrobeMutationPick = {
  summary: string;
  wardrobeId?: string | null;
  filters: ClothingPickFilters;
};

/**
 * Catalog-aware contrasting wardrobe for gallery / auto-improve mutations.
 */
export function resolveCatalogWardrobeMutation(input: {
  prompt: string;
  hints?: string;
  gender?: SubjectGender;
  recentClothing?: readonly string[];
  avoidedTokens?: readonly string[];
}): WardrobeMutationPick | null {
  const corpus = [input.hints, input.prompt].filter(Boolean).join(' ').trim();
  if (!corpus) {
    return null;
  }

  const location = parseSettingHint(corpus).location;
  const gender = input.gender ?? inferSubjectGenderFromHints(corpus) ?? undefined;

  const filters = buildClothingPickFilters({
    gender: gender === 'women' || gender === 'men' ? gender : undefined,
    sceneLocation: location,
    environmentSeed: corpus,
    hints: corpus,
    excludeIds: input.recentClothing,
    fantasyWardrobe: hintsFantasyWardrobe(corpus),
    avoidedTokens: input.avoidedTokens,
  });

  const outfit = pickRandomCharacterOutfit(filters);
  if (!outfit.summary.trim()) {
    return null;
  }

  return {
    summary: outfit.summary,
    wardrobeId: outfit.wardrobeId,
    filters: outfit.filters,
  };
}

/**
 * Build the wardrobe mutation clause using a catalog outfit when available.
 */
export function buildCatalogAwareWardrobeMutationClause(
  prompt: string,
  explicitValue?: string,
  options?: {
    hints?: string;
    recentClothing?: readonly string[];
  }
): { clause: string; summary?: string; wardrobeId?: string | null } {
  const explicit = explicitValue?.trim();
  if (explicit) {
    return {
      clause: `Change outfit to ${compactClothingScript(explicit)} while keeping pose and scene.`,
      summary: explicit,
    };
  }

  const picked = resolveCatalogWardrobeMutation({
    prompt,
    hints: options?.hints ?? prompt.slice(0, 400),
    recentClothing: options?.recentClothing,
  });

  if (picked?.summary) {
    return {
      clause: `Change outfit to ${picked.summary} while keeping pose, identity, and scene. Replace prior garments completely — do not layer the new kit over the old wardrobe.`,
      summary: picked.summary,
      wardrobeId: picked.wardrobeId,
    };
  }

  return {
    clause:
      'Refresh wardrobe with a contrasting but scene-appropriate outfit while keeping pose and identity. Replace prior garments completely.',
  };
}
