'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import PoseBodiesSvg from '@/components/pose/PoseBodiesSvg';
import { Button } from '@/components/ui/Button';
import { SelectInput, SwitchButton, TextInput } from '@/components/ui/Field';
import { usePoseOutcomeStats } from '@/hooks/usePoseOutcomeStats';
import { usePoseReferences } from '@/hooks/usePoseReferences';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { isDayAdultMood, type DaySlot } from '@/lib/day-planner';
import { dayPoseAsPhotoPose } from '@/lib/day-pose-presets';
import {
  activePosePack,
  applyPosePackToSlots,
  BUILT_IN_POSE_PACKS,
  clearPosePackFromSlots,
  POSE_PACK_NAME_MAX,
  slotHasPosePick,
  type PosePack,
} from '@/lib/day-pose-packs';
import { planDaySlotPose } from '@/lib/day-slot-pose';
import {
  loadMyPosePacks,
  removeMyPosePack,
  saveMyPosePack,
  subscribeMyPosePacks,
} from '@/lib/my-pose-packs';
import { mergeAvoidedPoseLayouts } from '@/lib/pose-guide-prompt';
import { poseLayoutLabel } from '@/lib/pose-layout-labels';
import { learnedWeakPoseLayouts } from '@/lib/pose-outcome-stats';

function useMyPosePacks(): PosePack[] {
  const json = useSyncExternalStore(
    subscribeMyPosePacks,
    () => JSON.stringify(loadMyPosePacks()),
    () => '[]'
  );
  return useMemo(() => JSON.parse(json) as PosePack[], [json]);
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Day → Pose pack: pose the whole Day from a themed set (Fitness, Dance, Portrait, …) or from a
 * pack of your own, clear it back to "pose from the beat", or save the Day's poses as a pack.
 */
export default function DayPosePackPicker({
  slots,
  dayMood,
  intimateEnabled,
  intimateMix,
  allowCompanions,
  model,
  busy = false,
  onSlotsChange,
}: {
  slots: DaySlot[];
  dayMood: string;
  intimateEnabled: boolean;
  intimateMix?: string;
  allowCompanions: boolean;
  model?: string | null;
  busy?: boolean;
  onSlotsChange: (slots: DaySlot[]) => void;
}) {
  const mine = useMyPosePacks();
  const metricsWeak = useWeakPoseLayouts();
  const outcomes = usePoseOutcomeStats();
  // Poses this engine keeps needing a second try on for this player are skipped too.
  const weak = useMemo(
    () => new Set([...metricsWeak, ...learnedWeakPoseLayouts(model, outcomes)]),
    [metricsWeak, model, outcomes]
  );
  // A pack pose with a variant previews that variant's real-world reference once they load.
  const references = usePoseReferences();
  const [fillBeats, setFillBeats] = useState(true);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const packs = useMemo(() => [...BUILT_IN_POSE_PACKS, ...mine], [mine]);
  const active = useMemo(() => activePosePack(slots, packs), [packs, slots]);
  const posedCount = slots.filter(slotHasPosePick).length;
  const effectiveMood = isDayAdultMood(dayMood) && !intimateEnabled ? 'everyday' : dayMood;

  const figures = useMemo(
    () =>
      (active?.entries ?? []).map((entry, index) => {
        const pose =
          entry.photo ??
          (entry.layout
            ? dayPoseAsPhotoPose(entry.layout, undefined, { variant: entry.variant, references })
            : null);
        return {
          key: `${index}-${entry.layout ?? 'photo'}`,
          label: entry.layout ? poseLayoutLabel(entry.layout) : 'Your pose',
          pose,
        };
      }),
    [active, references]
  );

  const apply = (pack: PosePack) => {
    // Each slot's headcount as the queue plans it: a solo pose never lands on a duo beat.
    const slotPeople = slots.map(
      slot =>
        planDaySlotPose({
          slot,
          dayMood: effectiveMood,
          intimateMix,
          allowCompanions,
          model,
        }).headcount
    );
    const result = applyPosePackToSlots(slots, pack, {
      fillBeats,
      avoidLayouts: mergeAvoidedPoseLayouts(weak, model),
      slotPeople,
    });
    onSlotsChange(result.slots);
    const parts = [`${pack.name}: ${plural(result.posed, 'slot')} posed`];
    if (result.beatsFilled) parts.push(`${plural(result.beatsFilled, 'empty beat')} filled`);
    if (result.skipped) {
      parts.push(
        `${plural(result.skipped, 'two-person slot')} kept ${result.skipped === 1 ? 'its' : 'their'} pose`
      );
    }
    setStatus(`${parts.join(' · ')}.`);
  };

  const clear = () => {
    onSlotsChange(clearPosePackFromSlots(slots));
    setStatus('Poses cleared — each slot takes its pose from the beat again.');
  };

  const save = () => {
    try {
      const pack = saveMyPosePack(slots, name.trim() || 'My pack');
      setStatus(`Saved “${pack.name}” (${plural(pack.entries.length, 'pose')}) to My packs.`);
      setNaming(false);
      setName('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not save that pack.');
    }
  };

  return (
    <div
      className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border-subtle)] p-2"
      data-testid="day-pose-pack"
      data-active-pack={active?.id ?? ''}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-caption text-[var(--text-muted)]">Pose pack</span>
        <SelectInput
          value={active?.id ?? ''}
          disabled={busy}
          aria-label="Pose pack"
          data-testid="day-pose-pack-select"
          className="w-auto! min-w-[10rem] py-1 text-sm"
          onChange={event => {
            const pack = packs.find(entry => entry.id === event.target.value);
            if (pack) apply(pack);
            else if (posedCount > 0) clear();
          }}
        >
          <option value="">
            {posedCount > 0 && !active ? 'Picked by hand' : 'None — poses from the beats'}
          </option>
          <optgroup label="Packs">
            {BUILT_IN_POSE_PACKS.map(pack => (
              <option key={pack.id} value={pack.id}>
                {pack.name}
              </option>
            ))}
          </optgroup>
          {mine.length > 0 ? (
            <optgroup label="My packs">
              {mine.map(pack => (
                <option key={pack.id} value={pack.id}>
                  {pack.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </SelectInput>
        <SwitchButton
          checked={fillBeats}
          disabled={busy}
          onChange={setFillBeats}
          data-testid="day-pose-pack-fill"
          title="When a pack is applied, write a matching beat (and setting) into slots that have none. Beats you wrote are never changed."
        >
          Fill empty beats
        </SwitchButton>
        {posedCount > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            data-testid="day-pose-pack-clear"
            title="Every slot back to Auto — the pose comes from the beat"
            onClick={clear}
          >
            Clear poses
          </Button>
        ) : null}
      </div>
      {active ? (
        <div className="space-y-1">
          {active.blurb ? (
            <p className="type-caption text-[var(--text-muted)]">{active.blurb}</p>
          ) : null}
          <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="day-pose-pack-figures">
            {figures.map(figure =>
              figure.pose ? (
                <PoseBodiesSvg
                  key={figure.key}
                  layers={[{ bodies: figure.pose.people }]}
                  aspect={figure.pose.aspect}
                  height={56}
                  label={figure.label}
                  testId="day-pose-pack-figure"
                />
              ) : null
            )}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {naming ? (
          <>
            <TextInput
              value={name}
              autoFocus
              maxLength={POSE_PACK_NAME_MAX}
              aria-label="Pack name"
              placeholder="Name this pack"
              data-testid="day-pose-pack-name"
              className="w-auto! min-w-[10rem] py-1 text-sm"
              onChange={event => setName(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') save();
                if (event.key === 'Escape') setNaming(false);
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              data-testid="day-pose-pack-save-confirm"
              onClick={save}
            >
              Save pack
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNaming(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || posedCount === 0}
            data-testid="day-pose-pack-save"
            title={
              posedCount === 0
                ? 'Pick a pose on a slot first'
                : "Save this Day's slot poses as a pack you can apply to any Day"
            }
            onClick={() => {
              setName(active && !active.mine ? '' : (active?.name ?? ''));
              setNaming(true);
            }}
          >
            Save as pack
          </Button>
        )}
        {active?.mine ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            data-testid="day-pose-pack-remove"
            onClick={() => {
              removeMyPosePack(active.id);
              setStatus(`Removed “${active.name}” from My packs. The slots keep their poses.`);
            }}
          >
            Remove pack
          </Button>
        ) : null}
      </div>
      <p
        className="type-caption text-[var(--text-muted)] empty:hidden"
        aria-live="polite"
        data-testid="day-pose-pack-status"
      >
        {status ?? ''}
      </p>
    </div>
  );
}
