/**
 * How a read line is said (2026-11-07): the voice engine reads a line in the speaker's kept voice
 * *and* an instruction ("teasing, a smile in her voice"). Without one every line came out flat —
 * the kept voice is a calm introduction, and its delivery is copied. Measured on nine episode
 * lines: pitch movement 2.26 → 2.92 semitones (SD), the voice as recognisable (WavLM 0.93), every
 * word heard.
 *
 * The instruction comes from the script: the line's parenthetical ("(voice tight)") when it has
 * one, turned with the shot's action into a short delivery by the LLM — notes are often actions
 * ("(trying the handle)"), and most lines have none. Without the LLM the note is used as written.
 * Pure, plus the client call.
 */

import type { ScriptScene } from '../script/parse';

/** An instruction this long at most (the engine reads it before the line). */
export const DELIVERY_MAX = 100;
/** Lines asked about in one LLM call. */
export const DELIVERY_BATCH = 30;

export type LineDeliveryAsk = {
  /** The caller's id for the line. */
  id: string;
  /** Who says it ("Lena"). */
  speaker: string;
  text: string;
  /** The script's parenthetical, as written. */
  note?: string;
  /** What is happening in the shot. */
  context?: string;
};

export function normalizeDelivery(value: unknown): string {
  return typeof value === 'string'
    ? value
        .replace(/[()"“”]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[.;,]+$/, '')
        .slice(0, DELIVERY_MAX)
    : '';
}

const words = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');

/**
 * The parenthetical written just before `line` in the script scene (the dialogue it belongs
 * to, by its words), or undefined when that line has none or isn't found.
 */
export function scriptLineNote(scene: ScriptScene, line: string): string | undefined {
  const target = words(line);
  if (!target) return undefined;
  const elements = scene.elements;
  for (let index = 0; index < elements.length; index += 1) {
    const element = elements[index]!;
    if (element.kind !== 'dialogue') continue;
    const said = words(element.text);
    // A shot's line is the dialogue as cleaned (and maybe cut short): match on its start.
    if (!said || !(said === target || said.startsWith(target) || target.startsWith(said))) continue;
    const before = elements[index - 1];
    if (before?.kind === 'parenthetical') {
      const note = normalizeDelivery(before.text);
      return note || undefined;
    }
    return undefined;
  }
  return undefined;
}

/** The LLM's messages: one short delivery per line, from its note and what's happening. */
export function buildLineDeliveryMessages(
  asks: readonly LineDeliveryAsk[],
  options: { adult?: boolean } = {}
): Array<{ role: 'system' | 'user'; content: string }> {
  const system = [
    'You are a voice director. For each line of dialogue, write how the actor says it: a short',
    'delivery note for a speech model, 3 to 10 words — emotion, energy, pace, volume',
    '("teasing, a smile in her voice", "gruff and reluctant, through gritted teeth",',
    '"breathless with wonder, almost laughing"). Use the script\'s note when it says how the line',
    'is said; when the note is an action ("trying the handle"), say what it does to the voice',
    '("straining, frustrated"). Read the line and the moment: vary the deliveries the way a scene',
    'would — not everything soft or quiet. No quotes, no stage directions, no names.',
    options.adult
      ? 'The script is for consenting adults; keep the notes to how the voice sounds.'
      : '',
    'Reply with JSON only: {"deliveries":[{"id":"…","delivery":"…"}]}, one per line, same ids.',
  ]
    .filter(Boolean)
    .join(' ');
  const user = asks
    .map(ask =>
      JSON.stringify({
        id: ask.id,
        speaker: ask.speaker,
        line: ask.text.slice(0, 300),
        ...(ask.note ? { note: ask.note } : {}),
        ...(ask.context ? { moment: ask.context.slice(0, 300) } : {}),
      })
    )
    .join('\n');
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

/** The deliveries in the LLM's reply, by id (only the ids asked about). */
export function parseLineDelivery(reply: string, ids: readonly string[]): Record<string, string> {
  const wanted = new Set(ids);
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start < 0 || end <= start) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return {};
  }
  const list = (parsed as { deliveries?: unknown })?.deliveries;
  if (!Array.isArray(list)) return {};
  const out: Record<string, string> = {};
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const id = String((entry as { id?: unknown }).id ?? '');
    const delivery = normalizeDelivery((entry as { delivery?: unknown }).delivery);
    if (wanted.has(id) && delivery) out[id] = delivery;
  }
  return out;
}

/**
 * Ask `/api/film/line-delivery` for the lines' deliveries (client), a batch at a time. A batch
 * the LLM can't do keeps its notes as written; nothing is thrown.
 */
export async function requestLineDeliveries(
  asks: readonly LineDeliveryAsk[],
  llmBody: Record<string, unknown>,
  options: { adult?: boolean } = {}
): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const ask of asks) {
    if (ask.note) out[ask.id] = ask.note;
  }
  for (let at = 0; at < asks.length; at += DELIVERY_BATCH) {
    const batch = asks.slice(at, at + DELIVERY_BATCH);
    try {
      const response = await fetch('/api/film/line-delivery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          lines: batch,
          ...llmBody,
          ...(options.adult ? { adult: true } : {}),
        }),
      });
      if (!response.ok) continue;
      const data = (await response.json()) as { deliveries?: Record<string, unknown> };
      for (const [id, value] of Object.entries(data.deliveries ?? {})) {
        const delivery = normalizeDelivery(value);
        if (delivery) out[id] = delivery;
      }
    } catch {
      // offline or the LLM is busy: the notes stand
    }
  }
  return out;
}
