'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import DayPlannerToolSections from '@/components/day-planner/DayPlannerToolSections';

export default function DayPlannerTool() {
  const description = useToolPageDescription(
    'A short film: plan the moments, render the stills, then cut it.',
    'A short film: plan the moments, render the stills, then cut it.'
  );
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) return null;
  return <DayPlannerToolSections description={description} {...vm} />;
}
