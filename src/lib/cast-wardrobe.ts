/**
 * What a Cast has worn (2026-10-14): each outfit a Day still was queued in — a kit or a clothing
 * photo, with the shoes — newest first, with a still to show it by. "Wear again" puts one back
 * as the look's outfit (setLookKeptOutfit → Outfit, Day and Story follow, as a look switch does).
 * Before this, an outfit from last week was only findable by scrolling the Gallery.
 */

import {
  activeLook,
  getCharacter,
  setLookKeptOutfit,
  upsertCharacter,
  type CastWornOutfit,
  type CharacterLookOutfit,
  type CharacterRecord,
} from './character-os';

export type { CastWornOutfit };

export const CAST_WARDROBE_MAX = 24;
/** A Day queues several stills in a row in one outfit: one record per half hour. */
const WORN_REFRESH_MS = 30 * 60 * 1000;

export function wornOutfitKey(outfit: CharacterLookOutfit): string {
  return (
    outfit.wardrobeId?.trim() ||
    outfit.customGarmentImageFilename?.trim() ||
    outfit.customGarmentImageUrl?.trim() ||
    ''
  );
}

export function normalizeCastWardrobe(raw: unknown): CastWornOutfit[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw
    .filter(
      (item): item is CastWornOutfit =>
        Boolean(item) &&
        typeof item.key === 'string' &&
        item.key.trim() !== '' &&
        typeof item.lastAt === 'number' &&
        Boolean(item.outfit)
    )
    .map(item => ({
      ...item,
      label: typeof item.label === 'string' ? item.label : item.key,
      count: typeof item.count === 'number' ? item.count : 1,
      firstAt: typeof item.firstAt === 'number' ? item.firstAt : item.lastAt,
      promptIds: Array.isArray(item.promptIds)
        ? item.promptIds.filter(id => typeof id === 'string').slice(0, 3)
        : [],
    }))
    .sort((a, b) => b.lastAt - a.lastAt);
  const seen = new Set<string>();
  const unique = list.filter(item => !seen.has(item.key) && Boolean(seen.add(item.key)));
  return unique.length ? unique.slice(0, CAST_WARDROBE_MAX) : undefined;
}

/**
 * The wardrobe after a still was queued in `outfit`, or null when nothing changes (the same
 * outfit within the half hour). Pure.
 */
export function withWornOutfit(
  wardrobe: CastWornOutfit[] | undefined,
  input: { outfit: CharacterLookOutfit; label: string; promptId?: string; now: number }
): CastWornOutfit[] | null {
  const key = wornOutfitKey(input.outfit);
  if (!key) return null;
  const list = normalizeCastWardrobe(wardrobe) ?? [];
  const existing = list.find(item => item.key === key);
  if (existing && input.now - existing.lastAt < WORN_REFRESH_MS) return null;
  const promptId = input.promptId?.trim();
  const next: CastWornOutfit = existing
    ? {
        ...existing,
        label: input.label || existing.label,
        outfit: input.outfit,
        lastAt: input.now,
        count: existing.count + 1,
        promptIds: promptId
          ? [promptId, ...existing.promptIds.filter(id => id !== promptId)].slice(0, 3)
          : existing.promptIds,
      }
    : {
        key,
        label: input.label || key,
        outfit: input.outfit,
        firstAt: input.now,
        lastAt: input.now,
        count: 1,
        promptIds: promptId ? [promptId] : [],
      };
  return [next, ...list.filter(item => item.key !== key)].slice(0, CAST_WARDROBE_MAX);
}

/** Day queued a still of this Cast in this outfit. */
export function recordCastOutfitWorn(
  castId: string | null | undefined,
  input: { outfit: CharacterLookOutfit; label: string; promptId?: string }
): void {
  const character = getCharacter(castId?.trim() || '');
  if (!character) return;
  const next = withWornOutfit(character.wardrobe, { ...input, now: Date.now() });
  if (next) upsertCharacter({ ...character, wardrobe: next });
}

/** Put a worn outfit back as the active look's outfit. Returns the Cast and the outfit it replaced. */
export function wearOutfitAgain(
  castId: string,
  key: string
): { character: CharacterRecord; previous?: CharacterLookOutfit } | undefined {
  const character = getCharacter(castId);
  const worn = normalizeCastWardrobe(character?.wardrobe)?.find(item => item.key === key);
  if (!character || !worn) return undefined;
  const look = activeLook(character);
  // A Gallery entry id ties the kept outfit to one try-on; a worn outfit is the outfit itself.
  const { entryId: _entry, dressPlateKey: _plate, ...outfit } = worn.outfit;
  void _entry;
  void _plate;
  const next = setLookKeptOutfit(castId, look.id, { outfit });
  return next ? { character: next, previous: look.keptOutfit } : undefined;
}
