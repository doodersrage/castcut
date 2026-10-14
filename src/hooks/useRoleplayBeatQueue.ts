'use client';

import {
  useRoleplayBeatQueueCore,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { useRoleplayBeatQueuePart2 } from '@/hooks/roleplay/useRoleplayBeatQueuePart2';
import { useStoryPoseCheck } from '@/hooks/roleplay/useStoryPoseCheck';
import { useStoryMarksCheck } from '@/hooks/roleplay/useStoryMarksCheck';
import { useStoryCloseUps } from '@/hooks/roleplay/useStoryCloseUps';
import { useStoryAdultGate } from '@/hooks/roleplay/useStoryAdultGate';

export type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueue(options: UseRoleplayBeatQueueOptions) {
  const core = useRoleplayBeatQueueCore(options);
  const part2 = useRoleplayBeatQueuePart2(options, core);
  const poseCheck = useStoryPoseCheck(options);
  // After the pose check: her glasses / tattoos on solo scenes, repaired when missing.
  const marksCheck = useStoryMarksCheck(options);
  const closeUps = useStoryCloseUps(options);
  // Always on: adult-rated stills are held until they read as clearly adult.
  const adultGate = useStoryAdultGate(options, core);
  return { ...core, ...part2, ...poseCheck, ...marksCheck, ...closeUps, ...adultGate };
}
