/**
 * Distinguishing marks a Cast keeps from still to still: a tattoo, a scar, a mole, freckles,
 * glasses, a piercing (2026-10-14). Nothing held them before — the plate route even strips
 * appearance words like freckles on Rapid (roleplay.ts), and the clean-skin lock asked for
 * "clean unmarked skin with no tattoos" on every still — so a mark came and went.
 *
 * A mark goes into a Day still's words only when that part of her shows: arm marks under long
 * sleeves, leg marks under trousers and torso marks under a top are left out (named, the model
 * paints them through the clothes or pulls the sleeve up).
 */

import {
  getCharacter,
  upsertCharacter,
  type CastMark,
  type CastMarkSpot,
  type CharacterRecord,
} from '../character-os';

export const CAST_MARK_SPOTS: readonly CastMarkSpot[] = [
  'face',
  'neck',
  'left arm',
  'right arm',
  'hands',
  'chest',
  'stomach',
  'back',
  'left leg',
  'right leg',
  'ankle',
];

export type { CastMark, CastMarkSpot };

export const CAST_MARKS_MAX = 6;
export const CAST_MARK_WHAT_MAX = 80;

/** Starting points for the Cast home picker (the player edits the words). */
export const CAST_MARK_PRESETS: Array<{ label: string; what: string; where: CastMarkSpot }> = [
  { label: 'Glasses', what: 'thin round wire-rimmed glasses', where: 'face' },
  {
    label: 'Freckles',
    what: 'a light dusting of freckles across the nose and cheeks',
    where: 'face',
  },
  { label: 'Mole', what: 'a small dark beauty mole', where: 'face' },
  { label: 'Nose piercing', what: 'a small silver nose stud', where: 'face' },
  { label: 'Arm tattoo', what: 'a small fine-line rose tattoo', where: 'left arm' },
  { label: 'Scar', what: 'a thin pale scar', where: 'face' },
];

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function normalizeCastMarks(raw: unknown): CastMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const marks: CastMark[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Partial<CastMark>;
    const what = cleanText(record.what, CAST_MARK_WHAT_MAX);
    const where = CAST_MARK_SPOTS.includes(record.where as CastMarkSpot)
      ? (record.where as CastMarkSpot)
      : null;
    if (!what || !where) continue;
    const detail = cleanText(record.detail, CAST_MARK_WHAT_MAX);
    marks.push({
      id: cleanText(record.id, 40) || `mark-${marks.length + 1}`,
      what,
      where,
      ...(detail ? { detail } : {}),
    });
    if (marks.length >= CAST_MARKS_MAX) break;
  }
  return marks.length ? marks : undefined;
}

export function newCastMarkId(): string {
  return `mark-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function saveCastMarks(castId: string, marks: CastMark[]): CharacterRecord | undefined {
  const character = getCharacter(castId.trim());
  if (!character) return undefined;
  const next = normalizeCastMarks(marks);
  if (next) {
    upsertCharacter({ ...character, marks: next });
  } else {
    // Cleared, not left out: an update without the field keeps the old value (character-os
    // mergeCharacterUpdate spreads the stored record first), so removing the last one did nothing.
    upsertCharacter({ ...character, marks: undefined });
  }
  return getCharacter(character.id);
}

const LONG_SLEEVES_RE =
  /\b(long[- ]sleeved?|sweater|jumper|cardigan|hoodie|sweatshirt|coat|jacket|blazer|parka|trench|turtleneck|fleece|puffer|raincoat|kimono|robe)\b/i;
const GLOVES_RE = /\b(gloves?|mittens?)\b/i;
const LEGS_COVERED_RE =
  /\b(jeans|trousers|pants|slacks|leggings|tights|joggers|sweatpants|overalls|jumpsuit|maxi|ankle[- ]length|floor[- ]length|full[- ]length|wetsuit|snowsuit|ski suit)\b/i;
const ANKLES_COVERED_RE = /\b(boots?|socks|stockings|tights|leggings|trousers|jeans|pants)\b/i;
/** Clothes that bare the torso: a mark on her chest, stomach or back can show. */
const TORSO_BARE_RE =
  /\b(bikini|swimsuit|swimwear|crop[- ]?top|sports bra|bra|bralette|lingerie|underwear|tube top|halter|backless|open[- ]back|low[- ]back|plunging|strapless|topless|nude|naked)\b/i;
const NECK_COVERED_RE = /\b(turtleneck|scarf|high[- ]neck|polo neck|roll[- ]neck|snood)\b/i;

/**
 * Whether a mark on this spot shows in a still, read off what she wears and the beat. The adult
 * moods are undressed: every spot shows. Unknown clothes (no outfit words) show arms, hands,
 * face and neck — Day's everyday outfits are mostly short-sleeved — and hide the rest.
 */
export function castMarkSpotShows(
  where: CastMarkSpot,
  input: { outfit?: string | null; beat?: string | null; undressed?: boolean }
): boolean {
  if (input.undressed) return true;
  const worn = `${input.outfit ?? ''} ${input.beat ?? ''}`;
  switch (where) {
    case 'face':
      return true;
    case 'neck':
      return !NECK_COVERED_RE.test(worn);
    case 'hands':
      return !GLOVES_RE.test(worn);
    case 'left arm':
    case 'right arm':
      return !LONG_SLEEVES_RE.test(worn);
    case 'left leg':
    case 'right leg':
      return Boolean(input.outfit?.trim()) && !LEGS_COVERED_RE.test(worn);
    case 'ankle':
      return Boolean(input.outfit?.trim()) && !ANKLES_COVERED_RE.test(worn);
    case 'chest':
    case 'stomach':
    case 'back':
      return TORSO_BARE_RE.test(worn);
  }
}

/**
 * Ends every marks line; clean-skin.ts reads it. "No other…": with the plate's tattoo and the
 * clean-skin negatives gone, Edit 2511 spread ink to both forearms (live 2026-10-14).
 */
export const CAST_MARKS_LINE_END =
  ' — the same in every picture of her. No other ink or marks on her skin.';

const SPOT_WORDS: Record<CastMarkSpot, string> = {
  face: 'face',
  neck: 'neck',
  'left arm': 'left forearm',
  'right arm': 'right forearm',
  hands: 'hand',
  chest: 'upper chest',
  stomach: 'stomach',
  back: 'back',
  'left leg': 'left thigh',
  'right leg': 'right thigh',
  ankle: 'ankle',
};

/** Worn on her rather than marked on her skin. */
const WORN_RE = /\b(glasses|spectacles|earrings?|stud|piercing|ring|hoop|chain|necklace|watch)\b/i;

/** One mark as a phrase about her: "a small rose tattoo on her left forearm". */
export function castMarkPhrase(mark: CastMark): string {
  const what = mark.what.trim().replace(/[.,;]+$/, '');
  const where = mark.detail?.trim() || `on her ${SPOT_WORDS[mark.where]}`;
  // "freckles across the nose" or "glasses" already say where on the face.
  if (
    mark.where === 'face' &&
    (WORN_RE.test(what) || /\b(across|on|over|above|below|under)\b/.test(what))
  ) {
    return what;
  }
  return `${what} ${where.replace(/^(?!on |in |at |across |along |over |above |below |under |inside |behind )/, 'on ')}`;
}

/**
 * The line a Day still carries for her marks, or '' when none shows. Written for a woman like
 * the rest of Day's text (a man lead's prompt is swapped whole).
 */
export function castMarksLine(
  marks: CastMark[] | undefined,
  input: { outfit?: string | null; beat?: string | null; undressed?: boolean }
): string {
  const shown = (marks ?? []).filter(mark => castMarkSpotShows(mark.where, input));
  if (!shown.length) return '';
  const phrases = shown.map(castMarkPhrase);
  const wears = phrases.filter(phrase => WORN_RE.test(phrase));
  const has = phrases.filter(phrase => !WORN_RE.test(phrase));
  const parts = [
    has.length ? `She has ${joinAnd(has)}` : '',
    wears.length ? `${has.length ? 'and wears' : 'She wears'} ${joinAnd(wears)}` : '',
  ].filter(Boolean);
  return `${parts.join(' ')}${CAST_MARKS_LINE_END}`;
}

/** For a plate render (she stands in a plain base layer): every mark. */
export function castMarksPlateLine(marks: CastMark[] | undefined): string {
  return castMarksLine(marks, { undressed: true });
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/**
 * Each mark for a plate edit: the phrase plus which side of the picture a left or right mark
 * is on (she faces the camera, so her left is the picture's right). "Left forearm" alone put a
 * rose on the wrong arm 1 of 2 (live, Edit 2511, 2026-10-14).
 */
export function castMarkEditPhrases(marks: CastMark[] | undefined): string[] {
  return (marks ?? []).map(mark => {
    const phrase = castMarkPhrase(mark);
    const side = /\bleft\b/i.test(mark.where + ' ' + (mark.detail ?? ''))
      ? 'right'
      : /\bright\b/i.test(mark.where + ' ' + (mark.detail ?? ''))
        ? 'left'
        : null;
    return side
      ? `${phrase} (on the ${side} side of the picture, as she faces the camera)`
      : phrase;
  });
}

/**
 * A try-on's marks line (Outfit): the marks this outfit shows, written for a man lead when the
 * Cast is one (Day's lines are written for a woman).
 */
export function tryOnMarksLine(
  marks: CastMark[] | undefined,
  outfit: string,
  notes?: string | null,
  man = false
): string {
  const line = castMarksLine(marks, { outfit, beat: notes });
  return man
    ? line
        .replace(/\bShe\b/g, 'He')
        .replace(/\bher\b/g, 'his')
        .replace(/\bHer\b/g, 'His')
    : line;
}
