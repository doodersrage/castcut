'use client';

import { castCatchphrases } from '@/lib/cast/speech';
import { getCharacter } from '@/lib/character/os';
import { loadSettingsCache } from '@/lib/settings/cache';
import StillReferenceTray from '@/components/StillReferenceTray';
import { poseLayoutFromGuideName } from '@/lib/still/references';
import { daySlotPoseOverride } from '@/lib/day/slot-pose';
import { spokenLineHeat } from '@/lib/audio/spoken-line';
import { normalizeSpokenLineTone } from '@/lib/video/ltx25-renderer';
import { isDayAdultMood } from '@/lib/day/planner';
import { activeCastHasVoice, suggestLineForActiveCast } from '@/lib/audio/spoken-line-context';
import NarrationField from '@/components/NarrationField';
import PortraitTileStrip from '@/components/ui/PortraitTileStrip';
import type { DayPartnerOption } from '@/components/day-planner/DayPartnerPicker';
import SpokenLineField from '@/components/SpokenLineField';
import { useRef, useState, type ReactNode } from 'react';
import { DayBeatOwnership } from '@/components/day-planner/DayBeatOwnership';
import { DaySameSeedRedo } from '@/components/day-planner/DaySameSeedRedo';
import DaySlotLookPicker from '@/components/day-planner/DaySlotLookPicker';
import DaySlotEnginePicker from '@/components/day-planner/DaySlotEnginePicker';
import ShotStoryStateFields from '@/components/day-planner/ShotStoryStateFields';
import DaySlotPosePreview from '@/components/day-planner/DaySlotPosePreview';
import { FieldLabel, SelectInput, TextArea } from '@/components/ui/Field';
import ClothingSheet, { ClothingSummaryRow } from '@/components/wardrobe/ClothingSheet';
import type { CharacterRecord } from '@/lib/character/os';
import type { LocationRecord } from '@/lib/location/records';
import type { ClothingSummaryThumb } from '@/lib/wardrobe/clothing-summary';
import {
  daySlotProgressState,
  typedDayBeatPatch,
  type DaySlot,
  type DaySlotId,
  type DaySlotStill,
} from '@/lib/day/planner';
import type { PoseMissView } from '@/lib/pose/coaching';
import { ROLEPLAY_SETTING_PRESETS } from '@/lib/story/roleplay';

export type DaySlotEditorProps = {
  slot: DaySlot;
  slots: DaySlot[];
  stills: DaySlotStill[];
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
  /** Phone: the compact pose preview. */
  compact?: boolean;
  /** Cast members who can be the third person in a group still (not the lead, not the partner). */
  groupOptions?: DayPartnerOption[];
  /** The Clothing sheet's title (default: "Clothing · <slot label>"). */
  clothingTitle?: string;
  /**
   * Location records the shot can be set in (M8 T2); unset = no picker (Day, whose slots a
   * location's delete guard does not count).
   */
  locations?: readonly LocationRecord[];
  /** The shot's story state fields (M8 T5, Scene only). */
  storyState?: boolean;
};

/**
 * Everything about one shot: Setting, Beat, line, narration, group, pose (with the 3D editor and
 * the Camera row), look, engine, clothing, setting presets and the same-seed redo. Day shows it in
 * a slot's side sheet (DaySlotSheet); Scene shows it on the page — one editor, so every fix to a
 * slot's controls reaches both.
 */
export default function DaySlotEditor({
  slot,
  slots,
  stills,
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
  compact = false,
  groupOptions = [],
  clothingTitle,
  locations,
  storyState = false,
}: DaySlotEditorProps) {
  const [clothingOpen, setClothingOpen] = useState(false);
  const outfitRef = useRef<HTMLDivElement>(null);
  const still = stills.find(entry => entry.slotId === slot.id);
  // The beat the still was rendered from (rolled when the slot has no scene of its own).
  const slotScene = slot.sceneHints?.trim() || still?.beatKey?.trim() || slot.label;
  const otherLines = slots
    .filter(entry => entry.id !== slot.id && entry.line?.trim())
    .map(entry => entry.line!.trim());
  // Narration earlier in the Day (in order), so a suggestion follows on from it.
  const narrationSoFar = slots
    .slice(
      0,
      Math.max(
        0,
        slots.findIndex(entry => entry.id === slot.id)
      )
    )
    .map(entry => entry.narration?.trim() ?? '')
    .filter(Boolean)
    .slice(-6);
  const done = daySlotProgressState(still) === 'done';

  return (
    <>
      <div className="space-y-3" data-testid="day-slots">
        {done && still?.promptId ? (
          <StillReferenceTray
            promptId={still.promptId}
            place={slot.location}
            testId="day-slot-references"
            actions={ref => {
              const jump = (testId: string) => () =>
                document
                  .querySelector(`[data-testid="${testId}"]`)
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              if ((ref.role === 'face' || ref.role === 'look') && character?.id) {
                return [
                  {
                    label: 'Change',
                    href: `/characters/${encodeURIComponent(character.id)}`,
                    testId: `day-slot-references-${ref.role}-change`,
                  },
                ];
              }
              if (ref.role === 'clothes' || ref.role === 'shoes') {
                return [
                  {
                    label: 'Change',
                    onClick: () => setClothingOpen(true),
                    testId: `day-slot-references-${ref.role}-change`,
                  },
                ];
              }
              if (ref.role === 'pose') {
                const layout = poseLayoutFromGuideName(ref.filename);
                const pinnable =
                  layout && daySlotPoseOverride(layout) && slot.poseLayout !== layout;
                return [
                  ...(pinnable
                    ? [
                        {
                          label: 'Keep',
                          onClick: () => updateSlot(slot.id, { poseLayout: layout }),
                          testId: 'day-slot-references-pose-keep',
                        },
                      ]
                    : []),
                  {
                    label: 'Change',
                    onClick: jump('day-slot-pose'),
                    testId: 'day-slot-references-pose-change',
                  },
                ];
              }
              return [];
            }}
          />
        ) : null}
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
          {locations ? (
            <label className="space-y-1.5">
              <FieldLabel>Location</FieldLabel>
              <SelectInput
                data-testid="day-slot-location-record"
                value={slot.locationId ?? ''}
                title="A place the film goes back to (Locations): every shot set there draws the same room"
                onChange={event => {
                  const picked = locations.find(entry => entry.id === event.target.value);
                  updateSlot(
                    slot.id,
                    picked
                      ? {
                          locationId: picked.id,
                          // No words yet: the place's name is a start.
                          ...(slot.location?.trim() ? {} : { location: picked.name }),
                        }
                      : { locationId: undefined }
                  );
                }}
              >
                <option value="">None — the Setting&apos;s words only</option>
                {slot.locationId && !locations.some(entry => entry.id === slot.locationId) ? (
                  <option value={slot.locationId}>A location no longer here</option>
                ) : null}
                {locations.map(entry => (
                  <option key={entry.id} value={entry.id}>
                    {entry.name}
                  </option>
                ))}
              </SelectInput>
            </label>
          ) : null}
          {storyState ? (
            <ShotStoryStateFields
              state={slot.state}
              onChange={next => updateSlot(slot.id, { state: next })}
            />
          ) : null}
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
            catchphrases={castCatchphrases(
              getCharacter(loadSettingsCache().shared.activeCharacterId?.trim() || '')
            )}
            // A new picture clears the slot's line (clearDaySlotLine): start the field afresh.
            key={`${slot.id}:${still?.promptId ?? ''}`}
            line={slot.line}
            fullFrame={slot.lineFullFrame === true}
            tone={slot.lineTone}
            onToneChange={tone => updateSlot(slot.id, { lineTone: normalizeSpokenLineTone(tone) })}
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
          <NarrationField
            key={`${slot.id}:narration`}
            value={slot.narration ?? ''}
            onSave={narration => updateSlot(slot.id, { narration: narration || undefined })}
            onSuggest={() =>
              suggestLineForActiveCast(
                {
                  scene: slotScene,
                  setting: slot.location,
                  when: slot.label,
                  heat: spokenLineHeat(dayMood),
                  avoid: narrationSoFar,
                  kind: 'narration',
                },
                { castId: character?.id }
              )
            }
          />
          {allowCompanions && !isDayAdultMood(dayMood) && groupOptions.length > 0 ? (
            <div className="space-y-1.5" data-testid="day-slot-group">
              <FieldLabel>Also in this still</FieldLabel>
              <PortraitTileStrip
                label="Also in this still"
                value={slot.thirdCastId ?? ''}
                disabled={busy}
                testIdPrefix="day-slot-third"
                onChange={next =>
                  updateSlot(slot.id, {
                    thirdCastId: next || undefined,
                    // The fourth person goes with the third (and never twice the same Cast).
                    ...(!next || next === slot.fourthCastId ? { fourthCastId: undefined } : {}),
                  })
                }
                tiles={[
                  { id: '', label: 'Nobody else', glyph: '—' },
                  ...groupOptions.map(option => ({
                    id: option.id,
                    label: option.name,
                    title: `${option.name} — the third person on this two-person still`,
                    thumb: option.thumb,
                  })),
                ]}
              />
              {slot.thirdCastId && groupOptions.some(option => option.id !== slot.thirdCastId) ? (
                <FieldLabel>And a fourth</FieldLabel>
              ) : null}
              {slot.thirdCastId && groupOptions.some(option => option.id !== slot.thirdCastId) ? (
                <PortraitTileStrip
                  label="And a fourth"
                  value={slot.fourthCastId ?? ''}
                  disabled={busy}
                  testIdPrefix="day-slot-fourth"
                  onChange={next => updateSlot(slot.id, { fourthCastId: next || undefined })}
                  tiles={[
                    { id: '', label: 'Nobody else', glyph: '—' },
                    ...groupOptions
                      .filter(option => option.id !== slot.thirdCastId)
                      .map(option => ({
                        id: option.id,
                        label: option.name,
                        title: `${option.name} — the fourth person on this still (Qwen-Image 2.1)`,
                        thumb: option.thumb,
                      })),
                  ]}
                />
              ) : null}
              <span className="type-caption block text-[var(--text-muted)]">
                A third Cast member with the lead and the partner — on two-person stills, Edit 2511
                or Qwen-Image 2.1 (their face takes the pose map&apos;s place; the pose is said in
                words). A fourth needs Qwen-Image 2.1 (the room photo, if any, rides as a fifth
                picture).
              </span>
            </div>
          ) : null}
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
          <DaySlotEnginePicker slot={slot} model={model} disabled={busy} updateSlot={updateSlot} />
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
        title={clothingTitle ?? `Clothing · ${slot.label}`}
        description="Outfit kit, your own photo, and footwear for this still."
      >
        {clothingOpen ? renderClothingPicker() : null}
      </ClothingSheet>
    </>
  );
}
