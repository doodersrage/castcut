/**
 * A posed 3D figure's posture, read from its joints (y up): standing, seated, kneeling, crouched,
 * bent over or lying. For checking the lift (a seated picture must not lift into a standing
 * figure) — the reference poses are filed under the posture they show.
 */

import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import { openPoseWorld } from '@/lib/pose/rig3d-pose';
import {
  classifyPosturePoints,
  postureAnglesOfPoints,
  posturesForPose,
  type Posture,
  type PostureAngles,
} from '@/lib/pose/rig3d-posture-points';

export type { Posture, PostureAngles };

export function postureAngles(figure: PoseRig3dFigure): PostureAngles {
  return postureAnglesOfPoints(openPoseWorld(figure));
}

export function classifyPosture(figure: PoseRig3dFigure): Posture {
  return classifyPosturePoints(openPoseWorld(figure));
}

/** What the reference poses filed under `pose` may lift into (null: no clear posture). */
export function expectedPostures(pose: string): Posture[] | null {
  return posturesForPose(pose) ?? null;
}
