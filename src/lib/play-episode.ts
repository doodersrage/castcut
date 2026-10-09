/**
 * Episode cut — one film per Cast: its Day (slot order), then its Story (reel order).
 *
 * Plan, from how the two cuts work today:
 * - Day: `dayWatchPlaylist(stills, slots)` gives one shot per finished slot (a finished clip wins
 *   over the still), keyed by slot id. `cutDayFilm` applies the shot list (`CutShotEdits`: order,
 *   `include: false`, caption, hold — `applyCutShotEdits`) plus any pre-cut leave-outs, then
 *   `assembleAndStampFilm` encodes it (server ffmpeg, else the browser's canvas + MediaRecorder),
 *   downloads it and stamps a Gallery entry (`derivedKind: 'film'`, tagged with the Cast id) —
 *   that entry is what the Cast's Film & media lists.
 * - Story: `roleplayWatchPlaylist(story)` keyed `beat.id@beat.at`, same edits, same assembler.
 * - Cast: `CharacterFilmStudio` keeps `character.filmCut` — a cut of Gallery entries; separate.
 * - The assembler draws one opening title card, not cards between shots, so the episode has no
 *   card between its parts: it opens on "<name> / Day, then Story" when titles are on.
 * The episode = the Day's shots (keys `day:…`) then the Story's (`story:…`), so one shot list
 * (FilmCutShotList via FilmCutOptionsControls) trims and reorders both without key clashes, and
 * the cut goes through `assembleAndStampFilm` like the other two.
 * Sources: the Cast's Day is the live Day when it owns it, else its parked Day (day-story-seed);
 * its Story is the live Story when bound to the Cast's library session, else that session.
 */

import { roleplayWatchPlaylist } from './character-film';
import { dayWatchPlaylist, type DaySlot, type DaySlotStill } from './day-planner';
import { castDayPlan } from './day-story-seed';
import { applyCutShotEdits, type CutShotEdits, type KeyedShot } from './film-cut-plan';
import type { FilmTitleCard } from './video-polish';
import type { RoleplayStoryBeat } from './roleplay';
import type { RoleplayLibrarySession } from './roleplay-library';
import type { DayToolCache, RoleplayToolCache } from './play-settings';

export type EpisodePart = 'day' | 'story';

const PART_PREFIX: Record<EpisodePart, string> = { day: 'day:', story: 'story:' };

/** Which part of the episode a shot key belongs to. */
export function episodeShotPart(key: string): EpisodePart | null {
  if (key.startsWith(PART_PREFIX.day)) return 'day';
  if (key.startsWith(PART_PREFIX.story)) return 'story';
  return null;
}

export type CastEpisodeSources = {
  daySlots?: DaySlot[];
  dayStills: DaySlotStill[];
  story: RoleplayStoryBeat[];
};

/** The Cast's Day stills and Story beats, wherever they live right now. */
export function castEpisodeSources(input: {
  characterId: string;
  activeCharacterId?: string | null;
  day: DayToolCache | null | undefined;
  roleplay: RoleplayToolCache | null | undefined;
  /** The Cast's Story library session id (`roleplayLibraryIdForCharacter`). */
  storySessionId: string | null;
  library: RoleplayLibrarySession[];
}): CastEpisodeSources {
  const plan = castDayPlan(input.day, input.characterId, input.activeCharacterId);
  const sessionId = input.storySessionId?.trim() || '';
  let story: RoleplayStoryBeat[] = [];
  if (sessionId && input.roleplay?.activeSessionId?.trim() === sessionId) {
    story = input.roleplay.story ?? [];
  } else if (sessionId) {
    story = input.library.find(session => session.id === sessionId)?.snapshot.story ?? [];
  }
  return {
    ...(plan?.slots ? { daySlots: plan.slots } : {}),
    dayStills: plan?.stills ?? [],
    story,
  };
}

function inPart(shot: KeyedShot, part: EpisodePart): KeyedShot {
  return {
    ...shot,
    key: `${PART_PREFIX[part]}${shot.key}`,
    // Captions keep the beat's own words; the part only labels the shot list.
    caption: shot.caption ?? shot.title,
    title: `${part === 'day' ? 'Day' : 'Story'} · ${shot.title}`,
  };
}

/** The episode before edits: Day shots in slot order, then Story shots in reel order. */
export function episodePlaylist(sources: CastEpisodeSources, stillHoldSec?: number): KeyedShot[] {
  const day = (dayWatchPlaylist(sources.dayStills, sources.daySlots, stillHoldSec) as KeyedShot[])
    .filter(shot => Boolean(shot.key))
    .map(shot => inPart(shot, 'day'));
  const story = (roleplayWatchPlaylist(sources.story, stillHoldSec) as KeyedShot[])
    .filter(shot => Boolean(shot.key))
    .map(shot => inPart(shot, 'story'));
  return [...day, ...story];
}

/** The shots that go in the cut: the shot list's edits, plus keys left out at the last moment. */
export function episodeCutShots(
  shots: KeyedShot[],
  edits?: CutShotEdits | null,
  excludeKeys: readonly string[] = []
): KeyedShot[] {
  if (excludeKeys.length === 0) return applyCutShotEdits(shots, edits);
  return applyCutShotEdits(shots, {
    ...edits,
    shots: {
      ...edits?.shots,
      ...Object.fromEntries(
        excludeKeys.map(key => [key, { ...edits?.shots?.[key], include: false }])
      ),
    },
  });
}

/** Shot counts per part, for the button and the summary line. */
export function episodePartCounts(shots: KeyedShot[]): Record<EpisodePart, number> {
  const counts: Record<EpisodePart, number> = { day: 0, story: 0 };
  for (const shot of shots) {
    const part = episodeShotPart(shot.key);
    if (part) counts[part] += 1;
  }
  return counts;
}

/** The episode's opening card (the assembler has no mid-film cards). */
export function episodeTitleCard(characterName: string): FilmTitleCard {
  return { title: characterName.trim() || 'Episode', subtitle: 'Day, then Story' };
}
