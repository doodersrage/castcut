'use client';

import {
  useFittingRoomQueueCore,
  type FittingRoomQueueInput,
} from '@/hooks/fitting-room/useFittingRoomQueueCore';
import { useFittingRoomQueuePart2 } from '@/hooks/fitting-room/useFittingRoomQueuePart2';
import { useKeeperStandIn } from '@/hooks/fitting-room/useKeeperStandIn';

export function useFittingRoomQueue(input: FittingRoomQueueInput) {
  const core = useFittingRoomQueueCore(input);
  const standIn = useKeeperStandIn(input);
  const part2 = useFittingRoomQueuePart2(input, core, standIn);
  return {
    busy: core.busy,
    compareTryOns: core.compareTryOns,
    setCompareTryOns: core.setCompareTryOns,
    previewStatus: part2.previewStatus,
    queueTryOn: core.queueTryOn,
    queueKitPreview: part2.queueKitPreview,
    fillKitPreviews: part2.fillKitPreviews,
    keepTryOn: part2.keepTryOn,
    queueTryOnAndSwipe: part2.queueTryOnAndSwipe,
    keeperStandIn: standIn.status,
    makeStandingPicture: standIn.makeStandingPicture,
  };
}
