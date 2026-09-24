/**
 * The four dayparts Day's preset tables are keyed by, and the slot → daypart mapping.
 * Dependency-free so day-planner, day-vacation and day-sport can all import it without cycles.
 */

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening', 'night'];

/** Daypart a slot draws its presets from (`morning-2` → `morning`). */
export function dayPartOf(slotId: string | null | undefined): DayPart {
  const base = String(slotId ?? '')
    .trim()
    .split('-')[0] as DayPart;
  return (DAY_PARTS as readonly string[]).includes(base) ? base : 'afternoon';
}
