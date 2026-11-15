import { comfyInputViewUrl } from '@/lib/face/match-client';
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
      createdAt?: number;
    }[];
    scriptRooms?: Record<string, string>;
  },
  sceneId: string
): string | null {
  const scene = tool.scenes?.find(entry => entry.id === sceneId);
  const link = scene?.fromScript;
  if (!link?.scriptId || !link.sceneId) return null;
  const room = tool.scriptRooms?.[`${link.scriptId}|${link.sceneId}`];
  if (room) return comfyInputViewUrl(room);
  for (const other of tool.scenes ?? []) {
    if (other.id === sceneId) continue;
    if (other.fromScript?.scriptId !== link.scriptId || other.fromScript.sceneId !== link.sceneId)
      continue;
    const kept = other.takes.find(take => take.id === other.keptTakeId && take.tier !== 'preview');
    if (kept?.imageUrl) return kept.imageUrl;
  }
  return null;
}
