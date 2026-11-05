/**
 * How a Cast talks, beyond the voice sample (2026-10-14): words the talking-clip model says wrong,
 * written the way they sound ("Siobhan" → "Shiv-awn"), and a few lines they'd say, offered as
 * one tap beside a clip's line. The sounds-like spelling goes only into the clip prompt; the
 * line shown, saved and captioned keeps the real spelling.
 *
 * Catchphrases are picked, never handed to the line-writing LLM: it built lines around the
 * bible's catchphrase ("Your coffee's too hot" at a beach bar, spoken-line-context.ts).
 */

import {
  getCharacter,
  upsertCharacter,
  type CastPronunciation,
  type CastSpeech,
  type CharacterRecord,
} from '../character/os';

export type { CastPronunciation, CastSpeech };

/**
 * Accents a Cast can speak with: said in their voice auditions ("…in a warm, low voice, with a
 * Scottish accent") and in their Day and Story talking clips. A kept voice from an audition
 * already carries it; the words keep a voice from another source close to it.
 */
export const CAST_ACCENTS = [
  'American',
  'Southern American',
  'New York',
  'Canadian',
  'British',
  'London',
  'Scottish',
  'Irish',
  'Welsh',
  'Australian',
  'New Zealand',
  'South African',
  'Indian',
  'Jamaican',
  'French',
  'Spanish',
  'Mexican',
  'Italian',
  'German',
  'Russian',
  'Brazilian',
] as const;

export function normalizeCastAccent(value: unknown): string | undefined {
  return typeof value === 'string'
    ? CAST_ACCENTS.find(accent => accent.toLowerCase() === value.trim().toLowerCase())
    : undefined;
}

export const CAST_PRONUNCIATIONS_MAX = 12;
export const CAST_CATCHPHRASES_MAX = 6;
const WORD_MAX = 40;
const CATCHPHRASE_MAX = 90;

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function normalizeCastSpeech(raw: unknown): CastSpeech | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const record = raw as CastSpeech;
  const pronunciations: CastPronunciation[] = [];
  for (const item of Array.isArray(record.pronunciations) ? record.pronunciations : []) {
    const word = clean(item?.word, WORD_MAX);
    const sayAs = clean(item?.sayAs, WORD_MAX);
    if (!word || !sayAs || word.toLowerCase() === sayAs.toLowerCase()) continue;
    if (pronunciations.some(other => other.word.toLowerCase() === word.toLowerCase())) continue;
    pronunciations.push({ word, sayAs });
    if (pronunciations.length >= CAST_PRONUNCIATIONS_MAX) break;
  }
  const catchphrases = [
    ...new Set(
      (Array.isArray(record.catchphrases) ? record.catchphrases : [])
        .map(item => clean(item, CATCHPHRASE_MAX).replace(/^["“]|["”]$/g, ''))
        .filter(Boolean)
    ),
  ].slice(0, CAST_CATCHPHRASES_MAX);
  const accent = normalizeCastAccent(record.accent);
  const next: CastSpeech = {
    ...(accent ? { accent } : {}),
    ...(pronunciations.length ? { pronunciations } : {}),
    ...(catchphrases.length ? { catchphrases } : {}),
  };
  return Object.keys(next).length ? next : undefined;
}

export function saveCastSpeech(castId: string, speech: CastSpeech): CharacterRecord | undefined {
  const character = getCharacter(castId.trim());
  if (!character) return undefined;
  const next = normalizeCastSpeech(speech);
  if (next) {
    upsertCharacter({ ...character, speech: next });
  } else {
    // Cleared, not left out: an update without the field keeps the old value (character-os
    // mergeCharacterUpdate spreads the stored record first), so removing the last one did nothing.
    upsertCharacter({ ...character, speech: undefined });
  }
  return getCharacter(character.id);
}

function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The line as the clip model should say it: each listed word swapped for its sounds-like spelling. */
export function pronounceLine(
  line: string,
  pronunciations: ReadonlyArray<CastPronunciation> | undefined
): string {
  let said = line;
  for (const { word, sayAs } of pronunciations ?? []) {
    // Whole words only, any case; a possessive keeps its 's ("Siobhan's" → "Shiv-awn's").
    said = said.replace(
      new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, 'giu'),
      sayAs
    );
  }
  return said;
}

/** The lines a Cast offers beside a clip's line: their own, then the bible's catchphrase. */
export function castCatchphrases(
  character: Pick<CharacterRecord, 'speech' | 'bio'> | null | undefined
): string[] {
  const own = normalizeCastSpeech(character?.speech)?.catchphrases ?? [];
  const bible = clean(character?.bio?.catchphrase, CATCHPHRASE_MAX).replace(/^["“]|["”]$/g, '');
  return [...new Set([...own, ...(bible ? [bible] : [])])];
}

/** A line said by this Cast in a clip prompt (Day / Story talking and conversation clips). */
export function pronounceForCast(line: string, castId: string | null | undefined): string {
  const id = castId?.trim();
  if (!id || !line.trim()) return line;
  return pronounceLine(line, normalizeCastSpeech(getCharacter(id)?.speech)?.pronunciations);
}

/** The Cast's accent, if one is set. */
export function castAccent(castId: string | null | undefined): string | undefined {
  const id = castId?.trim();
  return id ? normalizeCastSpeech(getCharacter(id)?.speech)?.accent : undefined;
}

/**
 * A talking-clip prompt with the Cast's accent said once, after it ("She speaks with a Scottish
 * accent."): a sentence of its own, so the "says …, \"line\"" the H3 dialogue rewrite reads stays
 * as it was. Unchanged without a quoted line or an accent.
 */
export function withAccent(prompt: string, accent: string | undefined, speaker: string): string {
  const named = normalizeCastAccent(accent);
  if (!named || !/"[^"]+"/.test(prompt)) return prompt;
  const article = /^[AEIOU]/.test(named) ? 'an' : 'a';
  return `${prompt.trim()} ${speaker} speaks with ${article} ${named} accent.`;
}
