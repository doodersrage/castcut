/**
 * Cut — the film's own step (/cut): the shots of this Day and of the current Story in one
 * list, cut into one film. Each shot's key carries its source ("day:morning",
 * "story:<beat>@<at>") so the shot list's edits (order, leave-outs, captions, holds) stay put
 * across sources and visits. Pure.
 */

import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { roleplayWatchPlaylist } from './character-film';
import { dayWatchPlaylist, type DaySlot, type DaySlotStill } from './day-planner';
import type { KeyedShot } from './film-cut-plan';
import type { RoleplayStoryBeat } from './roleplay';

export type CutSource = 'day' | 'story';

export const CUT_SOURCES: { id: CutSource; label: string; href: string }[] = [
  { id: 'day', label: 'Day', href: '/day' },
  { id: 'story', label: 'Story', href: '/story' },
];

export type CutToolCache = {
  /** The sources this film is cut from; unset = every source that has shots. */
  sources?: CutSource[];
  /** Cut options, shot list edits included (keys carry the source). */
  options?: FilmCutOptionsValue;
};

export const DEFAULT_CUT_TOOL_CACHE: CutToolCache = {};

export function cutRoomKey(source: CutSource, key: string): string {
  return `${source}:${key}`;
}

/** The source and the source's own key; a key without a known prefix is Day's (older edits). */
export function splitCutRoomKey(key: string): { source: CutSource; key: string } {
  const at = key.indexOf(':');
  const prefix = at > 0 ? key.slice(0, at) : '';
  return prefix === 'day' || prefix === 'story'
    ? { source: prefix, key: key.slice(at + 1) }
    : { source: 'day', key };
}

export type CutRoomInput = {
  day?: { slots?: DaySlot[]; stills?: DaySlotStill[] | null } | null;
  story?: RoleplayStoryBeat[] | null;
};

/** Each source's shots, keys prefixed — Day's in slot order, then Story's in scene order. */
export function cutRoomSourceShots(input: CutRoomInput): Record<CutSource, KeyedShot[]> {
  const day = input.day
    ? (dayWatchPlaylist(input.day.stills ?? [], input.day.slots) as KeyedShot[])
    : [];
  const story = input.story ? (roleplayWatchPlaylist(input.story) as KeyedShot[]) : [];
  return {
    day: day.map(shot => ({ ...shot, key: cutRoomKey('day', shot.key) })),
    story: story.map(shot => ({ ...shot, key: cutRoomKey('story', shot.key) })),
  };
}

/** The sources a cut uses: the picked ones that have shots, else every source with shots. */
export function activeCutSources(
  picked: CutSource[] | undefined,
  bySource: Record<CutSource, KeyedShot[]>
): CutSource[] {
  const withShots = CUT_SOURCES.map(entry => entry.id).filter(id => bySource[id].length > 0);
  const chosen = (picked ?? []).filter(id => withShots.includes(id));
  return chosen.length > 0 ? chosen : withShots;
}

/** The film's shots before edits: the active sources' shots, in source order. */
export function cutRoomShots(
  bySource: Record<CutSource, KeyedShot[]>,
  sources: CutSource[]
): KeyedShot[] {
  return CUT_SOURCES.filter(entry => sources.includes(entry.id)).flatMap(
    entry => bySource[entry.id]
  );
}

/** Where a film cut from these sources is recorded (cut-recipe source). */
export function cutRoomRecipeSource(sources: CutSource[]): 'day' | 'story' | 'cast' {
  if (sources.length === 1) return sources[0]!;
  return 'cast';
}
