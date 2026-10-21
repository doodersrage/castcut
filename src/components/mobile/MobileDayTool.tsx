'use client';

import { useDayPlannerToolOrchestration } from '@/hooks/useDayPlannerToolOrchestration';
import MobileDayToolSections from '@/components/mobile/MobileDayToolSections';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

export default function MobileDayTool() {
  const vm = useDayPlannerToolOrchestration();
  if (!vm.mounted) {
    return <ToolPageSkeleton label="Loading day" />;
  }
  return <MobileDayToolSections {...vm} />;
}
