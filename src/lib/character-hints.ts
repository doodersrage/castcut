import {
  pickCharacterSubject,
  pickDistinctIdentitySeeds,
  type SubjectGender,
} from './variation-seed';

const WOMAN_WORDS =
  /\b(woman|women|girl|girls|female|lady|ladies|mother|daughter|sister|wife|girlfriend|feminine)\b/i;
const MAN_WORDS =
  /\b(man|men|boy|boys|male|guy|guys|father|son|brother|husband|boyfriend|masculine)\b/i;
const MINIMAL_HAIR_WORDS =
  /\b(bald|balding|shaved head|shaved scalp|clean-shaven scalp|buzz cut|buzzed hair|buzzed|monk|tonsure|hairless head)\b/i;
const HAIR_WORDS =
  /\b(hair|bun|braids|locs|dreads|ponytail|bangs|curls|curly|straight hair|wavy hair|afro|undercut|pigtails|bob cut|fringe)\b/i;
const AGE_WORDS =
  /\b(\d{1,2}\s*(?:years?\s*old|yo|y\.o\.)|in her (?:teens|twenties|thirties|forties|fifties|sixties|seventies)|in his (?:teens|twenties|thirties|forties|fifties|sixties|seventies)|teenage|teen|elderly|middle-aged|young (?:man|woman|person|lady|guy|boy|girl)|(?:an |the )?old (?:man|woman|person|lady|guy|boy|girl)|years?\s*old|aged (?:man|woman|person)|youthful|senior|child|kid|toddler|infant|twenties|thirties|forties|fifties|sixties)\b/i;
/** Face / ancestry detail that already specifies who the person is — not mere gender or scene length. */
const FACE_IDENTITY_WORDS =
  /\b((?:black|white|latina|latino|asian|east asian|south asian|southeast asian|middle eastern|indigenous|polynesian|mediterranean|nordic|mixed[- ]race|biracial|african(?:[- ]american)?|caribbean|hispanic)\s+(?:woman|man|person|girl|boy|woman's|man's)|olive skin|dark skin|brown skin|fair skin|pale skin|freckles|cheekbones|jawline|square jaw|high cheekbones|amber eyes|brown eyes|blue eyes|green eyes|hazel eyes|complexion|skin tone|box braids|locs|cornrows|henna)\b/i;

export type ParsedCharacterHints = {
  raw: string;
  gender: SubjectGender;
  explicitGender: boolean;
  wantsMinimalHair: boolean;
  mentionsHair: boolean;
  mentionsAge: boolean;
  hasIdentityConstraints: boolean;
};

export function parseCharacterHints(hints?: string): ParsedCharacterHints {
  const raw = hints?.trim() ?? '';
  if (!raw) {
    return {
      raw,
      gender: 'any',
      explicitGender: false,
      wantsMinimalHair: false,
      mentionsHair: false,
      mentionsAge: false,
      hasIdentityConstraints: false,
    };
  }

  const woman = WOMAN_WORDS.test(raw);
  const man = MAN_WORDS.test(raw);
  let gender: SubjectGender = 'any';
  if (woman && !man) {
    gender = 'women';
  } else if (man && !woman) {
    gender = 'men';
  }

  const wantsMinimalHair = MINIMAL_HAIR_WORDS.test(raw);
  const mentionsHair = HAIR_WORDS.test(raw) || wantsMinimalHair;
  const mentionsAge = AGE_WORDS.test(raw);
  const mentionsFaceIdentity = FACE_IDENTITY_WORDS.test(raw);
  const explicitGender = woman || man;
  // Gender or long scene text alone is not enough — models still default to a stock face.
  const hasIdentityConstraints = mentionsAge || mentionsHair || mentionsFaceIdentity;

  return {
    raw,
    gender,
    explicitGender,
    wantsMinimalHair,
    mentionsHair,
    mentionsAge,
    hasIdentityConstraints,
  };
}

export function buildCharacterMandatoryBlock(parsed: ParsedCharacterHints): string {
  if (!parsed.raw) {
    return '';
  }

  const lines = [
    `MANDATORY CHARACTER (must match exactly): ${parsed.raw}`,
    'Treat the mandatory character block as authoritative. Do not replace it with a different person.',
  ];

  if (parsed.explicitGender) {
    lines.push(
      "Keep the subject's sex/gender exactly as specified. Do not swap woman/man or change implied gender."
    );
  }

  if (parsed.mentionsAge) {
    lines.push(
      'Keep the stated age or age read exactly. Do not default to a generic adult or change the life stage.'
    );
  }

  if (!parsed.wantsMinimalHair) {
    lines.push(
      'Describe specific visible hair (color, length, texture, style). Do not make the subject bald, shaved, or buzz-cut unless the mandatory block explicitly requests it.'
    );
  }

  return lines.join('\n');
}

export function pickCharacterIdentitySeed(parsed: ParsedCharacterHints): string | null {
  if (parsed.hasIdentityConstraints) {
    return null;
  }

  return pickCharacterSubject(parsed.gender, parsed.wantsMinimalHair);
}

export function pickDuoCharacterIdentitySeeds(
  gender: SubjectGender = 'any',
  allowMinimalHair = false,
  athletic = false
): [string, string] {
  const resolvedGender = gender === 'any' || gender === 'mixed' ? 'women' : gender;
  const pool = pickDistinctIdentitySeeds(2, resolvedGender, {
    allowMinimalHair,
    athletic,
  });

  if (pool.length >= 2) {
    return [pool[0]!, pool[1]!];
  }

  const fallbackOne = pickFilteredIdentityFromPool(resolvedGender, {
    allowMinimalHair,
    athletic,
  });
  let fallbackTwo = pickFilteredIdentityFromPool(resolvedGender, {
    allowMinimalHair,
    athletic,
  });
  if (fallbackTwo === fallbackOne) {
    const extra = pickDistinctIdentitySeeds(2, resolvedGender, {
      allowMinimalHair,
      athletic,
    });
    fallbackTwo = extra[1] ?? fallbackTwo;
  }

  return [fallbackOne, fallbackTwo];
}

function pickFilteredIdentityFromPool(
  gender: SubjectGender,
  options: { allowMinimalHair?: boolean; athletic?: boolean }
): string {
  const [seed] = pickDistinctIdentitySeeds(1, gender, options);
  return seed ?? pickCharacterSubject(gender, options.allowMinimalHair);
}

export function buildDuoIdentityUserDirective(
  leftSeed: string,
  rightSeed: string,
  athletic = false,
  cyclingHelmets = false
): string {
  return [
    'MANDATORY DISTINCT IDENTITIES (each person must look like a different individual—not two interchangeable generic models):',
    `Person on the left: ${leftSeed}`,
    `Person on the right: ${rightSeed}`,
    "Weave face shape, hair, skin tone, and age read into each person's sentence.",
    "Do not describe both people with the same vague traits only (e.g. both simply 'determined' with no distinguishing features).",
    ...(athletic
      ? [
          'Competition-age athletes only—generally twenties to forties, fit and race-ready. No elderly, retired, teen, or child descriptors.',
          'Identity only—do NOT describe dresses, street clothes, uniforms from other professions, or non-sport garments; the assigned athletic kit is what both people wear.',
        ]
      : []),
    ...(cyclingHelmets
      ? [
          'Every cyclist wears a fastened cycling helmet; hair may show at the temples or through rear vents, but never bare heads.',
        ]
      : []),
  ].join('\n');
}
