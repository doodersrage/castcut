'use client';

import {
  useFittingRoomQueueCore,
  type FittingRoomQueueInput,
} from '@/hooks/fitting-room/useFittingRoomQueueCore';
import { useFittingRoomQueuePart2 } from '@/hooks/fitting-room/useFittingRoomQueuePart2';

export function useFittingRoomQueue(input: FittingRoomQueueInput) {
  const core = useFittingRoomQueueCore(input);
  const part2 = useFittingRoomQueuePart2(input, core);
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
  };
}
