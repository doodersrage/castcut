/**
 * A 3D posture read from the 18 OpenPose points in world space (y up): standing, seated,
 * kneeling, crouched, bent over or lying. Kept apart from rig3d-posture.ts (which reads a posed
 * figure) so the lift (rig3d-pose.ts) can use it while choosing between depth readings.
 */

import { Vector3 } from 'three';
import type { VisionPostureClass } from '@/lib/pose/types';

export type Posture = 'stand' | 'seated' | 'kneel' | 'crouch' | 'bend' | 'lying';

const UP = new Vector3(0, 1, 0);
const DOWN = new Vector3(0, -1, 0);
const deg = (r: number) => (r * 180) / Math.PI;

export type PostureAngles = {
  /** The spine (between the hips → neck) from straight up, degrees. */
  torso: number;
  /**
   * How far the spine leans back, away from where the thighs point (degrees from upright along
   * them; negative: leaning forward over them).
   */
  backLean: number;
  /** Each thigh from straight down, degrees. */
  thigh: [number, number];
  /** Each shin from straight down, degrees. */
  shin: [number, number];
  /** How far each knee bends (0 straight), degrees. */
  knee: [number, number];
  /** Between the hips, above the lowest ankle / knee / wrist, over the leg's length. */
  hipHeight: number;
};

export function postureAnglesOfPoints(p: Vector3[]): PostureAngles {
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
  // The spine's lean along the floor against the thighs' (+: back, away from the knees).
  const thighs = p[9]!.clone().add(p[12]!).sub(p[8]!).sub(p[11]!).setY(0);
  const spineFlat = spine.clone().setY(0);
  const back =
    thighs.lengthSq() > 1e-8 && spine.lengthSq() > 1e-8
      ? -spineFlat.dot(thighs.normalize()) / spine.length()
      : 0;
  return {
    torso: deg(spine.angleTo(UP)),
    backLean: deg(Math.asin(Math.max(-1, Math.min(1, back)))),
    thigh: [r.thigh, l.thigh],
    shin: [r.shin, l.shin],
    knee: [r.knee, l.knee],
    hipHeight: (hipMid.y - floor) / legLength,
  };
}

export function classifyPostureAngles(a: PostureAngles): Posture {
  // Lying: the body along the floor (a bend over keeps the hips up on straight legs).
  if (a.torso > 60 && a.hipHeight < 0.55) return 'lying';
  // Reclined: tipped well back from the thighs, propped on the elbows with the hips down on the
  // floor (a floor sit leaning back on her hands keeps the hips a little above her feet).
  if (a.torso > 45 && a.backLean > 15 && a.hipHeight < 0.1) return 'lying';
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

export function classifyPosturePoints(p: Vector3[]): Posture {
  return classifyPostureAngles(postureAnglesOfPoints(p));
}

/**
 * The 3D postures a pose filed under `pose` (a Day pose or layout id, a reference's `pose`) may
 * lift into; undefined when the id says nothing clear about the posture.
 */
export function posturesForPose(pose: string | null | undefined): Posture[] | undefined {
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
      return undefined;
  }
}

/**
 * The 3D postures a Day slot's or Story beat's pose is known to be in: the vision model's read of
 * the player's own photo when the pose came from one, else the picked layout or posture.
 */
export function pickedPostures(picked: {
  poseLayout?: string | null;
  posePhoto?: { posture?: { posture: VisionPostureClass } } | null;
}): Posture[] | undefined {
  if (picked.posePhoto) return posturesForVision(picked.posePhoto.posture?.posture);
  return posturesForPose(picked.poseLayout);
}

/**
 * The 3D postures the vision model's read of a photo (pose/vision-posture.ts) may lift into;
 * undefined when it says nothing to go on.
 */
export function posturesForVision(
  posture: VisionPostureClass | null | undefined
): Posture[] | undefined {
  switch (posture) {
    case 'standing':
    case 'walking':
      return ['stand', 'bend'];
    case 'sitting':
      return ['seated', 'crouch'];
    case 'kneeling':
      return ['kneel'];
    case 'crouching':
      return ['crouch', 'seated', 'kneel'];
    case 'bending':
      return ['bend', 'crouch'];
    case 'all-fours':
      return ['kneel', 'lying', 'bend'];
    case 'reclining':
      return ['lying', 'seated'];
    case 'lying-back':
    case 'lying-front':
    case 'lying-side':
      return ['lying'];
    default:
      return undefined;
  }
}
