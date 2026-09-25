'use client';

import { useMemo } from 'react';
import PoseMissPanel from '@/components/pose/PoseMissPanel';
import PosePreview from '@/components/pose/PosePreview';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { isDayAdultMood, type DaySlot, type DaySlotId } from '@/lib/day-planner';
import { dayPoseGuideFallbackIndex } from '@/lib/day-pose-guide';
import { planDaySlotPose } from '@/lib/day-slot-pose';
import type { PoseMissView } from '@/lib/pose-coaching';

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
  poseMiss,
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
  /** Auto-review's last pose miss on this slot. */
  poseMiss?: PoseMissView;
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
    <div className="space-y-2" data-testid="day-slot-pose">
      <PosePreview
        sceneText={plan.sceneText}
        options={plan.options}
        fallbackIndex={dayPoseGuideFallbackIndex(slot.id)}
        picks={slot}
        weakLayouts={weakLayouts}
        disabled={busy}
        compact={compact}
        testIdPrefix="day-slot-pose-preview"
        onChange={patch => updateSlot(slot.id, patch)}
      />
      {poseMiss ? <PoseMissPanel view={poseMiss} testId="day-slot-pose-miss" /> : null}
    </div>
  );
}
