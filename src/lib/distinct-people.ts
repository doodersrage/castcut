import {
  pickDistinctIdentitySeeds,
  pickDistinctSubjects,
  type SubjectGender,
} from './variation-seed';
import { inferAthleticSport } from './athletic-sport-profiles';
import type { DetailLevel } from './detail-level';
import type { GenerationSettings } from './generation-settings';
import { findDistinctPeopleSentenceIndexes } from './prompt-shape';

export type PeopleConstraint = {
  count: number | null;
  gender: SubjectGender;
};

function parseCount(raw: string): number {
  const wordToNumber: Record<string, number> = {
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
  };
  return wordToNumber[raw] ?? Number.parseInt(raw, 10);
}

const PERSON_NOUNS =
  'men|man|women|woman|people|persons|person|guys|guy|girls|girl|boys|boy|figures|characters|models|friends|strangers|lovers|dancers|soldiers|students|teachers|artists|models';

const COUNT_WORDS = 'two|three|four|five|six|seven|eight|\\d+';

function matchCountAndGender(lower: string): PeopleConstraint | null {
  const numericMatch = lower.match(
    new RegExp(`\\b(${COUNT_WORDS})\\s+(?:\\w+\\s+){0,4}(${PERSON_NOUNS})\\b`, 'i')
  );

  if (numericMatch) {
    const count = parseCount(numericMatch[1]!);
    const gender = nounToGender(numericMatch[2]!);
    if (Number.isFinite(count) && count >= 2) {
      return { count, gender };
    }
  }

  return null;
}

function matchAndPair(lower: string): PeopleConstraint | null {
  const mixedPatterns = [
    /\b(man|men|boy|boys|guy|guys|male)\b.*\band\b.*\b(woman|women|girl|girls|female)\b/,
    /\b(woman|women|girl|girls|female)\b.*\band\b.*\b(man|men|boy|boys|guy|guys|male)\b/,
  ];

  if (mixedPatterns.some(pattern => pattern.test(lower))) {
    return { count: 2, gender: 'mixed' };
  }

  if (/\b(man|men|boy|boys|guy|guys)\b.*\band\b.*\b(man|men|boy|boys|guy|guys)\b/.test(lower)) {
    return { count: 2, gender: 'men' };
  }

  if (/\b(woman|women|girl|girls)\b.*\band\b.*\b(woman|women|girl|girls)\b/.test(lower)) {
    return { count: 2, gender: 'women' };
  }

  return null;
}

function matchExplicitTwo(lower: string): PeopleConstraint | null {
  if (/\b(two|2)\s+(women|woman|girls|girl|female)\b/.test(lower)) {
    return { count: 2, gender: 'women' };
  }

  if (/\b(two|2)\s+(men|man|guys|guy|boys|boy|male)\b/.test(lower)) {
    return { count: 2, gender: 'men' };
  }

  if (/\bboth\s+(women|woman|girls|girl)\b/.test(lower)) {
    return { count: 2, gender: 'women' };
  }

  if (/\bboth\s+(men|man|guys|guy|boys|boy)\b/.test(lower)) {
    return { count: 2, gender: 'men' };
  }

  if (/\b(twins|twin sisters|twin brothers)\b/.test(lower)) {
    if (/\bbrother|male|men\b/.test(lower)) {
      return { count: 2, gender: 'men' };
    }
    if (/\bsister|female|women\b/.test(lower)) {
      return { count: 2, gender: 'women' };
    }
    return { count: 2, gender: 'any' };
  }

  if (/\bsisters\b/.test(lower)) {
    return { count: 2, gender: 'women' };
  }

  if (/\bbrothers\b/.test(lower)) {
    return { count: 2, gender: 'men' };
  }

  return null;
}

function nounToGender(noun: string): SubjectGender {
  if (/^(men|man|guys|guy|boys|boy)$/.test(noun)) {
    return 'men';
  }
  if (/^(women|woman|girls|girl)$/.test(noun)) {
    return 'women';
  }
  return 'any';
}

export function parsePeopleConstraint(input: string): PeopleConstraint {
  const lower = input.toLowerCase();

  return (
    matchCountAndGender(lower) ??
    matchExplicitTwo(lower) ??
    matchAndPair(lower) ??
    matchCouplePhrase(lower, input) ?? { count: null, gender: 'any' }
  );
}

function matchCouplePhrase(lower: string, input: string): PeopleConstraint | null {
  if (/\bduo\b/.test(lower) || /\btwosome\b/.test(lower) || /\bboth of them\b/.test(lower)) {
    return resolveCoupleGender(input);
  }

  if (/\bcouple\b/.test(lower)) {
    if (
      /\bcouple of (?:minutes|hours|days|weeks|months|years|times|soft|hard|quick|brief|seconds)\b/.test(
        lower
      )
    ) {
      return null;
    }
    return resolveCoupleGender(input);
  }

  if (/\bpair\b/.test(lower)) {
    if (
      /\bpair of (?:\w+\s+){0,4}(?:men|women|people|persons|friends|lovers|strangers|students|dancers|models|cyclists|runners|athletes|figures|characters)\b/.test(
        lower
      )
    ) {
      return resolveCoupleGender(input);
    }
    return null;
  }

  return null;
}

function resolveCoupleGender(input: string): PeopleConstraint {
  if (/\b(two men|2 men|gay men|men only)\b/i.test(input)) {
    return { count: 2, gender: 'men' };
  }
  if (/\b(two women|2 women|lesbian|women only)\b/i.test(input)) {
    return { count: 2, gender: 'women' };
  }
  return { count: 2, gender: 'mixed' };
}

export function countImpliedPeople(input: string): number | null {
  return parsePeopleConstraint(input).count;
}

export function impliesMultiplePeople(input: string): boolean {
  return isMultiPersonInput(input);
}

export function isMultiPersonInput(input: string): boolean {
  const lower = input.toLowerCase();

  if (/\b(group|crowd|party of|gathering|audience|mob)\b/.test(lower)) {
    return false;
  }

  return countImpliedPeople(input) !== null;
}

const EXPLICIT_WOMAN_SUBJECT =
  /\b(?:portrait\s+of|headshot\s+of|bust\s+of\s+)?(?:a|the|one)\s+(?:young|old|elderly|middle-aged|teen(?:age)?\s+)?(?:woman|girl|lady|female)\b/i;
const EXPLICIT_MAN_SUBJECT =
  /\b(?:portrait\s+of|headshot\s+of|bust\s+of\s+)?(?:a|the|one)\s+(?:young|old|elderly|middle-aged|teen(?:age)?\s+)?(?:man|boy|guy|male|gentleman)\b/i;

/** Infer a single subject's gender from prompt/seed wording when count rules do not apply. */
export function inferSubjectGenderFromHints(text: string): SubjectGender | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  const constraint = parsePeopleConstraint(trimmed);
  if (constraint.gender === 'women' || constraint.gender === 'men') {
    return constraint.gender;
  }

  if (EXPLICIT_WOMAN_SUBJECT.test(trimmed)) {
    return 'women';
  }

  if (EXPLICIT_MAN_SUBJECT.test(trimmed)) {
    return 'men';
  }

  return undefined;
}

export function hasDistinctPeopleStructure(text: string): boolean {
  const lower = text.toLowerCase();

  if (/\bon the left\b/.test(lower) && /\bon the right\b/.test(lower)) {
    return true;
  }

  if (/\bto the left\b/.test(lower) && /\bto the right\b/.test(lower)) {
    return true;
  }

  if (/\bto the left\b/.test(lower) && /\bto the right\b/.test(lower)) {
    return true;
  }

  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);

  const placementSentences = sentences.filter(sentence =>
    /\b(on the left|on the right|to the left|to the right|left side|right side|in the foreground|in the midground)\b/i.test(
      sentence
    )
  );

  if (placementSentences.length >= 2) {
    return true;
  }

  const { leftIdx, rightIdx } = findDistinctPeopleSentenceIndexes(sentences);
  return leftIdx >= 0 && rightIdx >= 0;
}

export function buildDistinctPeopleUserDirective(input: string): string {
  const constraint = parsePeopleConstraint(input);
  const genderRule = genderMandate(constraint.gender);
  const count = constraint.count ?? 2;

  if (count === 2) {
    return [
      'PEOPLE (mandatory): Two separate individuals—one sentence for the person on the left, then one for the person on the right.',
      'Keep each person sentence compact: distinct face, hair, skin tone, age read, pose, and brief clothing—do not spend the whole prompt on one woman.',
      'The two people must look like clearly different individuals, not two generic models with only different shirt colors.',
      genderRule,
      'Do not merge them into one couple blob or a single shared description.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (count > 2) {
    return [
      `PEOPLE (mandatory): ${count} separate individuals—one short sentence each with distinct face, clothing, and pose.`,
      genderRule,
    ]
      .filter(Boolean)
      .join(' ');
  }

  return [
    'PEOPLE (mandatory): If multiple people appear, one short sentence each—fully separate individuals.',
    genderRule,
  ]
    .filter(Boolean)
    .join(' ');
}

export function ensureDistinctPeoplePrompt(
  prompt: string,
  input: string,
  settings: GenerationSettings
): string {
  if (!settings.distinctPeople || !isMultiPersonInput(input)) {
    return prompt;
  }

  // Keywords-only / no ingredient seeding: never replace the draft with rolled
  // identity seeds ("stocky Mediterranean man…") during optimize.
  if (settings.seedLlmWithIngredients !== true) {
    return prompt;
  }

  if (hasDistinctPeopleStructure(prompt)) {
    return prompt;
  }

  const fallback = paintDistinctPeopleScene(input, settings);
  return fallback ?? prompt;
}

function extractSceneSetting(input: string): string {
  const stripped = input
    .replace(new RegExp(`\\b(${COUNT_WORDS})\\s+(?:\\w+\\s+){0,4}(${PERSON_NOUNS})\\b`, 'gi'), '')
    .replace(
      /\b(man|men|boy|boys|guy|guys|woman|women|girl|girls)\b\s+\band\b\s+\b(man|men|boy|boys|guy|guys|woman|women|girl|girls)\b/gi,
      ''
    )
    .replace(/\b(two|2)\s+(female|male|women|men|woman|man)\b/gi, '')
    .replace(/\b(twins|sisters|brothers|both\s+\w+)\b/gi, '')
    .replace(/\b(couple|pair|duo|twosome)\b/gi, '')
    .replace(/^[,;\s|]+|[,;\s|]+$/g, '')
    .trim();

  return stripped || input.trim();
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function genderMandate(gender: SubjectGender): string {
  if (gender === 'women') {
    return 'Both people MUST be women. Do not introduce men or masculine figures.';
  }
  if (gender === 'men') {
    return 'Both people MUST be men. Do not introduce women or feminine figures.';
  }
  if (gender === 'mixed') {
    return 'The pair must be one man and one woman unless the topic states otherwise.';
  }
  return '';
}

function groupedLabel(constraint: PeopleConstraint): string {
  if (constraint.gender === 'women') {
    return 'Two women';
  }
  if (constraint.gender === 'men') {
    return 'Two men';
  }
  return 'A couple';
}

export function buildDistinctPeopleSystemAddendum(input: string): string {
  const constraint = parsePeopleConstraint(input);
  const genderRule = genderMandate(constraint.gender);

  if (constraint.count === 2 || /\b(couple|pair|duo)\b/i.test(input)) {
    return [
      'Two separate people only: one compact sentence each, left then right.',
      'Each person gets a distinct face, hair, skin tone, age read, pose, and brief clothing in a single sentence—finish both people within the character limit.',
      'Make the two people visually contrasting—not interchangeable generic figures.',
      genderRule,
      'Do not merge them into one couple blob or shared description.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  if (constraint.count !== null && constraint.count > 2) {
    return [
      `${constraint.count} separate people, one short sentence each.`,
      genderRule,
      'No faceless group blob.',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return ['If multiple people appear, one short sentence each.', genderRule]
    .filter(Boolean)
    .join(' ');
}

export function buildGroupedPeopleSystemAddendum(input: string): string {
  const constraint = parsePeopleConstraint(input);
  const genderRule = genderMandate(constraint.gender);
  const label = groupedLabel(constraint);

  return [
    `${label} as one unified subject in a single sentence.`,
    genderRule,
    'No Person A/Person B split and no left/right catalog entries.',
  ]
    .filter(Boolean)
    .join(' ');
}

export function paintDistinctPeopleScene(
  input: string,
  settings: GenerationSettings
): string | null {
  if (settings.seedLlmWithIngredients !== true) {
    return null;
  }

  const constraint = parsePeopleConstraint(input);
  const detail: DetailLevel = settings.detail;
  const setting = extractSceneSetting(input);
  const settingPhrase =
    setting.toLowerCase().startsWith('a ') || setting.toLowerCase().startsWith('an ')
      ? setting
      : setting.charAt(0).toLowerCase() + setting.slice(1);

  if (constraint.count === 2 || /\b(couple|pair|duo)\b/i.test(input)) {
    const gender = constraint.gender === 'mixed' ? 'mixed' : constraint.gender;
    const athletic = inferAthleticSport(input) !== null;
    const [personOne, personTwo] = athletic
      ? pickDistinctIdentitySeeds(2, gender, { athletic: true })
      : pickDistinctSubjects(2, gender);

    if (detail === 'concise') {
      return `${capitalize(settingPhrase)}. On the left, ${personOne}; on the right, ${personTwo}.`;
    }

    if (detail === 'rich') {
      return `${capitalize(settingPhrase)}, warm light falling across the frame. On the left, ${personOne}, posture distinct in the light; on the right, ${personTwo}, clearly separate from the first. The background holds one environmental beat that ties both figures to the same moment.`;
    }

    return `${capitalize(settingPhrase)}. On the left, ${personOne}; on the right, ${personTwo}, each with distinct posture in the same light.`;
  }

  if (constraint.count !== null && constraint.count > 2) {
    const subjects = pickDistinctSubjects(
      Math.min(constraint.count, 4),
      constraint.gender === 'any' ? 'any' : constraint.gender
    );
    const placements = ['in the foreground', 'to the left', 'to the right', 'in the midground'];
    const people = subjects
      .map(
        (subject, index) =>
          `${capitalize(placements[index] ?? 'nearby')}, ${subject}, with distinct face, clothing, and posture`
      )
      .join('. ');

    return `${capitalize(settingPhrase)}. ${people}.`;
  }

  return null;
}

export function paintGroupedPeopleScene(
  input: string,
  settings: GenerationSettings
): string | null {
  const constraint = parsePeopleConstraint(input);
  if (constraint.count !== 2 && !/\b(couple|pair|duo)\b/i.test(input)) {
    return null;
  }

  const detail: DetailLevel = settings.detail;
  const setting = extractSceneSetting(input);
  const settingPhrase =
    setting.toLowerCase().startsWith('a ') || setting.toLowerCase().startsWith('an ')
      ? setting
      : setting.charAt(0).toLowerCase() + setting.slice(1);
  const label = groupedLabel(constraint);

  if (detail === 'concise') {
    return `${capitalize(settingPhrase)}. ${label} share the frame as one unified subject.`;
  }

  if (detail === 'rich') {
    return `${capitalize(settingPhrase)}, warm light wrapping the pair. ${label} share the frame as one unified subject, clothes and posture reading together in the same moment. One background detail completes the scene without splitting them apart.`;
  }

  return `${capitalize(settingPhrase)}. ${label} share the frame as one unified subject in warm, simple light.`;
}

const STREET_CLOTHING_IN_ATHLETIC_PROMPT =
  /\b(?:,\s*)?(?:linen dress|evening gown|floor-length gown|bright sari|deep brown robes|brown robes|paint-stained apron|stained apron|bomber jacket|leather jacket|worn leather jacket|rolled shirtsleeves|scuffed sneakers|in a dress|wearing (?:a )?(?:linen )?dress)\b/gi;

export function stripStreetClothingFromAthleticPeoplePrompt(prompt: string): string {
  return prompt
    .replace(STREET_CLOTHING_IN_ATHLETIC_PROMPT, '')
    .replace(/\bpregnant woman\b/gi, 'woman')
    .replace(/\bpregnant\b/gi, '')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .trim();
}
