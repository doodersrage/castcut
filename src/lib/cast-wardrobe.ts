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

/**
 * Outfits from Day stills made before the wardrobe was kept (Cast home → Wardrobe → Find earlier
 * outfits). The prompt says what she wore ("OUTFIT (mandatory): she wears …"); the still's second
 * input image is the clothing photo when it is a garment packshot (a dressed plate is a picture of
 * her, not of the clothes, and is left out — that outfit comes back as words). Pure.
 */
export function wardrobeFromGallery(
  entries: ReadonlyArray<{
    characterId?: string;
    tool?: string;
    prompt?: string;
    promptId?: string;
    completedAt?: number;
    queuedAt?: number;
    queueParams?: { inputImageFilenames?: unknown } | null;
  }>,
  castId: string,
  existing?: CastWornOutfit[]
): CastWornOutfit[] | null {
  let list = normalizeCastWardrobe(existing) ?? [];
  const before = JSON.stringify(list);
  const stills = entries
    .filter(entry => entry.characterId === castId && entry.tool === 'image-prompt')
    .sort((a, b) => (a.completedAt ?? a.queuedAt ?? 0) - (b.completedAt ?? b.queuedAt ?? 0));
  for (const entry of stills) {
    const words = /OUTFIT[^:\n]*:\s*(?:she|he) wears ([^\n]+?)(?:\s+—|;|\.\s|$)/i
      .exec(entry.prompt ?? '')?.[1]
      ?.trim();
    // Not the mood's own clothes (Sport's kit for the sport) — only what she was dressed in.
    if (!words || /underwear in Image 1|nothing|naked|nude|\bsportswear\b/i.test(words)) continue;
    const files = Array.isArray(entry.queueParams?.inputImageFilenames)
      ? (entry.queueParams!.inputImageFilenames as unknown[])
      : [];
    const second = typeof files[1] === 'string' ? (files[1] as string).trim() : '';
    const garment = /^fitting-garment-packshot/i.test(second) ? second : '';
    const outfit: CharacterLookOutfit = garment
      ? { customGarmentImageFilename: garment, customGarmentDescription: words }
      : { customGarmentDescription: words };
    const key = garment || `words:${words.toLowerCase().slice(0, 80)}`;
    const at = entry.completedAt ?? entry.queuedAt ?? 0;
    const found = list.find(item => item.key === key);
    const promptId = entry.promptId?.trim();
    const item: CastWornOutfit = found
      ? {
          ...found,
          lastAt: Math.max(found.lastAt, at),
          count: found.count + (at - found.lastAt > 30 * 60 * 1000 ? 1 : 0),
          promptIds: promptId
            ? [promptId, ...found.promptIds.filter(id => id !== promptId)].slice(0, 3)
            : found.promptIds,
        }
      : {
          key,
          label: words.length > 60 ? `${words.slice(0, 57)}…` : words,
          outfit,
          firstAt: at,
          lastAt: at,
          count: 1,
          promptIds: promptId ? [promptId] : [],
        };
    list = [item, ...list.filter(other => other.key !== key)];
  }
  const next = normalizeCastWardrobe(list) ?? [];
  return JSON.stringify(next) === before ? null : next;
}

/** Fill a Cast's wardrobe from its earlier Day stills; returns how many outfits it holds after. */
export function backfillCastWardrobe(
  castId: string,
  entries: Parameters<typeof wardrobeFromGallery>[0]
): number {
  const character = getCharacter(castId);
  if (!character) return 0;
  const next = wardrobeFromGallery(entries, castId, character.wardrobe);
  if (next) upsertCharacter({ ...character, wardrobe: next });
  return (next ?? normalizeCastWardrobe(character.wardrobe) ?? []).length;
}

/** The turn-around clip direction for an outfit (live-tested 2026-10-14). */
export const RUNWAY_CLIP_PROMPT =
  'She turns slowly in place to show the whole outfit: a full turn from the front to the side, her back, the other side and the front again, then stands still facing the camera. Her face, hair and clothes stay exactly the same. The camera stays still, her whole body in frame, head to feet.';

/** A man lead's runway direction. */
export function runwayClipPrompt(man = false): string {
  return man
    ? RUNWAY_CLIP_PROMPT.replace(/\bShe\b/g, 'He')
        .replace(/\bher\b/g, 'his')
        .replace(/\bHer\b/g, 'His')
    : RUNWAY_CLIP_PROMPT;
}

/** Keep an outfit's runway clip (made from `from`, the outfit's picture). */
export function saveOutfitRunway(castId: string, key: string, url: string, from: string) {
  const character = getCharacter(castId);
  const list = normalizeCastWardrobe(character?.wardrobe);
  if (!character || !list?.some(item => item.key === key)) return undefined;
  const next = list.map(item =>
    item.key === key ? { ...item, runwayUrl: url, runwayFor: from } : item
  );
  upsertCharacter({ ...character, wardrobe: next });
  return getCharacter(castId);
}
