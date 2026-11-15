import { comfyInputViewUrl } from '@/lib/face/match-client';

const HEADING_WORDS = new Set([
  'int',
  'ext',
  'morning',
  'afternoon',
  'evening',
  'night',
  'day',
  'the',
  'scene',
]);
const placeWordsOf = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(word => word.length > 2 && !HEADING_WORDS.has(word));

/**
 * Whether a shot belongs in its script scene's room: its place words share one with the scene's
 * heading (its id, "ext-park-day"). s22 (2026-11-14): two hotel-suite shots still linked to the
 * park scene from an earlier draft of the script made the park's room a hotel suite, and every
 * park shot was sent it. An id with no place words in it (an older "scene-3"), or a shot with none, is not checked.
 */
export function sceneRoomFits(location: string | null | undefined, sceneId: string): boolean {
  const heading = placeWordsOf(sceneId);
  if (heading.length === 0) return true;
  const words = new Set(placeWordsOf(location ?? ''));
  if (words.size === 0) return true;
  return heading.some(word => words.has(word));
}

/**
 * What a take of `sceneId` is held against for the same room (still/room.ts): its script scene's
 * room photo (one room a scene), else the kept take of that scene's first shot that has one —
 * never the take's own Scene. Null for a Scene not from a script, or with nothing to compare.
 */
export function roomReferenceFor(
  tool: {
    scenes?: readonly {
      id: string;
      keptTakeId?: string;
      takes: readonly { id: string; imageUrl: string; tier?: string }[];
      fromScript?: { scriptId: string; sceneId: string };
      slot?: { location?: string; poseCamera?: { shot?: string } };
      createdAt?: number;
    }[];
    scriptRooms?: Record<string, string>;
  },
  sceneId: string
): string | null {
  const scene = tool.scenes?.find(entry => entry.id === sceneId);
  const link = scene?.fromScript;
  if (!link?.scriptId || !link.sceneId) return null;
  // A shot still linked to another place's scene (an earlier draft): nothing to hold it against.
  if (!sceneRoomFits(scene?.slot?.location, link.sceneId)) return null;
  // A close-up shows too little of the place to judge: s24 (2026-11-15), its close-ups all in
  // the right place by eye, the check still said 12 of 18 were elsewhere (a blurred background).
  if (scene?.slot?.poseCamera?.shot === 'head') return null;
  const room = tool.scriptRooms?.[`${link.scriptId}|${link.sceneId}`];
  if (room) return comfyInputViewUrl(room);
  for (const other of tool.scenes ?? []) {
    if (other.id === sceneId) continue;
    if (other.fromScript?.scriptId !== link.scriptId || other.fromScript.sceneId !== link.sceneId)
      continue;
    if (!sceneRoomFits(other.slot?.location, link.sceneId)) continue;
    if (other.slot?.poseCamera?.shot === 'head') continue;
    const kept = other.takes.find(take => take.id === other.keptTakeId && take.tier !== 'preview');
    if (kept?.imageUrl) return kept.imageUrl;
  }
  return null;
}
