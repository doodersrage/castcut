'use client';

import {
  useRoleplayBeatQueueCore,
  type UseRoleplayBeatQueueOptions,
} from '@/hooks/roleplay/useRoleplayBeatQueueCore';
import { useRoleplayBeatQueuePart2 } from '@/hooks/roleplay/useRoleplayBeatQueuePart2';

export type { UseRoleplayBeatQueueOptions } from '@/hooks/roleplay/useRoleplayBeatQueueCore';

export function useRoleplayBeatQueue(options: UseRoleplayBeatQueueOptions) {
  const core = useRoleplayBeatQueueCore(options);
  const part2 = useRoleplayBeatQueuePart2(options, core);
  return { ...core, ...part2 };
}
