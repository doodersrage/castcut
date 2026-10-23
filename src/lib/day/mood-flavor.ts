/**
 * Day's Intimate mood has a Playful toggle: crude sexual comedy (wardrobe fails, slapstick) —
 * what used to be its own Raunchy mood. Stored as `dayMood: 'intimate'` + `intimatePlayful: true`;
 * the planner still runs it as the `'raunchy'` flavor so its beats and prompt lines are exactly
 * what Raunchy built. Pure and dependency-free (types only) so Story's bundle can use it.
 */
import type { DayMoodSetting } from './planner';

/** The stored Day fields that pick the mood flavor. */
export type DayMoodFields = {
  dayMood?: DayMoodSetting | string | null;
  intimatePlayful?: boolean | null;
};

/**
 * The mood the planner runs for stored Day settings: Intimate with Playful on → `'raunchy'` (the
 * crude-comedy beats and lines, byte-for-byte what the old Raunchy mood built); everything else
 * as stored. A legacy stored `'raunchy'` (a Day saved before the merge) also plays as that.
 */
export function dayMoodFlavor(
  fields: DayMoodFields | null | undefined
): DayMoodSetting | undefined {
  const stored = fields?.dayMood;
  if (typeof stored !== 'string') return stored ?? undefined;
  const id = stored.trim().toLowerCase();
  if (id === 'raunchy') return 'raunchy';
  if (id === 'intimate' && fields?.intimatePlayful === true) return 'raunchy';
  return stored as DayMoodSetting;
}

/** Picker mood + Playful → the flavor id (`'raunchy'` for Intimate · Playful). */
export function dayMoodWithPlayful(mood: DayMoodSetting, playful: boolean): DayMoodSetting {
  if (mood === 'raunchy') return 'raunchy';
  return mood === 'intimate' && playful ? 'raunchy' : mood;
}

/** What the picker shows for a flavor: Raunchy is Intimate with Playful on. */
export function dayPickerMood(mood: DayMoodSetting): {
  mood: DayMoodSetting;
  playful: boolean;
} {
  return mood === 'raunchy' ? { mood: 'intimate', playful: true } : { mood, playful: false };
}

export { migrateDayMoodFields } from '../settings/day-mood-migration';
