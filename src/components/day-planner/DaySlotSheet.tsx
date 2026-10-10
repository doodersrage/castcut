'use client';

import { spokenLineHeat } from '@/lib/spoken-line';
import { isDayAdultMood } from '@/lib/day-planner';
import { activeCastHasVoice, suggestLineForActiveCast } from '@/lib/spoken-line-context';
import SpokenLineField from '@/components/SpokenLineField';
import { useRef, useState, type ReactNode } from 'react';
import { DayBeatOwnership } from '@/components/day-planner/DayBeatOwnership';
import { DaySameSeedRedo } from '@/components/day-planner/DaySameSeedRedo';
import DaySlotLookPicker from '@/components/day-planner/DaySlotLookPicker';
import DaySlotPosePreview from '@/components/day-planner/DaySlotPosePreview';
import { Button } from '@/components/ui/Button';
import { FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import SideSheet from '@/components/ui/SideSheet';
import UiIcon from '@/components/ui/UiIcon';
import ClothingSheet, { ClothingSummaryRow } from '@/components/wardrobe/ClothingSheet';
import type { CharacterRecord } from '@/lib/character-os';
import type { ClothingSummaryThumb } from '@/lib/clothing-summary';
import {
  daySlotProgressState,
  typedDayBeatPatch,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day-planner';
import type { PoseMissView } from '@/lib/pose-coaching';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/roleplay';

export type DaySlotSheetProps = {
  open: boolean;
  onClose: () => void;
  slot: DaySlot;
  slots: DaySlot[];
  stills: DaySlotStill[];
  onSelectSlot: (slotId: DaySlotId) => void;
  character: CharacterRecord | null | undefined;
  busy: boolean;
  queueBlocked: boolean;
  dayMood: string;
  intimateEnabled: boolean;
  intimateMix?: string;
  allowCompanions: boolean;
  model?: string | null;
  /** Auto-review's last pose miss on this slot. */
  poseMiss?: PoseMissView;
  /** The Day plate, shown behind the figure in the pose editor. */
  plateUrl?: string | null;
  updateSlot: (slotId: DaySlotId, patch: Partial<DaySlot>) => void;
  /** "Boxy chocolate habit · black pumps" — the Clothing row's one line. */
  clothingSummary: string;
  /** Kit packshot / photo / shoe photo beside it (clothing-summary). */
  clothingThumbs?: ClothingSummaryThumb[];
  /** The slot's look or kit is not the whole Day's (day-outfit-scope.ts). */
  differsFromDay?: boolean;
  /** "Use the Day's": this slot back on the Day's look and clothing. */
  onUseDayOutfit?: () => void;
  /** The full picker, rendered inside the Clothing sheet only while it is open. */
  renderClothingPicker: () => ReactNode;
  onRedoSameSeed: () => void;
  onKeepOldTake: () => void;
  onKeepNewTake: () => void;
  /** Two takes (intimate stills): keep the first or the second. */
  onPickTwoTake?: (keep: 'first' | 'second') => void;
  /** End pose control for a finished slot, when the clip engine can pin a last frame. */
  endPose?: ReactNode;
  onQueueSlot: () => void;
  onAnimateSlot: () => void;
  /** Phone: the compact pose preview. */
  compact?: boolean;
};

/**
 * Everything about one slot, in a side sheet: Setting, Beat, pose, look, clothing, presets,
 * takes, end pose, and Queue / Animate for this slot only. Opens from a card's Edit, its ⋯
 * menu, or a tap on a slot with no still yet.
 */
export default function DaySlotSheet({
  open,
  onClose,
  slot,
  slots,
  stills,
  onSelectSlot,
  character,
  busy,
  queueBlocked,
  dayMood,
  intimateEnabled,
  intimateMix,
  allowCompanions,
  model,
  poseMiss,
  plateUrl,
  updateSlot,
  clothingSummary,
  clothingThumbs,
  differsFromDay = false,
  onUseDayOutfit,
  renderClothingPicker,
  onRedoSameSeed,
  onKeepOldTake,
  onKeepNewTake,
  onPickTwoTake,
  endPose,
  onQueueSlot,
  onAnimateSlot,
  compact = false,
}: DaySlotSheetProps) {
  const [clothingOpen, setClothingOpen] = useState(false);
  const outfitRef = useRef<HTMLDivElement>(null);
  const still = stills.find(entry => entry.slotId === slot.id);
  // The beat the still was rendered from (rolled when the slot has no scene of its own).
  const slotScene = slot.sceneHints?.trim() || still?.beatKey?.trim() || slot.label;
  const otherLines = slots
    .filter(entry => entry.id !== slot.id && entry.line?.trim())
    .map(entry => entry.line!.trim());
  const done = daySlotProgressState(still) === 'done';
  const index = slots.findIndex(entry => entry.id === slot.id);
  const previous = index > 0 ? slots[index - 1] : null;
  const next = index >= 0 && index < slots.length - 1 ? slots[index + 1] : null;
  const label = slot.label.toLowerCase();

  return (
    <SideSheet
      open={open}
      onClose={() => {
        setClothingOpen(false);
        onClose();
      }}
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
        </div>
      }
    >
      <div className="space-y-3" data-testid="day-slots">
        <div className="grid gap-3" data-testid="day-active-plan">
          <label className="space-y-1.5">
            <FieldLabel>Setting</FieldLabel>
            <TextArea
              rows={2}
              data-testid="day-slot-location"
              value={slot.location ?? ''}
              className="min-h-[3.5rem] max-h-60 [field-sizing:content]"
              placeholder="e.g. sunlit café terrace, rainy commute, rooftop at dusk"
              onChange={event => updateSlot(slot.id, { location: event.target.value })}
            />
          </label>
          <label className="space-y-1.5">
            <FieldLabel>
              Beat
              <DayBeatOwnership slot={slot} updateSlot={updateSlot} />
            </FieldLabel>
            <TextArea
              rows={2}
              data-testid="day-slot-beat"
              value={slot.sceneHints ?? ''}
              className="min-h-[3.5rem] max-h-60 [field-sizing:content]"
              placeholder="What happens in this part of the day?"
              onChange={event => updateSlot(slot.id, typedDayBeatPatch(slot, event.target.value))}
            />
          </label>
          <SpokenLineField
            key={slot.id}
            line={slot.line}
            fullFrame={slot.lineFullFrame === true}
            reply={slot.replyLine}
            onReplySave={reply => updateSlot(slot.id, { replyLine: reply || undefined })}
            onSuggestReply={line =>
              suggestLineForActiveCast(
                {
                  scene: slotScene,
                  setting: slot.location,
                  when: slot.label,
                  heat: spokenLineHeat(dayMood),
                  replyTo: line,
                },
                { castId: character?.id }
              )
            }
            onFullFrameChange={on => updateSlot(slot.id, { lineFullFrame: on || undefined })}
            hasVoice={activeCastHasVoice()}
            onSuggest={() =>
              suggestLineForActiveCast(
                {
                  scene: slotScene,
                  setting: slot.location,
                  when: slot.label,
                  heat: spokenLineHeat(dayMood),
                  avoid: otherLines,
                },
                { castId: character?.id }
              )
            }
            note={
              isDayAdultMood(dayMood) && intimateMix !== 'solo'
                ? 'Two-person adult clips render on WAN, which cannot move their lips to words: Add voice gives them breathing and moans, and a line is spoken on one-person clips only.'
                : undefined
            }
            onSave={line => updateSlot(slot.id, { line: line || undefined })}
            testId="day-slot-line"
          />
        </div>
        <DaySlotPosePreview
          slot={slot}
          dayMood={dayMood}
          intimateEnabled={intimateEnabled}
          intimateMix={intimateMix}
          allowCompanions={allowCompanions}
          model={model}
          busy={busy}
          compact={compact}
          poseMiss={poseMiss}
          plateUrl={plateUrl}
          updateSlot={updateSlot}
        />
        {differsFromDay ? (
          <p
            className="type-caption flex flex-wrap items-center gap-x-1 text-[var(--text-muted)]"
            data-testid="day-slot-differs"
          >
            Different from the Day ·
            <button
              type="button"
              className="ui-text-link"
              disabled={busy}
              data-testid="day-slot-use-day"
              onClick={() => {
                onUseDayOutfit?.();
                // The line goes with the override: keep focus in the sheet (its look tiles or
                // the Clothing row), not on the page behind it.
                window.requestAnimationFrame(() =>
                  outfitRef.current
                    ?.querySelector<HTMLElement>('[aria-checked="true"], button')
                    ?.focus()
                );
              }}
            >
              Use the Day&apos;s
            </button>
          </p>
        ) : null}
        <div ref={outfitRef} className="space-y-3">
          <DaySlotLookPicker
            character={character}
            slot={slot}
            disabled={busy}
            updateSlot={updateSlot}
          />
          <ClothingSummaryRow
            summary={clothingSummary}
            thumbs={clothingThumbs}
            disabled={busy}
            testId="day-slot-clothing"
            onOpen={() => setClothingOpen(true)}
          />
        </div>
        <div
          className="flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] py-2"
          data-testid="day-setting-presets"
        >
          <div className="min-w-0">
            <p className="type-heading text-sm">Setting presets</p>
            <p className="type-caption text-[var(--text-muted)]">
              Insert a canned location into Setting.
            </p>
          </div>
          <SelectInput
            value=""
            disabled={busy}
            className="!w-auto shrink-0"
            data-testid="day-setting-preset"
            aria-label="Setting preset"
            onChange={event => {
              const preset = ROLEPLAY_SETTING_PRESETS.find(
                entry => entry.id === event.target.value
              );
              if (preset) {
                updateSlot(slot.id, { location: preset.setting });
              }
            }}
          >
            <option value="">Insert…</option>
            {ROLEPLAY_SETTING_PRESETS.map(preset => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </SelectInput>
        </div>
        <DaySameSeedRedo
          slot={slot}
          still={still}
          busy={busy}
          blocked={queueBlocked}
          onRedo={onRedoSameSeed}
          onKeepOld={onKeepOldTake}
          onKeepNew={onKeepNewTake}
          onPickTwoTake={onPickTwoTake}
        />
        {endPose}
      </div>
      <ClothingSheet
        open={clothingOpen}
        onClose={() => setClothingOpen(false)}
        title={`Clothing · ${slot.label}`}
        description="Outfit kit, your own photo, and footwear for this still."
      >
        {clothingOpen ? renderClothingPicker() : null}
      </ClothingSheet>
    </SideSheet>
  );
}
