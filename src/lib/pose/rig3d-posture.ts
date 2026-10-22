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
  switch (pose) {
    case 'stand':
    case 'walk':
    case 'phone':
    case 'drink':
    case 'wave':
    case 'point':
    case 'pockets':
    case 'cross_arms':
    case 'hands_hips':
    case 'hair_touch':
    case 'shrug':
    case 'look_back':
    case 'selfie':
    case 'arms_up':
    case 'hands_behind_head':
    case 'photograph':
      return ['stand'];
    case 'sit':
    case 'perch_edge':
      return ['seated', 'crouch'];
    case 'sit_floor':
      return ['seated', 'crouch', 'kneel'];
    case 'kneel':
      return ['kneel'];
    case 'crouch':
    case 'sport_squat':
      return ['crouch', 'seated', 'kneel'];
    case 'lie':
    case 'lie_front':
    case 'lie_side':
    case 'sport_plank':
    case 'sport_pushup':
    case 'lounge_elbows':
      return ['lying'];
    case 'bend_pick':
    case 'sport_deadlift':
      return ['bend', 'crouch'];
    default:
      return null;
  }
}
