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
/** Cut's crossfade at an event's joins (the test video's 0.25 s hid the grain change). */
export const DAY_EVENT_CROSSFADE_SEC = 0.25;
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
};

export function normalizeDayEvent(value: unknown): DayEvent | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const text =
    typeof record.text === 'string' ? record.text.trim().slice(0, DAY_EVENT_MAX_LENGTH) : '';
  const place = typeof record.place === 'string' ? record.place.trim().slice(0, PLACE_MAX) : '';
  const time = TIMES.find(t => t === record.time) ?? 'Evening';
  return text && place ? { text, place, time } : undefined;
}

export type DayEventMoment = { beat: string; move: string };
export type DayEventPlan = {
  place: string;
  time: DayEventTime;
  moments: DayEventMoment[];
  /** What she does in the last moment's clip (it has no next moment to move into). */
  ending: string;
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
        'Keep ONE body position for the whole event — seated at a table stays seated, standing at a counter stays standing; the moments are what her hands and face do. At most one change, only standing up or sitting down right where she is. Never kneel or crouch unless the action is down on the floor, and she never lies down.',
        'Each moment after the first also gets a "move": what she does to get there from the moment before, in under 20 words.',
        'Keep her props from moment to moment; anything new she picks up is already there in the place (on the table, on the counter).',
        'She stays in view the whole time: no moment and no ending leaves the picture.',
        'She is the only person in the picture: never mention anyone else (no waiter, date, friend or crowd) — she can look across the table, out of the window or at the camera. Fully clothed, everyday and non-sexual.',
        'Give the place (under 12 words), the time (Morning, Afternoon, Evening or Night) and an "ending": a small action that rounds off the last moment, in under 20 words.',
        'Answer with JSON only: {"place":"...","time":"...","moments":[{"beat":"...","move":"..."}],"ending":"..."}, the first move empty.',
      ].join(' '),
    },
    {
      role: 'user',
      content: 'Event: morning coffee on the balcony\nMoments: 3',
    },
    {
      role: 'assistant',
      content:
        '{"place":"small sunny balcony with potted plants and a railing","time":"Morning","moments":[{"beat":"standing at the balcony door holding a steaming mug in both hands, looking out at the view","move":""},{"beat":"leaning on the railing with both forearms, the mug in one hand, smiling at the street below","move":"walks to the railing and leans on it with both forearms"},{"beat":"sitting on the small chair by the railing, the mug raised to her lips, eyes closed","move":"sits down on the chair beside her and lifts the mug to take a sip"}],"ending":"lowers the mug, opens her eyes and smiles at the morning"}',
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
  const written = cleanLine(record.ending, MOVE_MAX);
  if (ADULT_RE.test(written) || IN_FRAME_COMPANY_RE.test(written)) return null;
  const ending =
    written && !LEAVES_RE.test(written) && !LYING_RE.test(written) ? written : STAY_ENDING;
  return moments.length === count ? { place, time, moments, ending } : null;
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

/** Back to an ordinary Day: the event's labels and moves go; beats and places stay to edit. */
export function clearDayEventSlots<T extends DaySlot>(
  slots: T[],
  defaultLabel: (id: T['id']) => string
): T[] {
  return slots.map(slot => {
    const { eventMove: _eventMove, ...rest } = slot;
    return { ...rest, label: defaultLabel(slot.id) } as T;
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
 */
export const DAY_EVENT_EDIT_CAMERA_LINE =
  'The camera does not move: same height, distance and angle as Image 1, the whole room and her whole body framed as before.';

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
    `Natural, unhurried movement; ${her} face, hair and clothes stay the same.`,
  ].join(' ');
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
