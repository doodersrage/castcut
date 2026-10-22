/**
 * A posed 3D figure's posture, read from its joints (y up): standing, seated, kneeling, crouched,
 * bent over or lying. For checking the lift (a seated picture must not lift into a standing
 * figure) — the reference poses are filed under the posture they show.
 */

import { Vector3 } from 'three';
import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import { figureWorld, openPoseWorld } from '@/lib/pose/rig3d-pose';

export type Posture = 'stand' | 'seated' | 'kneel' | 'crouch' | 'bend' | 'lying';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const deg = (r: number) => (r * 180) / Math.PI;

export type PostureAngles = {
  /** The spine (between the hips → neck) from straight up, degrees. */
  torso: number;
  /** Each thigh from straight down, degrees. */
  thigh: [number, number];
  /** Each shin from straight down, degrees. */
  shin: [number, number];
  /** How far each knee bends (0 straight), degrees. */
  knee: [number, number];
  /** Between the hips, above the lowest ankle / knee / wrist, over the leg's length. */
  hipHeight: number;
};

export function postureAngles(figure: PoseRig3dFigure): PostureAngles {
  const world = figureWorld(figure);
  const p = openPoseWorld(figure, world);
  const hipMid = p[8]!.clone().add(p[11]!).multiplyScalar(0.5);
  const spine = p[1]!.clone().sub(hipMid);
  const leg = (hip: number, knee: number, ankle: number) => {
    const thigh = p[knee]!.clone().sub(p[hip]!);
    const shin = p[ankle]!.clone().sub(p[knee]!);
    return {
      thigh: deg(thigh.angleTo(DOWN)),
      shin: deg(shin.angleTo(DOWN)),
      knee: deg(thigh.angleTo(shin)),
    };
  };
  const floor = Math.min(...[4, 7, 9, 10, 12, 13].map(i => p[i]!.y));
  const legLength = p[8]!.distanceTo(p[9]!) + p[9]!.distanceTo(p[10]!) + 1e-6;
  const r = leg(8, 9, 10);
  const l = leg(11, 12, 13);
  return {
    torso: deg(spine.angleTo(UP)),
    thigh: [r.thigh, l.thigh],
    shin: [r.shin, l.shin],
    knee: [r.knee, l.knee],
    hipHeight: (hipMid.y - floor) / legLength,
  };
}

export function classifyPosture(figure: PoseRig3dFigure): Posture {
  const a = postureAngles(figure);
  // Lying: the body along the floor (a bend over keeps the hips up on straight legs).
  if (a.torso > 60 && a.hipHeight < 0.55) return 'lying';
  const thighMax = Math.max(...a.thigh);
  const thighMin = Math.min(...a.thigh);
  const kneeMax = Math.max(...a.knee);
  // A knee on the floor: that thigh hangs down and its shin lies back along the floor.
  const kneeling = [0, 1].some(i => a.thigh[i]! < 45 && a.shin[i]! > 60 && a.knee[i]! > 60);
  if (kneeling) return 'kneel';
  if ((a.torso > 35 && thighMax < 45) || a.torso > 60) return 'bend';
  if (thighMin > 50 && kneeMax > 70 && Math.min(...a.shin) < 45) {
    // Thighs out in front, shins down: a chair seat, or a squat when the knees fold right up.
    return Math.min(...a.knee) > 115 ? 'crouch' : 'seated';
  }
  if (thighMin > 50) return 'seated';
  if (thighMax > 50 && kneeMax > 60) return a.torso > 35 ? 'bend' : 'seated';
  if (a.torso > 35) return 'bend';
  return 'stand';
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
