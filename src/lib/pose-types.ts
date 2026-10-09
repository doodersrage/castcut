/**
 * Pose data shapes shared by Day's pose maps and the shared pose tools (my poses, pose import,
 * OpenPose drawing, Gallery pose dialog). Kept out of day-pose-guide so shared code needs no Play
 * import (docs/architecture-boundaries.md); day-pose-guide re-exports them.
 */

import type { PoseFacing } from '@/lib/pose-guide-openpose';
import type { NormalizedBody } from '@/lib/pose-library';

type Point = { x: number; y: number };

/** Normalized 0–1 skeleton joints for a full-body pose figure. */
export type StickSkeleton = {
  head: Point;
  neck: Point;
  pelvis: Point;
  lShoulder: Point;
  rShoulder: Point;
  lElbow: Point;
  rElbow: Point;
  lWrist: Point;
  rWrist: Point;
  lHip: Point;
  rHip: Point;
  lKnee: Point;
  rKnee: Point;
  lAnkle: Point;
  rAnkle: Point;
  /** Head direction for OpenPose face points; inferred from joint geometry when unset. */
  facing?: PoseFacing;
  /**
   * Where the face points, independent of the body (picked with "Look"): at the camera, turned
   * to image-left / image-right, or tipped down. Only the face keypoints change.
   */
  gaze?: StickGaze;
};

export type StickGaze = 'camera' | 'left' | 'right' | 'down';

/** Skeletons read from a reference photo for one slot / beat (lead first, 0–1 of the photo). */
export type PhotoPose = {
  aspect: number;
  people: NormalizedBody[];
  /** Read from a photo (default) or dragged into shape in the joint editor. */
  source?: 'photo' | 'edited';
  /**
   * The pose in words when it is known by name (a Day pose picked on Outfit: "waving: one arm
   * raised high …"). Dropped as soon as the joints are edited.
   */
  words?: string;
};
