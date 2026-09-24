'use client';

import {
  useRoleplayBeatQueueCore,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { useRoleplayBeatQueuePart2 } from '@/hooks/roleplay/useRoleplayBeatQueuePart2';
import { useStoryPoseCheck } from '@/hooks/roleplay/useStoryPoseCheck';

export type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueue(options: UseRoleplayBeatQueueOptions) {
  const core = useRoleplayBeatQueueCore(options);
  const part2 = useRoleplayBeatQueuePart2(options, core);
  const poseCheck = useStoryPoseCheck(options);
  return { ...core, ...part2, ...poseCheck };
}
