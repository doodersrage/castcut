/**
 * Cast create appearance controls — discrete sex / ethnicity / height / body / age
 * with random defaults, composed into a face+body descriptor for prompting.
 */

export type CharacterSex = 'woman' | 'man' | 'nonbinary';

export type CharacterEthnicity =
  | 'black'
  | 'latina-latino'
  | 'east-asian'
  | 'south-asian'
  | 'southeast-asian'
  | 'middle-eastern'
  | 'indigenous'
  | 'polynesian'
  | 'mediterranean'
  | 'nordic'
  | 'caribbean'
  | 'mixed-race'
  | 'white';

export type CharacterHeight = 'short' | 'average' | 'tall' | 'very-tall';

export type CharacterBodyBuild =
  'petite' | 'slender' | 'average' | 'athletic' | 'curvy' | 'muscular' | 'stocky' | 'heavyset';

export type CharacterAgeBand = 'early-20s' | 'late-20s' | '30s' | '40s' | '50s' | '60s';

export type CharacterAppearanceDraft = {
  sex: CharacterSex;
  ethnicity: CharacterEthnicity;
  height: CharacterHeight;
  bodyBuild: CharacterBodyBuild;
  ageBand: CharacterAgeBand;
};

/** Form state — each field may be concrete or left as Random until create. */
export const CHARACTER_APPEARANCE_RANDOM = 'random' as const;
export type CharacterAppearanceRandom = typeof CHARACTER_APPEARANCE_RANDOM;
export type CharacterAppearancePick<T extends string> = T | CharacterAppearanceRandom;

export type CharacterAppearanceFormDraft = {
  sex: CharacterAppearancePick<CharacterSex>;
  ethnicity: CharacterAppearancePick<CharacterEthnicity>;
  height: CharacterAppearancePick<CharacterHeight>;
  bodyBuild: CharacterAppearancePick<CharacterBodyBuild>;
  ageBand: CharacterAppearancePick<CharacterAgeBand>;
  /** Hair, as the Cast editor picks it (CharacterTraits); unset or Random = rolled. */
  hairColor?: CharacterAppearancePick<CharacterHairColor>;
  hairLength?: CharacterAppearancePick<CharacterHairLength>;
  hairStyle?: CharacterAppearancePick<CharacterHairStyle>;
  /** The finer traits (Cast editor and create form): unset or Random = rolled / left out. */
  facialHair?: CharacterAppearancePick<CharacterFacialHair>;
  faceShape?: CharacterAppearancePick<CharacterFaceShape>;
  skinTone?: CharacterAppearancePick<CharacterSkinTone>;
  eyeColor?: CharacterAppearancePick<CharacterEyeColor>;
  bust?: CharacterAppearancePick<CharacterBust>;
  hips?: CharacterAppearancePick<CharacterHips>;
};

export type CharacterAppearanceOption<T extends string> = {
  value: T;
  label: string;
};

export const CHARACTER_SEX_OPTIONS: CharacterAppearanceOption<CharacterSex>[] = [
  { value: 'woman', label: 'Woman' },
  { value: 'man', label: 'Man' },
  { value: 'nonbinary', label: 'Nonbinary' },
];

export const CHARACTER_ETHNICITY_OPTIONS: CharacterAppearanceOption<CharacterEthnicity>[] = [
  { value: 'black', label: 'Black' },
  { value: 'latina-latino', label: 'Latina / Latino' },
  { value: 'east-asian', label: 'East Asian' },
  { value: 'south-asian', label: 'South Asian' },
  { value: 'southeast-asian', label: 'Southeast Asian' },
  { value: 'middle-eastern', label: 'Middle Eastern' },
  { value: 'indigenous', label: 'Indigenous' },
  { value: 'polynesian', label: 'Polynesian' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'nordic', label: 'Nordic' },
  { value: 'caribbean', label: 'Caribbean' },
  { value: 'mixed-race', label: 'Mixed-race' },
  { value: 'white', label: 'White' },
];

export const CHARACTER_HEIGHT_OPTIONS: CharacterAppearanceOption<CharacterHeight>[] = [
  { value: 'short', label: 'Short' },
  { value: 'average', label: 'Average height' },
  { value: 'tall', label: 'Tall' },
  { value: 'very-tall', label: 'Very tall' },
];

export const CHARACTER_BODY_BUILD_OPTIONS: CharacterAppearanceOption<CharacterBodyBuild>[] = [
  { value: 'petite', label: 'Petite / slight' },
  { value: 'slender', label: 'Slender / lean' },
  { value: 'average', label: 'Average / natural' },
  { value: 'athletic', label: 'Athletic / toned' },
  { value: 'curvy', label: 'Curvy / full-figured' },
  { value: 'muscular', label: 'Muscular / built' },
  { value: 'stocky', label: 'Stocky / compact' },
  { value: 'heavyset', label: 'Heavyset / solid' },
];

export const CHARACTER_AGE_BAND_OPTIONS: CharacterAppearanceOption<CharacterAgeBand>[] = [
  { value: 'early-20s', label: 'Early 20s' },
  { value: 'late-20s', label: 'Late 20s' },
  { value: '30s', label: '30s' },
  { value: '40s', label: '40s' },
  { value: '50s', label: '50s' },
  { value: '60s', label: '60s' },
];

export function withRandomAppearanceOption<T extends string>(
  options: CharacterAppearanceOption<T>[]
): CharacterAppearanceOption<CharacterAppearancePick<T>>[] {
  return [{ value: CHARACTER_APPEARANCE_RANDOM, label: 'Random' }, ...options];
}

export const CHARACTER_SEX_SELECT_OPTIONS = withRandomAppearanceOption(CHARACTER_SEX_OPTIONS);
export const CHARACTER_ETHNICITY_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_ETHNICITY_OPTIONS
);
export const CHARACTER_HEIGHT_SELECT_OPTIONS = withRandomAppearanceOption(CHARACTER_HEIGHT_OPTIONS);
export const CHARACTER_BODY_BUILD_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_BODY_BUILD_OPTIONS
);
export const CHARACTER_AGE_BAND_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_AGE_BAND_OPTIONS
);

/** Default create form — every trait left Random until Create. */
export function defaultCharacterAppearanceForm(): CharacterAppearanceFormDraft {
  return {
    sex: CHARACTER_APPEARANCE_RANDOM,
    ethnicity: CHARACTER_APPEARANCE_RANDOM,
    height: CHARACTER_APPEARANCE_RANDOM,
    bodyBuild: CHARACTER_APPEARANCE_RANDOM,
    ageBand: CHARACTER_APPEARANCE_RANDOM,
  };
}

const FACE_DETAILS_GENERAL = [
  'a narrow aquiline nose and close-set hazel eyes',
  'asymmetric brows and a soft rounded jaw',
  'a square jaw and deep-set eyes',
  'full cheeks and a short upturned nose',
  'a bulbous nose, thin lips, and heavy eyelids',
  'a long face, a strong chin cleft, and pale lashes',
  'a soft double chin, warm brown eyes, and a gentle crooked smile',
  'a pointed chin and arched brows that nearly meet',
  'a gap between the front teeth, round cheeks, and bright alert eyes',
  'deep nasolabial folds, watery blue eyes, and weather-creased skin',
  'a delicate jaw and slightly protruding ears',
] as const;

const FACE_BY_ETHNICITY: Partial<Record<CharacterEthnicity, readonly string[]>> = {
  black: [
    'a wide nose bridge and spaced-apart dark eyes',
    'a broad flat nose, full lips, and a calm heavy-lidded gaze',
    'high cheekbones, warm brown eyes, and a soft rounded jaw',
  ],
  'east-asian': [
    'high cheekbones, monolid eyes, and a small mouth',
    'a delicate jaw, soft monolid eyes, and a straight nose bridge',
    'a round face, epicanthic folds, and sparse brows',
  ],
  'south-asian': [
    'large dark eyes, a straight nose, and full lips',
    'warm brown eyes, arched brows, and a soft oval face',
  ],
  'southeast-asian': [
    'warm brown eyes, a soft rounded nose, and a gentle smile',
    'a heart-shaped face with dark almond eyes',
  ],
  'middle-eastern': [
    'dark expressive eyes, thick brows, and an aquiline nose',
    'olive-toned features with deep-set eyes and a strong brow',
  ],
  'latina-latino': [
    'warm brown eyes, full cheeks, and a soft rounded nose',
    'expressive dark eyes, arched brows, and a gentle smile',
  ],
  nordic: [
    'a long face, a strong chin cleft, and pale lashes',
    'cool blue eyes, light brows, and a narrow nose',
  ],
  white: [
    'a narrow aquiline nose and close-set hazel eyes',
    'a delicate jaw and slightly protruding ears',
    'deep nasolabial folds, watery blue eyes, and weather-creased skin',
  ],
  mediterranean: [
    'dark expressive eyes, thick brows, and an olive-toned complexion',
    'a soft oval face with warm brown eyes and a straight nose',
  ],
  indigenous: [
    'high cheekbones, dark almond eyes, and a strong straight nose',
    'warm brown eyes, a broad cheek plane, and a calm expression',
  ],
  polynesian: [
    'full cheeks, warm brown eyes, and a broad soft nose',
    'a strong jaw, dark eyes, and a gentle smile',
  ],
  caribbean: [
    'warm brown eyes, full lips, and a soft rounded jaw',
    'high cheekbones, bright alert eyes, and a calm gaze',
  ],
};

const HAIR_WOMAN_GENERAL = [
  'loose gray-streaked waves',
  'a severe center-part bun',
  'a cropped copper pixie',
  'a long dark braid',
  'a sleek black bob',
  'twin braids with a few flyaways',
  'thick curls pinned messily',
  'a buzzed undercut with longer curls on top',
  'straight black hair with blunt bangs',
  'ash-blonde hair cut short and uneven',
  'henna-red coils around the shoulders',
] as const;

const HAIR_MAN_GENERAL = [
  'close-cropped black hair',
  'a salt-and-pepper beard and thinning crown',
  'messy dark curls',
  'a neat fade with a soft mustache',
  'long black hair tied back',
  'a ginger beard and pale brows',
  'a bald head with gray stubble',
  'thick dark hair swept back',
  'a short ash-blonde cut going thin',
  'a silver goatee and bare temples',
  'an undercut with longer wavy top',
] as const;

const HAIR_NONBINARY_GENERAL = [
  'a dyed teal undercut',
  'a buzzed fade with longer curls on top',
  'a sleek asymmetrical bob',
  'a messy dark mullet',
  'a soft center-part with face-framing pieces',
  'close-cropped natural hair',
] as const;

const HAIR_WOMAN_BY_ETHNICITY: Partial<Record<CharacterEthnicity, readonly string[]>> = {
  black: [
    'box braids past the shoulders',
    'locs tied in a high bun',
    'a short natural afro going silver at the temples',
    'thick coils pinned messily',
    'henna-red coils around the shoulders',
    'a buzzed undercut with longer curls on top',
  ],
  'east-asian': [
    'straight black hair with blunt bangs',
    'a sleek black bob',
    'a long dark braid',
    'a severe center-part bun',
    'shoulder-length straight dark hair',
  ],
  'south-asian': [
    'a long dark braid',
    'thick dark waves past the shoulders',
    'a severe center-part bun',
    'loose dark curls',
  ],
  'southeast-asian': [
    'straight black hair with blunt bangs',
    'a sleek black bob',
    'long dark hair with soft waves',
  ],
  white: [
    'loose gray-streaked waves',
    'a cropped copper pixie',
    'ash-blonde hair cut short and uneven',
    'a severe center-part bun',
    'shoulder-length soft waves',
  ],
  nordic: [
    'ash-blonde hair cut short and uneven',
    'pale blonde waves past the shoulders',
    'a cropped copper pixie',
  ],
  mediterranean: ['thick dark waves past the shoulders', 'a long dark braid', 'loose dark curls'],
  'latina-latino': [
    'thick dark waves past the shoulders',
    'a long dark braid',
    'loose dark curls pinned loosely',
  ],
  'middle-eastern': [
    'thick dark waves past the shoulders',
    'a long dark braid',
    'loose dark curls',
  ],
  caribbean: [
    'box braids past the shoulders',
    'locs tied in a high bun',
    'thick coils pinned messily',
  ],
  indigenous: [
    'a long dark braid',
    'straight black hair past the shoulders',
    'twin braids with a few flyaways',
  ],
  polynesian: ['thick dark waves past the shoulders', 'a long dark braid', 'loose dark curls'],
};

const HAIR_MAN_BY_ETHNICITY: Partial<Record<CharacterEthnicity, readonly string[]>> = {
  black: [
    'close-cropped black hair',
    'tight coils kept short',
    'a neat fade with a soft mustache',
    'locs tied loosely at the nape',
  ],
  'east-asian': [
    'straight black hair swept forward',
    'close-cropped black hair',
    'thick dark hair swept back',
  ],
  white: [
    'a ginger beard and pale brows',
    'a short ash-blonde cut going thin',
    'a salt-and-pepper beard and thinning crown',
    'messy dark curls',
  ],
  nordic: [
    'a short ash-blonde cut going thin',
    'a ginger beard and pale brows',
    'close-cropped light hair',
  ],
};

const HAIR_NONBINARY_BY_ETHNICITY: Partial<Record<CharacterEthnicity, readonly string[]>> = {
  black: [
    'locs tied loosely at the nape',
    'short silver-tipped coils',
    'a buzzed fade with longer curls on top',
  ],
  'east-asian': [
    'a sleek asymmetrical bob',
    'straight black hair with an undercut',
    'a soft center-part with face-framing pieces',
  ],
  white: ['a dyed teal undercut', 'a messy dark mullet', 'a sleek asymmetrical bob'],
};

const SKIN_TONE_BY_ETHNICITY: Record<CharacterEthnicity, string> = {
  black: 'deep rich brown to dark brown skin',
  'latina-latino': 'warm olive to medium-brown skin',
  'east-asian': 'light-to-medium East Asian skin tone',
  'south-asian': 'warm medium-to-deep South Asian skin tone',
  'southeast-asian': 'warm light-to-medium Southeast Asian skin tone',
  'middle-eastern': 'olive to warm medium skin',
  indigenous: 'warm medium-to-deep skin',
  polynesian: 'warm medium-to-deep brown skin',
  mediterranean: 'olive to light-tan Mediterranean skin',
  nordic: 'very fair light skin with cool undertones',
  caribbean: 'warm medium-to-deep brown skin',
  'mixed-race': 'mixed-race skin tone matching their ancestry',
  white: 'fair to light Caucasian skin',
};

function pickOne<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function pickOptionValue<T extends string>(options: CharacterAppearanceOption<T>[]): T {
  return pickOne(options).value;
}

function resolvePick<T extends string>(
  value: CharacterAppearancePick<T> | undefined,
  options: CharacterAppearanceOption<T>[]
): T {
  if (value && value !== CHARACTER_APPEARANCE_RANDOM) {
    return value;
  }
  return pickOptionValue(options);
}

/** Resolve Random picks into concrete traits (at create time). */
export function resolveCharacterAppearance(
  form: Partial<CharacterAppearanceFormDraft> | CharacterAppearanceDraft = {}
): CharacterAppearanceDraft {
  return {
    sex: resolvePick(form.sex, CHARACTER_SEX_OPTIONS),
    ethnicity: resolvePick(form.ethnicity, CHARACTER_ETHNICITY_OPTIONS),
    height: resolvePick(form.height, CHARACTER_HEIGHT_OPTIONS),
    bodyBuild: resolvePick(form.bodyBuild, CHARACTER_BODY_BUILD_OPTIONS),
    ageBand: resolvePick(form.ageBand, CHARACTER_AGE_BAND_OPTIONS),
  };
}

/** @deprecated Prefer resolveCharacterAppearance — kept for callers that want a concrete draft. */
export function rollCharacterAppearance(
  partial: Partial<CharacterAppearanceDraft> = {}
): CharacterAppearanceDraft {
  return resolveCharacterAppearance(partial);
}

function ancestryWord(ethnicity: CharacterEthnicity, sex: CharacterSex): string {
  if (ethnicity === 'latina-latino') {
    if (sex === 'woman') {
      return 'Latina';
    }
    if (sex === 'man') {
      return 'Latino';
    }
    return 'Latine';
  }
  const labels: Record<Exclude<CharacterEthnicity, 'latina-latino'>, string> = {
    black: 'Black',
    'east-asian': 'East Asian',
    'south-asian': 'South Asian',
    'southeast-asian': 'Southeast Asian',
    'middle-eastern': 'Middle Eastern',
    indigenous: 'Indigenous',
    polynesian: 'Polynesian',
    mediterranean: 'Mediterranean',
    nordic: 'Nordic',
    caribbean: 'Caribbean',
    'mixed-race': 'mixed-race',
    white: 'White',
  };
  return labels[ethnicity];
}

function nounForSex(sex: CharacterSex): string {
  if (sex === 'woman') {
    return 'woman';
  }
  if (sex === 'man') {
    return 'man';
  }
  return 'person';
}

function agePhrase(ageBand: CharacterAgeBand, sex: CharacterSex): string {
  const possessive = sex === 'woman' ? 'her' : sex === 'man' ? 'his' : 'their';
  const map: Record<CharacterAgeBand, string> = {
    'early-20s': `in ${possessive} early twenties`,
    'late-20s': `in ${possessive} late twenties`,
    '30s': `in ${possessive} thirties`,
    '40s': `in ${possessive} forties`,
    '50s': `in ${possessive} fifties`,
    '60s': `in ${possessive} sixties`,
  };
  return map[ageBand];
}

function heightPhrase(height: CharacterHeight): string {
  const map: Record<CharacterHeight, string> = {
    short: 'short',
    average: 'average height',
    tall: 'tall',
    'very-tall': 'very tall',
  };
  return map[height];
}

function bodyBuildPhrase(bodyBuild: CharacterBodyBuild): string {
  const map: Record<CharacterBodyBuild, string> = {
    petite: 'petite and slight with narrow shoulders and a short torso',
    slender: 'slender and lean with long limbs and little soft tissue',
    average: 'an everyday untrained build with even shoulders and hips',
    athletic: 'athletic and endurance-toned with defined posture',
    curvy: 'curvy and full-figured with soft hips and a grounded silhouette',
    muscular: 'muscular and well-defined with broad shoulders',
    stocky: 'stocky and dense with short limbs and a deep torso',
    heavyset: 'heavyset with a full midsection and solid presence',
  };
  return map[bodyBuild];
}

function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

function faceForEthnicity(ethnicity: CharacterEthnicity): string {
  const pool = FACE_BY_ETHNICITY[ethnicity];
  if (pool?.length) {
    return pickOne(pool);
  }
  return pickOne(FACE_DETAILS_GENERAL);
}

const FACIAL_HAIR_IN_HAIR_RE = /\b(?:beard|stubble|mustache|moustache|goatee)\b/i;

function hairForSex(
  sex: CharacterSex,
  ethnicity: CharacterEthnicity,
  /** Facial hair was picked: the rolled hair must not bring its own beard. */
  noFacialHair = false
): string {
  const pick = (pool: readonly string[] | undefined, general: readonly string[]) => {
    const from = pool?.length ? pool : general;
    const clean = noFacialHair ? from.filter(line => !FACIAL_HAIR_IN_HAIR_RE.test(line)) : from;
    return pickOne(
      clean.length ? clean : general.filter(line => !FACIAL_HAIR_IN_HAIR_RE.test(line))
    );
  };
  if (sex === 'woman') return pick(HAIR_WOMAN_BY_ETHNICITY[ethnicity], HAIR_WOMAN_GENERAL);
  if (sex === 'man') return pick(HAIR_MAN_BY_ETHNICITY[ethnicity], HAIR_MAN_GENERAL);
  return pick(HAIR_NONBINARY_BY_ETHNICITY[ethnicity], HAIR_NONBINARY_GENERAL);
}

/** Infer ethnicity key from a free-text Cast descriptor / hints. */
export function inferEthnicityFromAppearanceText(text: string): CharacterEthnicity | null {
  const t = text.trim();
  if (!t) {
    return null;
  }
  const patterns: Array<{ key: CharacterEthnicity; re: RegExp }> = [
    { key: 'east-asian', re: /\b(east[\s-]?asian|chinese|japanese|korean|monolid)\b/i },
    { key: 'south-asian', re: /\b(south[\s-]?asian|indian|pakistani|bangladeshi)\b/i },
    {
      key: 'southeast-asian',
      re: /\b(southeast[\s-]?asian|filipina|filipino|vietnamese|thai|indonesian)\b/i,
    },
    { key: 'middle-eastern', re: /\b(middle[\s-]?eastern|arab|persian|iranian|turkish)\b/i },
    { key: 'latina-latino', re: /\b(latina|latino|latine|hispanic|mexican|brazilian)\b/i },
    { key: 'nordic', re: /\b(nordic|scandinavian)\b/i },
    { key: 'mediterranean', re: /\b(mediterranean|greek|italian)\b/i },
    { key: 'indigenous', re: /\b(indigenous|native[\s-]?american|first[\s-]?nations)\b/i },
    { key: 'polynesian', re: /\b(polynesian|samoan|hawaiian|maori|pasifika)\b/i },
    { key: 'caribbean', re: /\b(caribbean|afro[\s-]?caribbean|jamaican|haitian)\b/i },
    { key: 'mixed-race', re: /\b(mixed[\s-]?race|biracial|multiracial)\b/i },
    { key: 'black', re: /\b(black|african[\s-]?american|deep rich brown)\b/i },
    { key: 'white', re: /\b(white|caucasian|fair to light caucasian)\b/i },
  ];
  for (const entry of patterns) {
    if (entry.re.test(t)) {
      return entry.key;
    }
  }
  return null;
}

/** Hair phrases that strongly fight certain ancestries (legacy random rolls). */
const CONFLICTING_HAIR_BY_ETHNICITY: Partial<Record<CharacterEthnicity, RegExp>> = {
  white:
    /\b(locs?(?:\s+tied(?:\s+(?:in|at|loosely)[^,.]*)?)?|dreadlocks?|box braids?(?:\s+past[^,.]*)?|cornrows?|natural afro(?:[^,.]*)?|short natural afro(?:[^,.]*)?|tight coils(?:[^,.]*)?|silver-tipped coils|henna-red coils(?:[^,.]*)?)\b/gi,
  nordic:
    /\b(locs?(?:\s+tied(?:\s+(?:in|at|loosely)[^,.]*)?)?|dreadlocks?|box braids?(?:\s+past[^,.]*)?|cornrows?|natural afro(?:[^,.]*)?|short natural afro(?:[^,.]*)?|tight coils(?:[^,.]*)?)\b/gi,
  mediterranean:
    /\b(locs?(?:\s+tied(?:\s+(?:in|at|loosely)[^,.]*)?)?|dreadlocks?|box braids?(?:\s+past[^,.]*)?|natural afro(?:[^,.]*)?|short natural afro(?:[^,.]*)?)\b/gi,
  'east-asian':
    /\b(locs?(?:\s+tied(?:\s+(?:in|at|loosely)[^,.]*)?)?|dreadlocks?|box braids?(?:\s+past[^,.]*)?|cornrows?|natural afro(?:[^,.]*)?|ash-blonde|pale blonde|ginger beard)\b/gi,
  'south-asian':
    /\b(locs?(?:\s+tied(?:\s+(?:in|at|loosely)[^,.]*)?)?|dreadlocks?|box braids?(?:\s+past[^,.]*)?|natural afro(?:[^,.]*)?|ash-blonde|pale blonde)\b/gi,
  'southeast-asian':
    /\b(locs?(?:\s+tied(?:\s+(?:in|at|loosely)[^,.]*)?)?|dreadlocks?|box braids?(?:\s+past[^,.]*)?|natural afro(?:[^,.]*)?|ash-blonde|pale blonde)\b/gi,
  black:
    /\b(ash-blonde(?:[^,.]*)?|pale blonde(?:[^,.]*)?|ginger beard(?:[^,.]*)?|monolid eyes)\b/gi,
  caribbean: /\b(ash-blonde(?:[^,.]*)?|pale blonde(?:[^,.]*)?|monolid eyes)\b/gi,
};

function defaultReplacementHair(ethnicity: CharacterEthnicity, text: string): string {
  const sex: CharacterSex = /\bman\b/i.test(text)
    ? 'man'
    : /\bnonbinary\b/i.test(text)
      ? 'nonbinary'
      : 'woman';
  if (sex === 'woman') {
    return HAIR_WOMAN_BY_ETHNICITY[ethnicity]?.[0] ?? HAIR_WOMAN_GENERAL[0]!;
  }
  if (sex === 'man') {
    return HAIR_MAN_BY_ETHNICITY[ethnicity]?.[0] ?? HAIR_MAN_GENERAL[0]!;
  }
  return HAIR_NONBINARY_BY_ETHNICITY[ethnicity]?.[0] ?? HAIR_NONBINARY_GENERAL[0]!;
}

/**
 * Fix legacy Cast descriptors where ethnicity and hair fight (e.g. white woman + locs).
 * Idempotent — returns the input unchanged when already coherent.
 */
export function sanitizeCharacterAppearanceDescriptor(descriptor: string): string {
  const trimmed = descriptor.trim();
  if (!trimmed) {
    return '';
  }
  const ethnicity = inferEthnicityFromAppearanceText(trimmed);
  if (!ethnicity) {
    return trimmed;
  }
  const conflict = CONFLICTING_HAIR_BY_ETHNICITY[ethnicity];
  if (!conflict || !conflict.test(trimmed)) {
    return trimmed;
  }
  // Reset lastIndex after .test on a global regex.
  conflict.lastIndex = 0;
  const replacement = defaultReplacementHair(ethnicity, trimmed);
  let next = trimmed.replace(conflict, replacement);
  // Collapse duplicated replacements / punctuation junk from the swap.
  next = next
    .replace(/(,\s*){2,}/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ', ')
    .trim();
  // Ensure skin tone is explicit when ancestry is clear but skin was never rolled.
  const skin = SKIN_TONE_BY_ETHNICITY[ethnicity];
  if (skin && !next.toLowerCase().includes(skin.slice(0, 12).toLowerCase())) {
    // Insert skin after "with " when present.
    if (/\bwith\b/i.test(next)) {
      next = next.replace(/\bwith\b/i, `with ${skin},`);
    } else {
      next = `${next}, ${skin}`;
    }
  }
  return next
    .replace(/,\s*,/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Compose a Cast descriptor from discrete appearance picks (face/hair still roll for variety). */
export function composeCharacterAppearanceDescriptor(
  draft: CharacterAppearanceDraft,
  /** Picked hair, in place of the rolled hair. */
  hairOverride?: string,
  /** Picked finer traits (skin tone, face, eyes, facial hair, bust, hips) in place of rolled ones. */
  finerPicks?: CharacterTraits
): string {
  const finer = finerTraitPhrases({ ...finerPicks, sex: draft.sex });
  const ancestry = ancestryWord(draft.ethnicity, draft.sex);
  const noun = nounForSex(draft.sex);
  const age = agePhrase(draft.ageBand, draft.sex);
  const skin = finer.skin || SKIN_TONE_BY_ETHNICITY[draft.ethnicity];
  const face = finer.face || faceForEthnicity(draft.ethnicity);
  const hair =
    hairOverride?.trim() || hairForSex(draft.sex, draft.ethnicity, Boolean(finer.facialHair));
  const height = heightPhrase(draft.height);
  // Picked hips say the hips: the build's own hip words ("even shoulders and hips") go.
  const body = finerPicks?.hips
    ? bodyBuildPhrase(draft.bodyBuild)
        .replace(/ and hips$/, '')
        .replace(/soft hips and /, '')
    : bodyBuildPhrase(draft.bodyBuild);
  const facialHair = finer.facialHair ? `, ${finer.facialHair}` : '';
  const figure = finer.figure ? `, with ${finer.figure}` : '';
  return `${articleFor(ancestry)} ${ancestry} ${noun} ${age} with ${skin}, ${face}, ${hair}${facialHair}, and a body that is ${height}, ${body}${figure}`;
}

/**
 * A Cast made from a photo: only what the player picked, nothing rolled. Random traits filled in
 * a whole invented person ("a White man in his forties … a ginger beard") that the photo then
 * contradicted — in prompts and in the Day partner line. Empty when nothing was picked.
 */
export function describeChosenAppearance(form: Partial<CharacterAppearanceFormDraft> = {}): {
  descriptor?: string;
  hints?: string;
} {
  const chosen = <T extends string>(value: CharacterAppearancePick<T> | undefined) =>
    value && value !== CHARACTER_APPEARANCE_RANDOM ? value : undefined;
  const sex = chosen(form.sex);
  const ethnicity = chosen(form.ethnicity);
  const ageBand = chosen(form.ageBand);
  const height = chosen(form.height);
  const bodyBuild = chosen(form.bodyBuild);
  if (!sex && !ethnicity && !ageBand && !height && !bodyBuild) return {};
  const noun = sex ? nounForSex(sex) : 'person';
  const ancestry = ethnicity ? ancestryWord(ethnicity, sex ?? 'nonbinary') : '';
  const age = ageBand ? ` ${agePhrase(ageBand, sex ?? 'nonbinary')}` : '';
  const head = [ancestry, noun].filter(Boolean).join(' ');
  const build = [height ? heightPhrase(height) : '', bodyBuild ? bodyBuildPhrase(bodyBuild) : '']
    .filter(Boolean)
    .join(', ');
  const descriptor = `${articleFor(head)} ${head}${age}${build ? `, ${build}` : ''}`;
  const label = <T extends string>(
    value: T | undefined,
    options: CharacterAppearanceOption<T>[]
  ) => (value ? options.find(option => option.value === value)?.label : undefined);
  const hints = [
    sex === 'woman' ? 'woman' : sex === 'man' ? 'man' : sex ? 'nonbinary person' : undefined,
    label(ethnicity, CHARACTER_ETHNICITY_OPTIONS),
    label(ageBand, CHARACTER_AGE_BAND_OPTIONS),
    label(height, CHARACTER_HEIGHT_OPTIONS),
    label(bodyBuild, CHARACTER_BODY_BUILD_OPTIONS),
  ]
    .filter(Boolean)
    .join(', ');
  return { descriptor, hints };
}

/** Short hints string so wardrobe / gender helpers can read sex without parsing the full descriptor. */
export function characterAppearanceHints(draft: CharacterAppearanceDraft): string {
  const sexLabel =
    draft.sex === 'woman' ? 'woman' : draft.sex === 'man' ? 'man' : 'nonbinary person';
  const ethnicity = CHARACTER_ETHNICITY_OPTIONS.find(
    option => option.value === draft.ethnicity
  )?.label;
  const age = CHARACTER_AGE_BAND_OPTIONS.find(option => option.value === draft.ageBand)?.label;
  const height = CHARACTER_HEIGHT_OPTIONS.find(option => option.value === draft.height)?.label;
  const body = CHARACTER_BODY_BUILD_OPTIONS.find(option => option.value === draft.bodyBuild)?.label;
  return [sexLabel, ethnicity, age, height, body].filter(Boolean).join(', ');
}

export function summarizeCharacterAppearance(draft: CharacterAppearanceDraft): string {
  const sex = CHARACTER_SEX_OPTIONS.find(option => option.value === draft.sex)?.label;
  const ethnicity = CHARACTER_ETHNICITY_OPTIONS.find(
    option => option.value === draft.ethnicity
  )?.label;
  const age = CHARACTER_AGE_BAND_OPTIONS.find(option => option.value === draft.ageBand)?.label;
  const height = CHARACTER_HEIGHT_OPTIONS.find(option => option.value === draft.height)?.label;
  const body = CHARACTER_BODY_BUILD_OPTIONS.find(option => option.value === draft.bodyBuild)?.label;
  return [sex, ethnicity, age, height, body].filter(Boolean).join(' · ');
}

function labelForPick<T extends string>(
  value: CharacterAppearancePick<T>,
  options: CharacterAppearanceOption<T>[]
): string {
  if (value === CHARACTER_APPEARANCE_RANDOM) {
    return 'Random';
  }
  return options.find(option => option.value === value)?.label ?? value;
}

/** Summary for the create form while Random picks are still unresolved. */
export function summarizeCharacterAppearanceForm(form: CharacterAppearanceFormDraft): string {
  const picks = createFormPickedTraits(form);
  const hair = hairPhrase(picks);
  return [
    labelForPick(form.sex, CHARACTER_SEX_OPTIONS),
    labelForPick(form.ethnicity, CHARACTER_ETHNICITY_OPTIONS),
    labelForPick(form.ageBand, CHARACTER_AGE_BAND_OPTIONS),
    labelForPick(form.height, CHARACTER_HEIGHT_OPTIONS),
    labelForPick(form.bodyBuild, CHARACTER_BODY_BUILD_OPTIONS),
    hair ? hair.replace(/^an? /, '') : null,
    ...finerTraitLabels({ ...picks, sex: pickedSex(form.sex) }),
  ]
    .filter(Boolean)
    .join(' · ');
}

function pickedSex(value: CharacterAppearancePick<CharacterSex> | undefined) {
  return value && value !== CHARACTER_APPEARANCE_RANDOM ? value : undefined;
}

/**
 * The create form's hair and finer-trait picks as traits (Random left out; Bald has no length or
 * style). Undefined when nothing beyond the basic five was picked.
 */
export function createFormPickedTraits(
  form: Partial<CharacterAppearanceFormDraft> | undefined
): CharacterTraits | undefined {
  const pick = <T extends string>(value: CharacterAppearancePick<T> | undefined) =>
    value && value !== CHARACTER_APPEARANCE_RANDOM ? value : undefined;
  const hairColor = pick(form?.hairColor);
  const bald = hairColor === 'bald';
  return normalizeCharacterTraits({
    hairColor,
    hairLength: bald ? undefined : pick(form?.hairLength),
    hairStyle: bald ? undefined : pick(form?.hairStyle),
    facialHair: pick(form?.facialHair),
    faceShape: pick(form?.faceShape),
    skinTone: pick(form?.skinTone),
    eyeColor: pick(form?.eyeColor),
    bust: pick(form?.bust),
    hips: pick(form?.hips),
  });
}

/** Written by composeCharacterAppearanceDescriptor (every trait rolled or picked). */
export function isRolledAppearanceDescriptor(text: string | null | undefined): boolean {
  return /^an? [^,]+ with [^.]+, and a body that is [^.]+$/i.test(text?.trim() ?? '');
}

/**
 * A Cast's physical traits as picked — only what was chosen (a trait left out is the picture's
 * to show). The physical description Day, Look and Outfit use is built from these alone; the
 * Story bible's look is Story's (it used to overwrite the description, and story wording —
 * clothes, mood, backstory — ended up in Day prompts).
 */
export type CharacterTraits = Partial<CharacterAppearanceDraft> & {
  hairColor?: CharacterHairColor;
  hairLength?: CharacterHairLength;
  hairStyle?: CharacterHairStyle;
  /** Men and nonbinary Casts only. */
  facialHair?: CharacterFacialHair;
  faceShape?: CharacterFaceShape;
  /** In place of the ethnicity's one tone. */
  skinTone?: CharacterSkinTone;
  eyeColor?: CharacterEyeColor;
  /** Women and nonbinary Casts only. */
  bust?: CharacterBust;
  hips?: CharacterHips;
};

export type CharacterFacialHair =
  'clean-shaven' | 'stubble' | 'short-beard' | 'full-beard' | 'moustache' | 'goatee';
export type CharacterFaceShape = 'oval' | 'round' | 'square' | 'heart' | 'long' | 'diamond';
export type CharacterSkinTone =
  'very-fair' | 'fair' | 'light' | 'olive' | 'tan' | 'medium-brown' | 'brown' | 'deep';
export type CharacterEyeColor =
  'dark-brown' | 'brown' | 'hazel' | 'amber' | 'green' | 'blue' | 'grey';
export type CharacterBust = 'small' | 'medium' | 'full' | 'very-full';
export type CharacterHips = 'narrow' | 'average' | 'curvy' | 'wide';

export const CHARACTER_FACIAL_HAIR_OPTIONS: CharacterAppearanceOption<CharacterFacialHair>[] = [
  { value: 'clean-shaven', label: 'Clean-shaven' },
  { value: 'stubble', label: 'Stubble' },
  { value: 'short-beard', label: 'Short beard' },
  { value: 'full-beard', label: 'Full beard' },
  { value: 'moustache', label: 'Moustache' },
  { value: 'goatee', label: 'Goatee' },
];
export const CHARACTER_FACE_SHAPE_OPTIONS: CharacterAppearanceOption<CharacterFaceShape>[] = [
  { value: 'oval', label: 'Oval' },
  { value: 'round', label: 'Round' },
  { value: 'square', label: 'Square' },
  { value: 'heart', label: 'Heart' },
  { value: 'long', label: 'Long' },
  { value: 'diamond', label: 'Diamond' },
];
export const CHARACTER_SKIN_TONE_OPTIONS: CharacterAppearanceOption<CharacterSkinTone>[] = [
  { value: 'very-fair', label: 'Very fair' },
  { value: 'fair', label: 'Fair' },
  { value: 'light', label: 'Light' },
  { value: 'olive', label: 'Olive' },
  { value: 'tan', label: 'Tan' },
  { value: 'medium-brown', label: 'Medium brown' },
  { value: 'brown', label: 'Brown' },
  { value: 'deep', label: 'Deep brown' },
];
export const CHARACTER_EYE_COLOR_OPTIONS: CharacterAppearanceOption<CharacterEyeColor>[] = [
  { value: 'dark-brown', label: 'Dark brown' },
  { value: 'brown', label: 'Brown' },
  { value: 'hazel', label: 'Hazel' },
  { value: 'amber', label: 'Amber' },
  { value: 'green', label: 'Green' },
  { value: 'blue', label: 'Blue' },
  { value: 'grey', label: 'Grey' },
];
export const CHARACTER_BUST_OPTIONS: CharacterAppearanceOption<CharacterBust>[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'full', label: 'Full' },
  { value: 'very-full', label: 'Very full' },
];
export const CHARACTER_HIPS_OPTIONS: CharacterAppearanceOption<CharacterHips>[] = [
  { value: 'narrow', label: 'Narrow' },
  { value: 'average', label: 'Average' },
  { value: 'curvy', label: 'Curvy' },
  { value: 'wide', label: 'Wide' },
];
export const CHARACTER_FACIAL_HAIR_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_FACIAL_HAIR_OPTIONS
);
export const CHARACTER_FACE_SHAPE_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_FACE_SHAPE_OPTIONS
);
export const CHARACTER_SKIN_TONE_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_SKIN_TONE_OPTIONS
);
export const CHARACTER_EYE_COLOR_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_EYE_COLOR_OPTIONS
);
export const CHARACTER_BUST_SELECT_OPTIONS = withRandomAppearanceOption(CHARACTER_BUST_OPTIONS);
export const CHARACTER_HIPS_SELECT_OPTIONS = withRandomAppearanceOption(CHARACTER_HIPS_OPTIONS);

const FACIAL_HAIR_WORDS: Record<CharacterFacialHair, string> = {
  'clean-shaven': 'a clean-shaven face',
  stubble: 'light stubble',
  'short-beard': 'a short neat beard',
  'full-beard': 'a full beard',
  moustache: 'a moustache',
  goatee: 'a goatee',
};
const SKIN_TONE_WORDS: Record<CharacterSkinTone, string> = {
  'very-fair': 'very fair skin',
  fair: 'fair skin',
  light: 'light skin',
  olive: 'olive skin',
  tan: 'tan skin',
  'medium-brown': 'medium-brown skin',
  brown: 'brown skin',
  deep: 'deep brown skin',
};
const EYE_COLOR_WORDS: Record<CharacterEyeColor, string> = {
  'dark-brown': 'dark brown eyes',
  brown: 'brown eyes',
  hazel: 'hazel eyes',
  amber: 'amber eyes',
  green: 'green eyes',
  blue: 'blue eyes',
  grey: 'grey eyes',
};
const BUST_WORDS: Record<CharacterBust, string> = {
  small: 'a small bust',
  medium: 'a medium bust',
  full: 'a full bust',
  'very-full': 'a very full bust',
};
const HIPS_WORDS: Record<CharacterHips, string> = {
  narrow: 'narrow hips',
  average: 'average hips',
  curvy: 'curvy hips',
  wide: 'wide hips',
};

/** Facial hair applies to men and nonbinary Casts; bust to women and nonbinary Casts. */
export function traitAppliesToSex(
  key: 'facialHair' | 'bust',
  sex: CharacterSex | 'random' | undefined
): boolean {
  if (key === 'facialHair') return sex !== 'woman';
  return sex !== 'man';
}

/** The finer traits as words, for a description: picked ones only. */
export function finerTraitPhrases(traits: CharacterTraits | undefined): {
  face: string;
  skin: string;
  facialHair: string;
  figure: string;
} {
  const sex = traits?.sex;
  const shape = traits?.faceShape ? `${articleFor(traits.faceShape)} ${traits.faceShape} face` : '';
  const eyes = traits?.eyeColor ? EYE_COLOR_WORDS[traits.eyeColor] : '';
  const facialHair =
    traits?.facialHair && traitAppliesToSex('facialHair', sex)
      ? FACIAL_HAIR_WORDS[traits.facialHair]
      : '';
  const bust = traits?.bust && traitAppliesToSex('bust', sex) ? BUST_WORDS[traits.bust] : '';
  const hips = traits?.hips ? HIPS_WORDS[traits.hips] : '';
  return {
    face: shape && eyes ? `${shape} with ${eyes}` : shape || eyes,
    skin: traits?.skinTone ? SKIN_TONE_WORDS[traits.skinTone] : '',
    facialHair,
    figure: [bust, hips].filter(Boolean).join(' and '),
  };
}

const FINER_TRAIT_LABELS: Array<{
  key: 'facialHair' | 'faceShape' | 'skinTone' | 'eyeColor' | 'bust' | 'hips';
  options: ReadonlyArray<{ value: string; label: string }>;
  suffix: string;
}> = [
  { key: 'skinTone', options: CHARACTER_SKIN_TONE_OPTIONS, suffix: ' skin' },
  { key: 'faceShape', options: CHARACTER_FACE_SHAPE_OPTIONS, suffix: ' face' },
  { key: 'eyeColor', options: CHARACTER_EYE_COLOR_OPTIONS, suffix: ' eyes' },
  { key: 'facialHair', options: CHARACTER_FACIAL_HAIR_OPTIONS, suffix: '' },
  { key: 'bust', options: CHARACTER_BUST_OPTIONS, suffix: ' bust' },
  { key: 'hips', options: CHARACTER_HIPS_OPTIONS, suffix: ' hips' },
];

/** Short labels of the picked finer traits, for hints and summaries ("Olive skin", "Green eyes"). */
export function finerTraitLabels(traits: CharacterTraits | undefined): string[] {
  if (!traits) return [];
  return FINER_TRAIT_LABELS.flatMap(({ key, options, suffix }) => {
    const value = traits[key];
    if (!value) return [];
    if ((key === 'facialHair' || key === 'bust') && !traitAppliesToSex(key, traits.sex)) return [];
    const label = options.find(option => option.value === value)?.label;
    return label ? [`${label}${suffix}`] : [];
  });
}

export type CharacterHairColor =
  | 'black'
  | 'dark-brown'
  | 'brown'
  | 'light-brown'
  | 'auburn'
  | 'red'
  | 'strawberry-blonde'
  | 'blonde'
  | 'platinum-blonde'
  | 'grey'
  | 'white'
  | 'bald';
export type CharacterHairLength =
  'bald' | 'buzzed' | 'short' | 'chin-length' | 'shoulder-length' | 'long' | 'very-long';
export type CharacterHairStyle =
  | 'straight'
  | 'wavy'
  | 'curly'
  | 'coily'
  | 'afro'
  | 'braids'
  | 'locs'
  | 'ponytail'
  | 'bun'
  | 'pixie'
  | 'undercut'
  | 'slicked-back';

export const CHARACTER_HAIR_COLOR_OPTIONS: CharacterAppearanceOption<CharacterHairColor>[] = [
  { value: 'black', label: 'Black' },
  { value: 'dark-brown', label: 'Dark brown' },
  { value: 'brown', label: 'Brown' },
  { value: 'light-brown', label: 'Light brown' },
  { value: 'auburn', label: 'Auburn' },
  { value: 'red', label: 'Red' },
  { value: 'strawberry-blonde', label: 'Strawberry blonde' },
  { value: 'blonde', label: 'Blonde' },
  { value: 'platinum-blonde', label: 'Platinum blonde' },
  { value: 'grey', label: 'Grey' },
  { value: 'white', label: 'White' },
  { value: 'bald', label: 'Bald (no hair)' },
];
export const CHARACTER_HAIR_LENGTH_OPTIONS: CharacterAppearanceOption<CharacterHairLength>[] = [
  { value: 'bald', label: 'Bald / shaved' },
  { value: 'buzzed', label: 'Buzzed' },
  { value: 'short', label: 'Short' },
  { value: 'chin-length', label: 'Chin-length' },
  { value: 'shoulder-length', label: 'Shoulder-length' },
  { value: 'long', label: 'Long' },
  { value: 'very-long', label: 'Very long' },
];
export const CHARACTER_HAIR_STYLE_OPTIONS: CharacterAppearanceOption<CharacterHairStyle>[] = [
  { value: 'straight', label: 'Straight' },
  { value: 'wavy', label: 'Wavy' },
  { value: 'curly', label: 'Curly' },
  { value: 'coily', label: 'Coily' },
  { value: 'afro', label: 'Afro' },
  { value: 'braids', label: 'Braids' },
  { value: 'locs', label: 'Locs' },
  { value: 'ponytail', label: 'Ponytail' },
  { value: 'bun', label: 'Bun' },
  { value: 'pixie', label: 'Pixie cut' },
  { value: 'undercut', label: 'Undercut' },
  { value: 'slicked-back', label: 'Slicked back' },
];
export const CHARACTER_HAIR_COLOR_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_HAIR_COLOR_OPTIONS
);
export const CHARACTER_HAIR_LENGTH_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_HAIR_LENGTH_OPTIONS
);
export const CHARACTER_HAIR_STYLE_SELECT_OPTIONS = withRandomAppearanceOption(
  CHARACTER_HAIR_STYLE_OPTIONS
);

const HAIR_COLOR_WORDS: Record<Exclude<CharacterHairColor, 'bald'>, string> = {
  black: 'black',
  'dark-brown': 'dark brown',
  brown: 'brown',
  'light-brown': 'light brown',
  auburn: 'auburn',
  red: 'red',
  'strawberry-blonde': 'strawberry-blonde',
  blonde: 'blonde',
  'platinum-blonde': 'platinum-blonde',
  grey: 'grey',
  white: 'white',
};
const HAIR_LENGTH_WORDS: Record<Exclude<CharacterHairLength, 'bald'>, string> = {
  buzzed: 'buzzed',
  short: 'short',
  'chin-length': 'chin-length',
  'shoulder-length': 'shoulder-length',
  long: 'long',
  'very-long': 'very long',
};
/** Texture words go before "hair"; the rest say how it is worn. */
const HAIR_TEXTURE: Partial<Record<CharacterHairStyle, string>> = {
  straight: 'straight',
  wavy: 'wavy',
  curly: 'curly',
  coily: 'tightly coiled',
};
const HAIR_WORN: Partial<Record<CharacterHairStyle, string>> = {
  afro: 'worn in an afro',
  braids: 'in braids',
  locs: 'in locs',
  ponytail: 'tied in a ponytail',
  bun: 'pulled up in a bun',
  pixie: 'in a pixie cut',
  undercut: 'with an undercut',
  'slicked-back': 'slicked back',
};

/** "shoulder-length wavy auburn hair", "long black hair in braids", "a shaved head"; '' if unset. */
export function hairPhrase(traits: CharacterTraits | undefined): string {
  if (!traits) return '';
  const { hairColor, hairLength, hairStyle } = traits;
  // Bald as the colour: no hair at all, whatever length or style was left picked.
  if (hairColor === 'bald') return 'a bald head';
  if (hairLength === 'bald') return 'a shaved head';
  if (!hairColor && !hairLength && !hairStyle) return '';
  const words = [
    hairLength ? HAIR_LENGTH_WORDS[hairLength] : '',
    hairStyle ? (HAIR_TEXTURE[hairStyle] ?? '') : '',
    hairColor ? HAIR_COLOR_WORDS[hairColor] : '',
    'hair',
    hairStyle ? (HAIR_WORN[hairStyle] ?? '') : '',
  ].filter(Boolean);
  return words.join(' ');
}

const TRAIT_OPTIONS = {
  sex: CHARACTER_SEX_OPTIONS,
  ethnicity: CHARACTER_ETHNICITY_OPTIONS,
  ageBand: CHARACTER_AGE_BAND_OPTIONS,
  height: CHARACTER_HEIGHT_OPTIONS,
  bodyBuild: CHARACTER_BODY_BUILD_OPTIONS,
  hairColor: CHARACTER_HAIR_COLOR_OPTIONS,
  hairLength: CHARACTER_HAIR_LENGTH_OPTIONS,
  hairStyle: CHARACTER_HAIR_STYLE_OPTIONS,
  facialHair: CHARACTER_FACIAL_HAIR_OPTIONS,
  faceShape: CHARACTER_FACE_SHAPE_OPTIONS,
  skinTone: CHARACTER_SKIN_TONE_OPTIONS,
  eyeColor: CHARACTER_EYE_COLOR_OPTIONS,
  bust: CHARACTER_BUST_OPTIONS,
  hips: CHARACTER_HIPS_OPTIONS,
} as const;

export const CHARACTER_TRAIT_KEYS = Object.keys(TRAIT_OPTIONS) as Array<keyof CharacterTraits>;

/** The finer traits picked (facial hair / bust only where they apply to the Cast's sex). */
function finerTraitsOf(traits: CharacterTraits | undefined): CharacterTraits {
  const out: CharacterTraits = {};
  if (!traits) return out;
  if (traits.faceShape) out.faceShape = traits.faceShape;
  if (traits.skinTone) out.skinTone = traits.skinTone;
  if (traits.eyeColor) out.eyeColor = traits.eyeColor;
  if (traits.hips) out.hips = traits.hips;
  if (traits.facialHair && traitAppliesToSex('facialHair', traits.sex)) {
    out.facialHair = traits.facialHair;
  }
  if (traits.bust && traitAppliesToSex('bust', traits.sex)) out.bust = traits.bust;
  return out;
}

/** Traits with the ones that don't fit the Cast's sex (a woman's beard, a man's bust) left out. */
function applicableTraits(traits: CharacterTraits | undefined): CharacterTraits | undefined {
  const known = normalizeCharacterTraits(traits);
  if (!known) return undefined;
  const { facialHair: _beard, bust: _bust, ...rest } = known;
  void _beard;
  void _bust;
  return normalizeCharacterTraits({ ...rest, ...finerTraitsOf(known) });
}

/** "a, b and c". */
function listWords(parts: string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Only known values; 'random' and unknown values drop out. Undefined when nothing is left. */
export function normalizeCharacterTraits(input: unknown): CharacterTraits | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const source = input as Record<string, unknown>;
  const traits: Record<string, string> = {};
  for (const key of CHARACTER_TRAIT_KEYS) {
    const value = source[key];
    const options = TRAIT_OPTIONS[key] as ReadonlyArray<{ value: string }>;
    if (typeof value === 'string' && options.some(option => option.value === value)) {
      traits[key] = value;
    }
  }
  return Object.keys(traits).length ? (traits as CharacterTraits) : undefined;
}

/**
 * The physical description for a set of traits. With a picture, only the picked traits are said
 * (the picture shows the rest; rolled traits contradicted it). Without one, the unpicked traits
 * are rolled once and returned so the description stays the same from then on.
 */
export function physicalDescriptionFromTraits(
  traits: CharacterTraits | undefined,
  options: { hasPicture: boolean }
): { descriptor?: string; hints?: string; traits?: CharacterTraits } {
  const hair = hairPhrase(traits);
  const hairPicks = {
    ...(traits?.hairColor ? { hairColor: traits.hairColor } : {}),
    ...(traits?.hairLength ? { hairLength: traits.hairLength } : {}),
    ...(traits?.hairStyle ? { hairStyle: traits.hairStyle } : {}),
  };
  const hairHint = hair ? hair.replace(/^a /, '') : '';
  const finerPicks = finerTraitsOf(traits);
  const finerHints = finerTraitLabels(traits);
  if (options.hasPicture) {
    const chosen = describeChosenAppearance(traits ?? {});
    const finer = finerTraitPhrases(traits);
    const withParts = [finer.skin, finer.face, hair, finer.facialHair].filter(Boolean);
    if (!withParts.length && !finer.figure) {
      return { ...chosen, traits: applicableTraits(traits) };
    }
    const base = chosen.descriptor ?? 'a person';
    const withText = withParts.length
      ? `${base.includes(',') ? ',' : ''} with ${listWords(withParts)}`
      : '';
    const figure = finer.figure
      ? `${withText || base.includes(',') ? ',' : ''} with ${finer.figure}`
      : '';
    return {
      descriptor: `${base}${withText}${figure}`,
      hints: [chosen.hints, hairHint, ...finerHints].filter(Boolean).join(', '),
      traits: applicableTraits(traits),
    };
  }
  const resolved = resolveCharacterAppearance(traits ?? {});
  return {
    descriptor: composeCharacterAppearanceDescriptor(resolved, hair || undefined, finerPicks),
    hints: [characterAppearanceHints(resolved), hairHint, ...finerHints].filter(Boolean).join(', '),
    traits: { ...resolved, ...hairPicks, ...finerPicks },
  };
}
