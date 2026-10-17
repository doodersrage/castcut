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

/**
 * Shots added in Cut itself: a still or clip from the Gallery, a text card, or a copy of another
 * shot (Duplicate, Split — the copy follows its original, its own trim in the edits).
 */
export type CutExtra =
  | {
      key: string;
      kind: 'media';
      title: string;
      url: string;
      shotKind: 'still' | 'clip';
      thumbUrl?: string;
      entryId?: string;
    }
  | { key: string; kind: 'text'; text: string; sub?: string }
  | { key: string; kind: 'copy'; of: string };

export type CutToolCache = {
  /** The sources this film is cut from; unset = every source that has shots. */
  sources?: CutSource[];
  /** Shots added here (Gallery, text cards, copies) — always in the film. */
  extras?: CutExtra[];
  /** Cut options, shot list edits included (keys carry the source). */
  options?: FilmCutOptionsValue;
};

export const DEFAULT_CUT_TOOL_CACHE: CutToolCache = {};

export function cutRoomKey(source: CutSource, key: string): string {
  return `${source}:${key}`;
}

/**
 * The source and the source's own key; an added shot ("x:…") is `added`; a key without a known
 * prefix is Day's (older edits). A copy keeps its original's source ("day:morning~2").
 */
export function splitCutRoomKey(key: string): { source: CutSource | 'added'; key: string } {
  const at = key.indexOf(':');
  const prefix = at > 0 ? key.slice(0, at) : '';
  if (prefix === 'x') return { source: 'added', key };
  return prefix === 'day' || prefix === 'story'
    ? { source: prefix, key: key.slice(at + 1) }
    : { source: 'day', key };
}

/** A new key for a copy of `key` that is not in `taken`. */
export function cutCopyKey(key: string, taken: ReadonlySet<string>): string {
  const base = key.replace(/~\d+$/, '');
  for (let n = 2; n < 100; n += 1) {
    const next = `${base}~${n}`;
    if (!taken.has(next)) return next;
  }
  return `${base}~${Date.now()}`;
}

/**
 * The added shots as shots: media as they are, text cards drawn by `textUrl` (a picture of the
 * card in the cut's shape), copies cloned from their original (dropped when it is gone).
 */
export function cutExtraShots(
  extras: ReadonlyArray<CutExtra> | undefined,
  originals: ReadonlyArray<KeyedShot>,
  textUrl: (extra: Extract<CutExtra, { kind: 'text' }>) => string
): KeyedShot[] {
  const byKey = new Map(originals.map(shot => [shot.key, shot]));
  const out: KeyedShot[] = [];
  for (const extra of extras ?? []) {
    if (extra.kind === 'media') {
      out.push({
        key: extra.key,
        title: extra.title,
        url: extra.url,
        kind: extra.shotKind,
        ...(extra.thumbUrl ? { thumbUrl: extra.thumbUrl } : {}),
        ...(extra.entryId ? { entryId: extra.entryId } : {}),
      });
    } else if (extra.kind === 'text') {
      out.push({
        key: extra.key,
        title: extra.text.trim().slice(0, 40) || 'Text card',
        url: textUrl(extra),
        kind: 'still',
        holdFixed: true,
      });
    } else {
      const original = byKey.get(extra.of);
      if (original) out.push({ ...original, key: extra.key, title: `${original.title} (copy)` });
    }
  }
  return out;
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

/** The film's shots before edits: the active sources' shots, in source order, then the added. */
export function cutRoomShots(
  bySource: Record<CutSource, KeyedShot[]>,
  sources: CutSource[],
  added: KeyedShot[] = []
): KeyedShot[] {
  return [
    ...CUT_SOURCES.filter(entry => sources.includes(entry.id)).flatMap(entry => bySource[entry.id]),
    ...added,
  ];
}

/** Where a film cut from these sources is recorded (cut-recipe source). */
export function cutRoomRecipeSource(sources: CutSource[]): 'day' | 'story' | 'cast' {
  if (sources.length === 1) return sources[0]!;
  return 'cast';
}
