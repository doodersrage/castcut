'use client';

import { useDayPlannerToolOrchestrationCore } from '@/hooks/day-planner/useDayPlannerToolOrchestrationCore';
import { useDayPlannerToolOrchestrationPart2 } from '@/hooks/day-planner/useDayPlannerToolOrchestrationPart2';
import { useDaySeries } from '@/hooks/day-planner/useDaySeries';
import { useDaySlotQualityGate } from '@/hooks/day-planner/useDaySlotQualityGate';
import { useDayClipQualityCheck } from '@/hooks/day-planner/useDayClipQualityCheck';

export function useDayPlannerToolOrchestration() {
  const core = useDayPlannerToolOrchestrationCore();
  const part2 = useDayPlannerToolOrchestrationPart2(core);
  const quality = useDaySlotQualityGate(core);
  const clips = useDayClipQualityCheck(core);
  const season = useDaySeries(core.character?.id);
  return { ...core, ...part2, ...quality, ...clips, ...season };
}
