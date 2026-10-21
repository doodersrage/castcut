'use client';

import { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';
import MobilePlayToolSections from '@/components/mobile/MobilePlayToolSections';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

export default function MobilePlayTool() {
  const vm = useMobilePlayToolOrchestration();
  if (!vm.mounted) return <ToolPageSkeleton label="Loading play" />;
  return <MobilePlayToolSections description="" {...vm} />;
}
