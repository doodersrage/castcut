/**
 * Cast → Bible "Picture this bible": one full-body still of the Cast lead as the Story bible
 * describes them. Identity comes from the Cast's picture (a face crop as Image 1, as Story's
 * clean-rated stills do), the body from the Appearance description, and what they wear and carry
 * from the bible's look — which never feeds the physical description itself.
 *
 * Short on purpose: the Rapid AIO models follow the opening lines and drop details from long
 * briefs, so identity, body and outfit come first and each is one line.
 */
import { sanitizeCharacterAppearanceDescriptor } from './character-appearance';

/** The last bible picture, kept on the Cast record so it shows again on a revisit. */
export type CastBiblePicture = {
  imageUrl: string;
  promptId?: string;
  at: number;
  /** "Gender swap": the same picture with the lead as the other gender (a new picture drops it). */
  swapped?: CastBiblePictureSwap;
};

export type CastBiblePictureSwap = {
  imageUrl: string;
  promptId?: string;
  at: number;
  /** Who the swapped picture shows. */
  as: 'woman' | 'man';
};

export type CastBiblePictureLead = 'woman' | 'man' | 'person';

const MAX_LOOK_CHARS = 280;
const MAX_SETTING_CHARS = 120;

/** Trim to a sentence (or word) boundary under `max`, without the closing full stop. */
function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) {
    return flat.replace(/[.\s]+$/, '');
  }
  const cut = flat.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  const end = sentence > max / 2 ? sentence : cut.lastIndexOf(' ');
  return (end > 0 ? cut.slice(0, end) : cut).replace(/[,;:.\s]+$/, '');
}

export function buildCastBiblePicturePrompt(input: {
  name: string;
  /** The Cast's physical description (Appearance traits): body, age, hair. */
  descriptor?: string | null;
  /** The bible's look: clothes, props, flavour. */
  bibleLook?: string | null;
  /** Story setting — the backdrop when set, else a plain studio one. */
  setting?: string | null;
  /** Adult rating: the look is used as written. Below it she is kept fully dressed. */
  adult: boolean;
  lead?: CastBiblePictureLead;
}): string {
  const name = input.name.trim() || 'the Cast lead';
  const noun = input.lead ?? 'person';
  const body = input.descriptor?.trim()
    ? clip(sanitizeCharacterAppearanceDescriptor(input.descriptor), MAX_LOOK_CHARS)
    : '';
  const look = input.bibleLook?.trim() ? clip(input.bibleLook, MAX_LOOK_CHARS) : '';
  const setting = input.setting?.trim() ? clip(input.setting, MAX_SETTING_CHARS) : '';
  // The description names the hair when Appearance picked one; it wins over the photo's.
  const keep = /\bhair\b/i.test(body) ? 'same face and skin tone' : 'same face, hair and skin tone';
  return [
    `Full-body photo of ${name}, the same ${noun} as in Image 1 — ${keep}.`,
    body ? `BODY: ${body}.` : null,
    look
      ? input.adult
        ? `OUTFIT (mandatory): ${look}.`
        : `OUTFIT (mandatory, fully dressed): ${look}.`
      : null,
    input.adult ? null : 'Fully clothed — no underwear or lingerie showing.',
    'Standing naturally, relaxed, facing the camera, head to toe in frame, feet visible. One person only.',
    setting ? `Background: ${setting}.` : 'Plain light studio backdrop, soft even light.',
    'Photoreal.',
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildCastBiblePictureNegative(adult: boolean): string {
  return [
    'different person, different face, extra people, crowd, cropped feet, cropped head',
    adult ? null : 'nude, topless, bare breasts, nipples, genitals, underwear only, lingerie, bra',
    'cartoon, anime, illustration, 3D render, text, watermark, blurry',
  ]
    .filter(Boolean)
    .join(', ');
}

/** Keep a stored bible picture only when it still names an image. */
export function normalizeCastBiblePicture(value: unknown): CastBiblePicture | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const entry = value as Partial<CastBiblePicture>;
  const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl.trim() : '';
  if (!imageUrl) {
    return undefined;
  }
  const promptId = typeof entry.promptId === 'string' ? entry.promptId.trim() : '';
  const at = typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : 0;
  const swapped = normalizeSwap(entry.swapped);
  return { imageUrl, ...(promptId ? { promptId } : {}), at, ...(swapped ? { swapped } : {}) };
}

function normalizeSwap(value: unknown): CastBiblePictureSwap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entry = value as Partial<CastBiblePictureSwap>;
  const imageUrl = typeof entry.imageUrl === 'string' ? entry.imageUrl.trim() : '';
  if (!imageUrl || (entry.as !== 'woman' && entry.as !== 'man')) return undefined;
  const promptId = typeof entry.promptId === 'string' ? entry.promptId.trim() : '';
  const at = typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : 0;
  return { imageUrl, ...(promptId ? { promptId } : {}), at, as: entry.as };
}

/**
 * "Gender swap" on the bible picture: an Edit 2511 edit of the rendered picture itself, so the
 * scene, pose, outfit and camera stay. Live (2026-10-12, two bible pictures × 2 seeds): 4 of 4
 * read as the male version of the same person, office and studio, outfit and props kept; a
 * "male twin" wording came out younger and more androgynous.
 */
export function buildCastBibleGenderSwapPrompt(from: 'woman' | 'man'): string {
  const to = from === 'woman' ? 'man' : 'woman';
  const [her, theirFace] =
    from === 'woman' ? ['her', "a man's face, jaw and build"] : ['his', "a woman's face and build"];
  const hair = from === 'woman' ? "hair cut in a man's style" : "hair grown in a woman's style";
  return [
    `Edit Image 1: turn this ${from} into a ${to} — the ${to === 'man' ? 'male' : 'female'} version of the same person: ${theirFace}, with ${her} eye shape, skin tone and hair colour (${hair}).`,
    `Same pose, same scene, background, light and camera framing; the same outfit colours and style, cut for a ${to}. One person only. Photoreal.`,
  ].join(' ');
}

export function buildCastBibleGenderSwapNegative(from: 'woman' | 'man'): string {
  return [
    from === 'woman' ? 'woman, female, breasts, makeup' : 'man, male, beard, stubble, flat chest',
    'two people, different background, changed camera angle, cartoon, text',
  ].join(', ');
}
