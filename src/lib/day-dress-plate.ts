/**
 * Day "dress plate": dress the Cast once — the picked clothing and shoes on the look plate, on
 * white — then start every clothed still from that plate instead of dressing her again in each
 * still from a clothing image.
 *
 * Live on Edit 2511 Lightning (2026-10-02, Vacation, lace dress photo + white sneaker kit, one
 * seed): from the dressed plate 8/8 one-person stills wore the exact dress and the sneakers with
 * the pose held; with a Cast partner (whose face takes the clothing image's slot) the lead wore
 * the exact dress 4/4, where the dress described in words came out as a bustier and skirt 3/4.
 * One extra render (about a minute) per outfit-and-shoes combination, then reused.
 */

import { buildFittingOutfitPrompt } from '@/lib/fitting-room';
import { isDayAdultMood, normalizeDayMood } from '@/lib/day-planner';
import { poseProfileForModel } from '@/lib/pose/pose-model-profile';

export {
  DAY_DRESS_PLATE_CACHE_LIMIT,
  findDayDressPlate,
  forgetDayDressPlate,
  rememberDayDressPlate,
  type DayDressPlateEntry,
} from '@/lib/dress-plate-cache';

/**
 * Whether this still starts from a dress plate. Not for the adult moods (Intimate / Raunchy),
 * Sport (the sport's own kit replaces the outfit), a still that drops the clothing, an Outfit
 * Keep (already a dressed plate), or when neither clothing nor shoes were picked.
 */
export function dayDressPlateApplies(input: {
  model: string | null | undefined;
  dayMood: string | null | undefined;
  plateSource?: 'keeper' | 'cast' | null;
  /** A clothing photo or a kit the player picked (not one the Day picked for itself). */
  clothingPicked: boolean;
  /** Shoes picked (a kit, a photo or words) and not barefoot-by-default "auto". */
  footwearPicked: boolean;
  /** The still drops the garment (nude beat) or replaces the outfit (Sport). */
  omitGarment?: boolean;
  replaceOutfit?: boolean;
}): boolean {
  if (!poseProfileForModel(input.model).dressPlate) return false;
  const mood = normalizeDayMood(input.dayMood);
  if (isDayAdultMood(mood) || mood === 'sport') return false;
  if (input.omitGarment || input.replaceOutfit) return false;
  if (input.plateSource !== 'cast') return false;
  return input.clothingPicked || input.footwearPicked;
}

/**
 * Story's version of the rule: clothed (not an adult-rated) photo stories with a plate and
 * clothing or shoes picked, on an engine with a dress plate, for a beat that keeps its clothes.
 */
export function storyDressPlateApplies(input: {
  model: string | null | undefined;
  adult: boolean;
  photoMode: boolean;
  hasPlate: boolean;
  clothingPicked: boolean;
  footwearPicked: boolean;
  omitGarment?: boolean;
}): boolean {
  if (!poseProfileForModel(input.model).dressPlate) return false;
  if (input.adult || !input.photoMode || !input.hasPlate || input.omitGarment) return false;
  return input.clothingPicked || input.footwearPicked;
}

/** The outfit line for a still that starts from a dressed plate (Story; Day's recipes say it). */
export const DRESS_PLATE_OUTFIT_LINE =
  'OUTFIT (mandatory): she wears exactly the outfit and the shoes she has on in Image 1 — unchanged, fully dressed.';

/**
 * A Story still's prompt, reworded for a dressed plate. The scene writer's fallback says
 * "replace the reference clothing with the beat outfit" and, with no clothing image, the pose
 * map is the second image, not the third — live, the first still from a dressed plate came out
 * in a sequin dress until both were fixed (and the edit opener stopped saying the wardrobe may
 * change: queue these with the balanced edit strength).
 */
export function storyDressPlatePrompt(prompt: string): string {
  const reworded = prompt
    .replace(
      /replace the reference clothing with the beat outfit,?\s*/gi,
      'keep the exact outfit and shoes she wears in the reference photo, '
    )
    .replace(
      /\bdiscard Image 1 (?:clothes|clothing|wardrobe|outfit)\b/gi,
      'keep the Image 1 outfit'
    )
    // No clothing image rides along: a sentence that calls Image 2 the clothing would point at
    // the pose map.
    .replace(
      /[^.\n]*\bImage 2\b[^.\n]*\b(?:packshot|clothing|garment|outfit)\b[^.\n]*\.?[ \t]*/gi,
      ''
    );
  return reworded.replace(/\bImage 3\b/g, 'Image 2');
}

/**
 * A stored still prompt without its outfit / footwear lead lines. A retry re-adds the lines
 * that are true now: the stored ones went stale when the shoes changed, the dressed plate stopped
 * applying, or simply piled up (each retry prepended another).
 */
export function stripOutfitLeadLines(prompt: string): string {
  return prompt
    .split('\n')
    .filter(line => !/^\s*(?:OUTFIT|FOOTWEAR) \(mandatory\):/.test(line))
    .join('\n')
    .replace(
      /(?:OUTFIT|FOOTWEAR) \(mandatory\):[^\n]*?(?:unchanged, fully dressed\.|on both feet\.|no socks\.)\s*/g,
      ''
    );
}

/** One key per plate + clothing + shoes + engine family: any change makes a new dress plate. */
export function dayDressPlateKey(input: {
  plate: string;
  clothing: string;
  footwear: string;
  model: string | null | undefined;
}): string {
  return [
    poseProfileForModel(input.model).family,
    input.plate.trim(),
    input.clothing.trim(),
    input.footwear.trim(),
  ].join('|');
}

/** What identifies a dress plate: the fields of a plate request the key is made from. */
export type DayDressPlateKeyInput = {
  model: string;
  /** The undressed Cast plate. */
  plate: { filename?: string; imageUrl?: string };
  /** Clothing image (your photo or a kit packshot), when there is one. */
  clothing?: { imageUrl?: string; imageFilename?: string } | null;
  /**
   * What identifies the clothing across tools: `kit:<id>` for a catalog kit (Day resolves a
   * packshot URL, Story and Outfit an id), else the photo's filename.
   */
  clothingKey?: string;
  /** What the clothing is called: the photo's description or the kit's label. */
  clothingLabel: string;
  /** Vision description of a clothing photo (edited by the player, it re-words the try-on). */
  clothingDescription?: string;
  /** Picked shoes in words ('' = none picked). */
  footwear: string;
  footwearImage?: { imageUrl?: string | null; imageFilename?: string | null };
};

/**
 * The store key of a dress-plate request. A clothing photo's description is part of it (the
 * try-on is worded from it, so an edited description is a different plate); a kit's is not.
 */
export function dayDressPlateRequestKey(request: DayDressPlateKeyInput): string {
  const description = request.clothingKey?.trim()
    ? ''
    : (request.clothingDescription ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const clothing =
    request.clothingKey?.trim() ||
    request.clothing?.imageFilename?.trim() ||
    request.clothing?.imageUrl?.trim() ||
    request.clothingLabel;
  return dayDressPlateKey({
    model: request.model,
    // The same Cast plate reaches the tools as a filename or a view URL of that filename.
    plate: dressPlateIdentity(request.plate),
    clothing: description ? `${clothing}~${textHash(description)}` : clothing,
    footwear: [
      request.footwear,
      request.footwearImage?.imageFilename?.trim() || request.footwearImage?.imageUrl?.trim() || '',
    ].join('#'),
  });
}

function dressPlateIdentity(plate: { filename?: string; imageUrl?: string }): string {
  const filename = plate.filename?.trim();
  if (filename) return filename.split('/').pop() ?? filename;
  const url = plate.imageUrl?.trim() ?? '';
  try {
    const fromQuery = new URL(url, 'http://local').searchParams.get('filename')?.trim();
    if (fromQuery) return fromQuery;
  } catch {
    /* not a URL */
  }
  return url;
}

/** Short, stable FNV-1a hash (keys stay short; a description can run to a paragraph). */
function textHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export type DayDressPlateChange = 'outfit' | 'shoes' | 'outfit and shoes';

/**
 * Why a new plate is being dressed: the newest stored plate for the same Cast plate and engine
 * was dressed in other clothing and/or shoes. Null when this Cast plate has no plate yet.
 */
export function dayDressPlateChange(
  entries: readonly { key: string; at: number }[],
  key: string
): DayDressPlateChange | null {
  const parts = splitDressPlateKey(key);
  if (!parts) return null;
  let previous: { clothing: string; footwear: string; at: number } | null = null;
  for (const entry of entries) {
    if (entry.key === key) continue;
    const other = splitDressPlateKey(entry.key);
    if (!other || other.family !== parts.family || other.plate !== parts.plate) continue;
    if (!previous || entry.at > previous.at) previous = { ...other, at: entry.at };
  }
  if (!previous) return null;
  const outfit = previous.clothing !== parts.clothing;
  const shoes = previous.footwear !== parts.footwear;
  return outfit && shoes ? 'outfit and shoes' : outfit ? 'outfit' : shoes ? 'shoes' : null;
}

function splitDressPlateKey(
  key: string
): { family: string; plate: string; clothing: string; footwear: string } | null {
  const first = key.indexOf('|');
  const second = first < 0 ? -1 : key.indexOf('|', first + 1);
  const last = key.lastIndexOf('|');
  if (first < 0 || second < 0 || last <= second) return null;
  return {
    family: key.slice(0, first),
    plate: key.slice(first + 1, second),
    clothing: key.slice(second + 1, last),
    footwear: key.slice(last + 1),
  };
}

/**
 * The try-on that makes the dress plate: Outfit's own try-on brief, full body with both feet in
 * frame (a three-quarter crop would lose the shoes) in the plate's plain standing pose.
 */
export function buildDayDressPlatePrompt(input: {
  outfitLabel: string;
  characterName?: string;
  hasGarmentReference: boolean;
  garmentDescription?: string;
  footwearLine?: string;
  footwearImage?: 'combined' | 'alone' | null;
}): string {
  return buildFittingOutfitPrompt({ ...input, isolated: true }).replace(
    /^output: single full-body (?:or three-quarter )?fashion still of the same person in the new kit.*$/m,
    'output: single full-body still of the same person in the new kit — head to feet in frame, both feet and shoes visible, the same relaxed standing pose facing the camera'
  );
}

/** What the status line and the tray notice say while the plate renders. */
export function dayDressPlateStatus(input: {
  name?: string | null;
  clothing: boolean;
  footwear: boolean;
  /** What changed since the last plate for this Cast plate (dayDressPlateChange). */
  change?: DayDressPlateChange | null;
}): string {
  const who = input.name?.trim() || 'the lead';
  const what =
    input.clothing && input.footwear
      ? 'the outfit and shoes'
      : input.clothing
        ? 'the outfit'
        : 'the shoes';
  if (input.change) {
    const changed = input.change.charAt(0).toUpperCase() + input.change.slice(1);
    return `${changed} changed — dressing ${who} again: one plate with ${what} (about a minute), then the stills start from it.`;
  }
  return `Dressing ${who} first — one plate with ${what} (about a minute), then the stills start from it.`;
}
