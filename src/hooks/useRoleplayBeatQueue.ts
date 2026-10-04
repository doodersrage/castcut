'use client';

import {
  useRoleplayBeatQueueCore,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { useRoleplayBeatQueuePart2 } from '@/hooks/roleplay/useRoleplayBeatQueuePart2';
import { useStoryPoseCheck } from '@/hooks/roleplay/useStoryPoseCheck';
import { useStoryAdultGate } from '@/hooks/roleplay/useStoryAdultGate';

export type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueue(options: UseRoleplayBeatQueueOptions) {
  const core = useRoleplayBeatQueueCore(options);
  const part2 = useRoleplayBeatQueuePart2(options, core);
  const poseCheck = useStoryPoseCheck(options);
  // Always on: adult-rated stills are held until they read as clearly adult.
  const adultGate = useStoryAdultGate(options, core);
  return { ...core, ...part2, ...poseCheck, ...adultGate };
}
