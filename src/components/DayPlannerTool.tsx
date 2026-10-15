'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import DayPlannerToolSections from '@/components/day-planner/DayPlannerToolSections';

export default function DayPlannerTool() {
  const description = useToolPageDescription(
    'Plan the scenes, render the stills, then cut the film.',
    'Plan the scenes, render the stills, then cut the film.'
  );
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) return null;
  return <DayPlannerToolSections description={description} {...vm} />;
}
