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
  'a square jaw, deep-set eyes, and a faint scar at the temple',
  'full cheeks, a short upturned nose, and freckles clustered on one cheek only',
  'a bulbous nose, thin lips, and heavy eyelids',
  'a long face, a strong chin cleft, and pale lashes',
  'a soft double chin, warm brown eyes, and a gentle crooked smile',
  'a pointed chin and arched brows that nearly meet',
  'a gap between the front teeth, round cheeks, and bright alert eyes',
  'deep nasolabial folds, watery blue eyes, and weather-creased skin',
  'a delicate jaw, sparse freckles, and slightly protruding ears',
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
    'a delicate jaw, sparse freckles, and slightly protruding ears',
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

function hairForSex(sex: CharacterSex, ethnicity: CharacterEthnicity): string {
  if (sex === 'woman') {
    const pool = HAIR_WOMAN_BY_ETHNICITY[ethnicity];
    return pickOne(pool?.length ? pool : HAIR_WOMAN_GENERAL);
  }
  if (sex === 'man') {
    const pool = HAIR_MAN_BY_ETHNICITY[ethnicity];
    return pickOne(pool?.length ? pool : HAIR_MAN_GENERAL);
  }
  const pool = HAIR_NONBINARY_BY_ETHNICITY[ethnicity];
  return pickOne(pool?.length ? pool : HAIR_NONBINARY_GENERAL);
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
export function composeCharacterAppearanceDescriptor(draft: CharacterAppearanceDraft): string {
  const ancestry = ancestryWord(draft.ethnicity, draft.sex);
  const noun = nounForSex(draft.sex);
  const age = agePhrase(draft.ageBand, draft.sex);
  const skin = SKIN_TONE_BY_ETHNICITY[draft.ethnicity];
  const face = faceForEthnicity(draft.ethnicity);
  const hair = hairForSex(draft.sex, draft.ethnicity);
  const height = heightPhrase(draft.height);
  const body = bodyBuildPhrase(draft.bodyBuild);
  return `${articleFor(ancestry)} ${ancestry} ${noun} ${age} with ${skin}, ${face}, ${hair}, and a body that is ${height}, ${body}`;
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
  return [
    labelForPick(form.sex, CHARACTER_SEX_OPTIONS),
    labelForPick(form.ethnicity, CHARACTER_ETHNICITY_OPTIONS),
    labelForPick(form.ageBand, CHARACTER_AGE_BAND_OPTIONS),
    labelForPick(form.height, CHARACTER_HEIGHT_OPTIONS),
    labelForPick(form.bodyBuild, CHARACTER_BODY_BUILD_OPTIONS),
  ].join(' · ');
}
