import type { AthleticSport } from './athletic-sport-profiles';
import {
  ATHLETIC_SPORT_PROFILES,
  getAthleticSportProfile,
  inferAthleticSport,
} from './athletic-sport-profiles';

export type SportActionBundle = {
  instructions: string;
  rewriteDefault: string;
  poses: readonly string[];
  settings: readonly string[];
  /** Tokens from other sports that should not appear in this sport's scene */
  foreignTokens: readonly string[];
};

const GENERIC_STUNT_TOKENS = [
  'hurling a spear',
  'hurling a javelin',
  'leaping from the edge of a wooden dock',
  'flip off a dock',
  'backflip off',
  'mounting a horse',
  'surfacing from water',
  'rappelling down',
  'vaulting a railing',
  'breaking through a paper door',
  'swinging on a rope over a gap',
] as const;

const SPORT_ACTION_BUNDLES: Record<AthleticSport, SportActionBundle> = {
  triathlon: {
    instructions:
      'Show swim-bike-run race action: running transition, cycling on aerobars, or stride off the bike. Stay in triathlon context—no unrelated stunts.',
    rewriteDefault: 'pushing through a triathlon transition at race pace',
    poses: [
      'running through transition with cycling shoes and race number',
      'aero tuck on the bike leg with focused forward lean',
      'sprinting off the bike toward the run segment',
    ],
    settings: [
      'a triathlon transition zone with racks and race tape',
      'an open road bike leg with crosswind and long shadows',
      'a lakeside run segment with wet pavement reflections',
    ],
    foreignTokens: ['javelin', 'dunk', 'soccer kick', 'golf swing', 'downward dog'],
  },
  track_field: {
    instructions:
      'Show track and field action: javelin throw, discus spin, shot put, pole vault, or sprint start. Athlete on foot—no bicycles or unrelated sports.',
    rewriteDefault: 'launching a javelin with full-body rotation',
    poses: [
      'hurling a javelin with full body rotation at release',
      'spinning into a discus throw with coiled torque',
      'exploding out of starting blocks on the track',
    ],
    settings: [
      'an empty stadium track lane under floodlights',
      'a field event sector with chalk lines and measured arc',
      'a rain-darkened track surface with starting blocks',
    ],
    foreignTokens: ['cyclist', 'pedaling', 'handlebars', 'bicycle', 'dunk', 'soccer', 'golf swing'],
  },
  cycling: {
    instructions:
      'Show cycling race action: pedaling hard, out-of-saddle sprinting, leaning through a corner, or drafting wheel-to-wheel. Every subject stays on a racing bicycle with a fastened cycling helmet—hair may show at the temples or through rear vents, but never bare heads. No javelin, spear, dock dives, backflips, or unrelated stunts.',
    rewriteDefault: 'sprinting on a racing bicycle',
    poses: [
      'sprinting out of the saddle on a road bike with aerodynamic forward lean',
      'leaning hard into a wet corner on a racing bicycle, tires spraying water',
      'driving the pedals in a fierce criterium sprint shoulder to shoulder',
      'charging through a cobblestone sector with mud spray flying from tires',
    ],
    settings: [
      'a rain-soaked city circuit with wet pavement and neon reflections',
      'a cobblestone race sector with mud spray flying from tires',
      'an open road descent with yellow-orange sunset light and long shadows',
    ],
    foreignTokens: [
      'javelin',
      'spear',
      'discus',
      'shot put',
      'dunk',
      'downward dog',
      'golf swing',
      'climbing dyno',
      'fencing lunge',
    ],
  },
  martial_arts: {
    instructions:
      'Show martial arts action: a committed strike, block, kick, or throw in gi or dobok on a dojo floor. No bicycles, balls, or unrelated sports gear.',
    rewriteDefault: 'delivering a committed martial arts strike in the dojo',
    poses: [
      'throwing a high roundhouse kick with hips fully rotated',
      'blocking a strike with forearm chambered and rooted stance',
      'sweeping into a controlled throw on the tatami',
    ],
    settings: [
      'a dojo floor with tatami mats and soft side light',
      'an empty training hall with dust motes in sunbeams',
      'a sparring ring with taped boundary lines',
    ],
    foreignTokens: ['cyclist', 'javelin', 'basketball', 'soccer cleats', 'golf swing', 'ski slope'],
  },
  fencing: {
    instructions:
      'Show fencing action: lunge, parry, or riposte in full fencing uniform with blade extended. No unrelated sports or stunts.',
    rewriteDefault: 'lunging into a fencing attack with blade extended',
    poses: [
      'lunging into an attack with foil extended and back foot anchored',
      'parrying with blade engaged and en garde stance low',
      'recovering from a riposte with quick footwork on the piste',
    ],
    settings: [
      'a fencing piste under cool overhead sport lights',
      'an indoor salle with metallic floor reflections',
      'a competition strip with electronic scoring box nearby',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'soccer', 'climbing', 'golf swing'],
  },
  gymnastics: {
    instructions:
      'Show gymnastics action: leap, handstand, tumbling pass, or apparatus work in a leotard. No street clothes, cleats, or unrelated sports.',
    rewriteDefault: 'extending through a gymnastics tumbling pass',
    poses: [
      'launching into a tumbling pass with tight body alignment',
      'holding a handstand line on the floor exercise mat',
      'extending through a split leap with toes pointed',
    ],
    settings: [
      'a competition floor exercise mat under arena lights',
      'a balance beam in a quiet training gym',
      'a chalk-dusted apparatus hall with soft bounce light',
    ],
    foreignTokens: ['cyclist', 'javelin', 'soccer cleats', 'golf swing', 'mounting a horse'],
  },
  climbing: {
    instructions:
      'Show climbing action: dyno, reach, or heel hook on a boulder or wall in climbing shoes and harness-ready kit. No ball sports or track throws.',
    rewriteDefault: 'dynoing to a hold on the overhang',
    poses: [
      'dynoing to a hold on an overhang with hips driving upward',
      'heel hooking on a steep boulder with chalk dust in the air',
      'reaching for a crimp on a competition wall',
    ],
    settings: [
      'an indoor climbing wall with colored holds and dramatic shadows',
      'a sunlit outdoor boulder with chalk marks on rock',
      'a competition route with crowd blur far below',
    ],
    foreignTokens: ['javelin', 'cyclist', 'dunk', 'soccer kick', 'golf swing', 'downward dog'],
  },
  yoga: {
    instructions:
      'Show yoga or pilates action: held pose, transition, or balance on a mat—calm controlled movement. No cleats, balls, or high-impact stunts.',
    rewriteDefault: 'flowing through a controlled yoga transition on the mat',
    poses: [
      'holding warrior two with arms extended and grounded stance',
      'transitioning through downward dog with long spine',
      'balancing in tree pose on a studio mat',
    ],
    settings: [
      'a quiet yoga studio with warm morning light',
      'a minimalist mat space with soft bounce light',
      'a rooftop class at golden hour with open sky',
    ],
    foreignTokens: ['javelin', 'cyclist', 'dunk', 'soccer cleats', 'sprint finish', 'golf swing'],
  },
  tennis: {
    instructions:
      'Show tennis action: serve toss, forehand drive, backhand slice, or court sprint in tennis whites. Stay on court—no unrelated sports.',
    rewriteDefault: 'driving a forehand with full shoulder rotation',
    poses: [
      'uncoiling into a forehand with racket head lagging then whipping through',
      'tossing into a serve with knee bend and upward extension',
      'split-stepping before a volley at the net',
    ],
    settings: [
      'a hard court with crisp white lines and afternoon sun',
      'a clay court with burnt-orange surface and sliding footwork',
      'an indoor tennis court with even sport lighting',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'soccer goal', 'golf swing', 'climbing dyno'],
  },
  basketball: {
    instructions:
      'Show basketball action: drive, jump shot, dunk, or defensive slide on court in jersey and shorts. No cycling, javelin, or unrelated sports.',
    rewriteDefault: 'elevating into a jump shot on the hardwood',
    poses: [
      'elevating into a jump shot with elbow aligned and wrist snapping',
      'driving hard to the rim with defender trailing',
      'planting for a crossover dribble with low center of gravity',
    ],
    settings: [
      'a polished indoor court under bright gymnasium lights',
      'an outdoor blacktop court at dusk with long shadows',
      'a half-court setup with scuffed key lines',
    ],
    foreignTokens: ['cyclist', 'javelin', 'soccer cleats', 'golf swing', 'ski slope', 'pedaling'],
  },
  hockey: {
    instructions:
      'Show hockey action: skating stride, stickhandling, or wrist shot on ice in hockey jersey gear. No bicycles, track throws, or unrelated sports.',
    rewriteDefault: 'winding up for a wrist shot on the ice',
    poses: [
      'winding up for a wrist shot with weight on the back skate',
      'stickhandling through a defender with low knee bend',
      'accelerating with powerful skating strides on the ice',
    ],
    settings: [
      'an ice rink with scuffed surface and arena boards',
      'a frozen outdoor pond with muted winter light',
      'a practice rink with breath visible in cold air',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'soccer pitch', 'golf fairway', 'downward dog'],
  },
  baseball: {
    instructions:
      'Show baseball action: pitch windup, swing, slide, or fielding in uniform and cleats. No cycling, javelin, or unrelated sports.',
    rewriteDefault: 'unloading into a baseball swing through the zone',
    poses: [
      'unloading into a swing with hips rotating through the zone',
      'delivering a pitch from the windup with leg kick high',
      'sliding into base with dirt kicking up',
    ],
    settings: [
      'a sunlit infield diamond with chalked baselines',
      "a batter's box with clay footing and stadium lights",
      'an empty bullpen mound with chain-link backdrop',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'soccer goal', 'golf swing', 'climbing'],
  },
  rugby: {
    instructions:
      'Show rugby action: tackle, pass, sprint with ball, or scrum push in rugby shirt and shorts. No cycling, javelin, or unrelated sports.',
    rewriteDefault: 'sprinting with the rugby ball tucked',
    poses: [
      'sprinting with the ball tucked and fending with a stiff arm',
      'diving to ground the ball over the try line',
      'driving low into a tackle with shoulder engagement',
    ],
    settings: [
      'a muddy rugby pitch under overcast skies',
      'a stadium field with painted try lines and worn turf',
      'a rainy training pitch with spray from footwork',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'golf swing', 'downward dog', 'basketball hoop'],
  },
  soccer: {
    instructions:
      'Show soccer action: strike, dribble, slide tackle, or header on pitch in kit and cleats. No cycling, javelin, or unrelated sports.',
    rewriteDefault: 'striking the ball with full follow-through',
    poses: [
      'striking the ball with full follow-through and planted foot',
      'dribbling at pace with close touches and low center of gravity',
      'rising for a header with eyes on the ball',
    ],
    settings: [
      'a rain-soaked pitch with reflected floodlights',
      'a green field with white touchlines and empty stands',
      'a tight urban pitch with chain-link fences',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'golf swing', 'climbing dyno', 'handlebars'],
  },
  ski: {
    instructions:
      'Show skiing or snowboarding action: carve, jump, or slalom in ski jacket and bib on snow. No court, pitch, or unrelated sports.',
    rewriteDefault: 'carving through a slalom turn with snow spraying',
    poses: [
      'carving through a slalom turn with snow spraying from the edge',
      'absorbing moguls with knees compressed and poles planted',
      'launching off a small kicker with skis parallel',
    ],
    settings: [
      'a groomed ski slope with blue shadows in the troughs',
      'a slalom course with red and blue gates blurring past',
      'a powder field with sun glitter on fresh snow',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'soccer pitch', 'tennis court', 'downward dog'],
  },
  golf: {
    instructions:
      'Show golf action: full swing, follow-through, or putting stroke in polo and tailored pants on course. No cycling, javelin, or unrelated sports.',
    rewriteDefault: 'unwinding through a golf swing with balanced finish',
    poses: [
      'unwinding through a driver swing with balanced finish',
      'rolling a putt with quiet shoulders and steady head',
      'chipping from rough with wrists firm through contact',
    ],
    settings: [
      'a fairway at golden hour with long grass fringe',
      'a putting green with dew and soft morning light',
      'a driving range with scattered balls and open sky',
    ],
    foreignTokens: ['cyclist', 'javelin', 'dunk', 'soccer goal', 'climbing dyno', 'fencing lunge'],
  },
  running: {
    instructions:
      'Show running action: sprint drive, mid-stride form, or hurdle clearance in singlet and shorts. On foot—no bicycles or unrelated sports.',
    rewriteDefault: 'driving knees in a full sprint stride',
    poses: [
      'exploding out of starting blocks with forward drive',
      'mid-sprint with high knee lift and pumping arms',
      'clearing a hurdle with lead leg extended',
    ],
    settings: [
      'a stadium track lane with rubber surface and lane numbers',
      'a rain-soaked city road with reflective asphalt',
      'a trail path with kicked gravel behind the stride',
    ],
    foreignTokens: [
      'cyclist',
      'cyclists',
      'pedaling',
      'pedals',
      'pedal',
      'handlebars',
      'bicycle',
      'bike',
      'cycling kit',
      'bib shorts',
      'dunk',
      'golf swing',
      'climbing dyno',
    ],
  },
};

export type CyclingDiscipline = 'road' | 'gravel' | 'mountain' | 'cyclocross' | 'track';

type CyclingDisciplineOverlay = {
  instructions: string;
  rewriteDefault: string;
  poses: readonly string[];
  settings: readonly string[];
  forbiddenVenueTokens: readonly string[];
};

const CYCLING_DISCIPLINE_OVERLAYS: Record<CyclingDiscipline, CyclingDisciplineOverlay> = {
  road: {
    instructions:
      'Show road cycling race action: pedaling hard, out-of-saddle sprinting, leaning through a corner, or drafting wheel-to-wheel on paved roads. Every subject stays on a road racing bicycle with a fastened aero cycling helmet—hair may show at the temples, but never bare heads. No singletrack, gravel sectors, or velodrome unless explicitly requested.',
    rewriteDefault: 'sprinting on a road racing bicycle',
    poses: SPORT_ACTION_BUNDLES.cycling.poses,
    settings: SPORT_ACTION_BUNDLES.cycling.settings,
    forbiddenVenueTokens: [
      'singletrack',
      'fire road',
      'doubletrack',
      'rail-trail',
      'velodrome',
      'banking turn',
      'cyclocross barrier',
      'trail drop',
    ],
  },
  gravel: {
    instructions:
      'Show gravel cycling action on unpaved roads, fire roads, rail-trails, or wide dirt sectors with a gravel or adventure bike. Every rider wears a fastened gravel cycling helmet—hair may show at the temples or through vents, but never bare heads. Loose surface, kicked-up dust or stones—never a velodrome, indoor track, or banked oval.',
    rewriteDefault: 'powering through a loose gravel sector on a fire road',
    poses: [
      'powering through a loose gravel sector with stones kicking up from knob tires',
      'railroading a fast descent on a dusty fire road with relaxed grip on the drops',
      'charging through a muddy doubletrack with spray from wide tires',
      'climbing a steep gravel pitch out of the saddle with the rear wheel biting for traction',
    ],
    settings: [
      'a remote fire road climb through pine forest with dust hanging in the air',
      'a wide gravel descent across open prairie with golden-hour side light',
      'a muddy doubletrack sector after rain with tire tracks in wet earth',
      'a crushed-stone rail-trail with long shadows and scattered scrub',
      'a rolling gravel road bend with loose chip and crosswind',
    ],
    forbiddenVenueTokens: [
      'velodrome',
      'banking turn',
      'indoor track',
      'track cycling',
      'banked oval',
    ],
  },
  mountain: {
    instructions:
      'Show mountain biking action on singletrack, trail, or technical terrain with a mountain bike. Every rider wears a fastened mountain bike helmet—hair may show at the temples or through vents, but never bare heads. Roots, rocks, and body English—never a velodrome or road race circuit.',
    rewriteDefault: 'carving through a rooty singletrack descent',
    poses: [
      'carving through a rooty singletrack descent with the bike leaned into a berm',
      'launching off a small trail drop with knees bent and eyes forward',
      'climbing a rocky switchback with weight shifted over the front wheel',
    ],
    settings: [
      'a pine-needle singletrack with dappled forest light',
      'a rocky alpine trail with exposed ridgeline views',
      'a red-dirt flow trail with berms and kicked-up dust',
    ],
    forbiddenVenueTokens: [
      'velodrome',
      'banking turn',
      'indoor track',
      'city circuit',
      'cobblestone race',
      'wet pavement and neon',
      'peloton',
    ],
  },
  cyclocross: {
    instructions:
      'Show cyclocross action: running barriers, shouldering the bike, or sprinting through mud in a cross race. Every rider wears a fastened cyclocross helmet—hair may show at the temples, but never bare heads. Grass, mud, and barriers—never a velodrome.',
    rewriteDefault: 'shouldering the bike over a muddy cyclocross barrier',
    poses: [
      'shouldering the bike over a wooden barrier with mud on the calves',
      'sprinting through a muddy grass straight with knobby tires spraying turf',
      'remounting at speed after a sand pit run-up',
    ],
    settings: [
      'a muddy cyclocross course with tape-lined corners and parked fans',
      'a grass-and-sand pit sector with churned ruts and cold overcast light',
      'a wooded cross loop with fallen leaves and slick off-camber turns',
    ],
    forbiddenVenueTokens: ['velodrome', 'banking turn', 'indoor track'],
  },
  track: {
    instructions:
      'Show track cycling action on a velodrome or indoor banked oval: high-speed pedaling, sprint lines, or pursuit pace. Every rider wears a fastened track cycling helmet—never bare heads. Stay on the track—no gravel roads or trail terrain.',
    rewriteDefault: 'charging through a velodrome banking turn at full speed',
    poses: [
      'charging through a velodrome banking turn at full speed',
      "accelerating from the sprinter's line with fixed-gear drive",
      'riding the black line in a tight pursuit formation',
    ],
    settings: [
      'a velodrome banking turn under harsh floodlights',
      'an indoor track oval with polished boards and echoing crowd blur',
      'a steep-banked velodrome straight with long afternoon shadows',
    ],
    forbiddenVenueTokens: ['gravel road', 'fire road', 'singletrack', 'doubletrack'],
  },
};

const CYCLING_DISCIPLINE_HINTS: ReadonlyArray<{
  discipline: CyclingDiscipline;
  pattern: RegExp;
}> = [
  {
    discipline: 'gravel',
    pattern:
      /\b(?:gravel(?:\s+(?:bike|bicycle|cyclist|cyclists|ride|riding|race|racing|grind|event|road|path|course|sector|adventure))?|graveler|bikepacking|dirt road|fire road|unpaved|all-road|adventure bike)\b/i,
  },
  {
    discipline: 'track',
    pattern: /\b(?:velodrome|track cycling|indoor track|keirin|omnium|sprint cycling on track)\b/i,
  },
  {
    discipline: 'mountain',
    pattern:
      /\b(?:mountain bike|mountain biker|mountain biking|mtb\b|mtb rider|downhill(?:\s+bike|\s+biking|\s+rider)?|enduro(?:\s+bike|\s+biking|\s+rider)?|singletrack|trail bike|trail rider|trail riding|xc bike|cross-country bike|cross country bike)\b/i,
  },
  { discipline: 'cyclocross', pattern: /\b(?:cyclocross|cx race|cross racing)\b/i },
  {
    discipline: 'road',
    pattern:
      /\b(?:road bike|road bicycle|road cyclist|road cycling|road race|criterium|crit race|peloton|grand tour|tour de|time trial|aero bars|drop bars on pavement)\b/i,
  },
];

export function inferCyclingDiscipline(hints?: string): CyclingDiscipline {
  const text = hints ?? '';
  for (const entry of CYCLING_DISCIPLINE_HINTS) {
    if (entry.pattern.test(text)) {
      return entry.discipline;
    }
  }
  return 'road';
}

const CYCLING_HELMET_IN_TEXT =
  /\b(?:cycling helmet|bike helmet|aero helmet|gravel helmet|mountain bike helmet|track cycling helmet|helmet visor|fastened helmet)\b/i;

/**
 * True when the text describes an actual bicycle / riding — not just cycling kit
 * wardrobe (jersey, bibs) that often appears in studio try-ons and portraits.
 */
export function promptMentionsBicycleOrRiding(text: string): boolean {
  return /\b(?:cyclists?|bicyclists?|bicycles?|(?:road|gravel|mountain|racing|track|cross)\s+bikes?|bike\s+(?:race|leg|lane|path)|bicycle\s+race|on\s+(?:a|the|her|his|their)\s+(?:bike|bicycle)|handlebars?|pedall?ing|pedals\b|peloton|velodrome|cycling\s+race|criterium|cyclocross|bikepacking|out-of-saddle|drafting\s+wheel|leaning\s+forward\s+on\s+the\s+bike)\b/i.test(
    text
  );
}

export function cyclingHelmetLabel(hints?: string): string {
  switch (inferCyclingDiscipline(hints)) {
    case 'gravel':
      return 'gravel cycling helmet';
    case 'mountain':
      return 'mountain bike helmet';
    case 'track':
      return 'track cycling helmet';
    case 'cyclocross':
      return 'cyclocross helmet';
    case 'road':
    default:
      return 'aero cycling helmet';
  }
}

export function summaryIncludesCyclingHelmet(summary: string): boolean {
  return CYCLING_HELMET_IN_TEXT.test(summary) || /\bhelmet\b/i.test(summary);
}

export function appendCyclingHelmetToSummary(summary: string, hints?: string): string {
  const trimmed = summary.trim();
  if (!trimmed || summaryIncludesCyclingHelmet(trimmed)) {
    return trimmed;
  }

  return `${trimmed}, ${cyclingHelmetLabel(hints)}`;
}

export function ensureCyclingHelmetInPrompt(prompt: string, hints?: string): string {
  const corpus = [hints, prompt].filter(Boolean).join(' ');
  // Kit-only / studio wardrobe scenes should not force helmets.
  if (!promptMentionsBicycleOrRiding(corpus)) {
    return prompt;
  }
  if (CYCLING_HELMET_IN_TEXT.test(prompt) || /\bhelmet\b/i.test(prompt)) {
    return prompt;
  }

  const helmet = cyclingHelmetLabel(hints);
  const corpusHasRiding = promptMentionsBicycleOrRiding(corpus);
  const sentences = prompt.split(/(?<=[.!?])\s+/);
  let changed = false;

  const updated = sentences.map(sentence => {
    const mentionsRiderOrBike =
      promptMentionsBicycleOrRiding(sentence) ||
      // Duo race prompts often only say "on the left/right" while hints name cyclists.
      (corpusHasRiding && /\bon the (?:left|right)\b/i.test(sentence));
    if (!mentionsRiderOrBike || /\bhelmet\b/i.test(sentence)) {
      return sentence;
    }

    changed = true;
    if (/\bwearing\b/i.test(sentence)) {
      return sentence.replace(/\bwearing\b/i, `wearing a ${helmet} and`);
    }

    const trimmed = sentence.trim().replace(/\.$/, '');
    return `${trimmed}, wearing a ${helmet}.`;
  });

  if (changed) {
    return updated
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Bicycle/riding was only in hints — leave the prompt alone rather than
  // appending "each wearing a helmet" to an unrelated scene sentence.
  return prompt;
}

const BOTTOM_LAYER_PRESENT =
  /\b(?:running shorts|track pants|shorts|pants|trousers|skirt|bib shorts|yoga pants|leggings|leotard|unitard|breeches|chinos|golf pants|soccer shorts|basketball shorts|rugby shorts|tennis skirt)\b/i;

const TOP_ONLY_ATHLETIC =
  /\b(?:running singlet|singlet|mesh jersey|sports bra|tank top|jersey|running top)\b/i;

const DEFAULT_BOTTOM_BY_SPORT: Partial<Record<AthleticSport, string>> = {
  running: 'running shorts',
  track_field: 'running shorts',
  basketball: 'basketball shorts',
  soccer: 'soccer shorts',
  tennis: 'tennis skirt',
  golf: 'golf shorts',
  martial_arts: 'martial arts pants',
  fencing: 'fencing breeches',
  rugby: 'rugby shorts',
  yoga: 'yoga pants',
};

const SPORTS_REQUIRING_BOTTOM: AthleticSport[] = [
  'running',
  'track_field',
  'basketball',
  'soccer',
  'tennis',
  'golf',
  'martial_arts',
  'fencing',
  'rugby',
  'yoga',
];

function bottomLabelFromSummary(summary: string, sport: AthleticSport): string | null {
  const profile = getAthleticSportProfile(sport);
  if (!profile?.bottomLabels?.length) {
    return null;
  }

  for (const part of summary.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    if (profile.bottomLabels.some(pattern => pattern.test(trimmed))) {
      return trimmed;
    }
  }

  return null;
}

export function promptMissingAthleticBottom(prompt: string, sport: AthleticSport): boolean {
  if (!SPORTS_REQUIRING_BOTTOM.includes(sport)) {
    return false;
  }

  if (BOTTOM_LAYER_PRESENT.test(prompt)) {
    return false;
  }

  return (
    TOP_ONLY_ATHLETIC.test(prompt) ||
    /\b(?:runner|sprinter|marathon|jogger|athlete)\b/i.test(prompt)
  );
}

export function ensureAthleticBottomInPrompt(
  prompt: string,
  sport: AthleticSport,
  options?: { hints?: string; wardrobeSummary?: string }
): string {
  if (!SPORTS_REQUIRING_BOTTOM.includes(sport)) {
    return prompt;
  }

  if (!promptMissingAthleticBottom(prompt, sport)) {
    return prompt;
  }

  const bottom =
    bottomLabelFromSummary(options?.wardrobeSummary ?? '', sport) ??
    DEFAULT_BOTTOM_BY_SPORT[sport] ??
    'shorts';

  const sentences = prompt.split(/(?<=[.!?])\s+/);
  let changed = false;

  const updated = sentences.map(sentence => {
    const mentionsAthlete =
      TOP_ONLY_ATHLETIC.test(sentence) ||
      /\b(?:runner|sprinter|marathon|jogger|athlete|player|tennis|basketball|soccer)\b/i.test(
        sentence
      );

    if (!mentionsAthlete || BOTTOM_LAYER_PRESENT.test(sentence)) {
      return sentence;
    }

    changed = true;
    if (/\bwearing\b/i.test(sentence)) {
      return sentence.replace(/\bwearing\b/i, `wearing ${bottom} and`);
    }

    const trimmed = sentence.trim().replace(/\.$/, '');
    return `${trimmed}, wearing ${bottom}.`;
  });

  if (changed) {
    return updated
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  const corpus = [options?.hints, prompt].filter(Boolean).join(' ');
  if (!/\b(?:runner|sprinter|marathon|jogger|athlete)\b/i.test(corpus)) {
    return prompt;
  }

  return `${prompt.replace(/\.$/, '')}, wearing ${bottom}.`;
}

function cyclingDisciplineOverlay(hints?: string): CyclingDisciplineOverlay {
  return CYCLING_DISCIPLINE_OVERLAYS[inferCyclingDiscipline(hints)];
}

function locationConflictsWithCyclingDiscipline(
  location: string,
  discipline: CyclingDiscipline
): boolean {
  const lower = location.toLowerCase();
  return CYCLING_DISCIPLINE_OVERLAYS[discipline].forbiddenVenueTokens.some(token =>
    lower.includes(token.toLowerCase())
  );
}

export function stripIncompatibleCyclingVenuesFromPrompt(prompt: string, hints?: string): string {
  if (inferAthleticSport(hints) !== 'cycling') {
    return prompt;
  }

  const overlay = cyclingDisciplineOverlay(hints);
  if (overlay.forbiddenVenueTokens.length === 0) {
    return prompt;
  }

  const escaped = overlay.forbiddenVenueTokens.map(token =>
    token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  );
  const pattern = new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
  if (!pattern.test(prompt)) {
    return prompt;
  }

  return prompt
    .split(/(?<=[.!?])\s+/)
    .map(sentence => (pattern.test(sentence) ? overlay.rewriteDefault : sentence))
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function foreignActionPattern(sport: AthleticSport): RegExp | null {
  const bundle = SPORT_ACTION_BUNDLES[sport];
  if (!bundle) {
    return null;
  }

  const tokens = [...GENERIC_STUNT_TOKENS, ...bundle.foreignTokens];
  if (tokens.length === 0) {
    return null;
  }

  const escaped = tokens.map(token =>
    token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  );
  return new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i');
}

function bundleFor(sport: AthleticSport | null | undefined): SportActionBundle | null {
  if (!sport) {
    return null;
  }
  return SPORT_ACTION_BUNDLES[sport] ?? null;
}

const RUNNING_ANTI_CYCLING_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:powerful thighs\s+)?stroke\s+pedals?\b/gi, 'drive a powerful forward stride'],
  [/\b(?:thighs\s+)?pedaling\b/gi, 'thighs driving forward'],
  [/\bpedaling\b/gi, 'striding forward'],
  [
    /\b(?:on (?:a |the |her |his |their )?(?:bike|bicycle)|leaning forward on the bike)\b/gi,
    'on the footpath',
  ],
  [/\bhandlebars\b/gi, 'arm carriage'],
  [/\b(?:racing )?bicycle\b/gi, 'running path'],
  [/\bcyclists?\b/gi, 'runner'],
];

function sanitizeForeignSportPhrases(prompt: string, sport: AthleticSport): string {
  if (sport !== 'running' && sport !== 'track_field') {
    return prompt;
  }

  let working = prompt;
  for (const [pattern, replacement] of RUNNING_ANTI_CYCLING_REWRITES) {
    working = working.replace(pattern, replacement);
  }
  return working.replace(/\s{2,}/g, ' ').trim();
}

export function getSportActionBundle(
  sport: AthleticSport | null | undefined
): SportActionBundle | null {
  return bundleFor(sport);
}

export function getSportActionInstructions(sport: AthleticSport, hints?: string): string {
  if (sport === 'cycling') {
    return cyclingDisciplineOverlay(hints).instructions;
  }
  return SPORT_ACTION_BUNDLES[sport]?.instructions ?? '';
}

export function formatSportActionInstructions(sport: AthleticSport, hints?: string): string {
  const instructions = getSportActionInstructions(sport, hints);
  if (!instructions.trim()) {
    return '';
  }

  return instructions
    .split(/(?<=[.!?])\s+/)
    .map(sentence => `- ${sentence.trim()}`)
    .join('\n');
}

const DUO_COMPETITION_LINES: Partial<Record<AthleticSport, string>> = {
  cycling: 'two cyclists in fierce wheel-to-wheel competition',
  running: 'two runners in fierce shoulder-to-shoulder competition',
  basketball: 'two players in fierce one-on-one competition on the court',
  soccer: 'two players in fierce competition for the ball',
  tennis: 'two players in fierce baseline rally competition',
  hockey: 'two players in fierce competition for the puck',
  rugby: 'two players in fierce open-field competition',
  martial_arts: 'two martial artists in fierce sparring competition',
  fencing: 'two fencers in fierce en garde competition',
  triathlon: 'two triathletes in fierce race competition',
  track_field: 'two athletes in fierce track competition',
};

export function getSportDuoCompetitionLine(sport: AthleticSport, hints: string): string | null {
  if (!/\b(?:competition|competing|race|racing|fierce|match|versus|vs\.?)\b/i.test(hints)) {
    return null;
  }

  return DUO_COMPETITION_LINES[sport] ?? null;
}

export function pickSportActionPose(sport: AthleticSport, hints?: string): string {
  if (sport === 'cycling') {
    const poses = cyclingDisciplineOverlay(hints).poses;
    return poses[Math.floor(Math.random() * poses.length)]!;
  }

  const poses = SPORT_ACTION_BUNDLES[sport]?.poses ?? [];
  if (poses.length === 0) {
    return 'committed mid-action with readable momentum';
  }
  return poses[Math.floor(Math.random() * poses.length)]!;
}

export function pickSportActionSetting(sport: AthleticSport, hints?: string): string {
  if (sport === 'cycling') {
    const settings = cyclingDisciplineOverlay(hints).settings;
    return settings[Math.floor(Math.random() * settings.length)]!;
  }

  const settings = SPORT_ACTION_BUNDLES[sport]?.settings ?? [];
  if (settings.length === 0) {
    return 'an athletic venue matched to the sport';
  }
  return settings[Math.floor(Math.random() * settings.length)]!;
}

export function pickSceneLocationForSportHints(
  hints: string | undefined,
  pickLocation: () => string,
  maxAttempts = 20
): string {
  const sport = inferAthleticSport(hints);
  if (sport !== 'cycling') {
    return pickLocation();
  }

  const discipline = inferCyclingDiscipline(hints);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = pickLocation();
    if (!locationConflictsWithCyclingDiscipline(candidate, discipline)) {
      return candidate;
    }
  }

  return pickSportActionSetting('cycling', hints);
}

export function buildSportPoseIncompatibilities(): ReadonlyArray<{
  subject: RegExp;
  incompatiblePose: RegExp;
}> {
  return ATHLETIC_SPORT_PROFILES.flatMap(profile => {
    const bundle = SPORT_ACTION_BUNDLES[profile.id];
    if (!bundle || bundle.foreignTokens.length === 0) {
      return [];
    }

    const escaped = bundle.foreignTokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return [
      {
        subject: profile.hint,
        incompatiblePose: new RegExp(`\\b(?:${escaped.join('|')})\\b`, 'i'),
      },
    ];
  });
}

export function promptContainsForeignSportActions(sport: AthleticSport, prompt: string): boolean {
  const pattern = foreignActionPattern(sport);
  return pattern ? pattern.test(prompt) : false;
}

export function stripForeignSportActionsFromPrompt(
  prompt: string,
  sport: AthleticSport,
  hints?: string
): string {
  const bundle = SPORT_ACTION_BUNDLES[sport];
  const pattern = foreignActionPattern(sport);
  let working = sanitizeForeignSportPhrases(prompt, sport);
  if (bundle && pattern && pattern.test(working)) {
    const globalPattern = new RegExp(pattern.source, pattern.flags.includes('i') ? 'gi' : 'g');

    working = working
      .split(/(?<=[.!?])\s+/)
      .map(sentence => {
        if (!pattern.test(sentence)) {
          return sentence;
        }

        const wardrobeMatch = sentence.match(
          /\b(?:,\s*)?(?:wearing|dressed in|outfit includes)\b[^]*$/i
        );
        if (wardrobeMatch?.index != null) {
          const wardrobeTail = wardrobeMatch[0];
          const actionPart = sentence
            .slice(0, wardrobeMatch.index)
            .replace(globalPattern, ' ')
            .replace(/\s{2,}/g, ' ')
            .replace(/\s+,/g, ',')
            .trim();

          if (!actionPart || pattern.test(actionPart)) {
            const lead = bundle.rewriteDefault.replace(/\.$/, '');
            const tail = wardrobeTail.replace(/^,\s*/, '');
            return `${lead}, ${tail}`;
          }

          return `${actionPart}${wardrobeTail.startsWith(',') ? wardrobeTail : `, ${wardrobeTail}`}`;
        }

        const sanitizedSentence = sanitizeForeignSportPhrases(sentence, sport);
        if (!pattern.test(sanitizedSentence)) {
          return sanitizedSentence;
        }

        return bundle.rewriteDefault;
      })
      .join(' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return stripIncompatibleCyclingVenuesFromPrompt(working, hints);
}

export function sentenceContainsExcludedWardrobe(sport: AthleticSport, sentence: string): boolean {
  const profile = getAthleticSportProfile(sport);
  if (!profile) {
    return false;
  }

  return (
    profile.excludeLabels.some(pattern => pattern.test(sentence)) ||
    /\b(?:dressed for cold weather|quilted nylon)\b/i.test(sentence)
  );
}

export function resolveAthleticSportForWardrobe(
  intentCorpus: string,
  promptCorpus: string,
  assignedSport?: AthleticSport | null
): AthleticSport | null {
  const fromIntent = inferAthleticSport(intentCorpus) ?? assignedSport ?? null;
  if (fromIntent) {
    return fromIntent;
  }

  return inferAthleticSport(promptCorpus);
}

/** @deprecated Use stripForeignSportActionsFromPrompt */
export function stripIncompatibleSportActionsFromPrompt(
  prompt: string,
  sport: AthleticSport,
  hints?: string
): string {
  return stripForeignSportActionsFromPrompt(prompt, sport, hints);
}

export function promptContainsIncompatibleSportAction(
  sport: AthleticSport,
  prompt: string
): boolean {
  return promptContainsForeignSportActions(sport, prompt);
}
