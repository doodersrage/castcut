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

import type { ChatMessage } from '@/lib/llm-client';
import { normalizeDayMood, type DaySlot } from '@/lib/day-planner';
import { dayPartOf } from '@/lib/day-parts';

export const DAY_PREMISE_MAX_LENGTH = 240;
const BEAT_MAX = 200;
const SETTING_MAX = 120;

/** Moods the premise writer serves: clothed, everyday stills. Adult and Sport beats are tuned by hand. */
export function dayPremiseAvailable(mood: string | null | undefined): boolean {
  const normalized = normalizeDayMood(mood);
  return normalized === 'everyday' || normalized === 'vacation';
}

const ADULT_RE =
  /\b(nude|naked|topless|sex|sexual|orgasm|masturbat\w*|lingerie|underwear|bra|panties|breasts?|nipples?|genital\w*|erotic|strip\w*|undress\w*)\b/i;
/** The stance words the prompt asks the beat to open with (dayEverydayPoseClass reads them). */
const STANCE_LEAD_RE =
  /^(?:she\s+(?:is\s+)?)?(?:sitting|sits|seated|perched|curled|standing|stands|walking|walks|strolling|leaning|leans|lying|lies|reclining|kneeling|kneels|crouching|crouches|squatting|dancing|dances|twirling|climbing|climbs)\b/i;
/** In the water: a clothed Day can't render it (nude, or dressed in the tub). */
const IN_WATER_RE =
  /\b(?:in|into)\s+(?:the\s+|a\s+|her\s+)?(?:bath|bathtub|tub|hot tub|shower|jacuzzi)\b|\b(?:bathing|showering|soaking)\b/i;
const SECOND_PERSON_RE =
  /\b(partner|boyfriend|girlfriend|husband|wife|friend|friends|date|together|with (?:him|her|them)|both|couple|guests?|neighbou?rs?|strangers?|crowd)\b/i;

export type DayPremiseBeat = { slotId: string; beat: string; setting: string };

export function buildDayPremiseMessages(input: {
  premise: string;
  slotIds: string[];
  companions: boolean;
  /** Tomorrow: yesterday's beats ("morning: …"), so today follows on from them. */
  previousBeats?: string[];
}): ChatMessage[] {
  const premise = input.premise.trim().slice(0, DAY_PREMISE_MAX_LENGTH);
  const yesterday = (input.previousBeats ?? [])
    .map(beat => beat.replace(/\s+/g, ' ').trim().slice(0, BEAT_MAX))
    .filter(Boolean)
    .slice(0, 8);
  const slots = input.slotIds.map(id => `"${id}" (${dayPartOf(id)})`).join(', ');
  const people = input.companions
    ? 'Some beats may include her partner or a friend; say so plainly ("with her partner").'
    : 'She is alone in every beat: no other people.';
  return [
    {
      role: 'system',
      content: [
        "You plan a photo story of one woman's day, one still photo per time slot.",
        'Write each beat as ONE short line (under 25 words) that STARTS with her body position:',
        'sitting, standing, walking, leaning, lying, kneeling, crouching, dancing, or climbing the stairs —',
        'then what she is doing with her hands and where she is looking. One moment only, no sequence.',
        'Give each beat a short room / place (under 12 words) with its light.',
        'Fully clothed in every beat, everyday, non-sexual; never in a bath, shower or hot tub.',
        'Follow the premise in time order, morning to night.',
        people,
        'Answer with JSON only: [{"slot":"<slot id>","beat":"...","setting":"..."}], one entry per slot.',
      ].join(' '),
    },
    {
      role: 'user',
      content:
        'Premise: a lazy Sunday that ends with a dinner party\nSlots: "morning" (morning), "evening" (evening)',
    },
    {
      role: 'assistant',
      content:
        '[{"slot":"morning","beat":"sitting cross-legged on the bed with a mug in both hands, looking out of the window","setting":"sunny bedroom with rumpled white sheets"},{"slot":"evening","beat":"standing at the set table raising a glass of wine, smiling at the guests off camera","setting":"candlelit dining room with a long table"}]',
    },
    {
      role: 'user',
      content: yesterday.length
        ? [
            `Yesterday she was: ${yesterday.join('; ')}.`,
            `Today is the next day${premise ? ` — ${premise}` : ''}. Continue her story: one beat follows on from something yesterday, and today's places are new, not yesterday's.`,
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
  options: { companions: boolean }
): DayPremiseBeat[] {
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
    if (ADULT_RE.test(beat) || ADULT_RE.test(setting)) return;
    if (IN_WATER_RE.test(beat)) return;
    if (!options.companions && SECOND_PERSON_RE.test(beat)) return;
    // A scene line with no stance ("the gallery is full of paintings") → the recipe would guess
    // one; keep Day's beat instead.
    if (!STANCE_LEAD_RE.test(beat)) return;
    seen.add(slotId);
    out.push({ slotId, beat, setting });
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
  companions: boolean;
  previousBeats?: string[];
  llmBody?: Record<string, unknown>;
}): Promise<DayPremiseBeat[]> {
  const response = await fetch('/api/day-premise', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      premise: input.premise,
      slotIds: input.slotIds,
      companions: input.companions,
      previousBeats: input.previousBeats,
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
