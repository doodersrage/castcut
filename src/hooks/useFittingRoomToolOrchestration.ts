'use client';

import { useFittingRoomToolOrchestrationCore } from '@/hooks/fitting-room/useFittingRoomToolOrchestrationCore';
import { useFittingRoomToolOrchestrationPart2 } from '@/hooks/fitting-room/useFittingRoomToolOrchestrationPart2';
import { useFittingRoomToolOrchestrationPart3 } from '@/hooks/fitting-room/useFittingRoomToolOrchestrationPart3';

import { useOutfitHandoff } from '@/hooks/fitting-room/useOutfitHandoff';

export function useFittingRoomToolOrchestration() {
  const core = useFittingRoomToolOrchestrationCore();
  const part2 = useFittingRoomToolOrchestrationPart2(core);
  const part3 = useFittingRoomToolOrchestrationPart3({ ...core, ...part2 });
  useOutfitHandoff(core.mounted, core.toolSettings);
  return { ...core, ...part2, ...part3 };
}
