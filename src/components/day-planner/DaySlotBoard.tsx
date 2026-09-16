'use client';

import { Button } from '@/components/ui/Button';
import {
  daySlotProgressLabel,
  daySlotProgressState,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';

export type DaySlotBoardProps = {
  slots: DaySlot[];
  stills: DaySlotStill[];
  activeSlotId: DaySlotId;
  busy?: boolean;
  queueBlocked?: boolean;
  compact?: boolean;
  onSelectSlot: (slotId: DaySlotId) => void;
  onOpenStill?: (slotId: DaySlotId) => void;
  onRetrySlot?: (slot: DaySlot) => void;
};

/**
 * Morning → night board: primary way to pick which Day slot you are editing.
 * Completed thumbs stay tappable for a larger view via View / second select.
 */
export default function DaySlotBoard({
  slots,
  stills,
  activeSlotId,
  busy = false,
  queueBlocked = false,
  compact = false,
  onSelectSlot,
  onOpenStill,
  onRetrySlot,
}: DaySlotBoardProps) {
  return (
    <ol
      className={compact ? 'grid grid-cols-2 gap-2' : 'grid gap-2 sm:grid-cols-4'}
      data-testid="day-progress"
      aria-label="Day slots"
    >
      {slots.map(slot => {
        const still = stills.find(entry => entry.slotId === slot.id);
        const state = daySlotProgressState(still);
        const label = daySlotProgressLabel(state);
        const thumb = state === 'done' ? still?.imageUrl?.trim() : '';
        const selected = activeSlotId === slot.id;
        return (
          <li key={slot.id} className="min-w-0">
            <div
              data-testid={`day-progress-${slot.id}`}
              data-state={state}
              data-selected={selected ? 'true' : 'false'}
              className={[
                'overflow-hidden rounded-[var(--radius-md)] border transition-[box-shadow,border-color,transform]',
                selected
                  ? 'border-[var(--accent-border)] bg-[var(--accent-muted)] shadow-[var(--shadow-card)] ring-2 ring-[var(--accent-ring)]'
                  : state === 'done'
                    ? 'border-[var(--tint-success-border)] bg-[var(--tint-success-bg)]'
                    : state === 'failed'
                      ? 'border-[var(--tint-danger-border)] bg-[var(--tint-danger-bg)]'
                      : state === 'queued'
                        ? 'border-[var(--accent-border)]/60 bg-[var(--accent-muted)]/50'
                        : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]',
              ].join(' ')}
            >
              <button
                type="button"
                className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-ring)]"
                aria-pressed={selected}
                aria-label={
                  selected
                    ? `${slot.label}, selected — ${label}`
                    : `Select ${slot.label} — ${label}`
                }
                data-testid={`day-slot-select-${slot.id}`}
                onClick={() => {
                  if (selected && thumb && onOpenStill) {
                    onOpenStill(slot.id);
                    return;
                  }
                  onSelectSlot(slot.id);
                }}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className={
                      compact
                        ? 'aspect-video w-full object-cover'
                        : 'aspect-[4/3] w-full object-cover'
                    }
                  />
                ) : (
                  <div
                    className={[
                      'flex items-center justify-center bg-[var(--bg-muted)]/40 text-[var(--text-muted)]',
                      compact ? 'aspect-video' : 'aspect-[4/3]',
                    ].join(' ')}
                    aria-hidden
                  >
                    <span className="type-caption">{label}</span>
                  </div>
                )}
                <div className={compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="type-heading text-sm sm:text-base">{slot.label}</p>
                    {selected ? (
                      <span className="type-overline text-[var(--accent-text)]">Editing</span>
                    ) : null}
                  </div>
                  <p className="type-caption text-[var(--text-muted)]">{label}</p>
                </div>
              </button>
              {thumb && onOpenStill ? (
                <div className={compact ? 'px-2.5 pb-2' : 'px-3 pb-2.5'}>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full justify-center"
                    data-testid={`day-progress-open-${slot.id}`}
                    onClick={() => onOpenStill(slot.id)}
                  >
                    View larger
                  </Button>
                </div>
              ) : null}
              {state === 'failed' && onRetrySlot ? (
                <div className={compact ? 'px-2.5 pb-2' : 'px-3 pb-2.5'}>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="w-full justify-center"
                    disabled={busy || queueBlocked}
                    data-testid={`day-progress-retry-${slot.id}`}
                    onClick={() => onRetrySlot(slot)}
                  >
                    Retry {slot.label}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
