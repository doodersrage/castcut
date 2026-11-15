/**
 * Same room? A take is shown beside its scene's reference — the scene's room photo, else the kept
 * take of its first shot — and the vision model says whether both were taken in the same place
 * (FINISHING_PLAN Phase 4: "same place rendered as different rooms" went unseen — the place check
 * reads the kind of place, and a kitchen is a kitchen).
 *
 * Measured (2026-11-14, nsfwvision-qwen3-vl-8b, s19's Edit 2511 finals, one reviewer —
 * docs/consistency/room-pairs.json): 18 of 18 clear pairs right (8 different rooms caught, no
 * false alarm); on close-ups and look-alike rooms 7 of 12 — two hotel rooms read as one, and
 * blurred backgrounds read as somewhere else. Its "different place" findings were right on 12 of
 * 16: advisory (said and listed, never redone) until a reviewed set holds it to the 70% bar.
 * Pure: the question and the reply.
 */

export const ROOM_COMPARE_PROMPT =
  'Two photos side by side, left and right. Ignore the people, their clothes, poses and the ' +
  'camera angle. Look only at the place: walls, windows, floor, furniture, fixtures, the view ' +
  'outside. Were both photos taken in the same room or place? A different room of the same kind ' +
  '(another kitchen, another bedroom) is NOT the same place. Answer with one line: "same: yes" or ' +
  '"same: no", then a few words on what differs or matches.';

export type RoomVerdict = { same: boolean; note: string };

/** The model's line: same or not, and what it said about it; null when unreadable. */
export function parseRoomReply(reply: string | null | undefined): RoomVerdict | null {
  const text = (reply ?? '')
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const match = /^(?:same\s*:\s*)?(yes|no)\b[\s.:;,—–-]*(.*)$/i.exec(text);
  if (!match) return null;
  return {
    same: match[1]!.toLowerCase() === 'yes',
    note: match[2]!.trim().slice(0, 160),
  };
}
