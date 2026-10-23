'use client';

import type { ReactNode } from 'react';
import DaySlotEditor, { type DaySlotEditorProps } from '@/components/day-planner/DaySlotEditor';
import { Button } from '@/components/ui/Button';
import SideSheet from '@/components/ui/SideSheet';
import UiIcon from '@/components/ui/UiIcon';
import { daySlotProgressState, type DaySlotId } from '@/lib/day/planner';

export type DaySlotSheetProps = Omit<DaySlotEditorProps, 'clothingTitle'> & {
  open: boolean;
  onClose: () => void;
  onSelectSlot: (slotId: DaySlotId) => void;
  onQueueSlot: () => void;
  onAnimateSlot: () => void;
  /** Make a face close-up and a detail shot of this still for the cut (film-angles-client.ts). */
  onAddCloseUps?: () => void;
  /** "Open as Scene": this slot's shot as a new scene on the Scene page (day/scenes.ts). */
  onOpenAsScene?: () => void;
  /** Extra footer actions after the slot's own. */
  footerExtra?: ReactNode;
};

/**
 * Everything about one slot, in a side sheet: Setting, Beat, pose, look, clothing, presets,
 * takes, end pose, and Queue / Animate for this slot only. Opens from a card's Edit, its ⋯
 * menu, or a tap on a slot with no still yet. The controls are DaySlotEditor (Scene shows the
 * same editor on its page).
 */
export default function DaySlotSheet({
  open,
  onClose,
  onSelectSlot,
  onQueueSlot,
  onAnimateSlot,
  onAddCloseUps,
  onOpenAsScene,
  footerExtra,
  ...editor
}: DaySlotSheetProps) {
  const { slot, slots, stills, busy, queueBlocked } = editor;
  const still = stills.find(entry => entry.slotId === slot.id);
  const done = daySlotProgressState(still) === 'done';
  const index = slots.findIndex(entry => entry.id === slot.id);
  const previous = index > 0 ? slots[index - 1] : null;
  const next = index >= 0 && index < slots.length - 1 ? slots[index + 1] : null;
  const label = slot.label.toLowerCase();

  return (
    <SideSheet
      open={open}
      onClose={onClose}
      title={slot.label}
      description="Setting, beat, pose and clothing for this time of day."
      testId="day-slot-sheet"
      dataAttributes={{ 'data-slot': slot.id }}
      headerActions={
        slots.length > 1 ? (
          <>
            <button
              type="button"
              className="ui-btn-ghost ui-btn-sm flex h-8 w-8 items-center justify-center !px-0"
              aria-label={previous ? `Previous slot: ${previous.label}` : 'Previous slot'}
              disabled={!previous}
              data-testid="day-slot-sheet-prev"
              onClick={() => previous && onSelectSlot(previous.id)}
            >
              <UiIcon name="chevronLeft" size={16} />
            </button>
            <button
              type="button"
              className="ui-btn-ghost ui-btn-sm flex h-8 w-8 items-center justify-center !px-0"
              aria-label={next ? `Next slot: ${next.label}` : 'Next slot'}
              disabled={!next}
              data-testid="day-slot-sheet-next"
              onClick={() => next && onSelectSlot(next.id)}
            >
              <UiIcon name="chevronRight" size={16} />
            </button>
          </>
        ) : null
      }
      footer={
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="primary"
            disabled={busy || queueBlocked}
            data-testid="day-slot-queue"
            title="Queue this slot only"
            onClick={onQueueSlot}
          >
            {done ? `Requeue ${label}` : `Queue ${label}`}
          </Button>
          {done ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="day-animate-active"
              onClick={onAnimateSlot}
            >
              Animate {label}
            </Button>
          ) : null}
          {done && onAddCloseUps ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              data-testid="day-slot-close-ups"
              title="Two more shots of this moment for the film — a face close-up and a detail (hands, what is held) — cut in for a beat right after it. Two Edit 2511 passes, about a minute."
              onClick={onAddCloseUps}
            >
              {still?.angles?.some(angle => angle.for === still.imageUrl)
                ? 'Redo close-ups'
                : 'Add close-ups'}
            </Button>
          ) : null}
          {onOpenAsScene ? (
            <Button
              size="sm"
              variant="ghost"
              data-testid="day-slot-open-as-scene"
              title="This shot on its own on the Scene page — render takes, keep the best, direct a move. The Day is left as it is."
              onClick={onOpenAsScene}
            >
              Open as Scene
            </Button>
          ) : null}
          {footerExtra}
        </div>
      }
    >
      <DaySlotEditor {...editor} />
    </SideSheet>
  );
}
