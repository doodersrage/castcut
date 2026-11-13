'use client';

import { useMobilePlayToolOrchestration } from '@/hooks/useMobilePlayToolOrchestration';
import MobilePlayToolSections from '@/components/mobile/MobilePlayToolSections';
import SavedDataWait from '@/components/ui/SavedDataWait';

export default function MobilePlayTool() {
  const vm = useMobilePlayToolOrchestration();
  if (!vm.mounted) return <SavedDataWait label="Opening your film" />;
  return <MobilePlayToolSections description="" {...vm} />;
}
