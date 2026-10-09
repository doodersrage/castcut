/**
 * Each Cast keeps its own Day. Day holds one plan and one set of stills, owned by the active
 * Cast, and switching Cast threw them away (they stayed only in the Gallery) — looking at another
 * character cost you the Day you were cutting. Switching away now parks the plan and stills
 * under their Cast; switching back puts them back.
 */
import type { DayToolCache } from './play-settings';

/** The part of Day that belongs to one Cast. */
export type ParkedDay = Pick<
  DayToolCache,
  | 'slots'
  | 'dayLength'
  | 'stills'
  | 'dayMood'
  | 'dayWeather'
  | 'intimateMix'
  | 'allowCompanions'
  | 'dayThread'
> & { at: number };

/** At most this many Casts keep a parked Day (oldest dropped). */
export const PARKED_DAY_LIMIT = 6;

const PARKED_FIELDS = [
  'slots',
  'dayLength',
  'stills',
  'dayMood',
  'dayWeather',
  'intimateMix',
  'allowCompanions',
  'dayThread',
] as const;

/**
 * The Day after the active Cast changes from `previousCast` to `nextCast`: the current Day is
 * parked under its owner (when it has stills) and the next Cast's parked Day, if any, comes back.
 * Fields this does not own (plate, stills owner) are the caller's to clear.
 */
export function swapDayForCast(
  day: DayToolCache,
  previousCast: string,
  nextCast: string,
  now = Date.now()
): Partial<DayToolCache> {
  const parked: Record<string, ParkedDay> = { ...(day.parkedDays ?? {}) };
  const owner = day.stillsCharacterId?.trim() || previousCast.trim();
  if (owner && (day.stills?.length ?? 0) > 0) {
    const entry = { at: now } as ParkedDay;
    for (const field of PARKED_FIELDS) {
      if (day[field] !== undefined) (entry as Record<string, unknown>)[field] = day[field];
    }
    parked[owner] = entry;
  }
  const next = nextCast.trim();
  const restored = next ? parked[next] : undefined;
  if (restored) delete parked[next];
  const kept = Object.entries(parked)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, PARKED_DAY_LIMIT);
  const patch: Partial<DayToolCache> = {
    parkedDays: kept.length > 0 ? Object.fromEntries(kept) : undefined,
  };
  if (restored) {
    for (const field of PARKED_FIELDS) {
      (patch as Record<string, unknown>)[field] = restored[field];
    }
    patch.stillsCharacterId = next;
  } else {
    patch.stills = [];
    patch.stillsCharacterId = undefined;
  }
  return patch;
}
