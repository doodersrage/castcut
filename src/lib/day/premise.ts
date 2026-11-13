/**
 * Day from an idea: the player writes one line ("a rainy Saturday that ends at a gallery
 * opening") and the local LLM writes one beat + room per slot, so the stills follow one thread
 * from morning to night instead of independent picks.
 *
 * Beats must open with a stance the Everyday pipeline knows (sitting, walking, leaning…) — the
 * stance class drives the recipe and pose guide. Small local models drift (wrong named layouts,
 * scene-only lines; see Story's composed poses), so a beat without a stance, an adult word or a
 * second person on a solo Day is dropped and the slot keeps Day's own beat.
 */

import type { ChatMessage } from '@/lib/llm/client';
import { normalizeDayMood, type DaySlot } from '@/lib/day/planner';
import { DAY_PARTS, slotDayPart, type DayPart } from '@/lib/day/parts';

export const DAY_PREMISE_MAX_LENGTH = 240;
const BEAT_MAX = 200;
const SETTING_MAX = 120;

/**
 * Moods the premise writer serves: clothed stills — Everyday, Vacation and Suggestive (its own
 * words, dayPremiseSuggestive; 2026-11-13: Write it vanished on Suggestive, so it looked broken).
 * Adult and Sport beats are tuned by hand.
 */
export function dayPremiseAvailable(mood: string | null | undefined): boolean {
  const normalized = normalizeDayMood(mood);
  return normalized === 'everyday' || normalized === 'vacation' || normalized === 'suggestive';
}

/** Suggestive's beats: flirty and glamorous, never undressed. */
const dayPremiseSuggestive = (mood: string | null | undefined) =>
  normalizeDayMood(mood) === 'suggestive';

/**
 * Words a clothed Day's beat can't have. "strip" only as undressing: `strip\w*` took "striped
 * awnings" and "a striped umbrella" for adult and dropped those moments (2026-11-07).
 */
const ADULT_RE =
  /\b(nude|naked|topless|sex|sexual|orgasm|masturbat\w*|lingerie|underwear|bra|panties|breasts?|nipples?|genital\w*|erotic|strip(?:per|pers|ping|tease|s?\s*club)|stripped|undress\w*)\b/i;
/** The stance words the prompt asks the beat to open with (dayEverydayPoseClass reads them). */
/**
 * Suggestive's check: clothed heat, so lingerie, a bra, a slip are its own — nudity, sex and
 * undressing are not (the adult moods are elsewhere).
 */
const SUGGESTIVE_BARE_RE =
  /\b(nude|naked|topless|bottomless|sex|sexual|orgasm|masturbat\w*|breasts?|nipples?|genital\w*|erotic|strip(?:per|pers|ping|tease|s?\s*club)|stripped|undress\w*)\b/i;
const STANCE_LEAD_RE =
  /^(?:she\s+(?:is\s+)?)?(?:sitting|sits|seated|perched|curled|standing|stands|walking|walks|strolling|leaning|leans|lying|lies|reclining|kneeling|kneels|crouching|crouches|squatting|dancing|dances|twirling|climbing|climbs)\b/i;
/** In the water: a clothed Day can't render it (nude, or dressed in the tub). */
const IN_WATER_RE =
  /\b(?:in|into)\s+(?:the\s+|a\s+|her\s+)?(?:bath|bathtub|tub|hot tub|shower|jacuzzi)\b|\b(?:bathing|showering|soaking)\b/i;
const SECOND_PERSON_RE =
  /\b(partner|boyfriend|girlfriend|husband|wife|friend|friends|date|together|with (?:him|her|them)|both|couple|guests?|neighbou?rs?|strangers?|crowd)\b/i;

export type DayPremiseBeat = {
  slotId: string;
  beat: string;
  setting: string;
  /** The moment's title (2–5 words) — its card's and its Scene's name. */
  title?: string;
  /** When it happens, as the story has it (a short need not span a day). */
  timeOfDay?: DayPart;
};

export function buildDayPremiseMessages(input: {
  premise: string;
  slotIds: string[];
  /** A moment's chosen time of day, by its id (DaySlot.timeOfDay); else where it falls. */
  slotTimes?: Record<string, string>;
  companions: boolean;
  /** Tomorrow: yesterday's beats ("morning: …"), so today follows on from them. */
  previousBeats?: string[];
  /** The Day's mood: Suggestive is written in its own words; any other, everyday. */
  mood?: string;
}): ChatMessage[] {
  const premise = input.premise.trim().slice(0, DAY_PREMISE_MAX_LENGTH);
  const yesterday = (input.previousBeats ?? [])
    .map(beat => beat.replace(/\s+/g, ' ').trim().slice(0, BEAT_MAX))
    .filter(Boolean)
    .slice(0, 8);
  // A moment's time is the story's to choose — unless one was chosen for it, then it is fixed.
  const slots = input.slotIds
    .map(id => {
      const fixed = input.slotTimes?.[id];
      return fixed ? `"${id}" (at ${slotDayPart({ id, timeOfDay: fixed })})` : `"${id}"`;
    })
    .join(', ');
  const people = input.companions
    ? 'Some beats may include her partner or a friend; say so plainly ("with her partner").'
    : 'She is alone in every beat: no other people.';
  return [
    {
      role: 'system',
      content: [
        'You plan a short film about one woman: a handful of moments, one still photo each, in story order.',
        'The moments are one continuous stretch of the story, close together — within an hour or two — so her clothes and the light carry from one to the next: give them the same time of day (morning, afternoon, evening or night), moving on at most once, gently (evening into night). A moment marked "at …" happens then. Each moment also gets a short title (2–5 words).',
        'Write each beat as ONE short line (under 25 words) that STARTS with her body position:',
        'sitting, standing, walking, leaning, lying, kneeling, crouching, dancing, or climbing the stairs —',
        'then what she is doing with her hands and where she is looking. One moment only, no sequence.',
        'Give each beat a short room / place (under 12 words) with its light.',
        dayPremiseSuggestive(input.mood)
          ? 'Flirty, playful and glamorous: charged looks and poses, a little teasing. She is always clothed — a slinky dress, a slip, lingerie at most — never nude, topless or undressing, nothing sexual; never in a bath, shower or hot tub.'
          : 'Fully clothed in every beat, everyday, non-sexual; never in a bath, shower or hot tub.',
        'Follow the premise in story order.',
        people,
        'Answer with JSON only: [{"slot":"<slot id>","title":"...","time":"morning|afternoon|evening|night","beat":"...","setting":"..."}], one entry per slot.',
      ].join(' '),
    },
    {
      role: 'user',
      content: 'Premise: she hosts her first dinner party\nSlots: "morning", "evening"',
    },
    {
      role: 'assistant',
      content:
        '[{"slot":"morning","title":"Last touches","time":"evening","beat":"standing at the set table straightening a napkin, glancing at the door","setting":"candlelit dining room with a long table"},{"slot":"evening","title":"A toast","time":"evening","beat":"standing at the table raising a glass of wine, smiling at the guests off camera","setting":"candlelit dining room with a long table"}]',
    },
    {
      role: 'user',
      content: yesterday.length
        ? [
            `In the short before, she was: ${yesterday.join('; ')}.`,
            `This is the next short${premise ? ` — ${premise}` : ''}. Continue her story: one moment follows on from something in the last one, and its places are new.`,
            `Slots: ${slots}`,
          ].join('\n')
        : `Premise: ${premise}\nSlots: ${slots}`,
    },
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

/** Beats the reply gives for these slots, checked; a slot with no usable beat is left out. */
export function parseDayPremiseBeats(
  reply: string,
  slotIds: string[],
  options: { companions: boolean; mood?: string }
): DayPremiseBeat[] {
  const bare = dayPremiseSuggestive(options.mood) ? SUGGESTIVE_BARE_RE : ADULT_RE;
  const match = reply.match(/\[[\s\S]*\]/);
  if (!match) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(match[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const wanted = new Set(slotIds);
  const out: DayPremiseBeat[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return;
    const record = row as Record<string, unknown>;
    // A model that numbers or misnames slots: fall back to the reply's order.
    const named = cleanLine(record.slot, 40);
    const slotId = wanted.has(named) ? named : slotIds[index];
    if (!slotId || seen.has(slotId)) return;
    const beat = cleanLine(record.beat, BEAT_MAX);
    const setting = cleanLine(record.setting, SETTING_MAX);
    if (!beat || !setting) return;
    if (bare.test(beat) || bare.test(setting)) return;
    if (IN_WATER_RE.test(beat)) return;
    if (!options.companions && SECOND_PERSON_RE.test(beat)) return;
    // A scene line with no stance ("the gallery is full of paintings") → the recipe would guess
    // one; keep Day's beat instead.
    if (!STANCE_LEAD_RE.test(beat)) return;
    seen.add(slotId);
    const title = cleanLine(record.title, 40);
    const time = cleanLine(record.time, 12).toLowerCase();
    out.push({
      slotId,
      beat,
      setting,
      ...(title ? { title } : {}),
      ...((DAY_PARTS as readonly string[]).includes(time) ? { timeOfDay: time as DayPart } : {}),
    });
  });
  return out;
}

/** Slots with the premise's beats written in as Day's own (not typed by the player). */
export function applyDayPremiseBeats<T extends DaySlot>(slots: T[], beats: DayPremiseBeat[]): T[] {
  const bySlot = new Map(beats.map(beat => [beat.slotId, beat]));
  return slots.map(slot => {
    const beat = bySlot.get(slot.id);
    if (!beat) return slot;
    return {
      ...slot,
      sceneHints: beat.beat,
      location: beat.setting,
      // Its title and when it happens, as the story has them (a time chosen for it was kept).
      ...(beat.title ? { label: beat.title } : {}),
      ...(beat.timeOfDay ? { timeOfDay: beat.timeOfDay } : {}),
      sceneHintsTyped: undefined,
      sceneHintsDay: undefined,
      // A pose picked for the old beat would fight the new one.
      poseLayout: undefined,
      posePhoto: undefined,
    };
  });
}

/** Ask `/api/day-premise` for the beats (client). Rejects with the server's message. */
export async function requestDayPremiseBeats(input: {
  premise: string;
  slotIds: string[];
  slotTimes?: Record<string, string>;
  companions: boolean;
  previousBeats?: string[];
  /** The Day's mood (Suggestive has its own words). */
  mood?: string;
  llmBody?: Record<string, unknown>;
}): Promise<DayPremiseBeat[]> {
  const response = await fetch('/api/day-premise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      premise: input.premise,
      slotIds: input.slotIds,
      ...(input.slotTimes ? { slotTimes: input.slotTimes } : {}),
      companions: input.companions,
      previousBeats: input.previousBeats,
      ...(input.mood ? { mood: input.mood } : {}),
      ...input.llmBody,
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    beats?: DayPremiseBeat[];
    error?: string;
  };
  if (!response.ok || !Array.isArray(data.beats)) {
    throw new Error(data.error ?? 'Day from an idea failed.');
  }
  return data.beats;
}
