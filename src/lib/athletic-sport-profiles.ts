export type AthleticSport =
  | 'triathlon'
  | 'track_field'
  | 'cycling'
  | 'martial_arts'
  | 'fencing'
  | 'gymnastics'
  | 'climbing'
  | 'yoga'
  | 'tennis'
  | 'basketball'
  | 'hockey'
  | 'baseball'
  | 'rugby'
  | 'soccer'
  | 'ski'
  | 'golf'
  | 'running'
  | 'swimming'
  | 'volleyball'
  | 'boxing'
  | 'surfing'
  | 'gym'
  | 'skateboarding';

export type AthleticSportProfile = {
  id: AthleticSport;
  hint: RegExp;
  outfitLabels: RegExp[];
  topLabels?: RegExp[];
  bottomLabels?: RegExp[];
  outerwearLabels?: RegExp[];
  footwearLabels: RegExp[];
  excludeLabels: RegExp[];
  guardrail: string;
  outfitPickRate?: number;
};

const WRONG_TRACK_OR_CASUAL =
  /\b(?:track pants|cargo shorts|chino shorts|denim shorts|sweatpants|sweat pants)\b/i;
const WRONG_CYCLING =
  /\b(?:cycling bib shorts|bib shorts|cycling jersey|cycling kit|cycling shoes)\b/i;
const WRONG_SOCCER = /\b(?:soccer cleats|soccer kit)\b/i;
const WRONG_RUNNING = /\b(?:running singlet|running shorts|running shoes)\b/i;
const WRONG_GENERIC_JERSEY =
  /\b(?:fleece mesh jersey|mesh jersey|compression top|jersey rain slicker)\b/i;

const CYCLING_BIKE_CUE =
  /\b(?:on (?:a |the |her |his |their )?bike|on bicycle|leaning forward on the bike|handlebars|pedaling|pedals|bike race|bicycle race|road race)\b/i;

function hintsSuggestCyclingByBike(value: string): boolean {
  if (/\b(?:motorbike|motorcycle|dirtbike)\b/i.test(value)) {
    return false;
  }

  if (CYCLING_BIKE_CUE.test(value)) {
    return true;
  }

  if (/\b(?:bike|bicycle|biking)\b/i.test(value)) {
    return true;
  }

  return false;
}

export const ATHLETIC_SPORT_PROFILES: readonly AthleticSportProfile[] = [
  {
    id: 'triathlon',
    hint: /\b(?:triathlon|triathlete|ironman|iron man)\b/i,
    outfitLabels: [/\btriathlon kit\b/i],
    footwearLabels: [/\b(?:running shoes|cycling shoes)\b/i],
    excludeLabels: [WRONG_SOCCER, WRONG_TRACK_OR_CASUAL, /\b(?:soccer cleats)\b/i],
    guardrail:
      'Triathlon activity—use a triathlon kit or swim-bike-run race kit with running shoes or cycling shoes. No track pants, soccer cleats, or street clothes.',
    outfitPickRate: 70,
  },
  {
    id: 'track_field',
    hint: /\b(?:javelin|discus|shot put|hammer throw|pole vault|hurling a (?:spear|javelin)|flings the spear|field event|heptathlon|decathlon throw)\b/i,
    outfitLabels: [],
    topLabels: [/\b(?:running singlet|singlet)\b/i],
    bottomLabels: [/\b(?:running shorts|track pants)\b/i],
    footwearLabels: [/\b(?:running shoes|cleats|trainer)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      /\b(?:cycling shoes|climbing shoes|soccer cleats)\b/i,
    ],
    guardrail:
      'Track and field event—use a running singlet with shorts or track pants and running shoes or spikes. No cycling kit, climbing shoes, or unrelated sports gear. Do not describe a cyclist; the subject is a field athlete.',
  },
  {
    id: 'cycling',
    hint: /\b(?:cyclist(?!-toned)|cyclists|cycling|gravel(?:\s+(?:bike|bicycle|cyclist|cyclists|ride|racing))?|bikepacking|cyclocross|mountain bike|mountain biker|road bike|road cycling|bicycle race|bike race|cycling race|peloton|bicyclist|cycling jersey|bib shorts|cycling kit|cycling bib|criterium|bike leg|cycle sprint|grand tour|tour de|cycling shoes|cycle shoes|on (?:a |the |her |his |their )?bike|on bicycle|leaning forward on the bike|handlebars|pedaling|pedals)\b/i,
    outfitLabels: [/\bcycling kit\b/i],
    topLabels: [/\bcycling jersey\b/i],
    bottomLabels: [/\b(?:cycling bib shorts|bib shorts)\b/i],
    footwearLabels: [/\b(?:cycling shoes|cleats)\b/i],
    excludeLabels: [
      WRONG_TRACK_OR_CASUAL,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_GENERIC_JERSEY,
      /\b(?:soccer cleats|yoga pants|climbing shoes)\b/i,
    ],
    guardrail:
      'Cycling activity—use a cycling jersey with bib shorts, or a one-piece cycling kit, plus cycling shoes or cleats, and a fastened cycling helmet on every rider. Hair may show at the temples or through helmet vents, but never bare heads. No track pants, sweatpants, generic mesh jerseys, climbing shoes, soccer cleats, running shoes, cold-weather layers stacked on kit, or a second outfit description.',
    outfitPickRate: 100,
  },
  {
    id: 'martial_arts',
    hint: /\b(?:karate|judogi|judo|taekwondo|dobok|martial arts|kickboxing|muay thai|bjj|brazilian jiu-jitsu|dojo|black belt|kung fu|kungfu)\b/i,
    outfitLabels: [/\bkarate gi\b/i, /\bjudogi\b/i, /\btaekwondo dobok\b/i],
    footwearLabels: [/\b(?:barefoot|training shoes|sneaker)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_SOCCER, WRONG_RUNNING, WRONG_TRACK_OR_CASUAL],
    guardrail:
      'Martial arts—use a karate gi, judogi, or taekwondo dobok. No cycling kit, track pants, soccer cleats, or casual streetwear.',
    outfitPickRate: 75,
  },
  {
    id: 'fencing',
    hint: /\b(?:fencer|fencing|épée|epee|foil|sabre|saber)\b/i,
    outfitLabels: [/\bfencing uniform\b/i],
    footwearLabels: [/\b(?:fencing shoes|training shoes|sneaker)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_SOCCER, WRONG_RUNNING, WRONG_TRACK_OR_CASUAL],
    guardrail:
      'Fencing—use a full fencing uniform with mask-ready jacket and breeches. No track pants, cycling kit, or soccer gear.',
    outfitPickRate: 80,
  },
  {
    id: 'gymnastics',
    hint: /\b(?:gymnast|gymnastics|balance beam|uneven bars|floor routine|vault table|pommel horse)\b/i,
    outfitLabels: [],
    topLabels: [/\bleotard\b/i],
    footwearLabels: [/\b(?:grip socks|barefoot|slippers)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|boots)\b/i,
    ],
    guardrail:
      'Gymnastics—use a fitted leotard (or unitard). No track pants, cycling bibs, cleats, or layered street clothes.',
  },
  {
    id: 'climbing',
    hint: /\b(?:climber|climbing|bouldering|boulder|rock wall|crag|sport climbing|lead climbing)\b/i,
    outfitLabels: [/\bclimbing harness outfit\b/i],
    footwearLabels: [/\bclimbing shoes\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|heels)\b/i,
    ],
    guardrail:
      'Climbing—use a harness-ready climbing outfit and climbing shoes. No track pants, cycling kit, or soccer cleats.',
    outfitPickRate: 60,
  },
  {
    id: 'yoga',
    hint: /\b(?:yoga|yogi|pilates|asana|downward dog|yoga mat)\b/i,
    outfitLabels: [],
    topLabels: [/\b(?:sports bra|tank top|crop top)\b/i],
    bottomLabels: [/\byoga pants\b/i],
    footwearLabels: [/\b(?:barefoot|grip socks|slippers)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|boots)\b/i,
    ],
    guardrail:
      'Yoga or pilates—use yoga pants or leggings with a fitted top or sports bra, barefoot or grip socks. No cleats, cycling kit, or track pants.',
  },
  {
    id: 'tennis',
    hint: /\b(?:tennis|wimbledon|tennis court|backhand|forehand|tennis match|tennis player)\b/i,
    outfitLabels: [/\btennis whites\b/i],
    bottomLabels: [/\btennis skirt\b/i],
    footwearLabels: [/\b(?:sneaker|trainer|running shoes)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|cycling shoes)\b/i,
    ],
    guardrail:
      'Tennis—use tennis whites or a polo with a tennis skirt or shorts and court sneakers. No cycling bibs, track pants, or soccer cleats.',
    outfitPickRate: 55,
  },
  {
    id: 'basketball',
    hint: /\b(?:basketball|nba|hoops|dunking|point guard|shooting guard|basketball player)\b/i,
    outfitLabels: [/\bbasketball jersey set\b/i],
    footwearLabels: [/\b(?:high-top sneaker|sneaker|trainer)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|cycling shoes)\b/i,
    ],
    guardrail:
      'Basketball—use a basketball jersey and shorts set with high-top sneakers. No cycling kit, track pants, or soccer cleats.',
    outfitPickRate: 65,
  },
  {
    id: 'hockey',
    hint: /\b(?:hockey player|ice hockey|hockey jersey|hockey stick|puck\b|nhl\b|hockey rink)\b/i,
    outfitLabels: [/\bhockey jersey outfit\b/i],
    footwearLabels: [/\b(?:skate|sneaker|trainer)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|cycling shoes)\b/i,
    ],
    guardrail:
      'Hockey—use a hockey jersey with padded shorts or a full hockey jersey outfit. No cycling kit, track pants, or soccer cleats.',
    outfitPickRate: 60,
  },
  {
    id: 'baseball',
    hint: /\b(?:baseball|batter|pitcher|catcher|home run|mlb|baseball player)\b/i,
    outfitLabels: [/\bbaseball uniform\b/i],
    footwearLabels: [/\b(?:cleats|sneaker|trainer)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_SOCCER, WRONG_TRACK_OR_CASUAL, /\b(?:cycling shoes)\b/i],
    guardrail:
      'Baseball—use a baseball uniform with cleats or turf shoes. No cycling kit, track pants, or soccer kit.',
    outfitPickRate: 65,
  },
  {
    id: 'rugby',
    hint: /\b(?:rugby|rugby player|scrum|try line|rugby match)\b/i,
    outfitLabels: [],
    topLabels: [/\brugby shirt\b/i],
    bottomLabels: [/\b(?:rugby shorts|shorts)\b/i],
    footwearLabels: [/\b(?:cleats|boots|trainer)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_TRACK_OR_CASUAL, /\b(?:cycling shoes|soccer cleats)\b/i],
    guardrail:
      'Rugby—use a rugby shirt with rugby shorts and boots or cleats. No cycling kit or track pants.',
  },
  {
    id: 'soccer',
    hint: /\b(?:soccer|goalkeeper|striker|midfielder|footballer|fútbol|futbol|soccer cleats|football boots|pitch player)\b/i,
    outfitLabels: [/\bsoccer kit\b/i],
    topLabels: [/\b(?:soccer jersey|football jersey)\b/i],
    bottomLabels: [/\b(?:soccer shorts|football shorts)\b/i],
    footwearLabels: [/\b(?:soccer cleats|football boots|cleats)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cycling shoes|running shoes)\b/i,
    ],
    guardrail:
      'Soccer—use a soccer jersey with shorts or a soccer kit and soccer cleats. No cycling bibs, track pants, or running shoes.',
    outfitPickRate: 60,
  },
  {
    id: 'ski',
    hint: /\b(?:skier|skiing|ski slope|slalom|downhill ski|snowboard|snowboarding|ski resort)\b/i,
    outfitLabels: [/\bski bib\b/i],
    outerwearLabels: [/\bski jacket\b/i],
    footwearLabels: [/\b(?:ski boot|boots)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|sneaker)\b/i,
    ],
    guardrail:
      'Skiing or snowboarding—use a ski jacket with ski pants or bib and winter boots. No cycling kit, track pants, or cleats.',
    outfitPickRate: 50,
  },
  {
    id: 'golf',
    hint: /\b(?:golfer|golf course|golf swing|putting green|fairway|golf bag|tee box)\b/i,
    outfitLabels: [],
    topLabels: [/\b(?:polo|quarter-zip|golf shirt)\b/i],
    bottomLabels: [/\b(?:chino|golf pants|shorts)\b/i],
    footwearLabels: [/\bgolf shoes\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|cycling shoes)\b/i,
    ],
    guardrail:
      'Golf—use a polo with tailored pants or shorts and golf shoes. No cycling kit, track pants, or cleats.',
  },
  {
    id: 'running',
    hint: /\b(?:sprinter|sprinting|marathon|jogger|jogging|trail runner|runner\b|running (?:shoes|shorts|singlet|on|at|through|along)|track and field|track meet|on (?:the )?track|at (?:the )?track|hurdles|hurdler|100m dash|400m dash|relay race|starting blocks|finish line|5k\b|10k\b|half marathon)\b/i,
    outfitLabels: [],
    topLabels: [/\b(?:running singlet|singlet|mesh jersey)\b/i],
    bottomLabels: [/\b(?:running shorts|track pants)\b/i],
    footwearLabels: [/\b(?:running shoes|trail runner|trainer)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_SOCCER, /\b(?:soccer cleats|cycling shoes)\b/i],
    guardrail:
      'Running activity—use a running singlet or top with visible running shorts or track pants and running shoes. Never a topless, bottomless, or sports-bra-only look. No cycling bibs, soccer cleats, or formalwear.',
  },
  {
    id: 'swimming',
    hint: /\b(?:swimmer|swimming|freestyle|butterfly stroke|breaststroke|backstroke|lap swim|pool lane|swim cap|goggles|starting block|streamline dive|flip turn)\b/i,
    outfitLabels: [/\b(?:swimsuit|racing suit|swim skin)\b/i],
    footwearLabels: [/\b(?:barefoot|swim fins)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|boots|sneakers)\b/i,
    ],
    guardrail:
      'Swimming—use a racing swimsuit or swim skin, barefoot or fins. No cycling kit, track pants, cleats, or street clothes.',
    outfitPickRate: 80,
  },
  {
    id: 'volleyball',
    hint: /\b(?:volleyball|spike(?:ing)?|setter|libero|beach volleyball|volleyball court)\b/i,
    outfitLabels: [],
    topLabels: [/\b(?:jersey|tank|sports bra)\b/i],
    bottomLabels: [/\b(?:volleyball shorts|shorts|spandex)\b/i],
    footwearLabels: [/\b(?:court shoes|sneaker|trainer|barefoot)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|cycling shoes)\b/i,
    ],
    guardrail:
      'Volleyball—use a jersey or tank with volleyball shorts and court shoes (or barefoot for beach). No cycling kit, track pants, or soccer cleats.',
    outfitPickRate: 65,
  },
  {
    id: 'boxing',
    hint: /\b(?:boxer|boxing|punching bag|sparring|heavy bag|jab(?:bing)?|hook punch|uppercut|boxing ring|gloves up)\b/i,
    outfitLabels: [],
    topLabels: [/\b(?:tank|singlet|sports bra)\b/i],
    bottomLabels: [/\b(?:boxing shorts|trunks|shorts)\b/i],
    footwearLabels: [/\b(?:boxing shoes|high-top|sneaker|barefoot)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cycling shoes|soccer cleats)\b/i,
    ],
    guardrail:
      'Boxing—use boxing shorts or trunks with a fitted top or tank and boxing shoes or high-tops. No cycling kit, track pants, or soccer cleats.',
    outfitPickRate: 70,
  },
  {
    id: 'surfing',
    hint: /\b(?:surfer|surfing|surfboard|paddling out|catching a wave|barrel ride|shortboard|longboard)\b/i,
    outfitLabels: [/\b(?:wetsuit|rash guard|boardshorts)\b/i],
    footwearLabels: [/\b(?:barefoot|booties)\b/i],
    excludeLabels: [
      WRONG_CYCLING,
      WRONG_SOCCER,
      WRONG_RUNNING,
      WRONG_TRACK_OR_CASUAL,
      /\b(?:cleats|sneakers|boots)\b/i,
    ],
    guardrail:
      'Surfing—use a wetsuit, rash guard with boardshorts, or swimwear with bare feet. No cycling kit, track pants, or cleats.',
    outfitPickRate: 75,
  },
  // Last so a "gym corner with a heavy bag" stays boxing — gym needs lifting words, not "gym".
  {
    id: 'gym',
    hint: /\b(?:barbell|dumbbells?|kettlebells?|deadlift(?:s|ing)?|squat rack|power rack|bench press|pull-?ups?|chin-?ups?|push-?ups?|press-?ups?|forearm plank|plank hold|weight room|lifting weights|strength training|weight training|gym floor|leg day)\b/i,
    outfitLabels: [/\b(?:gym|workout|training|athleisure|activewear)\b/i],
    topLabels: [/\b(?:sports bra|tank|tank top|crop top|training tee)\b/i],
    bottomLabels: [/\b(?:leggings|joggers|gym shorts|training shorts|bike shorts)\b/i],
    footwearLabels: [/\b(?:training shoes|trainers|sneakers?|lifting shoes|cross-?trainers)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_SOCCER, /\b(?:cleats|wetsuit|boots|heels|sandals)\b/i],
    guardrail:
      'Gym strength training—use leggings, joggers or gym shorts with a sports bra, tank or training tee and training shoes. No cleats, cycling kit, wetsuits, or street shoes.',
    outfitPickRate: 70,
  },
  {
    id: 'skateboarding',
    hint: /\b(?:skateboard(?:s|ing|er)?|skate ?park|skate bowl|kickflip|ollie|half-?pipe|grinding (?:a|the) (?:rail|ledge|coping))\b/i,
    outfitLabels: [/\b(?:skater|streetwear|skate)\b/i],
    topLabels: [/\b(?:hoodie|t-shirt|tee|flannel|graphic)\b/i],
    bottomLabels: [/\b(?:cargo pants|cargo shorts|baggy jeans|skate shorts|jeans|work pants)\b/i],
    footwearLabels: [/\b(?:skate shoes|sneakers?|high-tops?|canvas shoes)\b/i],
    excludeLabels: [WRONG_CYCLING, WRONG_SOCCER, /\b(?:cleats|wetsuit|heels|sandals|leotard)\b/i],
    guardrail:
      'Skateboarding—use streetwear: a tee or hoodie with cargo pants, baggy jeans or skate shorts and flat skate shoes. No cleats, wetsuits, heels, or sandals.',
    outfitPickRate: 70,
  },
];

const PROFILE_BY_ID = new Map(ATHLETIC_SPORT_PROFILES.map(profile => [profile.id, profile]));

export function inferAthleticSport(hints?: string): AthleticSport | null {
  const value = hints?.trim() ?? '';
  if (!value) {
    return null;
  }

  for (const profile of ATHLETIC_SPORT_PROFILES) {
    if (profile.hint.test(value)) {
      return profile.id;
    }
  }

  if (hintsSuggestCyclingByBike(value)) {
    return 'cycling';
  }

  return null;
}

export function getAthleticSportProfile(
  sport: AthleticSport | null | undefined
): AthleticSportProfile | null {
  if (!sport) {
    return null;
  }

  return PROFILE_BY_ID.get(sport) ?? null;
}

export function getAthleticSportGuardrail(sport: AthleticSport): string {
  const profile = PROFILE_BY_ID.get(sport);
  if (!profile) {
    return '';
  }

  return `${profile.guardrail} Use exactly one sport and one outfit—do not mix incompatible actions (e.g. cycling plus javelin throw) or add a second wardrobe sentence.`;
}

export function hintsDescribeCyclingActivity(hints?: string): boolean {
  return inferAthleticSport(hints) === 'cycling';
}

export function labelMatchesAnyPattern(label: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(label));
}

export function labelMatchesExcludePatterns(label: string, patterns: readonly RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(label));
}

export function summaryMatchesSportWardrobe(sport: AthleticSport, summary: string): boolean {
  const profile = getAthleticSportProfile(sport);
  if (!profile || !summary.trim()) {
    return false;
  }

  const chunks = summary
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  return chunks.every(chunk => {
    if (
      sport === 'cycling' &&
      /\b(?:cycling helmet|bike helmet|aero helmet|gravel helmet|mountain bike helmet|track cycling helmet|cyclocross helmet|helmet)\b/i.test(
        chunk
      )
    ) {
      return true;
    }

    if (labelMatchesExcludePatterns(chunk, profile.excludeLabels)) {
      return false;
    }

    const patterns = [
      ...profile.outfitLabels,
      ...(profile.topLabels ?? []),
      ...(profile.bottomLabels ?? []),
      ...(profile.outerwearLabels ?? []),
      ...profile.footwearLabels,
    ];

    return labelMatchesAnyPattern(chunk, patterns);
  });
}

export function promptContainsSportWardrobeConflict(
  prompt: string,
  sport: AthleticSport,
  assignedSummary: string
): boolean {
  const profile = getAthleticSportProfile(sport);
  if (!profile) {
    return false;
  }

  const lower = prompt.toLowerCase();
  if (profile.excludeLabels.some(pattern => pattern.test(lower))) {
    return true;
  }

  if (!assignedSummary.trim()) {
    return false;
  }

  return !summaryMatchesSportWardrobe(sport, assignedSummary);
}
