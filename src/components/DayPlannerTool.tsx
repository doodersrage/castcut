'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import DayPlannerToolSections from '@/components/day-planner/DayPlannerToolSections';

export default function DayPlannerTool() {
  const description = useToolPageDescription(
    'Pick a time of day, queue stills, then Cut film. Finished slots open the next one.',
    'Four times of day → stills → Cut film. Tap a card to edit that slot.'
  );
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) return null;
  return <DayPlannerToolSections description={description} {...vm} />;
}
