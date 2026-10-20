/**
 * Undo / redo for the Day plan — places, beats, outfits, lines, poses, slot count (roadmap review
 * 2026-10-11: "every major creative decision should be recoverable"). Suggest day, a remix or a
 * mistyped beat used to overwrite the plan with no way back. Pure: the hook
 * (useDayPlanHistory) records a step per burst of edits.
 */

import type { DaySlot } from './planner';

export type DayPlanHistory = { past: DaySlot[][]; future: DaySlot[][] };

export const EMPTY_PLAN_HISTORY: DayPlanHistory = { past: [], future: [] };
export const PLAN_HISTORY_LIMIT = 30;

/** A new step: the plan as it was before the edit. Clears redo. */
export function recordPlanStep(
  history: DayPlanHistory,
  before: DaySlot[],
  limit = PLAN_HISTORY_LIMIT
): DayPlanHistory {
  return { past: [...history.past, before].slice(-limit), future: [] };
}

export function undoPlanStep(
  history: DayPlanHistory,
  current: DaySlot[]
): { history: DayPlanHistory; slots: DaySlot[] } | null {
  const previous = history.past[history.past.length - 1];
  if (!previous) return null;
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    slots: previous,
  };
}

export function redoPlanStep(
  history: DayPlanHistory,
  current: DaySlot[]
): { history: DayPlanHistory; slots: DaySlot[] } | null {
  const next = history.future[0];
  if (!next) return null;
  return {
    history: { past: [...history.past, current], future: history.future.slice(1) },
    slots: next,
  };
}

const FIELD_LABELS: Array<[keyof DaySlot, string]> = [
  ['sceneHints', 'beat'],
  ['location', 'place'],
  ['wardrobeId', 'outfit'],
  ['line', 'line'],
  ['lineTone', 'how the line is said'],
  ['poseLayout', 'pose'],
];

/** What going from `a` to `b` changes, for the button ("Afternoon's beat", "the plan"). */
export function planChangeLabel(a: DaySlot[], b: DaySlot[]): string {
  if (a.length !== b.length) return 'the number of stills';
  const changed = a.filter((slot, index) => JSON.stringify(slot) !== JSON.stringify(b[index]));
  if (changed.length === 0) return 'the plan';
  if (changed.length > 1) return `the plan (${changed.length} slots)`;
  const slot = changed[0]!;
  const other = b[a.indexOf(slot)]!;
  const fields = FIELD_LABELS.filter(([field]) => slot[field] !== other[field]);
  return fields.length === 1 ? `${slot.label}'s ${fields[0]![1]}` : `${slot.label}`;
}

export function samePlan(a: DaySlot[], b: DaySlot[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
