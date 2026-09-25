/**
 * Where a pose read from a gallery still can go: a Day slot or a Story beat (as its photo
 * pose), mirroring what "Use a photo…" does in the pose preview. Pure list updates plus thin
 * settings wrappers.
 */

import type { PhotoPose } from '@/lib/day-pose-guide';
import type { DaySlot } from '@/lib/day-planner';
import type { RoleplayStoryBeat } from '@/lib/roleplay';
import { loadSettingsCache, saveToolSettings } from '@/lib/settings-cache';

/** Set a slot's pose to `pose` (drawn exactly; the picked layout / variant are cleared). */
export function withDaySlotPose(slots: DaySlot[], slotId: string, pose: PhotoPose): DaySlot[] {
  return slots.map(slot =>
    slot.id === slotId
      ? { ...slot, posePhoto: pose, poseLayout: undefined, poseVariant: undefined }
      : slot
  );
}

/** Beat key: id + at (beats with the same id across rolls are told apart by `at`). */
export function storyBeatKey(beat: Pick<RoleplayStoryBeat, 'id' | 'at'>): string {
  return `${beat.id}@${beat.at}`;
}

export function withStoryBeatPose(
  story: RoleplayStoryBeat[],
  beatKey: string,
  pose: PhotoPose
): RoleplayStoryBeat[] {
  return story.map(beat =>
    storyBeatKey(beat) === beatKey
      ? { ...beat, posePhoto: pose, poseLayout: undefined, poseVariant: undefined }
      : beat
  );
}

export type PoseTargetOption = { key: string; label: string };

/** Day slots the pose can go to (label · beat). */
export function daySlotPoseTargets(): PoseTargetOption[] {
  const slots = (loadSettingsCache().tools.day?.slots ?? []) as DaySlot[];
  return slots.map(slot => ({
    key: slot.id,
    label: slot.sceneHints?.trim()
      ? `${slot.label} · ${slot.sceneHints.trim().slice(0, 40)}`
      : slot.label,
  }));
}

/** Story beats the pose can go to (number · title). */
export function storyBeatPoseTargets(): PoseTargetOption[] {
  const story = (loadSettingsCache().tools.roleplay?.story ?? []) as RoleplayStoryBeat[];
  return story.map((beat, index) => ({
    key: storyBeatKey(beat),
    label: `${index + 1}. ${beat.title?.trim() || 'Beat'}`,
  }));
}

export function applyPoseToDaySlot(slotId: string, pose: PhotoPose): void {
  const slots = (loadSettingsCache().tools.day?.slots ?? []) as DaySlot[];
  saveToolSettings('day', { slots: withDaySlotPose(slots, slotId, pose) });
}

export function applyPoseToStoryBeat(beatKey: string, pose: PhotoPose): void {
  const story = (loadSettingsCache().tools.roleplay?.story ?? []) as RoleplayStoryBeat[];
  saveToolSettings('roleplay', { story: withStoryBeatPose(story, beatKey, pose) });
}
