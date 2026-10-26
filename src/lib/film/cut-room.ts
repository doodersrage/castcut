/**
 * Cut — the film's own step (/cut): the shots of this Day, of the current Story and the Cast's
 * kept Scene takes in one list, cut into one film. Each shot's key carries its source
 * ("day:morning", "story:<beat>@<at>", "scenes:<scene id>") so the shot list's edits (order,
 * leave-outs, captions, holds) stay put across sources and visits. Pure.
 */

import {
  cutGeneratedTitle,
  type CutGeneratedStage,
  type CutGeneratedStatus,
} from '../video/cut-generate';
import type { FilmCutOptionsValue } from '@/components/FilmCutOptionsControls';
import { roleplayWatchPlaylist } from './character-film';
import { dayWatchPlaylist, type DaySlot, type DaySlotStill } from '../day/planner';
import type { KeyedShot } from './cut-plan';
import type { RoleplayStoryBeat } from '../story/roleplay';
import type { CutBridgeStatus } from '../video/cut-bridge';

export type CutSource = 'day' | 'story' | 'scenes';

export const CUT_SOURCES: { id: CutSource; label: string; href: string }[] = [
  { id: 'day', label: 'Day', href: '/day' },
  { id: 'story', label: 'Story', href: '/story' },
  // The Cast's scenes (day/scenes.ts): each scene's kept take, its clip when it has one.
  { id: 'scenes', label: 'Scenes', href: '/scene' },
];

/** A source's own name for `?from=` (Day / Story / Scene pages link here with it). */
export function cutSourceFromParam(value: string | null | undefined): CutSource | null {
  const id = (value ?? '').trim();
  return id === 'day' || id === 'story' || id === 'scenes' ? id : null;
}

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
    }
  /**
   * A clip made longer (clip-extend-server.ts, "Make longer"): stands in for `of` once it has
   * rendered — the original is left out then; until then (or when it failed) the original plays.
   */
  | {
      key: string;
      kind: 'extended';
      of: string;
      /** Seconds added (0 for a new take). */
      bySec: number;
      status: CutGeneratedStatus;
      jobId?: string;
      url?: string;
      /** A new take: the shot's own render again with a new seed (its ComfyUI prompt id). */
      take?: boolean;
      promptId?: string;
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
  /**
   * Versions deleted (or replaced by one of the same name), by id: another device's copy does
   * not bring them back (M4 F1, storage/tool-record-merge.ts).
   */
  removedVersionAt?: Record<string, number>;
  /**
   * When the live edit (sources, added shots, options) was last changed, and the `editedAt` of
   * the edit it was made on: an edit another device made meanwhile is kept as a version rather
   * than lost (TOOL_EDIT_LINEAGES).
   */
  editedAt?: number;
  editBase?: number;
};

export type CutVersion = {
  id: string;
  name: string;
  savedAt: number;
  sources?: CutSource[];
  extras?: CutExtra[];
  options?: FilmCutOptionsValue;
};

export const CUT_VERSIONS_LIMIT = 12;

/** The versions with `next` saved (a name already there is replaced); newest first, at most 12. */
export function saveCutVersion(versions: CutVersion[] | undefined, next: CutVersion): CutVersion[] {
  const name = next.name.trim().slice(0, 60) || 'Version';
  const rest = (versions ?? []).filter(entry => entry.name !== name);
  return [{ ...next, name }, ...rest].slice(0, CUT_VERSIONS_LIMIT);
}

/** Versions that went (deleted, replaced or over the limit) marked removed, so a merge keeps them gone. */
function withRemovedVersions(
  cache: Pick<CutToolCache, 'versions' | 'removedVersionAt'>,
  versions: CutVersion[],
  now: number
): Pick<CutToolCache, 'versions' | 'removedVersionAt'> {
  const kept = new Set(versions.map(entry => entry.id));
  const gone = (cache.versions ?? []).filter(entry => !kept.has(entry.id));
  if (!gone.length) return { versions };
  return {
    versions,
    removedVersionAt: {
      ...(cache.removedVersionAt ?? {}),
      ...Object.fromEntries(gone.map(entry => [entry.id, Math.max(now, entry.savedAt + 1)])),
    },
  };
}

/** Save versions (in order) as a patch: those replaced or pushed over the limit are marked removed. */
export function saveCutVersionsPatch(
  cache: Pick<CutToolCache, 'versions' | 'removedVersionAt'>,
  next: readonly CutVersion[],
  now = Date.now()
): Pick<CutToolCache, 'versions' | 'removedVersionAt'> {
  const versions = next.reduce<CutVersion[]>(
    (list, version) => saveCutVersion(list, version),
    cache.versions ?? []
  );
  return withRemovedVersions(cache, versions, now);
}

export function deleteCutVersionPatch(
  cache: Pick<CutToolCache, 'versions' | 'removedVersionAt'>,
  id: string,
  now = Date.now()
): Pick<CutToolCache, 'versions' | 'removedVersionAt'> {
  return withRemovedVersions(
    cache,
    (cache.versions ?? []).filter(entry => entry.id !== id),
    now
  );
}

/**
 * The live edit's stamp for a write that changes it: made now (always after the edit it was made
 * on), on `base` — the `editedAt` this device last had.
 */
export function cutEditStamp(
  base: number | undefined,
  now = Date.now()
): Pick<CutToolCache, 'editedAt' | 'editBase'> {
  return {
    editedAt: base !== undefined && now <= base ? base + 1 : now,
    ...(base !== undefined ? { editBase: base } : {}),
  };
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
  return prefix === 'day' || prefix === 'story' || prefix === 'scenes'
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
          ...(extra.promptId ? { entryId: extra.promptId } : {}),
        });
      }
    } else if (extra.kind === 'extended') {
      const original = byKey.get(extra.of);
      if (original && extra.status === 'ready' && extra.url) {
        out.push({
          ...original,
          key: extra.key,
          title: `${original.title} ${extra.take ? '(new take)' : '(longer)'}`,
          url: extra.url,
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
  /** The Cast's kept scene takes (sceneCutShots), keyed by scene id. */
  scenes?: KeyedShot[] | null;
};

/**
 * Each source's shots, keys prefixed — Day's in slot order, then Story's in scene order, then
 * the Cast's scenes in the order they were made.
 */
export function cutRoomSourceShots(input: CutRoomInput): Record<CutSource, KeyedShot[]> {
  const day = input.day
    ? (dayWatchPlaylist(input.day.stills ?? [], input.day.slots) as KeyedShot[])
    : [];
  const story = input.story ? (roleplayWatchPlaylist(input.story) as KeyedShot[]) : [];
  return {
    day: day.map(shot => ({ ...shot, key: cutRoomKey('day', shot.key) })),
    story: story.map(shot => ({ ...shot, key: cutRoomKey('story', shot.key) })),
    scenes: (input.scenes ?? []).map(shot => ({ ...shot, key: cutRoomKey('scenes', shot.key) })),
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

/** Where a film cut from these sources is recorded (cut-recipe source); Scenes are the Cast's. */
export function cutRoomRecipeSource(sources: CutSource[]): 'day' | 'story' | 'cast' {
  if (sources.length === 1 && sources[0] !== 'scenes') return sources[0]!;
  return 'cast';
}
