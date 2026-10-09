/**
 * Recurring places: a Cast member's home and workplace look the same in every still. Day draws
 * each beat's Setting on its own ("sunlit bedroom with rumpled white sheets", "warm kitchen with
 * a pot on the stove"), so every room was a different apartment. A place is one fixed look —
 * the whole home's walls / floors / windows, plus each room's signature pieces — added to any
 * Setting that is a room of that home (or that office).
 *
 * Every Cast has a home and a workplace without setting anything up (a design picked from their
 * id); Cast → Places changes it or turns it off.
 */

export type CastPlaceKind = 'home' | 'work';

export type HomeRoom = 'bedroom' | 'bathroom' | 'kitchen' | 'living room' | 'hallway' | 'balcony';
export type WorkRoom = 'desk' | 'meeting room' | 'kitchen';

export type CastPlaceDesign = {
  id: string;
  label: string;
  /** What every room of it shares. */
  style: string;
  rooms: Record<string, string>;
};

/**
 * Live (2026-10-09, Rapid, same 8 home beats): no place = a different home in every still; Brick
 * loft = one apartment throughout (walls, windows, floors, each room's pieces). Bathroom pieces
 * name no mirror — the beats bring their own, and a second one cloned her in it.
 */
export const HOME_DESIGNS: readonly CastPlaceDesign[] = [
  {
    id: 'brick-loft',
    label: 'Brick loft',
    style:
      'white-painted brick walls, honey oak floorboards, tall black-framed windows, brass fixtures',
    rooms: {
      bedroom:
        'a low oak bed with oatmeal linen bedding and a mustard throw, a rattan pendant lamp',
      bathroom: 'white zellige tiles, brass taps, a freestanding white tub',
      kitchen: 'sage-green cabinets, white marble counters, open oak shelves with cream ceramics',
      'living room': 'a deep-green velvet sofa, a round jute rug, a tall monstera plant',
      hallway: 'a tall arched oak mirror, a row of brass coat hooks',
      balcony: 'a narrow black iron balcony with terracotta pots',
    },
  },
  {
    id: 'scandi',
    label: 'Bright Scandi flat',
    style: 'white walls, pale ash floors, big plain windows with sheer linen curtains',
    rooms: {
      bedroom: 'a white bed with light-gray linen, a round paper pendant lamp, a birch nightstand',
      bathroom: 'pale gray terrazzo tiles, a floating oak shelf, a glass shower',
      kitchen: 'white flat-front cabinets, a pale oak worktop, a row of white mugs on a shelf',
      'living room': 'a light-gray boucle sofa, a pale wool rug, a tall fiddle-leaf fig',
      hallway: 'a white bench under a round wall mirror',
      balcony: 'a small balcony with a folding birch chair',
    },
  },
  {
    id: 'old-flat',
    label: 'Cozy old flat',
    style: 'warm cream walls, worn herringbone parquet, old white sash windows, vintage lamps',
    rooms: {
      bedroom: 'an iron bed frame with a floral quilt, a wicker chair piled with cushions',
      bathroom: 'black-and-white checkered floor tiles, a pedestal sink, a clawfoot tub',
      kitchen: 'cream painted cabinets, butcher-block counters, copper pans hanging',
      'living room': 'a rust-orange corduroy sofa, a patterned red rug, overflowing bookshelves',
      hallway: 'a vintage gilded mirror and a wooden coat stand',
      balcony: 'a small balcony with string lights and herb pots',
    },
  },
  {
    id: 'city-modern',
    label: 'Modern city apartment',
    style: 'charcoal walls, polished concrete floors, floor-to-ceiling windows over the city',
    rooms: {
      bedroom: 'a platform bed with charcoal bedding, a black marble nightstand, a globe lamp',
      bathroom: 'black slate tiles, matte black taps, a walk-in rain shower',
      kitchen: 'matte black cabinets, a white quartz island, globe pendant lights',
      'living room': 'a cognac leather sofa, a black marble coffee table',
      hallway: 'a black-framed floor mirror and a slim console table',
      balcony: 'a glass-railed balcony high over the city',
    },
  },
];

export const WORK_DESIGNS: readonly CastPlaceDesign[] = [
  {
    id: 'glass-office',
    label: 'Bright glass office',
    style: 'a bright modern office: white desks, glass partitions, light oak floors, big windows',
    rooms: {
      desk: 'a white desk with a laptop and a small potted plant',
      'meeting room': 'a glass-walled meeting room with a long oak table and a whiteboard',
      kitchen: 'a white office kitchen with a coffee machine and oak stools',
    },
  },
  {
    id: 'brick-studio',
    label: 'Brick studio',
    style: 'a creative studio office: exposed brick, black steel windows, plants everywhere',
    rooms: {
      desk: 'a wooden trestle desk with a monitor and sketches pinned above it',
      'meeting room': 'a meeting nook with a reclaimed wood table and a chalkboard wall',
      kitchen: 'a small kitchen corner with open shelves and a vintage espresso machine',
    },
  },
  {
    id: 'tower',
    label: 'Corporate tower',
    style:
      'a corporate office high in a tower: dark wood, gray carpet, frosted glass, skyline views',
    rooms: {
      desk: 'a dark wood desk with two monitors',
      'meeting room': 'a boardroom with a long dark table and leather chairs',
      kitchen: 'a sleek office pantry with a steel coffee machine',
    },
  },
];

import {
  getCharacter,
  upsertCharacter,
  type CastPlaceChoice,
  type CastPlaces,
  type CharacterRecord,
} from './character-os';

export type { CastPlaceChoice, CastPlaces };

/** Longest own description kept (one line of a prompt). */
export const CAST_PLACE_CUSTOM_MAX = 200;

function hash(value: string): number {
  let h = 0;
  for (const char of value) h = (h * 31 + char.charCodeAt(0)) >>> 0;
  return h;
}

function designsOf(kind: CastPlaceKind): readonly CastPlaceDesign[] {
  return kind === 'home' ? HOME_DESIGNS : WORK_DESIGNS;
}

/** The design a Cast gets without picking one — stable for their id. */
export function defaultPlaceDesign(castId: string, kind: CastPlaceKind): CastPlaceDesign {
  const list = designsOf(kind);
  return list[hash(`${kind}:${castId}`) % list.length]!;
}

export function normalizeCastPlaces(value: unknown): CastPlaces | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const out: CastPlaces = {};
  for (const kind of ['home', 'work'] as const) {
    const raw = (value as Record<string, unknown>)[kind];
    if (!raw || typeof raw !== 'object') continue;
    const choice = raw as Record<string, unknown>;
    if (choice.off === true) {
      out[kind] = { off: true };
    } else if (typeof choice.custom === 'string' && choice.custom.trim()) {
      out[kind] = {
        custom: choice.custom.replace(/\s+/g, ' ').trim().slice(0, CAST_PLACE_CUSTOM_MAX),
      };
    } else if (
      typeof choice.design === 'string' &&
      designsOf(kind).some(design => design.id === choice.design)
    ) {
      out[kind] = { design: choice.design };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

/** A place as it is used: its shared look and (for a design) each room's pieces. Null = off. */
export type ResolvedPlace = {
  kind: CastPlaceKind;
  label: string;
  style: string;
  rooms: Record<string, string>;
};

export function resolveCastPlace(
  cast: { id?: string; places?: CastPlaces } | null | undefined,
  kind: CastPlaceKind
): ResolvedPlace | null {
  const id = cast?.id?.trim();
  if (!id) return null;
  const choice = normalizeCastPlaces(cast?.places)?.[kind];
  if (choice && 'off' in choice) return null;
  if (choice && 'custom' in choice) {
    return { kind, label: 'Own description', style: choice.custom, rooms: {} };
  }
  const design =
    (choice && 'design' in choice && designsOf(kind).find(entry => entry.id === choice.design)) ||
    defaultPlaceDesign(id, kind);
  return { kind, label: design.label, style: design.style, rooms: design.rooms };
}

/** Somewhere else with rooms — never her home. */
const NOT_HOME_RE =
  /\b(hotel|motel|resort|villa|cabin|chalet|cottage|airbnb|hostel|dorm|friend'?s|party at|office|studio|gym|spa|caf[eé]|bar|pub|restaurant|club|cruise|beach|pool|lobby|boutique|store|shop|salon|hospital|dressing room|backstage|locker|campsite|tent|train|plane|car\b|outside|exterior|porch|steps|building|front door|stairwell|rooftop|garden|yard|street)\b/i;
const WORK_RE = /\b(office|open-plan|meeting room|conference room|boardroom|coworking|cubicle)\b/i;
const NOT_WORK_RE =
  /\b(entrance|outside|exterior|building|street|lobby|parking|home office|near|caf[eé]|restaurant|bar|pub)\b/i;

const HOME_ROOMS: Array<[HomeRoom, RegExp]> = [
  ['bathroom', /\b(bathroom|bath tub|bathtub|shower)\b/i],
  ['kitchen', /\b(kitchen|fridge|stove)\b/i],
  ['bedroom', /\b(bedroom|bedside|bed)\b/i],
  ['bathroom', /\bvanity\b/i],
  ['living room', /\b(living room|lounge|sofa|couch)\b/i],
  ['hallway', /\b(hallway|entryway|entrance hall)\b/i],
  ['balcony', /\bbalcony\b/i],
];
const WORK_ROOMS: Array<[WorkRoom, RegExp]> = [
  ['meeting room', /\b(meeting room|conference room|boardroom|whiteboard)\b/i],
  ['kitchen', /\b(kitchen|pantry|coffee machine)\b/i],
  ['desk', /\b(desk|open-plan|office)\b/i],
];

/** Which room of which place a Setting is, or null when it is somewhere else. */
export function placeRoomOfSetting(
  setting: string | null | undefined
): { kind: CastPlaceKind; room: string } | null {
  const text = setting?.trim() ?? '';
  if (!text) return null;
  if (WORK_RE.test(text) && !NOT_WORK_RE.test(text)) {
    const room = WORK_ROOMS.find(([, re]) => re.test(text))?.[0] ?? 'desk';
    return { kind: 'work', room };
  }
  if (NOT_HOME_RE.test(text)) return null;
  const room = HOME_ROOMS.find(([, re]) => re.test(text))?.[0];
  if (room) return { kind: 'home', room };
  return /\b(at home|apartment|flat|her place|his place)\b/i.test(text)
    ? { kind: 'home', room: 'living room' }
    : null;
}

/** Marks a Setting that already carries a place (so it is never added twice). */
const PLACE_MARK_RE = /\b(?:in (?:her|his) (?:apartment|home)|at (?:her|his) office):/;

/**
 * The Setting with the Cast's place: "warm kitchen with a pot on the stove, in her apartment:
 * <shared look>; <the kitchen's pieces>". Unchanged when it is not a room of their home or
 * office, or the place is off.
 */
export function withCastPlace(
  setting: string | null | undefined,
  cast: { id?: string; places?: CastPlaces } | null | undefined,
  lead: 'woman' | 'man' | string = 'woman'
): string | undefined {
  const text = setting?.trim();
  if (!text) return text || undefined;
  if (PLACE_MARK_RE.test(text)) return text;
  const where = placeRoomOfSetting(text);
  if (!where) return text;
  const place = resolveCastPlace(cast, where.kind);
  if (!place) return text;
  const pronoun = lead === 'man' ? 'his' : 'her';
  const head = where.kind === 'home' ? `in ${pronoun} apartment` : `at ${pronoun} office`;
  const room = place.rooms[where.room];
  return `${text.replace(/[.\s]+$/, '')}, ${head}: ${place.style}${room ? `; ${room}` : ''}`;
}

/** Save one place choice on the Cast (null = back to the design picked for them). */
export function saveCastPlace(
  castId: string,
  kind: CastPlaceKind,
  choice: CastPlaceChoice | null
): CharacterRecord | undefined {
  const character = getCharacter(castId.trim());
  if (!character) return undefined;
  const places: CastPlaces = { ...(normalizeCastPlaces(character.places) ?? {}) };
  if (choice) places[kind] = choice;
  else delete places[kind];
  const next = normalizeCastPlaces(places);
  if (next) {
    upsertCharacter({ ...character, places: next });
  } else {
    const { places: _dropped, ...rest } = character;
    void _dropped;
    upsertCharacter(rest);
  }
  return getCharacter(character.id);
}
