'use client';

import { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import MobileFittingToolSections from '@/components/mobile/MobileFittingToolSections';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

export default function MobileFittingTool() {
  const vm = useFittingRoomToolOrchestration();
  if (!vm.mounted) {
    return <ToolPageSkeleton label="Loading fitting" />;
  }
  return <MobileFittingToolSections {...vm} />;
}
