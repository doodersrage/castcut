/**
 * Whether a clip drifted from the shot it was meant to hold: its last frame against its first, by
 * the vision model. MiniMax-H3 flew the camera in on a product, walked her into a close-up, brought
 * strangers in, or turned a stairwell into another scene — no hard cut for clip-check to find
 * (the flagship, 2026-11-16: 4A, 2A, 8C, 10A, 7A, 7D, 3A). Asked this, the vision model named all
 * seven and passed seven good clips with gestures and moves of their own. Pure.
 */

export const CLIP_DRIFT_SYSTEM =
  'You compare the first and the last frame of one short film clip. Answer only with JSON.';

export const CLIP_DRIFT_PROMPT = [
  'Picture 1 is the first frame of a clip, picture 2 its last frame. Compare them.',
  'new_people: does picture 2 show anyone who is not in picture 1 (a stranger, an extra person, a second copy of someone)? true/false',
  'people_gone: is someone from picture 1 missing in picture 2? true/false',
  "framing: compared with picture 1, is picture 2 'same' (about the same distance and angle), 'closer' (clearly a closer shot, e.g. a face or an object fills more of the frame), or 'other' (a different angle or a different shot)?",
  'place: is picture 2 the same room or place? true/false',
  'Reply: {"new_people":…,"people_gone":…,"framing":"…","place":…}',
].join('\n');

export type ClipDrift = { drifted: boolean; reasons: string[] };

/** The vision model's reply read; null when it isn't the JSON asked for. */
export function parseClipDrift(reply: string | null | undefined): ClipDrift | null {
  const match = reply?.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const framing = typeof parsed.framing === 'string' ? parsed.framing.trim().toLowerCase() : '';
  if (!framing && typeof parsed.new_people !== 'boolean') return null;
  // A different angle alone is a move of its own (she turns, walks a step: 8A, 8B, 9C), and
  // someone new alone is a passer-by on a busy street (2C) — read on all 51 of the flagship's
  // clips, those flagged 9 good ones. Drift is a closer shot, someone gone, someone new on
  // another shot, or another place: 7 flagged, 6 of them the ones that went wrong.
  const newOnAnotherShot = parsed.new_people === true && framing !== 'same';
  const reasons = [
    newOnAnotherShot ? 'someone new comes in' : '',
    parsed.people_gone === true ? 'someone leaves the shot' : '',
    framing === 'closer' ? 'the camera moves in close' : '',
    newOnAnotherShot && framing === 'other' ? 'it ends on a different shot' : '',
    parsed.place === false ? 'it ends somewhere else' : '',
  ].filter(Boolean);
  return { drifted: reasons.length > 0, reasons };
}
