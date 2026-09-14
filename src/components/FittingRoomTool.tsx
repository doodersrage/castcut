'use client';

import { useFittingRoomToolOrchestration } from '@/hooks/useFittingRoomToolOrchestration';
import { useToolPageDescription } from '@/hooks/useToolPageDescription';
import FittingRoomToolSections from '@/components/fitting/FittingRoomToolSections';

export default function FittingRoomTool() {
  const description = useToolPageDescription(
    'Try outfits on a Cast plate, Keep a kit, continue to Day.',
    'Outfit try-ons — Keep a kit or skip to Day.'
  );
  const vm = useFittingRoomToolOrchestration();
  if (!vm.mounted) return null;
  return <FittingRoomToolSections description={description} {...vm} />;
}
