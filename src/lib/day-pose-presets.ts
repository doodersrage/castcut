/**
 * Day's named poses (the slot editor's "Change pose" list) as ready-made skeletons, for places
 * that take a pose directly — Outfit's try-on pose. Same drawing code as Day's guides, so a pose
 * picked here is the figure Day would draw for it.
 */

import {
  resolveSceneGuidePlan,
  SCENE_POSE_BODY_IDS,
  type PhotoPose,
  type PoseGuideBase,
  type SocialLayout,
} from '@/lib/day-pose-guide';
import type { PoseLibraryEntry } from '@/lib/pose-library';
import { poseLayoutCue } from '@/lib/pose-coaching';
import {
  POSE_PICKER_GROUPS,
  poseLayoutLabel,
  type PosePickerGroup,
} from '@/lib/pose-layout-labels';

const BODY_IDS: ReadonlySet<string> = new Set(SCENE_POSE_BODY_IDS);

/** One Day pose as a single-figure pose, or null when it draws no usable figure. */
export function dayPoseAsPhotoPose(id: string, library?: PoseLibraryEntry[]): PhotoPose | null {
  const key = id.trim();
  if (!key) return null;
  const pose = BODY_IDS.has(key) ? { body: key as PoseGuideBase } : { layout: key as SocialLayout };
  const { openPose } = resolveSceneGuidePlan(undefined, 0, {
    forcePeople: 1,
    pose,
    openPose: true,
    ...(library ? { library } : {}),
  });
  const body = openPose.keypoints[0];
  if (!body || openPose.keypoints.length !== 1) return null;
  const { width, height } = openPose.canvas;
  return {
    aspect: width > 0 && height > 0 ? width / height : 2 / 3,
    people: [body],
    // Editable like any custom pose.
    source: 'edited',
    words: dayPoseWords(key),
  };
}

/** A named pose in a few words: its cue when it has one ("one arm raised high …"), else its name. */
export function dayPoseWords(id: string): string {
  const label = poseLayoutLabel(id).toLowerCase();
  const cue = poseLayoutCue(id);
  // Sport cues already start with the sport's name ("tennis serve: …").
  return cue ? (id.startsWith('sport_') ? cue : `${label}: ${cue}`) : label;
}

let soloGroups: PosePickerGroup[] | null = null;

/** The pose list for one person: Day's groups without the two-person layouts. */
export function soloDayPoseGroups(): readonly PosePickerGroup[] {
  soloGroups ??= POSE_PICKER_GROUPS.map(group => ({
    ...group,
    ids: group.ids.filter(id => dayPoseAsPhotoPose(id) !== null),
  })).filter(group => group.ids.length > 0 && group.label !== 'Two people');
  return soloGroups;
}
