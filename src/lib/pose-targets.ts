/**
 * Where a pose read in the Gallery can be sent (docs/architecture-boundaries.md). Features
 * register target groups — Play: Day slots and Story beats (play-pose-targets.ts) — and the
 * Gallery pose dialog lists them without importing the features.
 */

import type { PhotoPose } from '@/lib/pose-types';

export type PoseTargetOption = { key: string; label: string };

export type PoseTargetGroup = {
  /** Stable id; the dialog's "Use" button is `gallery-pose-${id}`. */
  id: string;
  heading: string;
  /** Accessible name of the picker. */
  pickerLabel: string;
  options: () => PoseTargetOption[];
  apply: (key: string, pose: PhotoPose) => void;
  /** What the dialog says after Use, and where "Open" goes. */
  doneText: string;
  href?: string;
};

const groups = new Map<string, PoseTargetGroup>();

export function registerPoseTargetGroup(group: PoseTargetGroup): void {
  groups.set(group.id, group);
}

export function poseTargetGroups(): PoseTargetGroup[] {
  return [...groups.values()];
}
