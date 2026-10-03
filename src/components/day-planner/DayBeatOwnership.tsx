'use client';

import { dayBeatIsTyped, restoreDayBeatPatch, type DaySlot } from '@/lib/day-planner';

/**
 * Beside a slot's Beat field: "Your words" when the beat is the player's (it reaches the prompt as
 * typed), with a way back to Day's own beat.
 */
export function DayBeatOwnership({
  slot,
  updateSlot,
}: {
  slot: DaySlot;
  updateSlot: (id: DaySlot['id'], patch: Partial<DaySlot>) => void;
}) {
  if (!dayBeatIsTyped(slot)) return null;
  return (
    <span className="ml-2 inline-flex items-center gap-2 align-middle">
      <span
        className="rounded-full bg-[var(--bg-muted)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
        data-testid="day-beat-typed-badge"
      >
        Your words
      </span>
      <button
        type="button"
        className="text-[11px] text-[var(--text-muted)] underline underline-offset-2 hover:text-[var(--text-primary)]"
        data-testid="day-beat-restore"
        onClick={event => {
          // Inside the field's <label>: keep the click from focusing the text area.
          event.preventDefault();
          updateSlot(slot.id, restoreDayBeatPatch(slot));
        }}
      >
        {slot.sceneHintsDay ? "Use Day's scene" : 'Clear'}
      </button>
    </span>
  );
}
