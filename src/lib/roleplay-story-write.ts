/**
 * Writing a Story scene's still — the decisions desk and phone Story share (useRoleplaySceneFlow,
 * useRoleplayBioFlow, commitStill). Pure, so both pages make them the same way.
 */

import type { RoleplayStoryBeat } from '@/lib/roleplay';
import type { RoleplayBeatOutput } from '@/lib/roleplay-film';

/**
 * How a picked scene (or a story's opening scene) is written: with "Clip" output and queueing on
 * pick, no still is queued — the clip is queued from the scene's text — so the beat is not shown
 * as a still being written.
 */
export function roleplaySceneWritePlan(input: {
  beatOutput: RoleplayBeatOutput;
  autoQueue: boolean;
}): { skipStill: boolean; queueStill: boolean; stillStatus: 'writing' | undefined } {
  const skipStill = input.beatOutput === 'clip' && input.autoQueue;
  return {
    skipStill,
    queueStill: input.autoQueue && !skipStill,
    stillStatus: skipStill ? undefined : 'writing',
  };
}

/** Whether the reel still holds this beat (not taken back, not replaced by a start-over). */
export function storyHasBeat(
  story: readonly RoleplayStoryBeat[],
  beat: Pick<RoleplayStoryBeat, 'id' | 'at'>
): boolean {
  return story.some(entry => entry.id === beat.id && entry.at === beat.at);
}

/**
 * The reel after a scene's still could not be written: the scene leaves the reel unless it
 * already has a prompt. Applied to the reel as it is now, not as it was when the write began.
 */
export function storyWithoutUnwrittenBeat(
  story: readonly RoleplayStoryBeat[],
  beat: Pick<RoleplayStoryBeat, 'id' | 'at'>
): RoleplayStoryBeat[] {
  return story.filter(
    entry => !(entry.id === beat.id && entry.at === beat.at) || Boolean(entry.prompt)
  );
}
