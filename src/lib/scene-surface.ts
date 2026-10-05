/**
 * What a setting has to lie, sit, kneel and lean on — so a pose sentence never names furniture the
 * place does not have. Day draws an Everyday / Suggestive beat and its setting separately, and the
 * beat names its own furniture: "lying on her side on the sofa" went out with "busy plaza with a
 * fountain and café umbrellas" (Castcut_02403, 2026-10-05) and a bed or sofa was painted onto the
 * street. A lying pose also has no place on a street or in a café at all.
 *
 * Pure text: `sceneVenue` reads the kind of place from the Setting, `sceneSurfaces` names what to
 * use there, `fitBeatToSetting` rewrites a beat's furniture (and a lying pose the place cannot host
 * becomes a sit), and `sceneSurfaceConflicts` finds what is still wrong in a finished prompt (the
 * queue-time audit, still-prompt-audit.ts).
 */
import { stripNegatedClauses } from './negated-clauses';

export type SceneVenue =
  | 'bedroom'
  | 'living'
  | 'kitchen'
  | 'bathroom'
  | 'hall'
  | 'hotel'
  | 'cafe'
  | 'restaurant'
  | 'bar'
  | 'shop'
  | 'library'
  | 'museum'
  | 'cinema'
  | 'office'
  | 'studio'
  | 'gym'
  | 'spa'
  | 'transit'
  | 'street'
  | 'plaza'
  | 'market'
  | 'park'
  | 'beach'
  | 'pool'
  | 'water'
  | 'trail'
  | 'rooftop'
  | 'balcony';

export type ScenePosture = 'lie' | 'sit' | 'kneel' | 'lean';

const OUTDOOR: ReadonlySet<SceneVenue> = new Set([
  'street',
  'plaza',
  'market',
  'park',
  'beach',
  'pool',
  'water',
  'trail',
  'rooftop',
  'balcony',
]);

/**
 * Setting words → the kind of place, first match wins. Rooms come first ("kitchen lit only by the
 * open fridge"), then the outdoor places that carry café or restaurant words of their own ("busy
 * plaza with a fountain and café umbrellas", "café corner on a city street", "lamplit street of
 * restaurants"), then cafés, bars and restaurants ("seaside café terrace", "waterfront restaurant
 * terrace" are the café, not the shore), then the rest.
 */
/** Race courses and sport sectors: the sport's own ground, not a place to furnish. */
const SPORT_COURSE_RE = /\b(?:sector|course|circuit|velodrome|piste|salle|apparatus\s+hall)\b/i;

const CAFE = String.raw`caf(?:e|é)(?![\w])`;
const VENUE_RULES: ReadonlyArray<[SceneVenue, RegExp]> = [
  ['pool', /(?<!tide-)\b(?:pool(?:side)?|swimming\s+pool|lido)\b/i],
  ['bathroom', /\b(?:bathroom|bath\s*tub|shower|vanity\s+lights?|powder\s+room)\b/i],
  ['bedroom', /\b(?:bedroom|bed|bedside|loft\s+bed|dorm\s+room|guest\s+room)\b/i],
  ['hotel', /\b(?:hotel\s+(?:room|suite|bed)|suite|motel|chalet)\b/i],
  ['kitchen', /\b(?:kitchen|pantry|fridge)\b/i],
  ['shop', /\bbook(?:store|shop)\b/i],
  [
    'living',
    /\b(?:living[- ]room|lounge\s+room|den|sofa|couch|reading\s+nook|home\s+office|fireplace)\b/i,
  ],
  ['hall', /\b(?:hallway|entryway|front\s+door|stairwell|landing)\b/i],
  ['plaza', /\b(?:plaza|piazza|square|fountain)\b/i],
  [
    'market',
    /\b(?:(?:farmers?|night|flea|flower|outdoor|open-air)\s+market|market\s+(?:stalls?|square|alley)|street\s+stall|food\s+trucks?)\b/i,
  ],
  ['beach', /\b(?:beach|sand(?:y|s)?|shore(?:line)?|cove|surf(?:\s+break)?|dunes?)\b/i],
  ['transit', /\b(?:taxi|back\s+seat|cab\s+ride)\b/i],
  [
    'street',
    /\b(?:street|sidewalk|pavement|crosswalk|crossing|alley(?:way)?|avenue|boulevard|block|downtown|bike\s+lane|road|promenade|boardwalk|bridge|stoop|steps|staircase|stairs|stairway|subway\s+exit|bus\s+stop|cobblestones?|parking\s+lot|car\s+park)\b/i,
  ],
  ['studio', /\b(?:studio|rehearsal|dojo)\b/i],
  [
    'cafe',
    new RegExp(
      String.raw`\b(?:${CAFE}|coffee\s+(?:shop|bar)|bakery|brunch|diner|juice\s+bar|tea\s*room|patisserie)`,
      'i'
    ),
  ],
  [
    'restaurant',
    /\b(?:restaurant|trattoria|bistro|brasserie|dinner\s+table|dining\s+room|ramen|sushi)\b/i,
  ],
  ['bar', /\b(?:bar|pub|cocktail|club|nightclub|dance\s+floor|speakeasy|karaoke)\b/i],
  [
    'water',
    /\b(?:pier|dock|jetty|marina|harbou?r|boat|ferry|cruise|kayak|deck\s+of|lake(?:side)?|canal|riverbank)\b/i,
  ],
  ['rooftop', /\b(?:rooftop|roof\s+terrace|roof)\b/i],
  ['balcony', /\b(?:balcony|patio|veranda|porch|terrace)\b/i],
  [
    'park',
    /\b(?:park|lawn|garden|meadow|field|orchard|vineyard|picnic|grass|botanical|greenhouse|courtyard)\b/i,
  ],
  [
    'trail',
    /\b(?:trail|hike|hiking|forest|woods|woodland|mountain|hillside|cliff|canyon|summit|ridge|valley|waterfall|campsite|campfire)\b/i,
  ],
  ['spa', /\b(?:spa|sauna|hot\s+spring|onsen|massage)\b/i],
  [
    'gym',
    /\b(?:gym|weight\s+room|fitness|climbing\s+wall|boxing|locker\s+room|track|court|pitch|rink|stadium)\b/i,
  ],
  ['bar', /\blounge\b/i],
  ['library', /\b(?:library|reading\s+room|study\s+hall)\b/i],
  ['museum', /\b(?:museum|gallery|exhibition)\b/i],
  ['cinema', /\b(?:cinema|theatre|theater|movie)\b/i],
  ['office', /\b(?:office|cowork\w*|desk|workspace|meeting\s+room)\b/i],
  [
    'shop',
    /\b(?:shop|store|boutique|record\s+shop|florist|laundromat|post\s+office|mall|salon|barber|pharmacy|supermarket|grocery)\b/i,
  ],
  [
    'transit',
    /\b(?:station|airport|terminal|train|bus|subway\s+car|tram|elevator|lift\s+lobby|platform)\b/i,
  ],
  // A home with no room named: "apartment rooftop" is the rooftop (above), "quiet apartment" a room.
  ['living', /\b(?:apartment|flat|home|loft)\b/i],
];

/** The kind of place a Setting is, or null when the words name none of them. */
export function sceneVenue(setting: string | null | undefined): SceneVenue | null {
  const text = stripNegatedClauses(setting ?? '').replace(/\s*[—–-]\s*indoor only\b.*$/i, '');
  if (!text.trim() || SPORT_COURSE_RE.test(text)) return null;
  // "hotel room with the balcony door open" is the room; "rooftop bar" is the rooftop.
  for (const [venue, re] of VENUE_RULES) {
    if (re.test(text)) return venue;
  }
  return null;
}

export function sceneVenueIsOutdoor(venue: SceneVenue | null): boolean {
  return venue !== null && OUTDOOR.has(venue);
}

export type SceneSurfaces = {
  /** Where she lies — null when the place has nowhere to lie (a street, a café). */
  lie: string | null;
  sit: string;
  kneel: string;
  lean: string;
  /** "floor" indoors, "ground" / "grass" / "sand" outside. */
  ground: string;
};

const VENUE_SURFACES: Record<SceneVenue, SceneSurfaces> = {
  bedroom: {
    lie: 'on the bed',
    sit: 'on the edge of the bed',
    kneel: 'on the rug',
    lean: 'against the wall',
    ground: 'floor',
  },
  living: {
    lie: 'on the sofa',
    sit: 'on the sofa',
    kneel: 'on the rug',
    lean: 'against the wall',
    ground: 'floor',
  },
  kitchen: {
    lie: null,
    sit: 'on a stool at the counter',
    kneel: 'on the kitchen floor',
    lean: 'against the counter',
    ground: 'floor',
  },
  bathroom: {
    lie: null,
    sit: 'on the edge of the bathtub',
    kneel: 'on the bath mat',
    lean: 'against the sink counter',
    ground: 'floor',
  },
  hall: {
    lie: null,
    sit: 'on the bottom stair',
    kneel: 'on the hallway floor',
    lean: 'against the wall',
    ground: 'floor',
  },
  hotel: {
    lie: 'on the bed',
    sit: 'on the edge of the bed',
    kneel: 'on the rug',
    lean: 'against the wall',
    ground: 'floor',
  },
  cafe: {
    lie: null,
    sit: 'on a chair at a café table',
    kneel: 'on one knee by the table',
    lean: 'against the counter',
    ground: 'floor',
  },
  restaurant: {
    lie: null,
    sit: 'on a chair at the table',
    kneel: 'on one knee by the table',
    lean: 'against the wall',
    ground: 'floor',
  },
  bar: {
    lie: null,
    sit: 'on a bar stool',
    kneel: 'on one knee by the bar',
    lean: 'against the bar',
    ground: 'floor',
  },
  shop: {
    lie: null,
    sit: 'on a low bench in the shop',
    kneel: 'on one knee on the shop floor',
    lean: 'against a shelf',
    ground: 'floor',
  },
  library: {
    lie: null,
    sit: 'in a reading chair',
    kneel: 'on one knee by the shelves',
    lean: 'against the shelves',
    ground: 'floor',
  },
  museum: {
    lie: null,
    sit: 'on a gallery bench',
    kneel: 'on one knee on the gallery floor',
    lean: 'against the wall',
    ground: 'floor',
  },
  cinema: {
    lie: null,
    sit: 'on a bench in the lobby',
    kneel: 'on one knee on the lobby floor',
    lean: 'against the wall',
    ground: 'floor',
  },
  office: {
    lie: null,
    sit: 'on a desk chair',
    kneel: 'on one knee by the desk',
    lean: 'against the desk',
    ground: 'floor',
  },
  studio: {
    lie: 'on a mat on the studio floor',
    sit: 'on the studio floor',
    kneel: 'on the studio floor',
    lean: 'against the wall',
    ground: 'floor',
  },
  gym: {
    lie: 'on a mat',
    sit: 'on a bench',
    kneel: 'on a mat',
    lean: 'against the wall',
    ground: 'floor',
  },
  spa: {
    lie: 'on a lounger',
    sit: 'on a lounger',
    kneel: 'on a mat',
    lean: 'against the wall',
    ground: 'floor',
  },
  transit: {
    lie: null,
    sit: 'in a seat',
    kneel: 'on one knee on the platform',
    lean: 'against a pillar',
    ground: 'floor',
  },
  street: {
    lie: null,
    sit: 'on a low step',
    kneel: 'on one knee on the pavement',
    lean: 'against a wall',
    ground: 'pavement',
  },
  plaza: {
    lie: null,
    sit: 'on a bench',
    kneel: 'on one knee on the paving',
    lean: 'against a lamppost',
    ground: 'paving',
  },
  market: {
    lie: null,
    sit: 'on a bench',
    kneel: 'on one knee by the crates',
    lean: 'against a stall',
    ground: 'ground',
  },
  park: {
    lie: 'on the grass',
    sit: 'on the grass',
    kneel: 'on the grass',
    lean: 'against a tree',
    ground: 'grass',
  },
  beach: {
    lie: 'on a towel on the sand',
    sit: 'on a towel on the sand',
    kneel: 'in the sand',
    lean: 'against a palm tree',
    ground: 'sand',
  },
  pool: {
    lie: 'on a sun lounger',
    sit: 'on the pool edge',
    kneel: 'on the pool deck',
    lean: 'against the pool rail',
    ground: 'pool deck',
  },
  water: {
    lie: 'on the deck',
    sit: 'on the edge of the dock',
    kneel: 'on the deck',
    lean: 'against the railing',
    ground: 'deck',
  },
  trail: {
    lie: 'on the grass beside the trail',
    sit: 'on a rock',
    kneel: 'on the trail',
    lean: 'against a tree',
    ground: 'ground',
  },
  rooftop: {
    lie: 'on a lounger',
    sit: 'on a lounge chair',
    kneel: 'on the rooftop deck',
    lean: 'against the railing',
    ground: 'deck',
  },
  balcony: {
    lie: 'on a lounger',
    sit: 'on a chair',
    kneel: 'on the balcony floor',
    lean: 'against the railing',
    ground: 'floor',
  },
};

/**
 * What to lie, sit, kneel and lean on in this Setting, or null for a Setting with no known place.
 * Something the Setting names to sit on wins ("… with a fountain" → the fountain's edge).
 */
export function sceneSurfaces(setting: string | null | undefined): SceneSurfaces | null {
  const venue = sceneVenue(setting);
  if (!venue) return null;
  const base = VENUE_SURFACES[venue];
  const text = (setting ?? '').toLowerCase();
  const named = (re: RegExp) => re.test(text);
  let sit = base.sit;
  let lie = base.lie;
  if (named(/\bfountain\b/) && (venue === 'plaza' || venue === 'park'))
    sit = "on the fountain's edge";
  else if (named(/\bbench(?:es)?\b/)) sit = 'on the bench';
  else if (named(/\b(?:steps|stoop|stairs|staircase)\b/) && OUTDOOR.has(venue))
    sit = 'on the steps';
  else if (named(/\bbooth\b/) && (venue === 'cafe' || venue === 'restaurant' || venue === 'bar')) {
    sit = 'in the booth';
  } else if (named(/\bwindow\s+seat\b/)) sit = 'in the window seat';
  if (named(/\b(?:loungers?|chaise|daybed)\b/) && lie) lie = 'on a lounger';
  if (named(/\bpicnic\s+blanket\b/) && venue === 'park') lie = 'on the picnic blanket';
  // On the water there is somewhere to lie only on a deck or a pier, not a harbour wall.
  if (venue === 'water') {
    lie = named(/\b(?:deck|boat|cruise|ferry)\b/)
      ? 'on the deck'
      : named(/\b(?:pier|dock|jetty)\b/)
        ? 'on the pier boards'
        : null;
    if (named(/\b(?:pier|dock|jetty)\b/)) sit = 'on the edge of the pier';
    else if (named(/\bwall\b/)) sit = 'on the harbour wall';
    else if (named(/\b(?:deck|boat|cruise|ferry)\b/)) sit = 'on the deck';
  }
  // Inside a car or carriage there is no platform underfoot.
  const kneel =
    venue === 'transit' &&
    named(/\b(?:car|carriage|cabin|coach|bus|tram|train)\b/) &&
    !named(/\b(?:platform|stop|station)\b/)
      ? 'on one knee on the floor of the carriage'
      : base.kneel;
  return { ...base, sit, lie, kneel };
}

// ── Surfaces a pose sentence names ────────────────────────────────────────────────────────

export type SurfaceKind =
  | 'bed'
  | 'sofa'
  | 'armchair'
  | 'rug'
  | 'floor'
  | 'grass'
  | 'sand'
  | 'beach-towel'
  | 'blanket'
  | 'mat'
  | 'lounger'
  | 'bench'
  | 'counter'
  | 'desk'
  | 'kitchen-table'
  | 'stool'
  | 'curb'
  | 'bathtub'
  | 'booth'
  | 'windowsill';

const ALL_INDOOR: readonly SceneVenue[] = [
  'bedroom',
  'living',
  'kitchen',
  'bathroom',
  'hall',
  'hotel',
  'cafe',
  'restaurant',
  'bar',
  'shop',
  'library',
  'museum',
  'cinema',
  'office',
  'studio',
  'gym',
  'spa',
  'transit',
];

/** Where each piece of furniture or ground can be. Kinds not listed fit anywhere (a chair, a wall). */
const SURFACE_VENUES: Record<SurfaceKind, readonly SceneVenue[]> = {
  bed: ['bedroom', 'hotel'],
  sofa: ['living', 'bedroom', 'hotel', 'cafe', 'bar', 'library', 'office', 'studio', 'spa'],
  armchair: ['living', 'bedroom', 'hotel', 'cafe', 'bar', 'library', 'office', 'shop', 'spa'],
  rug: ['living', 'bedroom', 'hotel', 'hall', 'studio', 'office', 'library', 'shop'],
  floor: [...ALL_INDOOR, 'balcony'],
  grass: ['park', 'trail'],
  sand: ['beach'],
  'beach-towel': ['beach', 'pool'],
  blanket: ['park', 'beach', 'rooftop', 'trail', 'living', 'bedroom', 'hotel', 'balcony'],
  mat: [
    'studio',
    'gym',
    'park',
    'beach',
    'living',
    'bedroom',
    'hotel',
    'rooftop',
    'balcony',
    'trail',
    'bathroom',
    'hall',
    'spa',
  ],
  lounger: [
    'pool',
    'beach',
    'rooftop',
    'balcony',
    'hotel',
    'spa',
    'water',
    'studio',
    'living',
    'bedroom',
    'park',
  ],
  bench: [
    'park',
    'plaza',
    'street',
    'market',
    'trail',
    'museum',
    'gym',
    'transit',
    'shop',
    'library',
    'beach',
    'rooftop',
    'pool',
    'water',
    'cinema',
    'hall',
    'spa',
    'studio',
    'bar',
    'restaurant',
    'cafe',
  ],
  counter: ['kitchen', 'cafe', 'bar', 'restaurant', 'shop', 'bathroom', 'hotel'],
  desk: ['office', 'bedroom', 'living', 'library', 'hotel', 'studio', 'shop'],
  'kitchen-table': ['kitchen', 'living'],
  stool: ['bar', 'cafe', 'kitchen', 'restaurant', 'studio', 'shop'],
  curb: ['street', 'plaza', 'market'],
  bathtub: ['bathroom', 'hotel', 'spa'],
  booth: ['cafe', 'restaurant', 'bar'],
  windowsill: [...ALL_INDOOR, 'balcony'],
};

/**
 * One piece of furniture or ground after a preposition: "on the sofa", "across the hotel bed",
 * "on the living-room floor", "in an armchair", "on a picnic blanket". Up to two describing words
 * before the noun. `dance floor`, `gym floor` and `forest floor` are places, not furniture.
 */
const SURFACE_PHRASE_RE =
  /\b(?:on|onto|across|in|into|along|over|off|at)\s+(?:the|a|an|her|his|their)\s+((?:(?!(?:at|on|in|of|the|a|an|to|by|with|and|or)\b)[\w’'-]+\s+){0,2}?)(bed(?:\s+edge)?|mattress|sheets|covers|duvet|sofa|couch|loveseat|armchair|rug|carpet|floor|grass|lawn|sand|beach\s+towel|picnic\s+blanket|blanket|(?:yoga\s+|bath\s+)?mat|lounger|sun\s*lounger|chaise|bench|counter\s+stool|counter(?:top)?|desk|kitchen\s+table|bar\s+stool|stool|curb|kerb|bath\s*tub|tub|booth|windowsill|window\s+sill|sill)\b(?![\s-]+(?:stool|chair|seat|cushion|lamp|rung|lights?)\b)/gi;

function surfaceKind(noun: string, describing: string): SurfaceKind | null {
  const n = noun.toLowerCase().replace(/\s+/g, ' ');
  const d = describing.toLowerCase();
  if (/^(?:bed(?: edge)?|mattress|sheets|covers|duvet)$/.test(n)) return 'bed';
  if (/^(?:sofa|couch|loveseat)$/.test(n)) return 'sofa';
  if (n === 'armchair') return 'armchair';
  if (/^(?:rug|carpet)$/.test(n)) return 'rug';
  if (n === 'floor') {
    // "the dance floor", "the gym floor", "the forest floor" are the place itself.
    return /\b(?:dance|gym|forest|shop|studio|gallery|ocean|sea|valley)\b/.test(d) ? null : 'floor';
  }
  if (/^(?:grass|lawn)$/.test(n)) return 'grass';
  if (n === 'sand') return 'sand';
  if (n === 'beach towel') return 'beach-towel';
  if (/^(?:lounger|sun ?lounger|chaise)$/.test(n)) return 'lounger';
  if (n === 'bench') return /\b(?:gallery|weight|piano|workout)\b/.test(d) ? null : 'bench';
  if (/^counter(?:top)?$/.test(n)) return 'counter';
  if (n === 'desk') return 'desk';
  if (n === 'kitchen table') return 'kitchen-table';
  if (/^(?:bar stool|counter stool|stool)$/.test(n)) return 'stool';
  if (/^(?:picnic blanket|blanket)$/.test(n)) return 'blanket';
  if (/^(?:yoga mat|bath mat|mat)$/.test(n)) return /\b(?:door|welcome)\b/.test(d) ? null : 'mat';
  if (/^(?:curb|kerb)$/.test(n)) return 'curb';
  if (/^(?:bath ?tub|tub)$/.test(n)) return /\bhot\b/.test(d) ? null : 'bathtub';
  if (n === 'booth') return /\b(?:photo|listening|ticket)\b/.test(d) ? null : 'booth';
  if (/^(?:windowsill|window sill|sill)$/.test(n)) return 'windowsill';
  return null;
}

export type PoseSurface = {
  /** The whole phrase ("on the sofa"). */
  phrase: string;
  index: number;
  kind: SurfaceKind;
};

/** Every piece of furniture or ground the text puts her on (negated clauses left out). */
export function poseSurfaces(text: string): PoseSurface[] {
  const found: PoseSurface[] = [];
  for (const match of text.matchAll(SURFACE_PHRASE_RE)) {
    const before = text.slice(Math.max(0, (match.index ?? 0) - 90), match.index ?? 0);
    if (/\b(?:never|not|no|without)\b[^.,;:—\n]*$/i.test(before)) continue;
    const kind = surfaceKind(match[2]!, match[1] ?? '');
    if (kind) found.push({ phrase: match[0], index: match.index ?? 0, kind });
  }
  return found;
}

/** True when this furniture or ground can be in this kind of place. */
export function surfaceFitsVenue(kind: SurfaceKind, venue: SceneVenue): boolean {
  return SURFACE_VENUES[kind].includes(venue);
}

/** The setting has somewhere to lie down ("busy crosswalk downtown" does not). */
export function settingHostsLying(setting: string | null | undefined): boolean {
  const surfaces = sceneSurfaces(setting);
  return !surfaces || surfaces.lie !== null;
}

// ── Lying ─────────────────────────────────────────────────────────────────────────────────

/** A lying pose in a beat or a pose sentence ("lies on her side", "propped back on her elbows"). */
const LYING_RE =
  /\b(?:lying|lies|lie|laying|reclining|reclines|sprawled|sprawls|stretched\s+out|whole\s+body\s+horizontal|propped\s+back\s+on\s+(?:her|his|both)\s+elbows)\b/i;

/**
 * A lying pose said as one ("lies on her side", "lying back", "LYING = …"), not a word in a list
 * of stances ("seated, mid-stride, reclining, relaxing … as written").
 */
const LYING_STATEMENT_RE =
  /\b(?:lying|lies|laying|reclining|reclines)\s+(?:on|back|flat|down|across|along|in|face|sideways|propped|together|stretched)\b|\bwhole\s+body\s+horizontal\b|\bpropped\s+back\s+on\s+(?:her|both)\s+elbows\b|\bLYING\s*=/i;

export function textLiesDown(text: string | null | undefined): boolean {
  const plain = stripNegatedClauses(text ?? '');
  if (!LYING_RE.test(plain)) return false;
  // "sprawled in an armchair" is a sit.
  if (/\bsprawl(?:ed|s)\b/i.test(plain) && !/\b(?:lying|lies|reclin\w+)\b/i.test(plain)) {
    return !/\b(?:arm)?chair\b/i.test(plain);
  }
  return true;
}

/** The posture a beat puts her in (for the surface it needs). */
export function beatPosture(beat: string): ScenePosture | null {
  const b = stripNegatedClauses(beat).toLowerCase();
  if (textLiesDown(b)) return 'lie';
  if (/\bkneel(?:s|ing)?\b|\bon\s+(?:her|one|both)\s+knees?\b/.test(b)) return 'kneel';
  if (/\b(?:sit|sits|sitting|seated|perched|perches|curled|cross-legged)\b/.test(b)) {
    return 'sit';
  }
  if (/\blean(?:s|ing)?\b|\bpropped\b|\belbows\s+on\b/.test(b)) return 'lean';
  return null;
}

// ── Fitting a beat to its setting ─────────────────────────────────────────────────────────

/** The surface sentence to use instead of a misfit one, by the posture around it. */
function replacementFor(posture: ScenePosture | null, surfaces: SceneSurfaces): string {
  switch (posture) {
    case 'lie':
      return surfaces.lie ?? surfaces.sit;
    case 'kneel':
      return surfaces.kneel;
    case 'lean':
      return surfaces.lean;
    default:
      return surfaces.sit;
  }
}

/** The posture the words just before a surface give it ("kneeling to light a candle on …"). */
function postureNear(
  text: string,
  index: number,
  fallback: ScenePosture | null
): ScenePosture | null {
  const before = text.slice(Math.max(0, index - 60), index).toLowerCase();
  const clause = before.split(/[,;—]/).pop() ?? before;
  return beatPosture(clause) ?? fallback;
}

/**
 * Lying wording → sitting wording, for a place with nowhere to lie: "lying on her side on the
 * sofa, head propped on one hand, reading" on a plaza → "sitting on the fountain's edge, head
 * propped on one hand, reading".
 */
function lyingToSitting(beat: string, surfaces: SceneSurfaces): string {
  let text = beat
    // Words only a lying body has.
    .replace(/,?\s*feet\s+kicked\s+up\s+behind(?:\s+her)?/gi, '')
    .replace(/,?\s*propped\s+(?:up\s+)?on\s+(?:her|both)\s+forearms/gi, '')
    .replace(/,?\s*whole\s+body\s+horizontal(?:\s+along\s+it)?/gi, '')
    .replace(/\bpropped\s+back\s+on\s+(?:her|both)\s+elbows\b/gi, 'leaning back on both hands')
    .replace(/\bpropped\s+on\s+both\s+elbows\b/gi, 'leaning back on both hands')
    .replace(/\bhands\s+behind\s+her\s+head\b/gi, 'hands behind her head, leaning back')
    .replace(/\bphone\s+held\s+overhead\b/gi, 'phone held up')
    .replace(/\btakeout\s+container\s+on\s+the\s+chest\b/gi, 'takeout container on her lap')
    .replace(
      /,?\s*\b(?:with\s+)?feet\s+up\s+on\s+the\s+(?:armrest|cushion)\b/gi,
      ', legs out in front'
    )
    // Propped on a hand reads as lying on the side; sitting, the chin rests on it.
    .replace(/\bhead\s+propped\s+on\s+one\s+hand\b/gi, 'chin resting on one hand')
    .replace(/\b(?:on|onto)\s+(?:her|the)\s+(?:back|side|stomach|front)\b/gi, '');
  text = text
    .replace(
      /\b(?:lying|laying|reclining|sprawled|stretched\s+out)(?:\s+(?:back|flat|down|sideways))?\b/gi,
      'sitting'
    )
    .replace(/\b(?:lies|reclines|sprawls)(?:\s+(?:back|flat|down|sideways))?\b/gi, 'sits')
    .replace(/\blie\s+(?:back|down|flat)\b/gi, 'sit');
  return text;
}

function tidy(text: string): string {
  return text
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.;])/g, '$1')
    .trim();
}

/**
 * The beat with its furniture fitted to the Setting: a sofa named in a plaza beat becomes the
 * fountain's edge, a lying pose in a place with nowhere to lie becomes a sit there. A beat whose
 * furniture already fits (or a Setting of no known kind) comes back as it was.
 */
export function fitBeatToSetting(
  beat: string | null | undefined,
  setting: string | null | undefined
): string {
  const text = beat ?? '';
  const venue = sceneVenue(setting);
  const surfaces = sceneSurfaces(setting);
  if (!text.trim() || !venue || !surfaces) return text;
  const posture = beatPosture(text);
  let next = text;
  const cannotLie = posture === 'lie' && surfaces.lie === null;
  if (cannotLie) {
    next = lyingToSitting(next, surfaces);
  }
  const misfits = poseSurfaces(next).filter(found => !surfaceFitsVenue(found.kind, venue));
  // Right to left, so earlier indexes stay valid.
  for (const found of [...misfits].reverse()) {
    const near = cannotLie ? 'sit' : postureNear(next, found.index, posture);
    // Only furniture her body is on moves: "reaching for a mug at the counter" or "a selfie on
    // a park bench" has no place-free version — that beat is drawn again instead.
    if (!near) continue;
    next = `${next.slice(0, found.index)}${replacementFor(near, surfaces)}${next.slice(found.index + found.phrase.length)}`;
  }
  // "sprawled in an armchair" is a sit; sprawled on a step reads as lying down.
  if (misfits.some(found => found.kind === 'armchair')) {
    next = next.replace(/\bsprawled\b/gi, 'slouched');
  }
  // Only one surface phrase per posture: "on a bench … on a bench" after two replacements.
  const repeated = replacementFor(cannotLie ? 'sit' : posture, surfaces);
  const first = next.indexOf(repeated);
  if (first >= 0) {
    next =
      next.slice(0, first + repeated.length) +
      next
        .slice(first + repeated.length)
        .split(repeated)
        .join('');
  }
  if (cannotLie && !poseSurfaces(next).length && !next.includes(surfaces.sit)) {
    next = next
      .replace(/\bsitting\b/i, `sitting ${surfaces.sit}`)
      .replace(/\bsits\b/i, `sits ${surfaces.sit}`);
  }
  return next === text ? text : tidy(next);
}

/** True when the beat's furniture and posture fit the Setting as they are. */
export function beatFitsSetting(
  beat: string | null | undefined,
  setting: string | null | undefined
): boolean {
  return sceneSurfaceConflicts(beat ?? '', setting).length === 0;
}

// ── Fixtures a beat's action needs ──────────────────────────────────────────────────────

/**
 * Things an action is done at that only some places have: cooking at the stove needs a kitchen.
 * Not rewritten (there is no stove to move to on a street) — the planner draws another beat.
 */
const FIXTURE_RULES: ReadonlyArray<[RegExp, readonly SceneVenue[]]> = [
  [/\b(?:at|over|by)\s+the\s+(?:stove|hob|oven)\b/i, ['kitchen']],
  [/\b(?:open\s+fridge|the\s+fridge)\b/i, ['kitchen']],
];

// ── Conflicts (the audit) ─────────────────────────────────────────────────────────────────

export type SceneSurfaceConflict = {
  kind: 'surface' | 'posture';
  /** The words that clash ("on the sofa", "lies on her side"). */
  evidence: string;
};

/**
 * What in the text the Setting cannot have: furniture or ground from another kind of place, or a
 * lying pose where there is nowhere to lie. Empty for a Setting of no known kind.
 */
export function sceneSurfaceConflicts(
  text: string | null | undefined,
  setting: string | null | undefined
): SceneSurfaceConflict[] {
  const venue = sceneVenue(setting);
  const surfaces = sceneSurfaces(setting);
  // The Setting's own words ("SCENE: she is in the grass-and-sand pit …") are the place itself.
  const place = setting?.trim();
  const body = place ? (text ?? '').split(place).join(' ') : (text ?? '');
  if (!venue || !surfaces || !body.trim()) return [];
  const conflicts: SceneSurfaceConflict[] = [];
  for (const found of poseSurfaces(body)) {
    // A mat is only furniture when she is on it ("keys dropped on the mat" is the doormat).
    if (
      found.kind === 'mat' &&
      !['lie', 'sit', 'kneel'].includes(postureNear(body, found.index, null) ?? '')
    ) {
      continue;
    }
    if (!surfaceFitsVenue(found.kind, venue)) {
      conflicts.push({ kind: 'surface', evidence: found.phrase });
    }
  }
  const plainBody = stripNegatedClauses(body);
  for (const [re, venues] of FIXTURE_RULES) {
    const found = re.exec(plainBody)?.[0];
    if (found && !venues.includes(venue)) conflicts.push({ kind: 'surface', evidence: found });
  }
  if (surfaces.lie === null) {
    const plain = plainBody;
    const lying = LYING_STATEMENT_RE.exec(plain);
    if (lying) conflicts.push({ kind: 'posture', evidence: lying[0] });
  }
  return conflicts;
}

/**
 * A stance directive's list of seats or beds ("ON a chair/bench/stool/couch", "ON the
 * bed/couch/floor"), cut to the ones the Setting has; none left, the Setting's own surface ("ON the
 * grass"). A Setting of no known kind keeps the whole list.
 */
export function surfaceWordsForSetting(
  words: readonly string[],
  posture: 'sit' | 'lie',
  setting: string | null | undefined
): string {
  const article = posture === 'sit' ? 'a' : 'the';
  const venue = sceneVenue(setting);
  const surfaces = sceneSurfaces(setting);
  if (!venue || !surfaces) return `ON ${article} ${words.join('/')}`;
  const kept = words.filter(word => {
    const kind = surfaceKind(word, '');
    return !kind || surfaceFitsVenue(kind, venue);
  });
  if (kept.length > 0) return `ON ${article} ${kept.join('/')}`;
  const own = posture === 'lie' ? (surfaces.lie ?? surfaces.sit) : surfaces.sit;
  return own.replace(/^(on|in)\b/i, word => word.toUpperCase());
}

const HARD_GROUND: ReadonlySet<SceneVenue> = new Set(['street', 'plaza', 'market', 'water']);

/**
 * "on the floor" in a pose's own words (a layout cue, a pose described from a skeleton) said as
 * the Setting's ground where a floor does not fit ("sitting on the floor cross-legged" on a park
 * lawn → "on the grass"). Indoors, or for a Setting of no known kind, the text is unchanged.
 */
export function withSceneGround(text: string, setting: string | null | undefined): string {
  const venue = sceneVenue(setting);
  if (!venue || surfaceFitsVenue('floor', venue) || !/\bon the floor\b/.test(text)) return text;
  // Hard city ground is not sat on: the place's seat ("on a low step", "on the fountain's edge").
  const seat = HARD_GROUND.has(venue) ? sceneSurfaces(setting)?.sit : null;
  return text.replace(/\bon the floor\b/g, seat ?? `on the ${sceneGroundWord(setting)}`);
}

/** "floor" indoors, the ground outside ("on the floor" in a park reads as a room). */
export function sceneGroundWord(setting: string | null | undefined): string {
  return sceneSurfaces(setting)?.ground ?? 'floor';
}
