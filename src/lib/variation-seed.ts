type VariationPools = {
  subjects: string[];
  lighting: string[];
  framing: string[];
  atmosphere: string[];
  palette: string[];
  styles: string[];
  eras: string[];
  lenses: string[];
  twists: string[];
  reinterpretations: string[];
  mandates: string[];
};

const POOLS: VariationPools = {
  subjects: [
    'an elderly man with a creased face, silver stubble, and work-worn hands',
    'a young Black woman with box braids, high cheekbones, and gold hoop earrings',
    'a middle-aged Latina with gray-streaked hair, soft build, and laugh lines',
    'a tall androgynous person with a shaved side, sharp jawline, and a worn leather jacket',
    'a teenage East Asian boy with messy hair, freckles, and a shy half-smile',
    'an older South Asian woman in a bright sari, gentle eyes, and henna on her palms',
    'a muscular Polynesian man with traditional arm tattoos and sun-darkened skin',
    'a pale red-haired woman in her thirties, light dusting of freckles, cropped copper hair',
    'a stocky Mediterranean man with olive skin, thick beard, and rolled shirtsleeves',
    'a slender elderly woman with white hair in a loose bun, reading glasses, and steady posture',
    'a young nonbinary person with dyed teal undercut, angular features, and layered jewelry',
    'a heavyset middle-aged man with a bald head, warm expression, and paint-stained apron',
    'a lithe dancer in her twenties, deep brown skin, locs tied back, expressive hands',
    'a grizzled fisherman with rope-scarred fingers, salt-and-pepper beard, and squinting eyes',
    'a school-age girl with braids, gap-toothed grin, and scuffed sneakers',
    'a wheelchair user with sharp features, buzzed hair, and a vintage bomber jacket',
    'a pregnant woman in her late thirties, curly auburn hair, linen dress, calm focus',
    'a street vendor with sun-creased skin, quick hands, and a stained apron',
    'a retired boxer with a flattened nose, gray temples, and quiet stillness',
    'a monk with a shaved head, deep brown robes, and ink-stained fingers',
  ],
  lighting: [
    'harsh midday sun casting crisp, short shadows',
    'soft overcast light with muted contrast',
    'golden-hour backlight with warm rim glow',
    'cool blue moonlight and deep shadow pools',
    'a single warm practical light source with falloff into darkness',
    'neon color spill mixing magenta and cyan across surfaces',
    'dappled light filtering through leaves or lattice',
    'storm-light with bruised purple clouds and sudden highlights',
    'candlelight flicker with warm amber pools on nearby surfaces',
    'early-morning fog diffusing pale sunlight',
    'sodium-vapor streetlight green cast on wet pavement',
    'lightning flash freezing motion for a split second',
    'projector light cutting through haze and dust',
    'underwater caustics rippling across surfaces',
  ],
  framing: [
    'a wide establishing view with layered depth',
    'a low angle looking upward for scale and drama',
    'a tight close framing on hands, face, or a key object',
    'an over-the-shoulder view opening into the scene beyond',
    'a slightly off-center asymmetric composition',
    "a bird's-eye perspective looking down into the space",
    'a three-quarter view with strong foreground-to-background separation',
    'a symmetrical centered composition with balanced negative space',
    'a Dutch tilt that adds unease and motion',
    'extreme foreground obstruction with the subject beyond',
  ],
  atmosphere: [
    'quiet and contemplative',
    'charged with restless energy',
    'humid and heavy',
    'crisp and wind-swept',
    'dreamlike and slightly surreal',
    'gritty and lived-in',
    'serene and suspended in time',
    'tense, as if a moment before something happens',
    'celebratory and bright',
    'melancholic but beautiful',
    'electric and unpredictable',
    'sacred and hushed',
  ],
  palette: [
    'rust, cream, and deep teal',
    'charcoal, silver, and a single red accent',
    'sun-faded ochre, sage, and dusty rose',
    'electric violet, acid green, and midnight blue',
    'warm amber, burnt sienna, and shadow brown',
    'ice blue, pale lavender, and soft white',
    'terracotta, olive, and sun-bleached sand',
    'ink black, pearl gray, and molten gold highlights',
    'copper, plum, and smoke gray',
    'lime, coral, and deep indigo',
  ],
  styles: [
    'documentary realism with unposed candid energy',
    'painterly impressionism with visible brushstroke logic',
    'cinematic widescreen still with anamorphic depth',
    'gritty street photography with grain and contrast',
    'soft romantic illustration with flowing edges',
    'hyper-detailed editorial fashion energy',
    'noir with crushed blacks and selective highlights',
    'surrealist dream logic with impossible scale shifts',
    'retro pulp cover boldness',
    'intimate indie film stillness',
  ],
  eras: [
    'a 1970s texture of film grain and faded warmth',
    'a near-future layer of worn tech and patched fabrics',
    'a 1920s elegance of art deco lines and polished surfaces',
    'a post-apocalyptic salvage aesthetic',
    'a timeless mythic past with no exact century',
    'a 1990s suburban mundane interrupted by something strange',
    'a colonial-era frontier roughness',
    'a solarpunk optimism of greenery and reclaimed materials',
  ],
  lenses: [
    'shot on a wide 24mm lens with environmental context',
    'compressed telephoto flattening layers at 85mm',
    'macro intimacy on a small telling detail',
    'fisheye distortion wrapping the space',
    'shallow depth of field isolating one sharp plane',
    'deep focus keeping foreground and horizon crisp',
  ],
  twists: [
    'a flock of paper birds caught mid-flight',
    'an obsolete object that should not belong there',
    'weather that contradicts the setting',
    'a mirror or window doubling the scene',
    'bioluminescence where none is expected',
    'evidence of a recent unseen event',
    'scale play—something tiny made monumental',
    'a stray animal behaving oddly',
    'architecture bleeding into nature',
    'light from two incompatible sources',
  ],
  reinterpretations: [
    'a mundane slice-of-life version of the topic',
    'a mythic or folkloric version of the topic',
    'a sci-fi reframing of the topic',
    'a horror-tinged version of the topic',
    'a tender romantic version of the topic',
    'a chaotic action-fragment version of the topic',
    'a minimalist version with few objects but strong mood',
    'a maximalist version overflowing with specific clutter',
  ],
  mandates: [
    'Push beyond the obvious first interpretation of the keywords.',
    'Surprise the viewer with at least one detail they would not expect.',
    'Avoid the most clichéd visual solution to this topic.',
    'Change the focal subject from what you would normally choose first.',
    'Open the description with an unusual detail, not a generic establishing line.',
    'Let one color or texture dominate unexpectedly.',
    'Make the scene feel like a specific place, not a stock backdrop.',
    'Give any person a specific job, habit, or tell visible in the frame.',
  ],
};

function randomInt(max: number): number {
  if (max <= 0) return 0;
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] % max;
}

function pick<T>(items: T[]): T {
  return items[randomInt(items.length)]!;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export type SubjectGender = 'women' | 'men' | 'mixed' | 'any';

const SUBJECTS_WOMEN = [
  'a young Black woman with box braids, a wide nose bridge, warm brown eyes set slightly apart, and gold hoop earrings',
  'a middle-aged Latina with gray-streaked waves, soft double chin, laugh lines, and a slightly crooked front tooth',
  'a pale red-haired woman in her thirties with dense freckles across one cheek, cropped copper hair, and thin lips',
  'a slender elderly East Asian woman with white hair in a loose bun, deep nasolabial folds, and reading glasses',
  'an older South Asian woman with silver-streaked hair, a soft rounded jaw, gentle hooded eyes, and henna on her palms',
  'a lithe Afro-Caribbean woman in her twenties with locs tied back, high cheekbones, and a gap between her front teeth',
  'a woman in her late thirties with curly auburn hair, a strong Roman nose, focused green eyes, and a faint forehead crease',
  'a woman in her forties with sharp cheekbones, dark tight curls, amber eyes, and a small mole beside her mouth',
  'a Southeast Asian woman in her late twenties with a short dark bob, monolid eyes, a soft chin, and sun-warmed skin',
  'a Middle Eastern woman in her thirties with olive skin, thick dark brows that nearly meet, and loosely pinned curls',
  'an Indigenous woman in her forties with twin braids, a broad nose, deep-set eyes, and weathered laugh lines',
  'a Nordic woman in her fifties with ice-blue eyes, fair weathered skin, a sharp jaw, and short ash-blonde hair',
  'a mixed-race woman in her twenties with coily dark hair, freckles on deep brown skin, and an asymmetrical smile',
  'a short stocky woman in her thirties with a buzzed undercut, round face, and bright hazel eyes',
  'a tall thin woman in her forties with a long aquiline nose, pale skin, and a severe center-part bun',
  'a Black woman in her fifties with close-cropped silver hair, bold cheekbones, and a calm heavy-lidded gaze',
  'a Latina teenager with a soft baby face, braces, dark wavy bangs, and a constellation of acne scars healing on her cheeks',
  'a white woman in her sixties with a soft jowl line, short steel-gray hair, and watery blue eyes',
  'a South Asian woman in her early twenties with a long braid, a small bindi, almond eyes, and a pointed chin',
  'a Polynesian woman in her thirties with sun-darkened skin, full cheeks, thick black hair in a low bun, and warm brown eyes',
  'a middle-aged white woman with a shaved head, strong brow, and quiet pale eyes',
];

const SUBJECTS_MEN = [
  'an elderly white man with a creased face, silver stubble, a bulbous nose, and work-worn hands',
  'a teenage East Asian man with messy hair, freckles across the nose, and a shy half-smile showing slightly uneven teeth',
  'a muscular Polynesian man with traditional arm tattoos, a broad flat nose, and sun-darkened skin',
  'a stocky Mediterranean man with olive skin, a thick beard, a square jaw, and deep-set brown eyes',
  'a heavyset middle-aged Black man with a bald head, warm expression, and soft folds at the neck',
  'a grizzled man with rope-scarred fingers, salt-and-pepper beard, squinting eyes, and a broken-capillary nose',
  'a retired boxer with a flattened nose, gray temples, cauliflower ear, and quiet stillness',
  'a man in his thirties with close-cropped hair, a sharp jawline, a thin scar through one eyebrow, and a steady gaze',
  'a South Asian man in his forties with thick dark hair, a soft belly under a shirt, and tired kind eyes',
  'a Latino man in his late twenties with dark curls, a soft rounded jaw, and a crooked smile',
  'a Middle Eastern man in his early thirties with dark stubble, a strong arched nose, and intent hazel eyes',
  'a Nordic man in his fifties with pale skin, cropped blond hair going thin, and a long angular face',
  'a Southeast Asian man in his twenties with tan skin, short black hair, a narrow face, and bright alert eyes',
  'a mixed-race man in his thirties with tight curls, freckled brown skin, and a wide easy mouth',
  'an Indigenous man in his forties with long black hair tied back, high cheekbones, and a weathered brow',
  'a thin elderly East Asian man with sparse white hair, deep wrinkles, and a small neat mustache',
  'a short compact white man in his twenties with a ginger beard, pale lashes, and a snub nose',
  'a tall lanky Black man in his forties with a salt-and-pepper goatee, narrow shoulders, and deep-set eyes',
  'a Mediterranean teenager with olive skin, a soft mustache just starting, and oversized ears',
  'a wheelchair-using man in his thirties with buzzed hair, sharp features, and a vintage bomber jacket',
  'a heavyset middle-aged man with a bald head, warm expression, and paint-stained apron',
  'a monk with a shaved head, deep brown robes, and ink-stained fingers',
];

const MINIMAL_HAIR_PATTERN = /\b(bald|balding|shaved|buzzed|monk|tonsure|hairless)\b/i;

const IDENTITY_WOMEN = SUBJECTS_WOMEN;
const IDENTITY_MEN = SUBJECTS_MEN;

/** Orthogonal face traits — composed into fresh identities so rolls do not cluster. */
const COMPOSE_ANCESTRY = [
  'Black',
  'Latina',
  'Latino',
  'East Asian',
  'South Asian',
  'Southeast Asian',
  'Middle Eastern',
  'Indigenous',
  'Polynesian',
  'Mediterranean',
  'Nordic',
  'Caribbean',
  'mixed-race',
  'white',
] as const;

const COMPOSE_AGE_WOMEN = [
  'in her early twenties',
  'in her late twenties',
  'in her early thirties',
  'in her late thirties',
  'in her forties',
  'in her fifties',
  'in her sixties',
] as const;

const COMPOSE_AGE_MEN = [
  'in his early twenties',
  'in his late twenties',
  'in his early thirties',
  'in his late thirties',
  'in his forties',
  'in his fifties',
  'in his sixties',
] as const;

const COMPOSE_FACE = [
  'a wide nose bridge and spaced-apart dark eyes',
  'a narrow aquiline nose and close-set hazel eyes',
  'asymmetric brows and a soft rounded jaw',
  'a square jaw, deep-set eyes, and a faint scar at the temple',
  'high cheekbones, monolid eyes, and a small mouth',
  'full cheeks, a short upturned nose, and freckles clustered on one cheek only',
  'a bulbous nose, thin lips, and heavy eyelids',
  'a long face, a strong chin cleft, and pale lashes',
  'a soft double chin, warm brown eyes, and a gentle crooked smile',
  'a pointed chin and arched brows that nearly meet',
  'a flattened boxer’s nose, gray at the temples, and quiet eyes',
  'a gap between the front teeth, round cheeks, and bright alert eyes',
  'deep nasolabial folds, watery blue eyes, and weather-creased skin',
  'a broad flat nose, full lips, and a calm heavy-lidded gaze',
  'a delicate jaw, sparse freckles, and slightly protruding ears',
] as const;

const COMPOSE_HAIR_WOMEN = [
  'box braids past the shoulders',
  'locs tied in a high bun',
  'a short natural afro going silver at the temples',
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

const COMPOSE_HAIR_MEN = [
  'close-cropped black hair',
  'a salt-and-pepper beard and thinning crown',
  'messy dark curls',
  'a neat fade with a soft mustache',
  'long black hair tied back',
  'a ginger beard and pale brows',
  'a bald head with gray stubble',
  'thick dark hair swept back',
  'a short ash-blonde cut going thin',
  'tight coils kept short',
  'a silver goatee and bare temples',
  'an undercut with longer wavy top',
] as const;

const COMPOSE_BODY_ARCHETYPES = [
  {
    height: 'very short',
    size: 'petite and slight',
    proportions: 'narrow shoulders, a short torso, and small hands',
    posture: 'an upright careful carriage',
    mark: 'knobby wrists',
  },
  {
    height: 'petite and short',
    size: 'soft and lightly padded',
    proportions: 'a soft belly, full upper arms, and short legs',
    posture: 'weight favored on one hip',
    mark: 'dimples at the lower back',
  },
  {
    height: 'average height',
    size: 'an everyday untrained build',
    proportions: 'even shoulders and hips with little waist definition',
    posture: 'a slight forward hunch from desk work',
    mark: 'a small belly pouch above the waistband',
  },
  {
    height: 'average height',
    size: 'solid and thick-set',
    proportions: 'a thick waist, sturdy calves, and heavy feet',
    posture: 'a grounded planted stance',
    mark: 'work-rough hands',
  },
  {
    height: 'tall',
    size: 'lean and rangy',
    proportions: 'long limbs, a short torso, and narrow hips',
    posture: 'an energetic forward lean',
    mark: 'a visible collarbone shadow',
  },
  {
    height: 'tall',
    size: 'plus-size with full arms and hips',
    proportions: 'wide hips, strong thighs, and a full bust or chest',
    posture: 'a loose easy slouch',
    mark: 'soft upper-arm fullness',
  },
  {
    height: 'very tall',
    size: 'narrow-framed and slight',
    proportions: 'long legs, angular collarbones, and long fingers',
    posture: 'a stiff straight spine',
    mark: 'slightly uneven shoulder height',
  },
  {
    height: 'average height',
    size: 'barrel-chested and broad',
    proportions: 'broad shoulders, a deep chest, and a thick neck',
    posture: 'an upright confident carriage',
    mark: 'defined forearm veins',
  },
  {
    height: 'short and compact',
    size: 'stocky and dense',
    proportions: 'short limbs, a deep torso, and thick ankles',
    posture: 'a careful cautious stance',
    mark: 'sun-weathered forearms',
  },
  {
    height: 'average height',
    size: 'heavyset with a full midsection',
    proportions: 'a soft double-chin tendency, full midsection, and heavy thighs',
    posture: 'rounded shoulders and a tucked chin',
    mark: 'a faded scar on one forearm',
  },
  {
    height: 'tall',
    size: 'endurance-lean without bulk',
    proportions: 'long legs, flat stomach, and wiry forearms',
    posture: 'a light ready stance',
    mark: 'long elegant fingers',
  },
  {
    height: 'petite and short',
    size: 'slim with little soft tissue',
    proportions: 'a flat chest, angular hips, and skinny calves',
    posture: 'a quiet contained posture',
    mark: 'knobby knees',
  },
] as const;

const recentIdentitySeeds: string[] = [];
const MAX_RECENT_IDENTITIES = 16;

function rememberIdentitySeed(seed: string): void {
  const trimmed = seed.trim();
  if (!trimmed) {
    return;
  }
  const next = [trimmed, ...recentIdentitySeeds.filter(entry => entry !== trimmed)];
  recentIdentitySeeds.length = 0;
  recentIdentitySeeds.push(...next.slice(0, MAX_RECENT_IDENTITIES));
}

function pickAvoidingRecent(candidates: readonly string[]): string {
  const fresh = candidates.filter(entry => !recentIdentitySeeds.includes(entry));
  const pool = fresh.length > 0 ? fresh : [...candidates];
  const chosen = pick(pool.length > 0 ? pool : ['a distinctive original person']);
  rememberIdentitySeed(chosen);
  return chosen;
}

function composeBodyBlock(): string {
  const body = pick([...COMPOSE_BODY_ARCHETYPES]);
  return `${body.height}, ${body.size}, ${body.proportions}, ${body.posture}, and ${body.mark}`;
}

function articleFor(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

function composeCharacterSubject(gender: SubjectGender, allowMinimalHair = false): string {
  const women = gender === 'women' || (gender === 'any' && Math.random() < 0.5);
  const noun = women ? 'woman' : 'man';
  const ancestry = pick([...COMPOSE_ANCESTRY]);
  // Avoid "Latina man" / "Latino woman" mismatches.
  const ancestryWord =
    ancestry === 'Latina' && !women
      ? 'Latino'
      : ancestry === 'Latino' && women
        ? 'Latina'
        : ancestry;
  const age = pick([...(women ? COMPOSE_AGE_WOMEN : COMPOSE_AGE_MEN)]);
  const face = pick([...COMPOSE_FACE]);
  let hair = pick([...(women ? COMPOSE_HAIR_WOMEN : COMPOSE_HAIR_MEN)]);
  if (!allowMinimalHair && MINIMAL_HAIR_PATTERN.test(hair)) {
    hair = women ? 'loose gray-streaked waves' : 'thick dark hair swept back';
  }
  const body = composeBodyBlock();
  return `${articleFor(ancestryWord)} ${ancestryWord} ${noun} ${age} with ${face}, ${hair}, and a body that is ${body}`;
}

const ATHLETIC_IDENTITY_EXCLUDE =
  /\b(?:pregnant|school-age|child|kid|toddler|infant|monk|nun|girl with|boy with|elderly|older|retired|teenage|teen\b|grizzled|reading glasses)\b/i;

const ATHLETIC_COMPETITION_IDENTITY_WOMEN = [
  'a young Black woman with box braids, high cheekbones, warm brown eyes, and an endurance-toned build',
  'a Latina woman in her thirties with dark wavy hair, strong jaw, and sun-warmed skin',
  'a pale red-haired woman in her thirties, light freckles, and cropped copper hair',
  'an East Asian woman in her twenties with a sleek black ponytail, sharp cheekbones, and focused eyes',
  'a South Asian woman in her late twenties with a long braid, warm brown eyes, and defined cheekbones',
  "a white woman in her forties with sun-weathered skin, a blonde braid, and crow's-feet at the eyes",
  'a mixed-race woman in her twenties with curly dark hair, amber eyes, and an athletic frame',
  'an Indigenous woman in her thirties with thick black hair in twin braids and high cheekbones',
  'a Middle Eastern woman in her twenties with olive skin, dark curls, and steady gaze',
  'a Nordic woman in her thirties with fair skin, ice-blue eyes, and closely cropped sides',
  'a Black woman in her forties with close-cropped natural hair, bold cheekbones, and a powerful jaw',
  'a Southeast Asian woman in her late twenties with tan skin, a short dark bob, and bright eyes',
  'a Mediterranean woman in her early thirties with chestnut waves, olive skin, and angular features',
  'a woman in her late thirties with curly auburn hair, focused eyes, and strong cheekbones',
];

const ATHLETIC_COMPETITION_IDENTITY_MEN = [
  'a Black man in his thirties with close-cropped hair, high cheekbones, and a lean endurance build',
  'a Latino man in his late twenties with dark curls, square jaw, and sun-bronzed skin',
  'a white man in his thirties with sandy blond stubble, gray-green eyes, and a rangy build',
  'an East Asian man in his twenties with messy black hair, sharp jawline, and alert eyes',
  'a South Asian man in his thirties with thick dark hair, warm brown skin, and steady gaze',
  'a Polynesian man in his late twenties with traditional arm tattoos, broad shoulders, and sun-darkened skin',
  'a Mediterranean man in his thirties with olive skin, thick beard, and a compact powerful frame',
  'a mixed-race man in his twenties with tight curls, hazel eyes, and long-limbed posture',
  'a Middle Eastern man in his early thirties with dark stubble, strong nose, and intent eyes',
  'a Nordic man in his thirties with pale skin, cropped blond hair, and sharp cheekbones',
  'a Southeast Asian man in his late twenties with tan skin, short black hair, and defined jaw',
  "a man in his forties with salt-and-pepper temples, weathered smile lines, and a wiry racer's build",
  'a stocky man in his thirties with a shaved head, brown eyes, and thick neck muscles',
  'a lean man in his twenties with a sharp jawline, auburn buzz cut, and freckles across his nose',
];

export function pickDistinctIdentitySeeds(
  count: number,
  gender: SubjectGender = 'any',
  options: { allowMinimalHair?: boolean; athletic?: boolean } = {}
): string[] {
  if (gender === 'mixed' && count >= 2) {
    return pickDistinctFromPool(
      count,
      [...ATHLETIC_COMPETITION_IDENTITY_MEN, ...ATHLETIC_COMPETITION_IDENTITY_WOMEN],
      options
    ).slice(0, 2);
  }

  const pool = options.athletic
    ? gender === 'women'
      ? ATHLETIC_COMPETITION_IDENTITY_WOMEN
      : gender === 'men'
        ? ATHLETIC_COMPETITION_IDENTITY_MEN
        : [...ATHLETIC_COMPETITION_IDENTITY_WOMEN, ...ATHLETIC_COMPETITION_IDENTITY_MEN]
    : gender === 'women'
      ? IDENTITY_WOMEN
      : gender === 'men'
        ? IDENTITY_MEN
        : [...IDENTITY_WOMEN, ...IDENTITY_MEN];

  return pickDistinctFromPool(count, pool, options);
}

function pickDistinctFromPool(
  count: number,
  pool: readonly string[],
  options: { allowMinimalHair?: boolean; athletic?: boolean }
): string[] {
  const filtered = filterIdentityPool(pool, options);
  const shuffled = shuffle(filtered.length > 0 ? filtered : [...pool]);
  const picked: string[] = [];

  for (const entry of shuffled) {
    if (picked.length >= count) {
      break;
    }
    if (!picked.includes(entry)) {
      picked.push(entry);
    }
  }

  return picked;
}

function filterIdentityPool(
  pool: readonly string[],
  options: { allowMinimalHair?: boolean; athletic?: boolean }
): string[] {
  return pool.filter(entry => {
    if (options.athletic && ATHLETIC_IDENTITY_EXCLUDE.test(entry)) {
      return false;
    }
    if (!options.allowMinimalHair && MINIMAL_HAIR_PATTERN.test(entry)) {
      return false;
    }
    return true;
  });
}

export function pickDistinctSubjects(count: number, gender: SubjectGender = 'any'): string[] {
  if (gender === 'mixed' && count >= 2) {
    return [composeCharacterSubject('men'), composeCharacterSubject('women')];
  }

  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(composeCharacterSubject(gender === 'any' ? (i % 2 === 0 ? 'women' : 'men') : gender));
  }
  return out;
}

function filterHairPreference(pool: readonly string[], allowMinimalHair: boolean): string[] {
  if (allowMinimalHair) {
    return [...pool];
  }

  return pool.filter(entry => !MINIMAL_HAIR_PATTERN.test(entry));
}

export function pickCharacterSubject(
  gender: SubjectGender = 'any',
  allowMinimalHair = false
): string {
  // Prefer composed identities so consecutive rolls do not collapse to the same 8 faces.
  if (Math.random() < 0.72) {
    const composed = composeCharacterSubject(gender, allowMinimalHair);
    rememberIdentitySeed(composed);
    return composed;
  }

  const pool =
    gender === 'women'
      ? SUBJECTS_WOMEN
      : gender === 'men'
        ? SUBJECTS_MEN
        : [...SUBJECTS_WOMEN, ...SUBJECTS_MEN];

  const filtered = filterHairPreference(pool, allowMinimalHair);
  const fallback = filterHairPreference([...SUBJECTS_WOMEN, ...SUBJECTS_MEN], allowMinimalHair);
  const candidates = filtered.length > 0 ? filtered : fallback;

  const base = pickAvoidingRecent(
    candidates.length > 0 ? candidates : [...SUBJECTS_WOMEN, ...SUBJECTS_MEN]
  );
  // Curated face lines are face-heavy — always attach a concrete body block.
  if (/\b(body that is|very short|petite and short|average height|very tall)\b/i.test(base)) {
    return base;
  }
  const withBody = `${base}, with a body that is ${composeBodyBlock()}`;
  rememberIdentitySeed(withBody);
  return withBody;
}

function sessionNonce(): string {
  const array = new Uint32Array(2);
  crypto.getRandomValues(array);
  return `${array[0]!.toString(36)}-${array[1]!.toString(36)}`;
}

export function buildVariationSeed(
  strength = 65,
  options: {
    distinctPeople?: boolean;
    impliedPeopleCount?: number | null;
    gender?: SubjectGender;
  } = {}
): string {
  const parts: string[] = [];
  const wild = strength >= 75;
  const chaos = strength >= 90;
  const distinctPeople = options.distinctPeople ?? false;
  const peopleCount = options.impliedPeopleCount ?? null;
  const gender = options.gender ?? 'any';

  parts.push(`Light the scene with ${pick(POOLS.lighting)}.`);
  parts.push(`Color palette leaning toward ${pick(POOLS.palette)}.`);
  parts.push(`Compose it as ${pick(POOLS.framing)}.`);
  parts.push(`Atmosphere: ${pick(POOLS.atmosphere)}.`);

  if (!distinctPeople && peopleCount !== null && peopleCount >= 2) {
    if (gender === 'women') {
      parts.push(
        'Describe two women together as one unified subject—not split into separate catalog entries.'
      );
    } else if (gender === 'men') {
      parts.push(
        'Describe two men together as one unified subject—not split into separate catalog entries.'
      );
    } else {
      parts.push(
        'Describe the pair as one unified couple or ensemble—not separate Person A and Person B.'
      );
    }
  } else if (distinctPeople && peopleCount !== null && peopleCount >= 2) {
    const castGender = gender === 'mixed' ? 'mixed' : gender;
    const subjects = pickDistinctSubjects(Math.min(peopleCount, 4), castGender);
    parts.push(
      `Cast each person separately: ${subjects.map((subject, index) => `person ${index + 1} like ${subject}`).join('; ')}.`
    );
    if (gender === 'women') {
      parts.push('Both people must be women.');
    } else if (gender === 'men') {
      parts.push('Both people must be men.');
    }
    parts.push(
      'Describe every person with their own face, body, clothing, and pose—never one merged couple or blob.'
    );
  } else if (strength >= 35) {
    parts.push(
      `If people belong in the scene, imagine someone like ${pick(POOLS.subjects)}—specific, not generic.`
    );
  }

  if (wild) {
    if (!(distinctPeople && peopleCount !== null && peopleCount >= 2)) {
      parts.push(
        `Or someone utterly unlike prior outputs, such as ${pick(POOLS.subjects)}—choose one and commit fully.`
      );
    }
    parts.push(`Visual style: ${pick(POOLS.styles)}.`);
    parts.push(`Era or world texture: ${pick(POOLS.eras)}.`);
    parts.push(`Camera feel: ${pick(POOLS.lenses)}.`);
    parts.push(`Weave in an unexpected detail: ${pick(POOLS.twists)}.`);
    parts.push(`Reinterpret the topic as ${pick(POOLS.reinterpretations)}.`);
    parts.push(pick(POOLS.mandates));
  }

  if (distinctPeople && peopleCount === null) {
    parts.push(
      'If more than one person appears, split them into fully separate individuals with contrasting details.'
    );
  }

  if (chaos) {
    parts.push(pick(POOLS.mandates));
    parts.push(pick(POOLS.mandates));
    parts.push(
      'Radically invent—never reuse default faces, couples, alley cats, beach walkers, or prior sentence structures.'
    );
    parts.push(
      'Vary who is centered, what action is happening, and how the scene opens from any previous generation.'
    );
    parts.push(`One-off composition id ${sessionNonce()}—must read as a unique image.`);
  } else if (strength >= 50) {
    parts.push(
      'Invent a fresh scene—vary age, ethnicity, body type, hair, clothing, and expression from prior generations.'
    );
  }

  return parts.join(' ');
}

export function buildVariationSystemAddendum(strength: number): string {
  if (strength < 55) {
    return '';
  }

  const lines = [pick(POOLS.mandates)];

  if (strength >= 75) {
    lines.push(
      'Treat repeated keywords as an excuse to explore a new angle, not to repeat prior wording or cast.'
    );
    lines.push(pick(POOLS.reinterpretations));
  }

  if (strength >= 90) {
    lines.push(
      'Maximize novelty: different opening line, different hero subject, different emotional temperature than your default.'
    );
  }

  return lines.join(' ');
}

export function pickFewShotExamples<T>(examples: T[], strength = 65, enabled = true): T[] {
  if (!enabled) {
    return examples;
  }

  if (strength >= 90) {
    return [];
  }

  if (strength >= 75) {
    return shuffle(examples).slice(0, 1);
  }

  if (strength <= 25) {
    return examples;
  }

  if (strength <= 50) {
    return shuffle(examples).slice(0, Math.min(3, examples.length));
  }

  return shuffle(examples).slice(0, Math.min(2, examples.length));
}

export function buildTemplateVariation(
  strength = 65,
  distinctPeople = false,
  impliedPeopleCount: number | null = null,
  gender: SubjectGender = 'any'
): string {
  const parts: string[] = [
    capitalize(pick(POOLS.lighting)),
    `Palette favors ${pick(POOLS.palette)}.`,
    `Mood feels ${pick(POOLS.atmosphere)}.`,
  ];

  if (distinctPeople && impliedPeopleCount !== null && impliedPeopleCount >= 2) {
    const castGender = gender === 'mixed' ? 'mixed' : gender;
    const subjects = pickDistinctSubjects(Math.min(impliedPeopleCount, 2), castGender);
    parts.push(
      `One figure resembles ${subjects[0]}; the other is clearly different—like ${subjects[1] ?? pick(POOLS.subjects)}—each described separately.`
    );
  } else if (!distinctPeople && impliedPeopleCount !== null && impliedPeopleCount >= 2) {
    parts.push('The pair reads as one unified subject in the frame.');
  } else if (strength >= 45) {
    parts.push(
      `Figures, if any, resemble ${pick(POOLS.subjects)} with concrete, distinct features.`
    );
  }

  if (strength >= 75) {
    parts.push(`Style leans ${pick(POOLS.styles)}.`);
    parts.push(`Include ${pick(POOLS.twists)}.`);
    parts.push(pick(POOLS.reinterpretations));
  }

  if (strength >= 90) {
    parts.push(`Also consider ${pick(POOLS.subjects)} instead of a generic default.`);
    parts.push(pick(POOLS.mandates));
  }

  return parts.join(' ');
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function getSamplingBoost(strength: number): {
  temperatureBoost: number;
  topP: number;
  frequencyPenalty: number;
  presencePenalty: number;
} {
  const t = strength / 100;

  return {
    temperatureBoost: t * 0.55,
    topP: 0.88 + t * 0.11,
    frequencyPenalty: t * 0.65,
    presencePenalty: t * 0.75,
  };
}
