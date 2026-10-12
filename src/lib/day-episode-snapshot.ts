/**
 * The Day an episode was cut from, kept on the episode (play-series.ts) so the Cast page can
 * show what went into it and open that Day again (roadmap review 2026-10-11: "a durable home
 * for each film … restore a previous project state without hunting through Gallery history").
 * The snapshot is the parked-Day shape (day-cast-park.ts) with the stills slimmed to what the
 * board, the reel and Cut need. Reopening never loses the Day it replaces: it is set aside and
 * Day offers to bring it back. Pure.
 */

import type { ParkedDay } from './day-cast-park';
import {
  dayStillShownImage,
  normalizeDaySlots,
  normalizeDaySlotStills,
  type DaySlotStill,
} from './day-planner';
import type { DayToolCache } from './play-settings';

export type EpisodeDay = Omit<ParkedDay, 'at'>;

/** The live Day (or a parked one) set aside by Open this Day again, with whose it was. */
export type SetAsideDay = ParkedDay & { castId: string; reason: string };

const STILL_FIELDS = [
  'slotId',
  'promptId',
  'imageUrl',
  'status',
  'clipPromptId',
  'clipUrl',
  'clipStatus',
  'clipRenderPromptId',
  'finishedUrl',
  'finishedFor',
] as const;

function slimStill(still: DaySlotStill): DaySlotStill {
  const out = {} as Record<string, unknown>;
  for (const field of STILL_FIELDS) {
    const value = (still as Record<string, unknown>)[field];
    // A data: URL (a demo still, an upload) would bloat every episode — keep server URLs only.
    if (typeof value === 'string' && value.startsWith('data:')) continue;
    if (value !== undefined) out[field] = value;
  }
  return out as DaySlotStill;
}

/** What to keep of a Day on its episode. */
export function dayEpisodeSnapshot(day: Partial<DayToolCache>): EpisodeDay | undefined {
  const slots = normalizeDaySlots(day.slots, day.dayLength);
  const stills = normalizeDaySlotStills(day.stills)
    .filter(still => still.status === 'completed' || still.clipStatus === 'completed')
    .map(slimStill);
  if (stills.length === 0) return undefined;
  return {
    slots,
    stills,
    ...(day.dayLength !== undefined ? { dayLength: day.dayLength } : {}),
    ...(day.dayMood !== undefined ? { dayMood: day.dayMood } : {}),
    ...(day.dayWeather !== undefined ? { dayWeather: day.dayWeather } : {}),
    ...(day.intimateMix !== undefined ? { intimateMix: day.intimateMix } : {}),
    ...(day.allowCompanions !== undefined ? { allowCompanions: day.allowCompanions } : {}),
  };
}

export function normalizeEpisodeDay(value: unknown): EpisodeDay | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Partial<EpisodeDay>;
  if (!Array.isArray(raw.slots) || !Array.isArray(raw.stills)) return undefined;
  return dayEpisodeSnapshot(raw);
}

const PARK_FIELDS = [
  'slots',
  'dayLength',
  'stills',
  'dayMood',
  'dayWeather',
  'intimateMix',
  'allowCompanions',
  'dayThread',
  'dayEvent',
] as const;

function parkOf(day: Partial<DayToolCache>, now: number): ParkedDay {
  const entry = { at: now } as ParkedDay;
  for (const field of PARK_FIELDS) {
    if (day[field] !== undefined) (entry as Record<string, unknown>)[field] = day[field];
  }
  return entry;
}

/**
 * The Day patch that opens an episode's Day again for `castId`. The Cast whose Day is live gets
 * it on the board; another Cast gets it as their parked Day (Day swaps it in when they are
 * picked). Whatever it replaces — with stills — is set aside, not dropped.
 */
export function reopenEpisodeDayPatch(input: {
  day: DayToolCache;
  castId: string;
  /** The active Cast now. */
  activeCastId?: string | null;
  snapshot: EpisodeDay;
  label: string;
  now?: number;
}): Partial<DayToolCache> {
  const now = input.now ?? Date.now();
  const castId = input.castId.trim();
  const live = (input.activeCastId?.trim() || '') === castId;
  const restored: Partial<DayToolCache> = {};
  for (const field of PARK_FIELDS) {
    const value = (input.snapshot as Record<string, unknown>)[field];
    (restored as Record<string, unknown>)[field] = value;
  }
  if (live) {
    const replaced = (input.day.stills?.length ?? 0) > 0 ? parkOf(input.day, now) : null;
    return {
      ...restored,
      stillsCharacterId: castId,
      setAsideDay: replaced ? { ...replaced, castId, reason: input.label } : undefined,
    };
  }
  const parked = { ...(input.day.parkedDays ?? {}) };
  const previous = parked[castId];
  parked[castId] = { ...parkOf(restored, now), at: now };
  return {
    parkedDays: parked,
    setAsideDay:
      previous && (previous.stills?.length ?? 0) > 0
        ? { ...previous, castId, reason: input.label }
        : input.day.setAsideDay,
  };
}

/** Bring the set-aside Day back (and set aside the one it replaces, so it can go back again). */
export function bringBackSetAsideDayPatch(
  day: DayToolCache,
  now = Date.now()
): Partial<DayToolCache> | null {
  const aside = day.setAsideDay;
  if (!aside) return null;
  const restored: Partial<DayToolCache> = {};
  for (const field of PARK_FIELDS) {
    (restored as Record<string, unknown>)[field] = (aside as Record<string, unknown>)[field];
  }
  const current = (day.stills?.length ?? 0) > 0 ? parkOf(day, now) : null;
  return {
    ...restored,
    stillsCharacterId: aside.castId,
    setAsideDay: current
      ? { ...current, castId: aside.castId, reason: 'the episode you opened' }
      : undefined,
  };
}

/** One row per slot of an episode's Day: what the Cast page lists under the episode. */
export function episodeDayRows(snapshot: EpisodeDay): Array<{
  slotId: string;
  label: string;
  place: string;
  beat: string;
  line: string;
  thumb: string;
  kind: 'clip' | 'still' | 'none';
}> {
  const bySlot = new Map((snapshot.stills ?? []).map(still => [still.slotId, still]));
  return normalizeDaySlots(snapshot.slots, snapshot.dayLength).map(slot => {
    const still = bySlot.get(slot.id);
    const clip = still?.clipStatus === 'completed' && Boolean(still.clipUrl?.trim());
    const shown = still?.status === 'completed' ? dayStillShownImage(still) : '';
    return {
      slotId: slot.id,
      label: slot.label,
      place: slot.location?.trim() ?? '',
      beat: slot.sceneHints?.trim() ?? '',
      line: slot.line?.trim() ?? '',
      thumb: shown,
      kind: clip ? 'clip' : shown ? 'still' : 'none',
    };
  });
}
