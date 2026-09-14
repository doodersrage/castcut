'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import DayPlannerToolSections from '@/components/day-planner/DayPlannerToolSections';

export default function DayPlannerTool() {
  const description = useToolPageDescription(
    'Queue morning through night, watch progress here, then Cut film.',
    'Day slots → stills → Cut film. Demo stills if Comfy is offline.'
  );
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) return null;
  return <DayPlannerToolSections description={description} {...vm} />;
}
