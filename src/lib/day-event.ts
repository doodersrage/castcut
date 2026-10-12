/**
 * One event: a Day whose slots are consecutive moments of a single event — one place, one time,
 * one outfit — instead of morning-to-night beats, so the clips join into one continuous video.
 *
 * Moment 1 is made the usual Day way; every later moment is a same-camera edit of the moment
 * before ("Re-pose this still", day-end-pose.ts), which keeps the room, light, camera and clothes.
 * Each clip ends on the next moment's still (an end pose), so clip N's last frame is clip N+1's
 * first. Live (2026-10-12, trattoria, 4 moments on Edit 2511 + LTX-2.5): the joins differed by
 * ~2 grey levels (in-clip motion 0.1–0.3 per frame) — a slight grain change, hidden by a short
 * crossfade; pose, place and camera lined up at every join.
 */

import type { ChatMessage } from '@/lib/llm-client';
import type { DaySlot } from '@/lib/day-planner';

export const DAY_EVENT_MAX_LENGTH = 240;
const BEAT_MAX = 200;
const MOVE_MAX = 160;
const PLACE_MAX = 120;

export type DayEventTime = 'Morning' | 'Afternoon' | 'Evening' | 'Night';
const TIMES: readonly DayEventTime[] = ['Morning', 'Afternoon', 'Evening', 'Night'];

/** The event a Day follows (Day settings `dayEvent`); unset = an ordinary Day. */
export type DayEvent = {
  /** What the player wrote ("dinner date at a candlelit trattoria"). */
  text: string;
  /** Where every moment happens. */
  place: string;
  /** When it happens — every slot is labelled with it (the still prompt reads the label). */
  time: DayEventTime;
  /** The Day's own scenes from before the event — Back to a whole day puts them back. */
  before?: DayEventSlotBefore[];
  /** The props the plan listed — every moment edit keeps them where they lie. */
  props?: string[];
};

/** One slot's own scene from before the event. */
export type DayEventSlotBefore = Partial<
  Pick<
    DaySlot,
    'label' | 'location' | 'sceneHints' | 'sceneHintsTyped' | 'sceneHintsDay' | 'poseLayout'
  >
> & { id: string };

const BEFORE_TEXT_FIELDS = [
  'label',
  'location',
  'sceneHints',
  'sceneHintsTyped',
  'sceneHintsDay',
  'poseLayout',
] as const;

/** The slots' own scenes, kept when they become an event. */
export function dayEventBefore(slots: ReadonlyArray<DaySlot>): DayEventSlotBefore[] {
  return slots.map(slot => {
    const entry: DayEventSlotBefore = { id: slot.id };
    for (const field of BEFORE_TEXT_FIELDS) {
      const value = slot[field];
      if (typeof value === 'string' && value.trim()) entry[field] = value;
    }
    return entry;
  });
}

function normalizeBefore(value: unknown): DayEventSlotBefore[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: DayEventSlotBefore[] = [];
  for (const row of value.slice(0, 12)) {
    if (!row || typeof row !== 'object') continue;
    const record = row as Record<string, unknown>;
    if (typeof record.id !== 'string' || !record.id.trim()) continue;
    const entry: DayEventSlotBefore = { id: record.id.trim() };
    for (const field of BEFORE_TEXT_FIELDS) {
      const text = record[field];
      if (typeof text === 'string' && text.trim()) entry[field] = text.slice(0, 320);
    }
    out.push(entry);
  }
  return out.length ? out : undefined;
}

export function normalizeDayEvent(value: unknown): DayEvent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const text =
    typeof record.text === 'string' ? record.text.trim().slice(0, DAY_EVENT_MAX_LENGTH) : '';
  const place = typeof record.place === 'string' ? record.place.trim().slice(0, PLACE_MAX) : '';
  const time = TIMES.find(t => t === record.time) ?? 'Evening';
  const before = normalizeBefore(record.before);
  const props = Array.isArray(record.props)
    ? record.props
        .filter((prop): prop is string => typeof prop === 'string' && Boolean(prop.trim()))
        .map(prop => prop.trim().slice(0, 60))
        .slice(0, 6)
    : [];
  return text && place
    ? { text, place, time, ...(before ? { before } : {}), ...(props.length ? { props } : {}) }
    : undefined;
}

export type DayEventMoment = { beat: string; move: string };
export type DayEventPlan = {
  place: string;
  time: DayEventTime;
  moments: DayEventMoment[];
  /** What she does in the last moment's clip (it has no next moment to move into). */
  ending: string;
  /** Everything she touches, as the LLM described it once — all in the first picture. */
  props?: string[];
};

const ADULT_RE =
  /\b(nude|naked|topless|sex|sexual|orgasm|masturbat\w*|lingerie|underwear|bra|panties|breasts?|nipples?|genital\w*|erotic|strip\w*|undress\w*)\b/i;
/** The beat opens with her body position (the Everyday recipe and the re-pose edit read it). */
/**
 * Moving to another spot. The edit recomposes the picture around her new spot (the user's beach
 * event, "standing at the water's edge": a new view of the sea, the beach gone) — and the clip then
 * has to swing the camera. Moves stay on the spot.
 */
const RELOCATE_RE =
  /\b(?:walks?|walking|strolls?|strolling|wanders?|paces|heads? (?:to|over|back|toward|towards)|goes (?:to|over|back)|moves (?:to|over|across|toward|towards)|crosses|steps (?:over|to|toward|towards|into|out|back|away))\b/i;

/**
 * Lying down. The moment edit can't show it from the same camera: on the user's beach event
 * (2026-10-12) "lying on back in shallow surf" came back as a close, overhead shot, and the clips
 * into and out of it swung the whole camera round — twice. Events keep her upright.
 */
const LYING_RE =
  /\b(?:lying|lies|lie down|lies down|lays? (?:down|back)|laying|reclin\w*|sprawl\w*|on (?:her|his) (?:back|stomach|front|side)|rolls? (?:onto|over)|flat on)\b/i;
/**
 * Standing vs sitting. One posture for the whole event: standing → sitting on the towel was too
 * big a move for one clip, and LTX dissolved into the next picture (the user's beach run).
 */
const STANDING_RE = /\b(?:standing|stands|stand)\b/i;
const SITTING_RE = /\b(?:sitting|sits|seated|cross-legged|perched)\b/i;
function postureOf(beat: string): 'standing' | 'sitting' | null {
  const standing = STANDING_RE.test(beat);
  const sitting = SITTING_RE.test(beat);
  return standing === sitting ? null : standing ? 'standing' : 'sitting';
}

const STANCE_LEAD_RE =
  /^(?:she\s+(?:is\s+)?)?(?:sitting|sits|seated|perched|standing|stands|walking|walks|strolling|leaning|leans|lying|lies|reclining|kneeling|kneels|crouching|crouches|dancing|dances)\b/i;
/**
 * Leaving the picture. The next moment can't follow from her gone, and the last clip would end on
 * an empty room (an 8B model still wrote "walks out into the alley" as an ending).
 */
const LEAVES_RE =
  /\b(?:walks?|walking|heads?|heading|steps?|stepping)\s+(?:out|away|off|outside|for the door|to the door|toward the door|towards the door)\b|\b(?:leaves|leaving|exits?|exiting)\b|\bout of (?:frame|the frame|view|the picture|the room|sight)\b/i;
/** The last clip when the LLM's ending would leave the picture. */
const STAY_ENDING = 'smiles and settles where she is';

/**
 * Anyone else at all. Said to be off camera ("looking at the server"), the edit painted the waiter
 * in, and the moment stayed seated instead of standing (live, 2026-10-12) — so beats name nobody.
 */
const IN_FRAME_COMPANY_RE =
  /\b(together|both of them|the two of them|couple|arm in arm|hand in hand|hugs?|hugging|kiss(?:es|ing)?|dancing with|crowd|group of|him|waiter|waitress|server|bartender|barista|date|partner|boyfriend|girlfriend|husband|wife|friends?|guests?|someone|stranger|people)\b/i;

export function buildDayEventMessages(input: { event: string; count: number }): ChatMessage[] {
  const event = input.event.trim().slice(0, DAY_EVENT_MAX_LENGTH);
  return [
    {
      role: 'system',
      content: [
        'You plan a short video of one woman at ONE event, as consecutive moments filmed from one fixed camera in one place.',
        'Each moment follows straight on from the one before, a few seconds later: a small, clear change of pose or action, never a jump in time or place.',
        'She stays on ONE spot the whole time (at the same table, on the same towel, at the same counter): the moments change her pose and what she does there, never where she is — the camera cannot follow her around.',
        'Write each moment as ONE short line (under 25 words) that STARTS with her body position (sitting, standing, walking, leaning…), then what her hands hold and where she looks.',
        'Keep ONE body position for the whole event — if she starts seated she stays seated, if she starts standing she stays standing; the moments are what her hands, head and face do, or one small shift (leaning in, sitting back). She never stands up, sits down, kneels or lies down during the event.',
        'Each moment after the first also gets a "move": what she does to get there from the moment before, in under 20 words.',
        'List every object she holds or touches during the event in "props", each with one short fixed description ("a glass of red wine", "a small paperback book") — all of them are within her reach from the very first moment, and every moment calls each one by exactly those words. Nothing appears that is not in props.',
        'She stays in view the whole time: no moment and no ending leaves the picture.',
        'She is the only person in the picture: never mention anyone else (no waiter, date, friend or crowd) — she can look across the table, out of the window or at the camera. Fully clothed, everyday and non-sexual.',
        'Give the place (under 12 words), the time (Morning, Afternoon, Evening or Night) and an "ending": a small gesture that rounds off the last moment and leaves her as she was — a smile, a glance, a breath — in under 15 words.',
        'Answer with JSON only: {"place":"...","time":"...","props":["..."],"moments":[{"beat":"...","move":"..."}],"ending":"..."}, the first move empty.',
      ].join(' '),
    },
    {
      role: 'user',
      content: 'Event: morning coffee on the balcony\nMoments: 3',
    },
    {
      role: 'assistant',
      content:
        '{"place":"small sunny balcony with potted plants and a railing","time":"Morning","props":["a steaming white mug of coffee","a folded newspaper"],"moments":[{"beat":"standing at the balcony railing holding a steaming white mug of coffee in both hands, looking out at the view","move":""},{"beat":"standing at the railing, the steaming white mug of coffee raised to her lips, eyes closed","move":"lifts the mug and takes a slow sip"},{"beat":"standing at the railing, the mug in one hand and the folded newspaper in the other, glancing down at it","move":"lowers the mug and picks up the folded newspaper from the railing"}],"ending":"looks up from the newspaper and smiles at the morning"}',
    },
    { role: 'user', content: `Event: ${event}\nMoments: ${input.count}` },
  ];
}

function cleanLine(value: unknown, max: number): string {
  return typeof value === 'string'
    ? value
        .replace(/\s+/g, ' ')
        .replace(/^["'\s]+|["'\s.]+$/g, '')
        .trim()
        .slice(0, max)
    : '';
}

/**
 * The plan in the reply, checked: every moment needs a stance-led beat with no adult word and
 * no second person, and every later one a move. Null when it falls short of `count` — a gap would
 * break the chain, so the player is asked to try again rather than given a partial event.
 */
export function parseDayEventPlan(reply: string, count: number): DayEventPlan | null {
  const match = reply.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const place = cleanLine(record.place, PLACE_MAX);
  const timeWord = cleanLine(record.time, 20).toLowerCase();
  const time = TIMES.find(t => t.toLowerCase() === timeWord) ?? 'Evening';
  if (!place || ADULT_RE.test(place) || !Array.isArray(record.moments)) return null;
  const moments: DayEventMoment[] = [];
  for (const [index, row] of record.moments.entries()) {
    if (moments.length >= count) break;
    if (!row || typeof row !== 'object') return null;
    const beat = cleanLine((row as Record<string, unknown>).beat, BEAT_MAX);
    const move = cleanLine((row as Record<string, unknown>).move, MOVE_MAX);
    // The first moment is made the usual Day way, whose recipe reads her stance from the beat's
    // first words; later moments are edits and take any wording.
    if (!beat || (index === 0 && !STANCE_LEAD_RE.test(beat))) return null;
    if (LYING_RE.test(beat) || LYING_RE.test(move)) return null;
    if (RELOCATE_RE.test(move)) return null;
    if (ADULT_RE.test(beat) || ADULT_RE.test(move)) return null;
    if (IN_FRAME_COMPANY_RE.test(beat) || IN_FRAME_COMPANY_RE.test(move)) return null;
    if (LEAVES_RE.test(beat) || LEAVES_RE.test(move)) return null;
    if (index > 0 && !move) return null;
    moments.push({ beat, move: index > 0 ? move : '' });
  }
  // One posture: a plan that mixes standing and sitting moments is not one take.
  const postures = new Set(moments.map(moment => postureOf(moment.beat)).filter(Boolean));
  if (postures.size > 1) return null;
  putDownDroppedProps(moments);
  // The props the LLM listed go into the first picture as it described them; without a list,
  // the props read from the beats do.
  const props = Array.isArray(record.props)
    ? record.props
        .map(prop => cleanLine(prop, 60))
        .filter(prop => prop && !ADULT_RE.test(prop) && !IN_FRAME_COMPANY_RE.test(prop))
        .slice(0, 6)
    : [];
  if (props.length > 0) setOutListedProps(moments, props);
  else setOutLaterProps(moments);
  const written = cleanLine(record.ending, MOVE_MAX);
  if (ADULT_RE.test(written) || IN_FRAME_COMPANY_RE.test(written)) return null;
  const ending =
    written && !LEAVES_RE.test(written) && !LYING_RE.test(written) ? written : STAY_ENDING;
  return moments.length === count
    ? { place, time, moments, ending, ...(props.length ? { props } : {}) }
    : null;
}

/** Things she can hold. */
const PROP_WORDS =
  'seashells?|shells?|cups?|mugs?|wine ?glass(?:es)?|glass(?:es)?|bottles?|books?|phones?|forks?|spoons?|menus?|hairbrush|brush|lipstick|bucket|camera|umbrella|flowers?|bouquet|napkin|spatula|bowl|tray|pen|notebook|ice cream|cone|sunglasses|fan|letter|card|tablet|guitar|ball|drink';
/** A prop she holds: "holding a seashell", "a mug in both hands", "the glass to her lips". */
const HELD_RE = new RegExp(
  `\\b(?:holding|holds|grips?|gripping|cradling|carrying|raising|lifting|clutching)\\s+(?:up\\s+)?(?:a|an|the|her|his|both)?\\s*(?:[\\w-]+\\s+){0,3}?(${PROP_WORDS})\\b|\\b(${PROP_WORDS})\\s+(?:in (?:her|his|one|both) hands?|to (?:her|his) (?:ear|lips|mouth|chest))`,
  'gi'
);
/** What else says the prop is still in play (a book being read, a drink being sipped). */
const STILL_USING: Record<string, RegExp> = {
  book: /\b(?:page|pages|reading|reads|text|words)\b/i,
  notebook: /\b(?:page|pages|writing|writes)\b/i,
  phone: /\b(?:screen|scrolling|texting|call)\b/i,
  drink: /\b(?:sip|sips|sipping)\b/i,
};
const PUT_DOWN_RE = /\b(?:puts?|sets?|places?|lays?|drops?|tucks?|leaves?)\b/i;

/** One prop under one name: a "wineglass" is the "glass" (of wine) of the other moments. */
function canonicalProp(word: string): string {
  return word.toLowerCase().replace(/^wine ?(glass(?:es)?)$/, '$1');
}

function heldProps(beat: string): string[] {
  const found = new Set<string>();
  for (const match of beat.matchAll(HELD_RE)) {
    const word = canonicalProp(match[1] ?? match[2] ?? '');
    if (word) found.add(word);
  }
  return [...found];
}

/**
 * A prop she was holding that is gone from the next moment is put down in the move. The next
 * moment's edit leaves it out, and the clip made it vanish mid-gesture (the user's beach event: a
 * shell at her ear, gone the next frame). Only things she holds count — not the towel she sits on.
 */
function putDownDroppedProps(moments: DayEventMoment[]): void {
  for (let i = 1; i < moments.length; i += 1) {
    const now = `${moments[i]!.beat} ${moments[i]!.move}`.toLowerCase();
    const dropped = heldProps(moments[i - 1]!.beat).filter(prop => {
      const stem = prop.replace(/(?:es|s)$/, '');
      if (now.includes(stem)) return false;
      return !STILL_USING[stem]?.test(now);
    });
    if (dropped.length === 0 || PUT_DOWN_RE.test(moments[i]!.move)) continue;
    const list =
      dropped.length > 1 ? `${dropped.slice(0, -1).join(', ')} and ${dropped.at(-1)}` : dropped[0];
    moments[i] = {
      ...moments[i]!,
      move: `${moments[i]!.move}, putting the ${list} down beside her`,
    };
  }
}

/** The longest "small plastic cup" the plan writes for a prop (its own word when it has none). */
function fullestPropPhrase(moments: ReadonlyArray<DayEventMoment>, prop: string): string {
  const word = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "small plastic cup", "glass of red wine", "wineglass" (the same glass).
  const pattern = new RegExp(
    `\\b(?:a|an|the|her|his)\\s+((?:[\\w-]+\\s+){0,3}(?:wine ?)?${word}(?:\\s+of\\s+(?:[\\w-]+\\s+)?[\\w-]+)?)\\b`,
    'gi'
  );
  let best = prop;
  for (const moment of moments) {
    for (const match of moment.beat.matchAll(pattern)) {
      const phrase = match[1]!.toLowerCase().replace(/\s+/g, ' ').trim();
      // Not "holding a towel and a cup" — words that run on from something else.
      if (/\b(?:and|with|or|holding|holds)\b/.test(phrase)) continue;
      if (/\bof\b/.test(phrase.split(word)[0] ?? '')) continue;
      if (phrase.length > best.length) best = phrase;
    }
  }
  return best;
}

/** "a glass of red wine" → "glass", "a kettle on a burner" → "kettle": the noun the beats use. */
function propHead(prop: string): string {
  const before = prop
    .toLowerCase()
    .split(/\s+(?:of|on|in|with|from|for)\s+/)[0]!
    .trim();
  return (before.split(/\s+/).at(-1) ?? before).replace(/(?:es|s)$/, '');
}

/**
 * The listed props the first moment does not already show go into it, in front of her, as the
 * LLM described them — whatever the event, nothing she touches later is new to the picture.
 */
function setOutListedProps(moments: DayEventMoment[], props: ReadonlyArray<string>): void {
  const first = moments[0];
  if (!first) return;
  const beat = first.beat.toLowerCase();
  const missing = props
    .filter(prop => !beat.includes(propHead(prop)))
    .map(prop => prop.replace(/^(?:the)\s+/i, 'a '));
  if (missing.length === 0) return;
  const list =
    missing.length > 1 ? `${missing.slice(0, -1).join(', ')} and ${missing.at(-1)}` : missing[0];
  moments[0] = { ...first, beat: `${first.beat}, with ${list} within reach in front of her` };
}

/**
 * Everything she picks up later is already beside her in the first moment. Later moments are
 * edits of the first, so a prop the first picture lacks appeared in her hand from nowhere (the
 * user's beach event: a shell, sunglasses and a bottle materialised mid-clip).
 */
function setOutLaterProps(moments: DayEventMoment[]): void {
  const first = moments[0];
  if (!first) return;
  const have = new Set(heldProps(first.beat).map(prop => prop.replace(/(?:es|s)$/, '')));
  const later: string[] = [];
  for (const moment of moments.slice(1)) {
    for (const prop of heldProps(moment.beat)) {
      const stem = prop.replace(/(?:es|s)$/, '');
      if (have.has(stem) || first.beat.toLowerCase().includes(stem)) continue;
      have.add(stem);
      later.push(prop);
    }
  }
  if (later.length === 0) return;
  // The fullest description the plan gives ("a small plastic cup", not "a cup"): a vague first
  // picture let each edit draw its own cup, coffee one moment and something else the next.
  const described = later.map(prop => fullestPropPhrase(moments, prop));
  // "glasses" / "flowers" stand alone; "glass" is one.
  const things = described.map(phrase =>
    /[^s]s$/.test(phrase) || /ice cream$/.test(phrase) ? phrase : `a ${phrase}`
  );
  const list =
    things.length > 1 ? `${things.slice(0, -1).join(', ')} and ${things.at(-1)}` : things[0];
  // In front of her: "beside her" at a table put the glass off to one side, and the edit gave her a
  // new glass of wine instead of picking it up (the user's dinner date).
  moments[0] = { ...first, beat: `${first.beat}, with ${list} within reach in front of her` };
}

/**
 * Slots for the event, in board order: the moment's beat, the one place, the event's time as the
 * label (the still prompt's time of day), and `eventMove` — what she does in this slot's clip: on
 * the way to the next moment (its move), or for the last one the ending.
 */
export function applyDayEventPlan<T extends DaySlot>(slots: T[], plan: DayEventPlan): T[] {
  return slots.map((slot, index) => {
    const moment = plan.moments[index];
    if (!moment) return slot;
    return {
      ...slot,
      label: plan.time,
      sceneHints: moment.beat,
      location: plan.place,
      sceneHintsTyped: undefined,
      sceneHintsDay: undefined,
      poseLayout: undefined,
      posePhoto: undefined,
      eventMove:
        (index === plan.moments.length - 1 ? plan.ending : plan.moments[index + 1]?.move) ||
        undefined,
    };
  });
}

/**
 * Back to an ordinary Day: each slot gets its own scene from before the event back (label, place,
 * beat, pose), and the moves go. A slot with nothing kept is left blank for Day to fill — the
 * event's beach moments used to stay on every card.
 */
export function clearDayEventSlots<T extends DaySlot>(
  slots: T[],
  defaultLabel: (id: T['id']) => string,
  before?: ReadonlyArray<DayEventSlotBefore>
): T[] {
  const byId = new Map((before ?? []).map(entry => [entry.id, entry]));
  return slots.map(slot => {
    const { eventMove: _eventMove, ...rest } = slot;
    if (!before) return { ...rest, label: defaultLabel(slot.id) } as T;
    const kept = byId.get(slot.id);
    return {
      ...rest,
      label: kept?.label || defaultLabel(slot.id),
      location: kept?.location,
      sceneHints: kept?.sceneHints,
      sceneHintsTyped: kept?.sceneHintsTyped,
      sceneHintsDay: kept?.sceneHintsDay,
      poseLayout: kept?.poseLayout,
      posePhoto: undefined,
    } as T;
  });
}

/**
 * A later moment's still: a same-camera edit of the moment before. The beat is the pose words —
 * beats open with her stance, which is what the re-pose edit wants.
 */
export function dayEventMomentWords(slot: Pick<DaySlot, 'sceneHints'>): string {
  return (slot.sceneHints ?? '').trim().replace(/[.\s]+$/, '');
}

/**
 * Added to a moment's re-pose edit: the camera stays put. "Same camera framing" alone let Edit 2511
 * move in or overhead for a big pose change, and the clip then swung the camera (2026-10-12).
 * Picking something up: without the last sentence the edit drew a second book in her hands and
 * left the first on the towel (2 of 2); with it, one book, lifted from the towel (2 of 2, the user's
 * beach event, 2026-10-12).
 */
/**
 * Added to a moment's edit when the plan listed props: they stay where they lie unless this moment
 * moves them. The edit only kept what the beat named — a book in her lap vanished when the next
 * beat said "hands resting on her knees", then reappeared later (the user's beach event). Named:
 * the book stayed, 2 of 2 (1 of 2 without).
 */
export function dayEventKeepPropsLine(props: ReadonlyArray<string> | undefined): string {
  const names = (props ?? [])
    .map(prop => prop.trim().replace(/^(?:a|an)\s+/i, 'the '))
    .filter(Boolean);
  if (names.length === 0) return '';
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} stay exactly where they are in Image 1 unless she picks them up or puts them down now.`;
}

export const DAY_EVENT_EDIT_CAMERA_LINE =
  'The camera does not move: same height, distance and angle as Image 1, the whole room and her whole body framed as before. Anything she holds or has beside her is the same object as in Image 1. Anything she now holds is picked up from where it lay in Image 1 — it is no longer lying there; there is only one of each thing.';

/**
 * A moment's clip (no spoken line): it moves into the next moment's still, which it ends on. The
 * last moment has nothing to land on — the camera words hold its framing (the test clip's last
 * shot pushed in to her face).
 */
export function dayEventClipPrompt(input: {
  place: string;
  /** What she does in this clip (the slot's eventMove). */
  move?: string;
  /** The next moment's beat — where the clip ends (unset on the last moment). */
  nextBeat?: string;
  speaker?: 'She' | 'He';
  /**
   * A spoken line: said while she moves into the next moment. Talking in place froze a raised
   * hand or jumped mid-clip and drifted the camera; moving while speaking said the line word for
   * word and landed on the next moment (the user's beach event, 2026-10-12).
   */
  line?: string;
}): string {
  const who = input.speaker ?? 'She';
  const she = who === 'He' ? 'he' : 'she';
  const her = who === 'He' ? 'his' : 'her';
  const trim = (text?: string) => (text ?? '').trim().replace(/[.\s]+$/, '');
  const place = trim(input.place);
  const move = trim(input.move) || 'moves a little, naturally';
  const next = trim(input.nextBeat);
  return [
    'One continuous shot that starts on the first frame; the camera stays still and keeps the same framing — it does not move, zoom or push in.',
    `In the ${place}, ${she} ${move.replace(/^(?:she|he)\s+/i, '')}${next ? `; by the end of the clip ${she} is ${next}` : ''}.`,
    input.line?.trim()
      ? `As ${she} moves ${she} says clearly, "${input.line.trim()}" — ${her} lips move with every word.`
      : null,
    `Natural, unhurried movement; ${her} face, hair and clothes stay the same.`,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Ask `/api/day-event` for the plan (client). Rejects with the server's message. */
export async function requestDayEventPlan(input: {
  event: string;
  count: number;
  llmBody?: Record<string, unknown>;
}): Promise<DayEventPlan> {
  const response = await fetch('/api/day-event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ event: input.event, count: input.count, ...input.llmBody }),
  });
  const data = (await response.json().catch(() => ({}))) as { plan?: DayEventPlan; error?: string };
  if (!response.ok || !data.plan) throw new Error(data.error ?? 'One event failed.');
  return data.plan;
}
