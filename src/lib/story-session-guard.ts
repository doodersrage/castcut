/**
 * A Story session's scenes belong to one Cast. On a demo install Tomas's session held Nora's
 * scenes (same ids and times) under Tomas's bible: the Story page bound Tomas while its reel ref
 * still held Nora's scenes, and the Gallery sync patched her finished still into "the" story —
 * now Tomas's. Scenes carry their Cast id (stamped when written in a Cast's session) and a scene
 * stamped for another Cast is never written into this Cast's session or library entry.
 */

import type { RoleplayStoryBeat } from './roleplay';

/** The Cast a Story session belongs to: "cast-<id>" → "<id>"; null for a free-standing story. */
export function castIdForStorySession(sessionId: string | null | undefined): string | null {
  const key = sessionId?.trim() || '';
  if (!key.startsWith('cast-') || key.length <= 'cast-'.length) return null;
  return key.slice('cast-'.length);
}

/**
 * The scenes a session may hold: another Cast's are dropped, unstamped ones get this Cast's id.
 * A free-standing story (no Cast) is left as it is.
 */
export function guardStoryForSession(
  story: RoleplayStoryBeat[] | undefined,
  sessionId: string | null | undefined
): { story: RoleplayStoryBeat[]; dropped: RoleplayStoryBeat[] } {
  const beats = story ?? [];
  const castId = castIdForStorySession(sessionId);
  if (!castId) return { story: beats, dropped: [] };
  const dropped: RoleplayStoryBeat[] = [];
  let changed = false;
  const kept: RoleplayStoryBeat[] = [];
  for (const beat of beats) {
    const owner = beat.castId?.trim();
    if (owner && owner !== castId) {
      dropped.push(beat);
      changed = true;
      continue;
    }
    if (!owner) {
      kept.push({ ...beat, castId });
      changed = true;
      continue;
    }
    kept.push(beat);
  }
  return { story: changed ? kept : beats, dropped };
}

/** Re-stamp a story moved to another Cast id (a Cast imported under a new id). */
export function restampStoryCast(
  story: RoleplayStoryBeat[] | undefined,
  fromCastId: string,
  toCastId: string
): RoleplayStoryBeat[] | undefined {
  if (!story || fromCastId === toCastId) return story;
  return story.map(beat =>
    !beat.castId || beat.castId === fromCastId ? { ...beat, castId: toCastId } : beat
  );
}

/** True when the reel holds a scene stamped for another Cast than `castId`. */
export function storyHasOtherCastBeats(
  story: RoleplayStoryBeat[] | undefined,
  castId: string
): boolean {
  return (story ?? []).some(beat => Boolean(beat.castId?.trim()) && beat.castId !== castId);
}
