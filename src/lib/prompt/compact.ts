import { isEditInstructionProfile } from '../comfy-models/prompt-profiles';
import type { PromptProfileId } from '../comfy-models/types';
import { stripExpansionPadding } from './cleanup';
import {
  isExpansionBeatSentence,
  joinTags,
  profileUsesTagFormat,
  splitSentences,
  splitTags,
} from './shape';

/** Tag soup tokens image parsers rarely use; safe to drop on SD1.x-style lists. */
const TAG_NOISE = new Set([
  'fine detail',
  'high detail',
  'best quality',
  'masterpiece',
  '8k',
  '8k uhd',
  'ultra detailed',
  'professional photo',
  'stock photo',
  'trending on artstation',
  'absurdres',
  'highres',
]);

/**
 * Expansion-beat / atmosphere clones that consume tokens without scene-specific
 * detail. Fabric, fit, and garment construction phrases are intentionally kept.
 */
const PROSE_NOISE_PHRASES: RegExp[] = [
  /\brendered with (?:readable )?material weight(?:, fine detail, and natural placement(?: on the body)?)?/gi,
  /\b(?:fine|subtle) detail(?:ing)?(?: and natural placement(?: on the body)?)?/gi,
  /\bnatural placement(?: on the (?:body|head|feet))?/gi,
  /\b(?:readable|believable) (?:material )?weight(?: on the (?:foot|body|feet))?/gi,
  /\bunder the same light\b/gi,
  /\b(?:in )?clear spatial layers(?: under the same light)?/gi,
  /\batmospheric haze softening the (?:far )?background\b/gi,
  /\bsoft atmospheric depth\b/gi,
  /\batmospheric perspective\b/gi,
  /\b(?:an )?(?:environmental|supporting) beat(?: that ties both figures to the same moment)?/gi,
  /\bmaterial weight grounds the image\b/gi,
  /\bthe composition holds at a natural eye level(?: with moderate depth of field)?/gi,
  /\bsurface color and texture stay consistent(?: across the frame with readable depth)?/gi,
  /\blighting stays even enough to preserve shape(?:, material, and any visible text in the scene)?/gi,
  /\b(?:the )?empty background adds depth under the same light\b/gi,
  /\ba single background detail in [^,.]+ adds depth under the same light\b/gi,
  /\bforeground and background elements read in clear spatial layers under the same light\b/gi,
  /\bdirectional light sculpts one face\b/gi,
  /\bsurface textures read clearly(?: in the directional light)?(?: on the sole subject)?/gi,
  /\bthe environment recedes through soft atmospheric depth without introducing[^.]*\.?/gi,
  /\bwith no other people visible anywhere\b/gi,
  /\bno other people visible(?: anywhere)?\b/gi,
  /\b(?:solo subject only|solo subject),?\s*no other people anywhere\b/gi,
  /\b(?:in|with) one cohesive scene(?: with readable lighting)?/gi,
  /\b(?:in|under) one unified scene(?: with readable lighting)?/gi,
  /\bunder clear directional light(?: in a unified scene)?/gi,
];

/** Hedge words that rarely change the rendered image (keep emphasis like "very" / "noticeably"). */
const WEAK_FILLER_WORDS =
  /\b(?:somewhat|rather|quite|fairly|decidedly|just|simply|actually|basically|literally|genuinely|truly)\s+/gi;

/** Same meaning, fewer characters — grammar-safe replacements only. */
const PHRASE_SHORTENINGS: Array<[RegExp, string]> = [
  [/\bon the left side of the frame\b/gi, 'on the left'],
  [/\bon the right side of the frame\b/gi, 'on the right'],
  [/\bto the left side of the frame\b/gi, 'to the left'],
  [/\bto the right side of the frame\b/gi, 'to the right'],
  [/\bleft side of the frame\b/gi, 'left side'],
  [/\bright side of the frame\b/gi, 'right side'],
  [/\billuminated by\b/gi, 'lit by'],
  [/\bstanding in front of\b/gi, 'standing before'],
  [/\bsitting in front of\b/gi, 'sitting before'],
];

const DISTINCT_CLAUSE =
  /\b(?:necklace|pendant|earring|tattoo|bracelet|ring|looking|gazing|smiling|facing|holding|wearing)\b/i;

function clauseOverlapRatio(clause: string, priorText: string): number {
  const words = clause.toLowerCase().match(/\b[a-z]{4,}\b/g) ?? [];
  if (words.length === 0) {
    return 0;
  }

  const priorLower = priorText.toLowerCase();
  return words.filter(word => priorLower.includes(word)).length / words.length;
}

function dedupeClausesInSentence(sentence: string, priorText = ''): string {
  const parts = sentence
    .split(/,\s+(?=[A-Za-z("'"])/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return sentence;
  }

  let context = priorText.trim();
  const kept: string[] = [];

  for (const part of parts) {
    const clause = part.replace(/[.!?]+$/, '').trim();
    if (!clause) {
      continue;
    }

    const overlap = context ? clauseOverlapRatio(clause, context) : 0;
    if (overlap >= 0.58 && !DISTINCT_CLAUSE.test(clause)) {
      continue;
    }

    kept.push(part);
    context = context ? `${context}, ${clause}` : clause;
  }

  if (kept.length === 0) {
    return sentence;
  }

  return kept.join(', ');
}

function dedupeRedundantClauses(text: string): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return text;
  }

  let prior = '';
  const kept: string[] = [];

  for (const sentence of sentences) {
    const cleaned = dedupeClausesInSentence(sentence, prior);
    if (!cleaned.trim()) {
      continue;
    }

    kept.push(cleaned);
    prior = `${prior} ${cleaned}`.trim();
  }

  return kept.join(' ');
}

function shortenEquivalentPhrases(text: string): string {
  let result = text;
  for (const [pattern, replacement] of PHRASE_SHORTENINGS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function dedupeNearDuplicateTags(tags: string[]): string[] {
  const normalized = tags.map(tag => tag.replace(/\s+/g, ' ').trim()).filter(Boolean);

  const kept: string[] = [];

  for (const tag of normalized) {
    const lower = tag.toLowerCase();
    const subsumed = kept.some(existing => {
      const existingLower = existing.toLowerCase();
      return existingLower.includes(lower) && existingLower.length >= lower.length + 4;
    });

    if (subsumed) {
      continue;
    }

    const withoutShorter = kept.filter(existing => {
      const existingLower = existing.toLowerCase();
      return !(lower.includes(existingLower) && lower.length >= existingLower.length + 4);
    });

    withoutShorter.push(tag);
    kept.length = 0;
    kept.push(...withoutShorter);
  }

  return kept;
}

function polishCompactProse(text: string): string {
  return text
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ', ')
    .replace(/,\s+(?=[.!?]|$)/g, '')
    .replace(/\(\s*\)/g, '')
    .replace(/\bwith\s+,/gi, ',')
    .replace(/\b,\s*and\s*,/gi, ', ')
    .replace(/,\s*\./g, '.')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactPromptProse(text: string): string {
  let cleaned = stripExpansionPadding(text.trim());
  if (!cleaned) {
    return cleaned;
  }

  cleaned = splitSentences(cleaned)
    .filter(sentence => !isExpansionBeatSentence(sentence))
    .join(' ');

  for (const pattern of PROSE_NOISE_PHRASES) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(WEAK_FILLER_WORDS, '');
  cleaned = shortenEquivalentPhrases(cleaned);
  cleaned = dedupeRedundantClauses(cleaned);
  return polishCompactProse(cleaned);
}

export function compactPromptTags(text: string): string {
  const tags = dedupeNearDuplicateTags(
    splitTags(text).filter(tag => !TAG_NOISE.has(tag.toLowerCase().trim()))
  );
  if (tags.length === 0) {
    return text.trim();
  }
  return joinTags(tags);
}

export function compactPromptForProfile(text: string, profile: PromptProfileId): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (isEditInstructionProfile(profile) || profile === 'instruct_pix2pix') {
    return trimmed;
  }

  if (profileUsesTagFormat(profile)) {
    return compactPromptTags(trimmed);
  }

  return compactPromptProse(trimmed);
}
