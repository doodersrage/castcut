/**
 * Day duo stills: who plays the second person. A Cast member — their face crop rides in as
 * Image 2 (the garment packshot's slot; the lead's outfit is then said in words) and the pose map
 * stays Image 3 — or an invented man / woman with their own face (no extra image).
 *
 * Adult duo stills: a woman lead with a man works on every engine. Two women, two men and a man
 * lead need Rapid AIO (its duo recipe has those layouts); clothed duo beats take anyone.
 */

import { inferSubjectGenderFromHints } from '@/lib/distinct-people';

export type DayPartnerNoun = 'man' | 'woman' | 'person';

export type DayPartner = {
  name: string;
  noun: DayPartnerNoun;
  descriptor?: string;
  /** No Cast face — a new man / woman each still. */
  invented?: boolean;
};

/** Partner setting values for an invented partner (next to Cast ids). */
export const DAY_NEW_PARTNER_OPTIONS = [
  { id: 'new:woman', label: 'A woman (same face all day)', noun: 'woman' },
  { id: 'new:man', label: 'A man (same face all day)', noun: 'man' },
] as const;

export function dayPartnerNoun(input: {
  descriptor?: string | null;
  hints?: string | null;
}): DayPartnerNoun {
  const text = [input.descriptor, input.hints].filter(Boolean).join(' ');
  const gender = inferSubjectGenderFromHints(text);
  if (gender === 'men') return 'man';
  if (gender === 'women') return 'woman';
  if (/\b(?:man|male|guy|boy|gentleman|he|him|his)\b/i.test(text)) return 'man';
  if (/\b(?:woman|female|girl|lady|she|her)\b/i.test(text)) return 'woman';
  return 'person';
}

export function toDayPartner(
  character: { name?: string; descriptor?: string; hints?: string } | null | undefined
): DayPartner | null {
  if (!character?.name?.trim()) {
    return null;
  }
  const descriptor = (character.descriptor || character.hints || '').trim();
  return {
    name: character.name.trim(),
    noun: dayPartnerNoun(character),
    ...(descriptor ? { descriptor: descriptor.slice(0, 220) } : {}),
  };
}

/** An invented partner from a `new:man` / `new:woman` setting, else null. */
export function inventedDayPartner(id: string | null | undefined): DayPartner | null {
  const option = DAY_NEW_PARTNER_OPTIONS.find(entry => entry.id === id?.trim());
  return option ? { name: '', noun: option.noun, invented: true } : null;
}

/** Whether a slot's second person is the chosen partner (two-person still, fitting layout). */
export function dayPartnerApplies(input: {
  partner: DayPartner | null | undefined;
  headcount: number;
  adultMood: boolean;
  /** The Cast lead (default a woman — Day's prompts are written for one). */
  lead?: DayPartnerNoun;
  /** Rapid AIO's duo recipe has two-women, two-men and man-lead layouts. */
  sameSexLayouts?: boolean;
}): boolean {
  const { partner } = input;
  if (!partner || input.headcount !== 2) {
    return false;
  }
  if (!input.adultMood) {
    return true;
  }
  if (partner.noun === 'person') {
    return false;
  }
  const lead = input.lead === 'man' ? 'man' : 'woman';
  if (lead === 'woman' && partner.noun === 'man') {
    return true;
  }
  return input.sameSexLayouts === true;
}

function possessive(noun: DayPartnerNoun): string {
  return noun === 'man' ? 'his' : noun === 'woman' ? 'her' : 'their';
}

/** One line naming the partner for the long Day brief (Image 2 = partner face). */
export function dayPartnerBriefLine(partner: DayPartner): string {
  const who = partner.noun === 'person' ? 'the second person' : `the ${partner.noun}`;
  if (partner.invented) {
    return `SECOND PERSON: ${who} with the Cast lead has ${possessive(partner.noun)} own face — different from the Cast lead; two different faces.`;
  }
  return [
    `SECOND PERSON: Image 2 is the face of ${who} with the Cast lead — give ${who} exactly this face, hair and skin tone`,
    partner.descriptor ? ` (${partner.descriptor})` : '',
    '; the Cast lead keeps the Image 1 face; two different faces, never merge them; ignore Image 2 background and framing.',
  ].join('');
}

/** Recipe sentence: whose face comes from which encoder image. */
export function dayPartnerRecipeLine(
  partner: DayPartner,
  image: string,
  who?: string,
  lead: DayPartnerNoun = 'woman'
): string {
  who ??=
    partner.noun === 'person'
      ? 'the other person'
      : partner.noun === lead
        ? `the other ${partner.noun}`
        : `the ${partner.noun}`;
  const keep = `Keep ${possessive(lead)} face from the first image`;
  if (partner.invented) {
    return `${keep}; ${who} has ${possessive(partner.noun)} own face.`;
  }
  return `${keep}; ${who} has the face from the ${image} image${partner.descriptor ? ` (${partner.descriptor})` : ''}.`;
}

/**
 * With the partner's face in Image 2, drop the few brief phrases that still read Image 2 as the
 * outfit (non-Rapid Suggestive mood line, the generic face-crop fallback) — the outfit is in words.
 */
export function scrubDayPartnerOutfitImageClaims(prompt: string): string {
  return (
    prompt
      .replace(/\bthe Keep\/Image 2 outfit\b/g, 'the day outfit')
      // Vacation couple brief: with the partner's face in the second slot the outfit is in words.
      .replace(/\bkeep the outfit Image 2 or the beat names\b/g, 'keep the outfit the brief names')
      .replace(/;?\s*outfit colors from Image 2 only/g, '')
      .replace(
        /Image 2 white is packshot only — do not use Image 2 or Image 3 white as the scene background\./g,
        'Do not use Image 3 white as the scene background.'
      )
  );
}
