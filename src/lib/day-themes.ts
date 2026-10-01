/**
 * Day themes — moods built on the Everyday pipeline (compact recipe, stance classes, catalog
 * kit on the Cast plate), each with its own beats, rooms and outfit pool. A theme id is stored
 * as the Day mood; `normalizeDayMood` maps it to 'everyday', so every render branch behaves as
 * Everyday and only the beat / setting pools and the kit pick read the theme.
 *
 * Each beat comes with its own room (like Sport and Vacation pairs) — drawn separately, a
 * karaoke beat landed in a taxi and a bed-reading beat in the bath.
 *
 * Beats name a stance the Everyday classifier knows (SEATED, LEANING, WALKING, DANCING, LYING,
 * KNEEL, GESTURE…) or a social layout the pose guide draws (hand in hand, hug, toast, head on
 * shoulder, selfie together), so a themed Day still spreads its poses.
 */

import { dayPartOf } from '@/lib/day-parts';

export type DayTheme = 'date-night' | 'night-out' | 'lazy-sunday' | 'photoshoot' | 'cosplay';

export type DayThemePart = 'morning' | 'afternoon' | 'evening' | 'night';

/** [beat, setting] */
export type DayThemeScene = readonly [beat: string, setting: string];

type ThemePools = Record<DayThemePart, DayThemeScene[]>;

export type DayThemeDefinition = {
  id: DayTheme;
  label: string;
  hint: string;
  /** Turn "Duo · companions" on when picked — the theme's beats need a second person. */
  companions: boolean;
  /** Catalog outfit labels this theme dresses from (garment nouns, not fit words). */
  kitRe: RegExp;
  /** Casual (Everyday) kit by day; the theme kit only for the evening outfit. */
  eveningKitOnly?: boolean;
  scenes: ThemePools;
  /** Scenes with a partner / friend — used when companions are on. */
  duoScenes: ThemePools;
};

const DATE_NIGHT: DayThemeDefinition = {
  id: 'date-night',
  label: 'Date night',
  hint: 'Getting ready, dinner, dancing, the walk home — a romantic evening out',
  eveningKitOnly: true,
  companions: true,
  kitRe:
    /\b(cocktail dress|wrap dress|slip dress|evening gown|ballroom dance dress|sweater dress|tuxedo|two-piece linen suit|three-piece wool suit|blazer)\b/i,
  scenes: {
    morning: [
      [
        'sitting cross-legged on the bed texting about tonight, phone at chest, soft smile',
        'sunny bedroom with rumpled sheets',
      ],
      [
        'standing at the wardrobe holding two dresses up, looking back over a shoulder',
        'bedroom with an open wardrobe',
      ],
    ],
    afternoon: [
      [
        'sitting at the vanity doing her makeup, leaning toward the mirror',
        'bedroom vanity with soft window light',
      ],
      [
        'twirling in the finished outfit in front of the hallway mirror',
        'hallway with a full-length mirror',
      ],
    ],
    evening: [
      [
        'seated at a candlelit restaurant table, chin on one hand, glass of wine in the other',
        'intimate candlelit restaurant with warm lamps',
      ],
      [
        'walking out of the restaurant into the evening, looking back over one shoulder',
        'restaurant doorway onto a lamplit street',
      ],
    ],
    night: [
      [
        'leaning against her front door at the end of the night, keys in hand, soft smile',
        'apartment front door under a porch light',
      ],
      [
        'sitting on the steps outside her building after the date, heels in one hand',
        'stone steps outside an apartment building at night',
      ],
    ],
  },
  duoScenes: {
    morning: [
      [
        'clinking coffee mugs with her partner at the kitchen counter, making plans for tonight',
        'bright kitchen with coffee on the counter',
      ],
    ],
    afternoon: [
      [
        'walking hand in hand with her partner to the restaurant, both dressed up, different faces',
        'city sidewalk at golden hour with shop windows',
      ],
      [
        'her partner fixing her necklace clasp from behind at the mirror, both smiling at the reflection',
        'bedroom with a full-length mirror',
      ],
    ],
    evening: [
      [
        'seated across a candlelit table from her partner, clinking wine glasses, different faces',
        'intimate candlelit restaurant with warm lamps',
      ],
      [
        'slow dancing with her partner on a small dance floor, her arms around his neck',
        'cozy wine bar with a small dance floor',
      ],
      [
        'sharing a dessert with her partner at a corner booth, leaning in close, different faces',
        'restaurant corner booth with string lights',
      ],
    ],
    night: [
      [
        'walking hand in hand with her partner under the streetlights, laughing, different faces',
        'quiet city street under warm streetlights',
      ],
      [
        "resting her head on her partner's shoulder on a bench by the river at night",
        'riverside promenade at night with city lights',
      ],
      [
        'hugging her partner goodnight at her front door, cheek on his shoulder',
        'apartment front door under a porch light',
      ],
    ],
  },
};

const NIGHT_OUT: DayThemeDefinition = {
  id: 'night-out',
  label: 'Night out',
  hint: 'Pre-drinks, the club, rooftop, karaoke, the taxi home — with friends',
  eveningKitOnly: true,
  companions: true,
  kitRe:
    /\b(cocktail dress|punk leather ensemble|y2k outfit|festival rave outfit|goth layered outfit|slip dress|jumpsuit|bomber jacket|leather jacket)\b/i,
  scenes: {
    morning: [
      [
        'lying on the couch the morning after with sunglasses on, one arm over her eyes',
        'messy living room the morning after a party',
      ],
      [
        "perched on the kitchen countertop eating toast in last night's outfit, legs dangling off the edge",
        'bright kitchen with party leftovers',
      ],
    ],
    afternoon: [
      [
        'standing at the bathroom mirror adjusting her hair, hands on hips, looking at the reflection',
        'bathroom with a big mirror and warm vanity lights',
      ],
      [
        'sitting on the bed edge pulling on an ankle boot, that foot raised onto the mattress',
        'bedroom with outfits laid on the bed',
      ],
    ],
    evening: [
      [
        'dancing with both arms up under colored club lights, hips mid-sway',
        'crowded nightclub dance floor with colored lights and haze',
      ],
      [
        'leaning on the rooftop bar rail, cocktail in hand, city lights behind, looking back over a shoulder',
        'rooftop bar with city lights at dusk',
      ],
    ],
    night: [
      [
        'singing into a karaoke mic with one arm raised, eyes closed, mid-song',
        'karaoke booth with neon lights',
      ],
      [
        'sitting in the back of a taxi at night, head against the window, city lights streaking',
        'back seat of a taxi at night with city lights outside',
      ],
      [
        'walking home at night with heels in one hand, mid-stride on the pavement',
        'empty city street at 2 a.m. under orange streetlights',
      ],
    ],
  },
  duoScenes: {
    morning: [
      [
        'sitting knee-to-knee with a friend on the couch sharing coffee after the party, different faces',
        'messy living room the morning after a party',
      ],
    ],
    afternoon: [
      [
        'mirror selfie with a friend before going out, both dressed up, different faces',
        'bedroom with a full-length mirror and outfits on the bed',
      ],
      [
        'clinking glasses with a friend at pre-drinks in the kitchen, different faces',
        'kitchen pre-drinks with fairy lights',
      ],
    ],
    evening: [
      [
        'dancing with a friend under club lights, both arms up, different faces',
        'crowded nightclub dance floor with colored lights and haze',
      ],
      [
        'selfie together with a friend at the rooftop bar, heads close, different faces',
        'rooftop bar with city lights at dusk',
      ],
    ],
    night: [
      [
        'singing karaoke with a friend, sharing one mic, different faces',
        'karaoke booth with neon lights',
      ],
      [
        'walking home arm in arm with a friend at night, both laughing, different faces',
        'empty city street at 2 a.m. under orange streetlights',
      ],
      [
        "side by side with a friend in the back of a taxi, her head on the friend's shoulder, different faces",
        'back seat of a taxi at night with city lights outside',
      ],
    ],
  },
};

const LAZY_SUNDAY: DayThemeDefinition = {
  id: 'lazy-sunday',
  label: 'Lazy Sunday',
  hint: 'Staying in — slow breakfast, couch, bath, cooking, reading in bed',
  companions: false,
  kitRe:
    /\b(sweater dress|romper|coastal grandmother look|cottagecore dress ensemble|light academia outfit|shirt dress|denim overall dress)\b/i,
  scenes: {
    morning: [
      [
        'stretching both arms overhead by the bedroom window, mid-yawn, hair messy',
        'sunlit bedroom with rumpled white sheets',
      ],
      [
        'sitting cross-legged on the bed with a mug of coffee in both hands',
        'cozy bedroom with morning light through the curtains',
      ],
      [
        'lying on her stomach across the bed scrolling her phone, feet up behind her',
        'sunlit bedroom with rumpled white sheets',
      ],
    ],
    afternoon: [
      [
        'curled up on the couch under a blanket reading a paperback',
        'cozy living room with a knitted blanket on the couch',
      ],
      [
        'standing at the stove flipping pancakes, spatula in hand, looking back over a shoulder',
        'warm kitchen with pancakes on the stove',
      ],
      [
        'sitting on the floor by the window watering potted plants',
        'bright living room corner full of potted plants',
      ],
    ],
    evening: [
      [
        'lying on the couch with a bowl of popcorn watching a movie, knees drawn up',
        'living room lit by the TV and a floor lamp',
      ],
      [
        'kneeling on the rug doing a jigsaw puzzle on the coffee table',
        'living room with a floor lamp and a coffee table',
      ],
      [
        'leaning on the kitchen counter stirring a pot of soup',
        'kitchen with a pot simmering on the stove',
      ],
    ],
    night: [
      [
        'standing at the bathroom mirror smoothing on a face mask, hair wrapped up in a towel, candles lit',
        'candlelit bathroom with a big mirror',
      ],
      [
        'lying in bed reading by the bedside lamp, propped on pillows',
        'bedroom lit by a single bedside lamp',
      ],
    ],
  },
  duoScenes: {
    morning: [
      [
        'sharing breakfast in bed with her partner, trays on their laps, different faces',
        'sunlit bedroom with rumpled white sheets',
      ],
    ],
    afternoon: [
      [
        'cooking with her partner at the stove, both stirring one pot, different faces',
        'warm kitchen with a pot on the stove',
      ],
    ],
    evening: [
      [
        "resting her head on her partner's shoulder on the couch under one blanket",
        'living room lit by the TV and a floor lamp',
      ],
    ],
    night: [
      [
        'reading side by side in bed with her partner, lamp on, different faces',
        'bedroom lit by a single bedside lamp',
      ],
    ],
  },
};

const PHOTOSHOOT: DayThemeDefinition = {
  id: 'photoshoot',
  label: 'Photoshoot',
  hint: 'Studio, editorial and street-style fashion shoot — posed, deliberate model shots',
  companions: false,
  kitRe:
    /\b(evening gown|cocktail dress|slip dress|tuxedo|three-piece wool suit|dark academia outfit|goth layered outfit|techwear ensemble|y2k outfit|flamenco dress|ballroom dance dress|sari with draped blouse|hanbok set|punk leather ensemble)\b/i,
  scenes: {
    morning: [
      [
        'posing against a seamless gray studio backdrop, hands on hips, chin up',
        'photo studio with a seamless pale gray backdrop and softboxes',
      ],
      [
        'sitting on a wooden stool in the studio with one leg crossed over the other knee, leaning forward toward the camera',
        'daylight studio with a wooden stool and a big window',
      ],
    ],
    afternoon: [
      [
        'street-style shot mid-stride across a crosswalk, looking over one shoulder',
        'city crosswalk with tall buildings',
      ],
      [
        'leaning against a graffiti wall, one foot up against it, arms crossed',
        'alley with a colorful graffiti wall',
      ],
      [
        'sitting on concrete steps in the city, elbows on knees, looking off to the side',
        'concrete city steps in bright sun',
      ],
    ],
    evening: [
      [
        'editorial pose on a rooftop at golden hour, one arm raised to her hair, wind in the fabric',
        'rooftop at golden hour with the skyline behind',
      ],
      [
        'reclining on a velvet chaise in a styled set, propped on one elbow',
        'styled studio set with a velvet chaise and warm lights',
      ],
    ],
    night: [
      [
        'posing under a neon sign at night, one hand in her hair, looking back over a shoulder',
        'city street under a pink neon sign',
      ],
      [
        'down on one knee on a dark studio floor under a single spotlight, the other foot planted forward',
        'dark studio with a single hard spotlight',
      ],
    ],
  },
  duoScenes: {
    morning: [
      [
        'the two models posing back to back in the studio, arms crossed, different faces',
        'photo studio with a seamless pale gray backdrop and softboxes',
      ],
    ],
    afternoon: [
      [
        'street-style shot of the two models walking side by side, mid-stride, different faces',
        'city crosswalk with tall buildings',
      ],
    ],
    evening: [
      [
        'the two models in an editorial pose on the rooftop, one leaning on the other, different faces',
        'rooftop at golden hour with the skyline behind',
      ],
    ],
    night: [
      [
        'the two models posing face to face under neon lights, different faces',
        'city street under a pink neon sign',
      ],
    ],
  },
};

const COSPLAY: DayThemeDefinition = {
  id: 'cosplay',
  label: 'Cosplay',
  hint: 'Costumes and themed sets — convention floor, photo shoots, fantasy locations',
  companions: false,
  kitRe:
    /\b(wizard robe outfit|knight armor cuirass look|samurai hakama set|circus ringmaster coat outfit|magician tailcoat|renaissance faire outfit|flamenco dress|sailor deck outfit|dirndl dress|hanbok set|goth layered outfit|pilot uniform|barbarian furs|necromancer robes|dwarven mail|rogue leather armor|battle mage robes|elven (?:ranger|gown)|druid woven vestments|knight plate armor|oracle ceremonial vestments|wizard robes|witch ritual robes|cleric vestments|sorceress gown|paladin cuirass)\b/i,
  scenes: {
    morning: [
      [
        'kneeling on the bedroom floor finishing her costume with a glue gun, pieces laid around her',
        'bedroom with a sewing table and costume pieces on the floor',
      ],
      [
        'standing at the mirror in full costume, hands on hips, checking the fit',
        'hotel room with a full-length mirror',
      ],
    ],
    afternoon: [
      [
        'striking a heroic pose on the convention floor, one arm pointing forward',
        'busy convention hall with banners and booths',
      ],
      [
        'walking through a crowded convention hall in costume, mid-stride, looking around',
        'busy convention hall with banners and booths',
      ],
      [
        'sitting on the edge of a convention stage in costume, legs dangling, taking a break',
        'convention stage with bright lights',
      ],
    ],
    evening: [
      [
        'posing in costume in a misty forest clearing, one arm raised',
        'misty forest clearing at golden hour',
      ],
      [
        'leaning against a castle stone wall in costume at golden hour, looking back over a shoulder',
        'old castle courtyard with stone walls',
      ],
    ],
    night: [
      [
        'posing in costume under neon city lights, one foot up on a step',
        'city street with neon signs at night',
      ],
      [
        'sitting cross-legged on the hotel bed in costume, removing a prop with a tired smile',
        'hotel room at night lit by a lamp',
      ],
    ],
  },
  duoScenes: {
    morning: [
      [
        "getting into costumes with a friend in the hotel room, adjusting each other's straps, different faces",
        'hotel room with costume pieces laid out on the bed',
      ],
    ],
    afternoon: [
      [
        'posing back to back with a friend in costume on the convention floor, different faces',
        'busy convention hall with banners and booths',
      ],
      [
        'selfie together with a friend in costume at the convention, different faces',
        'busy convention hall with banners and booths',
      ],
    ],
    evening: [
      [
        'high-fiving with a friend in costume after the cosplay contest, different faces',
        'convention stage with bright lights',
      ],
    ],
    night: [
      [
        'walking back to the hotel arm in arm with a friend in costume at night, different faces',
        'city street with neon signs at night',
      ],
    ],
  },
};

export const DAY_THEMES: Record<DayTheme, DayThemeDefinition> = {
  'date-night': DATE_NIGHT,
  'night-out': NIGHT_OUT,
  'lazy-sunday': LAZY_SUNDAY,
  photoshoot: PHOTOSHOOT,
  cosplay: COSPLAY,
};

export const DAY_THEME_OPTIONS = Object.values(DAY_THEMES).map(({ id, label, hint }) => ({
  id,
  label,
  hint,
}));

const PARTS: DayThemePart[] = ['morning', 'afternoon', 'evening', 'night'];

/** The theme a stored Day mood names, if any ('everyday', 'sport'… → null). */
export function dayThemeOf(value: unknown): DayThemeDefinition | null {
  const id = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return id in DAY_THEMES ? DAY_THEMES[id as DayTheme] : null;
}

function part(slotId: string): DayThemePart {
  return dayPartOf(slotId);
}

/** Scenes for a slot: solo scenes, plus partner / friend scenes when companions are on. */
export function dayThemeScenes(
  theme: DayThemeDefinition,
  slotId: string,
  companions: boolean
): DayThemeScene[] {
  const p = part(slotId);
  return companions ? [...theme.scenes[p], ...theme.duoScenes[p]] : theme.scenes[p];
}

export function dayThemeBeats(
  theme: DayThemeDefinition,
  slotId: string,
  companions: boolean
): string[] {
  return dayThemeScenes(theme, slotId, companions).map(([beat]) => beat);
}

export function dayThemeSettings(theme: DayThemeDefinition, slotId: string): string[] {
  const p = part(slotId);
  return [...new Set([...theme.scenes[p], ...theme.duoScenes[p]].map(([, setting]) => setting))];
}

/** The room a theme beat belongs in. */
export function dayThemeSettingForBeat(
  theme: DayThemeDefinition,
  beat: string
): string | undefined {
  const needle = beat.trim().toLowerCase();
  for (const p of PARTS) {
    for (const [b, setting] of [...theme.scenes[p], ...theme.duoScenes[p]]) {
      if (b.toLowerCase() === needle) return setting;
    }
  }
  return undefined;
}

/** A board belongs to the theme when its beat (and setting, if any) come from here. */
export function dayThemeOwns(theme: DayThemeDefinition, beat: string, setting: string): boolean {
  const all = PARTS.flatMap(p => [...theme.scenes[p], ...theme.duoScenes[p]]);
  const needle = beat.trim().toLowerCase();
  const settingNeedle = setting.trim().toLowerCase();
  return (
    all.some(([b]) => b.toLowerCase() === needle) &&
    (!settingNeedle || all.some(([, s]) => s.toLowerCase() === settingNeedle))
  );
}

/**
 * Beat + room for one slot: a fresh stance class when possible, and about half the slots from
 * the partner / friend scenes when companions are on.
 */
export function pickDayThemeScenePair(
  theme: DayThemeDefinition,
  slotId: string,
  options: {
    companions: boolean;
    /** People → Duo: only the partner / friend scenes. */
    duoOnly?: boolean;
    usedBeats: Set<string>;
    usedPoseClasses: Set<string>;
    poseClass: (beat: string) => string;
    random: () => number;
  }
): { beat: string; setting: string; poseClass: string } | null {
  const p = part(slotId);
  const solo = theme.scenes[p];
  const duo = options.companions ? theme.duoScenes[p] : [];
  const preferDuo = duo.length > 0 && (options.duoOnly === true || options.random() < 0.5);
  const pools = options.duoOnly && duo.length > 0 ? [duo] : preferDuo ? [duo, solo] : [solo, duo];
  for (const pool of pools) {
    const fresh = pool.filter(([beat]) => !options.usedBeats.has(beat.toLowerCase()));
    const newClass = fresh.filter(
      ([beat]) => !options.usedPoseClasses.has(options.poseClass(beat))
    );
    const choices = newClass.length > 0 ? newClass : fresh;
    if (choices.length > 0) {
      const [beat, setting] = choices[Math.floor(options.random() * choices.length)]!;
      return { beat, setting, poseClass: options.poseClass(beat) };
    }
  }
  const any = [...solo, ...duo];
  if (any.length === 0) return null;
  const [beat, setting] = any[Math.floor(options.random() * any.length)]!;
  return { beat, setting, poseClass: options.poseClass(beat) };
}
