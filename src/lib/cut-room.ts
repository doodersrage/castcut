/**
 * Cut — the film's own step (/cut): the shots of this Day and of the current Story in one
 * list, cut into one film. Each shot's key carries its source ("day:morning",
 * "story:<beat>@<at>") so the shot list's edits (order, leave-outs, captions, holds) stay put
 * across sources and visits. Pure.
 */

import { cutGeneratedTitle, type CutGeneratedStage, type CutGeneratedStatus } from './cut-generate';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { roleplayWatchPlaylist } from './character-film';
import { dayWatchPlaylist, type DaySlot, type DaySlotStill } from './day-planner';
import type { KeyedShot } from './film-cut-plan';
import type { RoleplayStoryBeat } from './roleplay';
import type { CutBridgeStatus } from './cut-bridge';

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
  | { key: string; kind: 'copy'; of: string }
  /**
   * A generated clip from one shot into the next (cut-bridge.ts): in the film once it has
   * rendered; until then (or when it failed) it sits out and the two shots join as before.
   */
  | {
      key: string;
      kind: 'bridge';
      from: string;
      to: string;
      status: CutBridgeStatus;
      promptId?: string;
      url?: string;
      engine?: string;
      /** How `to` came in before the bridge (put back if the bridge is removed). */
      toWas?: string;
    }
  /**
   * A shot generated from words (cut-generate.ts): a picture in the cut's shape, animated when a
   * clip was asked for. In the film once it has rendered.
   */
  | {
      key: string;
      kind: 'generated';
      prompt: string;
      shotKind: 'still' | 'clip';
      status: CutGeneratedStatus;
      /** What the render in flight is: the picture, or (clips) its motion. */
      stage?: CutGeneratedStage;
      promptId?: string;
      /** The rendered picture (a clip's first frame). */
      stillUrl?: string;
      url?: string;
      engine?: string;
    };

export type CutToolCache = {
  /** The sources this film is cut from; unset = every source that has shots. */
  sources?: CutSource[];
  /** Shots added here (Gallery, text cards, copies) — always in the film. */
  extras?: CutExtra[];
  /** Cut options, shot list edits included (keys carry the source). */
  options?: FilmCutOptionsValue;
  /** Saved versions of the edit — switch between, say, a long cut and a 30 s Reels cut. */
  versions?: CutVersion[];
};

export type CutVersion = {
  id: string;
  name: string;
  savedAt: number;
  sources?: CutSource[];
  extras?: CutExtra[];
  options?: FilmCutOptionsValue;
};

/** The versions with `next` saved (a name already there is replaced); newest first, at most 12. */
export function saveCutVersion(versions: CutVersion[] | undefined, next: CutVersion): CutVersion[] {
  const name = next.name.trim().slice(0, 60) || 'Version';
  const rest = (versions ?? []).filter(entry => entry.name !== name);
  return [{ ...next, name }, ...rest].slice(0, 12);
}

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
    } else if (extra.kind === 'bridge') {
      if (extra.status === 'ready' && extra.url) {
        out.push({
          key: extra.key,
          title: 'Bridge',
          url: extra.url,
          kind: 'clip',
        });
      }
    } else if (extra.kind === 'generated') {
      if (extra.status === 'ready' && extra.url) {
        out.push({
          key: extra.key,
          title: cutGeneratedTitle(extra.prompt),
          url: extra.url,
          kind: extra.shotKind,
          ...(extra.stillUrl && extra.shotKind === 'clip' ? { thumbUrl: extra.stillUrl } : {}),
        });
      }
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
