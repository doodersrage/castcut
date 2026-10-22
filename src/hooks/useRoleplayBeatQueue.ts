'use client';

import { useMemo } from 'react';
import {
  useRoleplayBeatQueueCore,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { useRoleplayBeatQueuePart2 } from '@/hooks/roleplay/useRoleplayBeatQueuePart2';
import { useStoryPoseCheck } from '@/hooks/roleplay/useStoryPoseCheck';
import { useStoryMarksCheck } from '@/hooks/roleplay/useStoryMarksCheck';
import { useStoryCloseUps } from '@/hooks/roleplay/useStoryCloseUps';
import { useStoryAdultGate } from '@/hooks/roleplay/useStoryAdultGate';
import { useStoryShotReframe } from '@/hooks/roleplay/useStoryShotReframe';

export type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueue(options: UseRoleplayBeatQueueOptions) {
  const core = useRoleplayBeatQueueCore(options);
  const part2 = useRoleplayBeatQueuePart2(options, core);
  // A picked waist-up / close-up shot is cut from the take first (shot-reframe.ts): the pose
  // check (and the marks check after it) look at the cut.
  const { holdsBeatForReframe, shotReframeTick } = useStoryShotReframe(options);
  const reframeHold = useMemo(
    () => ({ holdsBeat: holdsBeatForReframe, tick: shotReframeTick }),
    [holdsBeatForReframe, shotReframeTick]
  );
  const poseCheck = useStoryPoseCheck(options, reframeHold);
  // After the pose check: her glasses / tattoos on solo scenes, repaired when missing.
  const marksCheck = useStoryMarksCheck(options);
  const closeUps = useStoryCloseUps(options);
  // Always on: adult-rated stills are held until they read as clearly adult.
  const adultGate = useStoryAdultGate(options, core);
  return { ...core, ...part2, ...poseCheck, ...marksCheck, ...closeUps, ...adultGate };
}
