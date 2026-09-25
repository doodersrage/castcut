'use client';

import { useMemo } from 'react';
import PosePreview from '@/components/PosePreview';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { isDayAdultMood, type DaySlot, type DaySlotId } from '@/lib/day-planner';
import { dayPoseGuideFallbackIndex } from '@/lib/day-pose-guide';
import { planDaySlotPose } from '@/lib/day-slot-pose';

/** The active Day slot's pose preview — drawn with the same plan Queue day uses. */
export default function DaySlotPosePreview({
  slot,
  dayMood,
  intimateEnabled,
  intimateMix,
  allowCompanions,
  model,
  busy,
  compact,
  updateSlot,
}: {
  slot: DaySlot;
  dayMood: string;
  intimateEnabled: boolean;
  intimateMix?: string;
  allowCompanions: boolean;
  model?: string | null;
  busy?: boolean;
  compact?: boolean;
  updateSlot: (id: DaySlotId, patch: Partial<DaySlot>) => void;
}) {
  const weakLayouts = useWeakPoseLayouts();
  const effectiveMood = isDayAdultMood(dayMood) && !intimateEnabled ? 'everyday' : dayMood;
  const plan = useMemo(
    () =>
      planDaySlotPose({
        slot,
        dayMood: effectiveMood,
        intimateMix,
        allowCompanions,
        model,
      }),
    [allowCompanions, effectiveMood, intimateMix, model, slot]
  );
  return (
    <div className="space-y-1.5" data-testid="day-slot-pose">
      <PosePreview
        sceneText={plan.sceneText}
        options={plan.options}
        fallbackIndex={dayPoseGuideFallbackIndex(slot.id)}
        value={slot.poseLayout}
        weakLayouts={weakLayouts}
        disabled={busy}
        compact={compact}
        testIdPrefix="day-slot-pose-preview"
        onChange={poseLayout => updateSlot(slot.id, { poseLayout, poseVariant: undefined })}
        onTryAnother={() =>
          updateSlot(slot.id, { poseVariant: ((slot.poseVariant ?? 0) % 99) + 1 })
        }
      />
    </div>
  );
}
