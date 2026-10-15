'use client';

import { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import FittingRoomToolSections from '@/components/fitting/FittingRoomToolSections';

export default function FittingRoomTool() {
  const description = useToolPageDescription(
    'Try clothes on, keep the one you like.',
    'Try clothes on, keep the one you like.'
  );
  const vm = useFittingRoomToolOrchestration();
  if (!vm.mounted) return null;
  return <FittingRoomToolSections description={description} {...vm} />;
}
