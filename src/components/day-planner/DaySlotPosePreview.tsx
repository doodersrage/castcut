'use client';

import { useMemo } from 'react';
import PoseMissPanel from '@/components/pose/PoseMissPanel';
import PosePreview from '@/components/pose/PosePreview';
import { usePoseOutcomeStats } from '@/hooks/usePoseOutcomeStats';
import { useWeakPoseLayouts } from '@/hooks/useWeakPoseLayouts';
import { COMFY_IMAGE_MODELS } from '@/lib/comfy-models/client';
import { readCachedComfyObjectInfoModels } from '@/lib/comfyui-object-info-cache';
import { isDayAdultMood, type DaySlot, type DaySlotId } from '@/lib/day-planner';
import { dayPoseGuideFallbackIndex } from '@/lib/day-pose-guide';
import { planDaySlotPose, plannedDaySlotPoseKey } from '@/lib/day-slot-pose';
import { installedComfyModels } from '@/lib/model-picker';
import type { PoseMissView } from '@/lib/pose-coaching';
import { poseEngineHint, poseOutcomeEngine } from '@/lib/pose-outcome-stats';

/** Engine families with an installed model, or null while the inventory isn't known. */
function installedPoseEngines(): Set<string> | null {
  const installed = installedComfyModels(COMFY_IMAGE_MODELS, readCachedComfyObjectInfoModels());
  if (!installed) return null;
  return new Set(
    [...installed.keys()]
      .map(poseOutcomeEngine)
      .filter((engine): engine is NonNullable<typeof engine> => Boolean(engine))
  );
}

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
  plateUrl,
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
  /** The Day plate, shown behind the figure in the pose editor. */
  plateUrl?: string | null;
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
  // A quiet hint when this pose has kept needing a second try on this engine (local stats).
  const outcomes = usePoseOutcomeStats();
  const hint = useMemo(() => {
    let poseKey: string;
    try {
      poseKey = plannedDaySlotPoseKey(plan, slot.id);
    } catch {
      return null;
    }
    const engines = installedPoseEngines();
    return poseEngineHint({
      poseKey,
      model,
      stats: outcomes,
      mood: effectiveMood,
      ...(engines ? { installed: engine => engines.has(engine) } : {}),
    });
  }, [effectiveMood, model, outcomes, plan, slot.id]);
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
        backdropUrl={plateUrl}
        backdropLabel="Day plate"
        photoPeople={plan.headcount}
        onChange={patch => updateSlot(slot.id, patch)}
      />
      {hint ? (
        <p
          className="type-caption text-[var(--text-muted)]"
          data-testid="day-slot-pose-engine-hint"
        >
          {hint.text}
        </p>
      ) : null}
      {poseMiss ? <PoseMissPanel view={poseMiss} testId="day-slot-pose-miss" /> : null}
    </div>
  );
}
