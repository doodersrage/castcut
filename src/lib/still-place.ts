/**
 * Is the still in the planned place? Auto-review's place check: the vision model says where the
 * photo was taken in plain words, then a loose text judge (same model, no image) compares that
 * with the slot's place. Describe-then-judge as the outfit second look does (play-slot-quality.ts).
 *
 * Calibration (2026-10-14, nsfwvision-qwen3-vl-8b, 30 one-person Day stills with distinct
 * places, each also judged against another still's place): false alarms 0/30, wrong places
 * caught 26/30 — the misses were near neighbours (night bedroom / night spa lounge, surf / pier,
 * plaza / florist) and one home office passed as "bedroom with a laptop". Pure.
 */

export const PLACE_DESCRIBE_PROMPT =
  'Where was this photo taken? Answer in one short line: the kind of place and the main things ' +
  'around her (for example "kitchen, at the stove" or "city street at night, shop windows"). No other words.';

export function placeJudgePrompt(planned: string, seen: string): string {
  return (
    `A photo was meant to be taken at: "${planned}".\nA description of where it was taken: "${seen}".\n` +
    'Could the description be that place, loosely read? Count it as the same when it is the same general ' +
    'kind of place: indoors vs outdoors must match, and the room or setting must be the same kind (a bedroom ' +
    'is not a kitchen, a beach is not a street, a café is not an office); details, lighting and time of day ' +
    'do not matter. Answer only yes or no.'
  );
}

export type PlaceVerdict = { match: boolean; seen: string };

/** The judge's answer: yes = the planned place, no = somewhere else; null when unreadable. */
export function decidePlace(seen: string, answer: string): PlaceVerdict | null {
  const where = seen
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const reply = answer
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .trim()
    .toLowerCase();
  if (!where) return null;
  if (reply.startsWith('yes')) return { match: true, seen: where };
  if (reply.startsWith('no')) return { match: false, seen: where.slice(0, 120) };
  return null;
}
