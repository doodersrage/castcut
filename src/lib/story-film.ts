/**
 * Story films get Day's film round (2026-10-14): narration, close-ups, "Previously on" and
 * widened stills. Story already has prose for every scene, so its narration needs no writing —
 * each scene's first sentence becomes the voice-over over its shot.
 */

import { roleplayWatchPlaylist } from './character-film';
import { narrationSeconds, NARRATION_MAX_CHARS } from './film-narration';
import type { FilmPlaylistShot } from './media-kind';
import type { RoleplayStoryBeat } from './roleplay';

/** Seconds of a "Previously on" shot (as Day's). */
const RECAP_SHOT_SEC = 2;

/**
 * The voice-over for a scene: its first sentence, quotes and stage directions dropped, cut at a
 * word under the narration limit. '' for a scene with its own spoken line (a talking clip) or
 * no text.
 */
export function storyNarrationLine(beat: Pick<RoleplayStoryBeat, 'blurb' | 'line'>): string {
  if (beat.line?.trim()) return '';
  const text = (beat.blurb ?? '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/["“”]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const first = text.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? text;
  if (first.length <= NARRATION_MAX_CHARS) return first;
  const cut = first.slice(0, NARRATION_MAX_CHARS);
  const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf(' — '), cut.lastIndexOf('; '));
  const clipped = at > 40 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(' '));
  return `${clipped.replace(/[,;—\s]+$/, '')}.`;
}

/** A narrated still holds at least as long as its line (else it ran into the next shot). */
export function holdForNarration<T extends FilmPlaylistShot>(shot: T, line: string): T {
  if (shot.kind !== 'still' || !line) return shot;
  // Held for the line, and kept so when the cut is fitted to a length.
  const need = narrationSeconds(line) + 0.4;
  return { ...shot, holdSec: Math.max(shot.holdSec ?? 0, need), holdFixed: true };
}

/**
 * "Previously on" for a Story: the first, middle and last shot of the Cast's most recent earlier
 * Story (another library session whose scenes are this Cast's), 2 s each, the first captioned.
 */
export function storyPreviouslyOnShots(
  sessions: Array<{ id: string; updatedAt: number; snapshot: { story?: RoleplayStoryBeat[] } }>,
  input: { castId: string; currentSessionId?: string | null; name: string }
): FilmPlaylistShot[] {
  const castId = input.castId.trim();
  if (!castId) return [];
  const last = sessions
    .filter(
      session =>
        session.id !== input.currentSessionId &&
        (session.snapshot.story ?? []).some(beat => beat.castId === castId)
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!last) return [];
  const shots = roleplayWatchPlaylist(last.snapshot.story ?? []).filter(
    shot => !shot.url.startsWith('data:') && !shot.key?.includes('#')
  );
  if (shots.length === 0) return [];
  const picks = [...new Set([0, Math.floor((shots.length - 1) / 2), shots.length - 1])].map(
    index => shots[index]!
  );
  const name = input.name.trim() || 'last time';
  return picks.map((shot, index) => ({
    ...shot,
    key: `previously-${index}`,
    holdSec: RECAP_SHOT_SEC,
    holdFixed: true,
    ...(shot.kind === 'clip' ? { trimStartSec: 0, trimEndSec: RECAP_SHOT_SEC } : {}),
    ...(index === 0
      ? { title: `Previously on ${name}`, caption: `Previously on ${name}…` }
      : { captionless: true }),
  }));
}
