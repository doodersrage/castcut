/**
 * The 3D pose editor's maths, without WebGL: forward kinematics on the base body's skeleton
 * (rig3d-skeleton.ts), the 18 OpenPose points seen through the editor's camera, two-bone IK with
 * joint limits (elbows and knees only bend the natural way), a look-at for the head, mirror,
 * "flip depth" for a limb, and lifting a flat 18-point pose into the rig.
 *
 * Space: glTF y-up metres. At rest a figure faces +z; its left is +x. The default camera stands
 * on +z looking back at it, so a figure facing the camera has its right on the picture's left —
 * as OpenPose draws it.
 */

import { PerspectiveCamera, Quaternion, Vector3, Matrix4 } from 'three';
import type { NormalizedBody } from '@/lib/pose/library';
import {
  RIG3D_VERSION,
  type PoseRig3d,
  type PoseRig3dCamera,
  type PoseRig3dFigure,
  type Rig3dBodyKind,
  type Rig3dQuat,
  type Rig3dVec3,
} from '@/lib/pose/rig3d';
import { RIG3D_SKELETONS, type Rig3dBoneRest } from '@/lib/pose/rig3d-skeleton';
import { classifyPosture as classifyFlatPosture } from '@/lib/pose/posture';
import { classifyPosturePoints, type Posture } from '@/lib/pose/rig3d-posture-points';

type Pt = { x: number; y: number };
export type Side = 'R' | 'L';
export type Limb = 'arm' | 'leg';

/** Joint / landmark world positions and bone world rotations for one posed figure. */
export type FigureWorld = {
  pos: Record<string, Vector3>;
  quat: Record<string, Quaternion>;
};

export const DEFAULT_CAMERA: PoseRig3dCamera = {
  position: [0, 1.0, 5.4],
  target: [0, 0.88, 0],
  fov: 30,
};

/** Bones of a limb chain, root first; the chain's root joint is the first bone's head. */
export function limbChain(side: Side, limb: Limb): [string, string, string] {
  return limb === 'arm'
    ? [`upperarm_${side}`, `forearm_${side}`, `hand_${side}`]
    : [`thigh_${side}`, `shin_${side}`, `foot_${side}`];
}

// How far a limb may twist on its own axis away from rest, either way: past this an elbow or a
// knee would point the wrong way (a knee bending backwards is a thigh turned half round).
const TWIST_LIMIT: Record<Limb, number> = {
  arm: (100 * Math.PI) / 180,
  leg: (55 * Math.PI) / 180,
};
const FLEX_DIRECTION: Record<Limb, Vector3> = {
  // At rest, a forearm bends forward and a shin backward.
  arm: new Vector3(0, 0, 1),
  leg: new Vector3(0, 0, -1),
};

// ── Skeleton data, precomputed per body ───────────────────────────────────────────────────

type SkeletonInfo = {
  order: Rig3dBoneRest[];
  byName: Map<string, Rig3dBoneRest>;
  children: Map<string, string[]>;
  restWorldQ: Map<string, Quaternion>;
  restWorldP: Map<string, Vector3>;
  /** Unit vector along each bone (to its first child), in the bone's own frame. */
  dirLocal: Map<string, Vector3>;
  /** Each limb root's hinge axis (forearm / shin bends about it), in the bone's own frame. */
  hingeLocal: Map<string, Vector3>;
  /** Face landmarks in the head bone's frame. */
  face: Record<'nose' | 'eyeR' | 'eyeL' | 'earR' | 'earL', Vector3>;
  /** The head's forward (+z at rest) and left (+x at rest) in its own frame. */
  headForward: Vector3;
  headLeft: Vector3;
  /** OpenPose hip points in the hips bone's frame (a little outside the hip joints). */
  hipPoint: Record<Side, Vector3>;
  /** OpenPose shoulder points in each clavicle's frame (the top of the shoulder). */
  shoulderPoint: Record<Side, Vector3>;
  length: Map<string, number>;
};

const INFO = new Map<Rig3dBodyKind, SkeletonInfo>();

function info(kind: Rig3dBodyKind): SkeletonInfo {
  const cached = INFO.get(kind);
  if (cached) return cached;
  const skeleton = RIG3D_SKELETONS[kind];
  const byName = new Map(skeleton.bones.map(bone => [bone.name, bone]));
  const children = new Map<string, string[]>();
  for (const bone of skeleton.bones) {
    if (bone.parent) children.set(bone.parent, [...(children.get(bone.parent) ?? []), bone.name]);
  }
  const restWorldQ = new Map<string, Quaternion>();
  const restWorldP = new Map<string, Vector3>();
  for (const bone of skeleton.bones) {
    const q = new Quaternion(...bone.q);
    const p = new Vector3(...bone.p);
    if (bone.parent) {
      const pq = restWorldQ.get(bone.parent)!;
      restWorldQ.set(bone.name, pq.clone().multiply(q));
      restWorldP.set(bone.name, p.applyQuaternion(pq).add(restWorldP.get(bone.parent)!));
    } else {
      restWorldQ.set(bone.name, q);
      restWorldP.set(bone.name, p);
    }
  }
  const dirLocal = new Map<string, Vector3>();
  const length = new Map<string, number>();
  for (const bone of skeleton.bones) {
    // The limb's next bone (a clavicle's upper arm; the chest's neck, not a clavicle).
    const kids = children.get(bone.name) ?? [];
    const next = kids.find(kid => kid === 'neck') ?? kids[0];
    if (next) {
      const p = new Vector3(...byName.get(next)!.p);
      length.set(bone.name, p.length());
      dirLocal.set(bone.name, p.normalize());
    }
  }
  const hingeLocal = new Map<string, Vector3>();
  for (const side of ['R', 'L'] as const) {
    for (const limb of ['arm', 'leg'] as const) {
      const [upper] = limbChain(side, limb);
      const inv = restWorldQ.get(upper)!.clone().invert();
      const dir = dirLocal.get(upper)!;
      const flex = FLEX_DIRECTION[limb].clone().applyQuaternion(inv);
      hingeLocal.set(upper, dir.clone().cross(flex).normalize());
    }
  }
  const headQInv = restWorldQ.get('head')!.clone().invert();
  const headP = restWorldP.get('head')!;
  const toHead = (point: Rig3dVec3) => new Vector3(...point).sub(headP).applyQuaternion(headQInv);
  const hipsQInv = restWorldQ.get('hips')!.clone().invert();
  const hipsP = restWorldP.get('hips')!;
  // Where a pose detector puts the shoulders and hips, measured against the one-person reference
  // poses (standing, facing the camera): the shoulders a little above the joint centre, the hips
  // a little outside and above the joints. With the joint centres the torso came out 15% short,
  // and lifting bent every limb toward the camera to make up for it; with the shoulders 5 cm up
  // and the hips 1 cm down it came out long, and standing figures leaned back 18° on average
  // (scripts/pose-3d/lift-check.mts). Now 2 cm and 1 cm up: about 8°.
  const hipPoint = (side: Side) => {
    const joint = restWorldP.get(`thigh_${side}`)!.clone();
    joint.x += side === 'L' ? 0.017 : -0.017;
    joint.y += 0.01;
    return joint.sub(hipsP).applyQuaternion(hipsQInv);
  };
  const shoulderPoint = (side: Side) => {
    const joint = restWorldP.get(`upperarm_${side}`)!.clone();
    joint.x *= 0.94;
    joint.y += 0.02;
    const clavicle = `clavicle_${side}`;
    return joint
      .sub(restWorldP.get(clavicle)!)
      .applyQuaternion(restWorldQ.get(clavicle)!.clone().invert());
  };
  const built: SkeletonInfo = {
    order: skeleton.bones,
    byName,
    children,
    restWorldQ,
    restWorldP,
    dirLocal,
    hingeLocal,
    face: {
      nose: toHead(skeleton.landmarks.nose),
      eyeR: toHead(skeleton.landmarks.eyeR),
      eyeL: toHead(skeleton.landmarks.eyeL),
      earR: toHead(skeleton.landmarks.earR),
      earL: toHead(skeleton.landmarks.earL),
    },
    headForward: new Vector3(0, 0, 1).applyQuaternion(headQInv),
    headLeft: new Vector3(1, 0, 0).applyQuaternion(headQInv),
    hipPoint: { R: hipPoint('R'), L: hipPoint('L') },
    shoulderPoint: { R: shoulderPoint('R'), L: shoulderPoint('L') },
    length,
  };
  INFO.set(kind, built);
  return built;
}

export function boneNames(kind: Rig3dBodyKind = 'female'): string[] {
  return info(kind).order.map(bone => bone.name);
}

// ── Figures ───────────────────────────────────────────────────────────────────────────────

export function restFigure(kind: Rig3dBodyKind, position?: Rig3dVec3): PoseRig3dFigure {
  const sk = info(kind);
  const bones: Record<string, Rig3dQuat> = {};
  for (const bone of sk.order) bones[bone.name] = [...bone.q];
  const hips = sk.byName.get('hips')!.p;
  return { body: kind, position: position ?? [hips[0], hips[1], hips[2]], bones };
}

export function cloneFigure(figure: PoseRig3dFigure): PoseRig3dFigure {
  const bones: Record<string, Rig3dQuat> = {};
  for (const [name, q] of Object.entries(figure.bones)) bones[name] = [q[0], q[1], q[2], q[3]];
  return { body: figure.body, position: [...figure.position], bones };
}

export function cloneRig(rig: PoseRig3d): PoseRig3d {
  return {
    version: RIG3D_VERSION,
    figures: rig.figures.map(cloneFigure),
    camera: {
      position: [...rig.camera.position],
      target: [...rig.camera.target],
      fov: rig.camera.fov,
      ...(rig.camera.choice ? { choice: { ...rig.camera.choice } } : {}),
    },
  };
}

function localQ(figure: PoseRig3dFigure, bone: Rig3dBoneRest): Quaternion {
  const q = figure.bones[bone.name];
  return q ? new Quaternion(q[0], q[1], q[2], q[3]) : new Quaternion(...bone.q);
}

/** Forward kinematics: every bone's world position (its head) and rotation. */
export function figureWorld(figure: PoseRig3dFigure): FigureWorld {
  const sk = info(figure.body);
  const pos: Record<string, Vector3> = {};
  const quat: Record<string, Quaternion> = {};
  for (const bone of sk.order) {
    const q = localQ(figure, bone);
    if (!bone.parent) {
      quat[bone.name] = q;
      pos[bone.name] = new Vector3(...figure.position);
    } else {
      const pq = quat[bone.parent]!;
      quat[bone.name] = pq.clone().multiply(q);
      pos[bone.name] = new Vector3(...bone.p).applyQuaternion(pq).add(pos[bone.parent]!);
    }
  }
  return { pos, quat };
}

function setWorldQ(figure: PoseRig3dFigure, world: FigureWorld, bone: string, q: Quaternion) {
  const rest = info(figure.body).byName.get(bone)!;
  const local = rest.parent ? world.quat[rest.parent]!.clone().invert().multiply(q) : q.clone();
  local.normalize();
  figure.bones[bone] = [local.x, local.y, local.z, local.w];
}

/** A bone's world rotation, then forward kinematics again. */
export function setBoneWorldRotation(
  figure: PoseRig3dFigure,
  bone: string,
  q: Quaternion
): FigureWorld {
  setWorldQ(figure, figureWorld(figure), bone, q);
  return figureWorld(figure);
}

/** World points of the face landmarks and the head's forward / left axes. */
export function faceWorld(figure: PoseRig3dFigure, world = figureWorld(figure)) {
  const sk = info(figure.body);
  const q = world.quat.head!;
  const p = world.pos.head!;
  const at = (v: Vector3) => v.clone().applyQuaternion(q).add(p);
  return {
    nose: at(sk.face.nose),
    eyeR: at(sk.face.eyeR),
    eyeL: at(sk.face.eyeL),
    earR: at(sk.face.earR),
    earL: at(sk.face.earL),
    forward: sk.headForward.clone().applyQuaternion(q),
    left: sk.headLeft.clone().applyQuaternion(q),
  };
}

/** The 18 OpenPose points in world space (null never: visibility is the camera's call). */
export function openPoseWorld(figure: PoseRig3dFigure, world = figureWorld(figure)): Vector3[] {
  const sk = info(figure.body);
  const face = faceWorld(figure, world);
  const hip = (side: Side) =>
    sk.hipPoint[side].clone().applyQuaternion(world.quat.hips!).add(world.pos.hips!);
  const shoulder = (side: Side) =>
    sk.shoulderPoint[side]
      .clone()
      .applyQuaternion(world.quat[`clavicle_${side}`]!)
      .add(world.pos[`clavicle_${side}`]!);
  const p = world.pos;
  const rightShoulder = shoulder('R');
  const leftShoulder = shoulder('L');
  return [
    face.nose,
    rightShoulder.clone().add(leftShoulder).multiplyScalar(0.5),
    rightShoulder,
    p.forearm_R!,
    p.hand_R!,
    leftShoulder,
    p.forearm_L!,
    p.hand_L!,
    hip('R'),
    p.shin_R!,
    p.foot_R!,
    hip('L'),
    p.shin_L!,
    p.foot_L!,
    face.eyeR,
    face.eyeL,
    face.earR,
    face.earL,
  ].map(v => v.clone());
}

// ── Camera ────────────────────────────────────────────────────────────────────────────────

export function makeCamera(camera: PoseRig3dCamera, aspect: number): PerspectiveCamera {
  const cam = new PerspectiveCamera(camera.fov, aspect, 0.05, 100);
  cam.position.set(...camera.position);
  cam.up.set(0, 1, 0);
  const target = new Vector3(...camera.target);
  // Looking straight down: lookAt with y-up is undefined, so tip the view by a hair.
  const dir = target.clone().sub(cam.position);
  if (Math.abs(dir.clone().normalize().y) > 0.9999) cam.position.z += 1e-4;
  cam.lookAt(target);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
  return cam;
}

/** A world point on the picture (0–1 across and down). */
export function projectPoint(cam: PerspectiveCamera, point: Vector3): Pt {
  const ndc = point.clone().project(cam);
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2 };
}

/** The camera ray through a picture point (unit direction from the camera). */
export function pictureRay(cam: PerspectiveCamera, point: Pt): Vector3 {
  const v = new Vector3(point.x * 2 - 1, 1 - point.y * 2, 0.5).unproject(cam);
  return v.sub(cam.position).normalize();
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * The figure as OpenPose would read it from this camera: the 18 points on the picture, with the
 * joints outside the picture and the face points a detector would not see left out (the nose and eyes of a head turned away, the
 * ear on the far side of a head in profile), as the reference poses have them.
 */
export function projectFigure(
  figure: PoseRig3dFigure,
  camera: PoseRig3dCamera,
  aspect: number
): NormalizedBody {
  const cam = makeCamera(camera, aspect);
  const world = figureWorld(figure);
  const points = openPoseWorld(figure, world);
  const face = faceWorld(figure, world);
  const toCamera = cam.position.clone().sub(world.pos.head!).normalize();
  const facing = face.forward.dot(toCamera);
  const leftSide = face.left.dot(toCamera);
  const visible = (index: number) => {
    if (index === 0) return facing > -0.05;
    if (index === 14) return facing > -0.05 && leftSide < 0.8;
    if (index === 15) return facing > -0.05 && leftSide > -0.8;
    if (index === 16) return leftSide < 0.6;
    if (index === 17) return leftSide > -0.6;
    return true;
  };
  return points.map((point, index) => {
    if (!visible(index)) return null;
    // Out of the picture (a closer shot crops the legs, a turned camera loses a hand): left out,
    // as a detector would — the pose map draws only what the still frames.
    if (point.clone().sub(cam.position).dot(cam.getWorldDirection(new Vector3())) <= 0) return null;
    const p = projectPoint(cam, point);
    if (p.x < -0.005 || p.x > 1.005 || p.y < -0.005 || p.y > 1.005) return null;
    return { x: round4(p.x), y: round4(p.y) };
  });
}

export function projectRig(rig: PoseRig3d, aspect: number): NormalizedBody[] {
  return rig.figures.map(figure => projectFigure(figure, rig.camera, aspect));
}

/**
 * Mean distance (in picture heights) between a rig's projection and a flat pose, over the points
 * both have; Infinity when the figures do not line up. The editor restores a saved rig only when
 * this is small — the pose may have been changed elsewhere since.
 */
export function rigProjectionError(
  rig: PoseRig3d,
  bodies: NormalizedBody[],
  aspect: number
): number {
  if (rig.figures.length !== bodies.length) return Infinity;
  const projected = projectRig(rig, aspect);
  let sum = 0;
  let count = 0;
  let missing = 0;
  projected.forEach((body, person) => {
    body.forEach((point, joint) => {
      const other = bodies[person]?.[joint];
      if (point && other) {
        sum += Math.hypot((point.x - other.x) * aspect, point.y - other.y);
        count += 1;
      } else if (joint < 14 && Boolean(point) !== Boolean(other)) {
        missing += 1;
      }
    });
  });
  return count && !missing ? sum / count : Infinity;
}

// ── Limbs: placing, twist limits, IK ──────────────────────────────────────────────────────

function twistAngle(figure: PoseRig3dFigure, bone: string): number {
  const rest = info(figure.body).byName.get(bone)!;
  const delta = new Quaternion(...rest.q).invert().multiply(localQ(figure, rest));
  const axis = info(figure.body).dirLocal.get(bone)!;
  const along = delta.x * axis.x + delta.y * axis.y + delta.z * axis.z;
  let angle = 2 * Math.atan2(along, delta.w);
  if (angle > Math.PI) angle -= 2 * Math.PI;
  if (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/** How far past its twist limit a limb's root bone is (0 inside the limit). */
export function limbTwistExcess(figure: PoseRig3dFigure, side: Side, limb: Limb): number {
  return Math.max(0, Math.abs(twistAngle(figure, limbChain(side, limb)[0])) - TWIST_LIMIT[limb]);
}

function frameQuat(a1: Vector3, a2: Vector3, b1: Vector3, b2: Vector3): Quaternion {
  // The rotation taking the orthonormal frame (a1, a2, a1×a2) onto (b1, b2, b1×b2).
  const a3 = a1.clone().cross(a2);
  const b3 = b1.clone().cross(b2);
  const A = new Matrix4().makeBasis(a1, a2, a3);
  const B = new Matrix4().makeBasis(b1, b2, b3);
  return new Quaternion().setFromRotationMatrix(B.multiply(A.transpose()));
}

/**
 * Put a limb's middle joint at `mid` and its end at `end` (both world points, at the bones'
 * own lengths from the root and from each other): the root bone is turned so the joint bends
 * the natural way (forward for an elbow, back for a knee), the middle bone aims at the end.
 * The end bone keeps its world rotation when `keepEnd` (a foot staying flat), else its local.
 */
export function placeLimb(
  figure: PoseRig3dFigure,
  side: Side,
  limb: Limb,
  mid: Vector3,
  end: Vector3,
  keepEnd = false
): void {
  const sk = info(figure.body);
  const [upper, lower, tip] = limbChain(side, limb);
  let world = figureWorld(figure);
  const endWorldQ = world.quat[tip]!.clone();
  const root = world.pos[upper]!;
  const d = mid.clone().sub(root).normalize();
  const e = end.clone().sub(mid).normalize();
  let n = d.clone().cross(e);
  if (n.length() < 1e-3) {
    // Straight: keep the hinge where it is, square to the new direction.
    n = sk.hingeLocal.get(upper)!.clone().applyQuaternion(world.quat[upper]!);
    n.sub(d.clone().multiplyScalar(n.dot(d)));
    if (n.length() < 1e-6) n = new Vector3(1, 0, 0).cross(d);
  }
  n.normalize();
  const dirL = sk.dirLocal.get(upper)!;
  const hingeL = sk.hingeLocal.get(upper)!.clone();
  hingeL.sub(dirL.clone().multiplyScalar(hingeL.dot(dirL))).normalize();
  setWorldQ(figure, world, upper, frameQuat(dirL, hingeL, d, n));
  world = figureWorld(figure);
  const current = sk.dirLocal.get(lower)!.clone().applyQuaternion(world.quat[lower]!);
  const turn = new Quaternion().setFromUnitVectors(current, e);
  setWorldQ(figure, world, lower, turn.multiply(world.quat[lower]!));
  if (keepEnd) {
    world = figureWorld(figure);
    setWorldQ(figure, world, tip, endWorldQ);
  }
}

/** The limb's joints in world space: root, middle, end. */
export function limbJoints(figure: PoseRig3dFigure, side: Side, limb: Limb, world?: FigureWorld) {
  const w = world ?? figureWorld(figure);
  const [upper, lower, tip] = limbChain(side, limb);
  return { root: w.pos[upper]!.clone(), mid: w.pos[lower]!.clone(), end: w.pos[tip]!.clone() };
}

function limbLengths(kind: Rig3dBodyKind, side: Side, limb: Limb): [number, number] {
  const sk = info(kind);
  const [upper, lower] = limbChain(side, limb);
  return [sk.length.get(upper)!, sk.length.get(lower)!];
}

/**
 * Two-bone IK: move a hand or foot toward `target`; the elbow or knee goes where it can bend the
 * natural way, as near as it can to where it was (or to `hint`). A foot stays flat (keeps its
 * world rotation); a hand turns with the forearm.
 */
export function solveLimbIK(
  figure: PoseRig3dFigure,
  side: Side,
  limb: Limb,
  target: Vector3,
  hint?: Vector3
): void {
  const [l1, l2] = limbLengths(figure.body, side, limb);
  const joints = limbJoints(figure, side, limb);
  const S = joints.root;
  let to = target.clone().sub(S);
  let distance = to.length();
  if (distance < 1e-6) {
    to = joints.end.clone().sub(S);
    distance = to.length();
  }
  const u = to.normalize();
  distance = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, distance));
  const W = S.clone().add(u.clone().multiplyScalar(distance));
  const a = (l1 * l1 - l2 * l2 + distance * distance) / (2 * distance);
  const r = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const C = S.clone().add(u.clone().multiplyScalar(a));
  const towards = (hint ?? joints.mid).clone().sub(C);
  towards.sub(u.clone().multiplyScalar(towards.dot(u)));
  let e1 =
    towards.length() > 1e-6
      ? towards.normalize()
      : new Vector3(0, 0, limb === 'arm' ? -1 : 1).cross(u).cross(u).normalize();
  if (!Number.isFinite(e1.x) || e1.length() < 0.5) e1 = new Vector3(1, 0, 0).cross(u).normalize();
  const e2 = u.clone().cross(e1).normalize();
  const keepEnd = limb === 'leg';
  const original = cloneFigure(figure);
  const tryAngle = (phi: number) => {
    const trial = cloneFigure(original);
    const mid = C.clone()
      .add(e1.clone().multiplyScalar(r * Math.cos(phi)))
      .add(e2.clone().multiplyScalar(r * Math.sin(phi)));
    placeLimb(trial, side, limb, mid, W, keepEnd);
    return { trial, excess: limbTwistExcess(trial, side, limb) };
  };
  // Nearest to the hint first, widening both ways until the joint is within its limits.
  let best: { trial: PoseRig3dFigure; excess: number } | null = null;
  const STEPS = 36;
  for (let step = 0; step <= STEPS; step += 1) {
    const angles = step === 0 ? [0] : [(step * Math.PI) / STEPS, (-step * Math.PI) / STEPS];
    for (const phi of angles) {
      const result = tryAngle(phi);
      if (result.excess === 0) {
        Object.assign(figure, result.trial);
        return;
      }
      if (!best || result.excess < best.excess) best = result;
    }
  }
  if (best) Object.assign(figure, best.trial);
}

// ── Head ──────────────────────────────────────────────────────────────────────────────────

const HEAD_LIMITS = {
  yaw: (80 * Math.PI) / 180,
  up: (45 * Math.PI) / 180,
  down: (60 * Math.PI) / 180,
};

/**
 * Turn the head (and a little of the neck) to look at a world point, within a neck's reach of
 * the chest's facing. Keeps no roll: a tilt is set by rotating the head itself.
 */
export function lookAt(figure: PoseRig3dFigure, target: Vector3): void {
  const sk = info(figure.body);
  let world = figureWorld(figure);
  const chestFromRest = world.quat
    .chest!.clone()
    .multiply(sk.restWorldQ.get('chest')!.clone().invert());
  const dir = target.clone().sub(world.pos.head!).normalize();
  const local = dir.applyQuaternion(chestFromRest.clone().invert());
  const yaw = Math.max(-HEAD_LIMITS.yaw, Math.min(HEAD_LIMITS.yaw, Math.atan2(local.x, local.z)));
  const pitch = Math.max(
    -HEAD_LIMITS.down,
    Math.min(HEAD_LIMITS.up, Math.asin(Math.max(-1, Math.min(1, local.y))))
  );
  const turn = (share: number) =>
    new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), yaw * share)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -pitch * share));
  setWorldQ(
    figure,
    world,
    'neck',
    chestFromRest.clone().multiply(turn(0.35)).multiply(sk.restWorldQ.get('neck')!)
  );
  world = figureWorld(figure);
  setWorldQ(
    figure,
    world,
    'head',
    chestFromRest.clone().multiply(turn(1)).multiply(sk.restWorldQ.get('head')!)
  );
}

/** Where the head looks: a point `reach` metres in front of the face. */
export function gazePoint(figure: PoseRig3dFigure, reach = 0.35): Vector3 {
  const world = figureWorld(figure);
  const face = faceWorld(figure, world);
  const between = face.eyeL.clone().add(face.eyeR).multiplyScalar(0.5);
  return between.add(face.forward.multiplyScalar(reach));
}

// ── Whole-figure edits ────────────────────────────────────────────────────────────────────

const MIRROR_NAME = (name: string) =>
  name.endsWith('_L')
    ? `${name.slice(0, -2)}_R`
    : name.endsWith('_R')
      ? `${name.slice(0, -2)}_L`
      : name;

/** Swap the figure's left and right (its limbs and its turn), reflected across x = `about`. */
export function mirrorFigure(figure: PoseRig3dFigure, about = 0): PoseRig3dFigure {
  const bones: Record<string, Rig3dQuat> = {};
  for (const [name, q] of Object.entries(figure.bones)) {
    bones[MIRROR_NAME(name)] = [q[0], -q[1], -q[2], q[3]];
  }
  const [x, y, z] = figure.position;
  return { body: figure.body, position: [2 * about - x, y, z], bones };
}

export function mirrorRig(rig: PoseRig3d): PoseRig3d {
  const xs = rig.figures.map(figure => figure.position[0]);
  const about = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
  return { ...cloneRig(rig), figures: rig.figures.map(figure => mirrorFigure(figure, about)) };
}

/** Move the whole figure so its hips are at `to`. */
export function moveFigure(figure: PoseRig3dFigure, to: Vector3): void {
  figure.position = [to.x, to.y, to.z];
}

/** Turn the whole figure about the vertical through its hips. */
export function turnFigure(figure: PoseRig3dFigure, radians: number): void {
  const q = new Quaternion(...figure.bones.hips!);
  const turned = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), radians).multiply(q);
  figure.bones.hips = [turned.x, turned.y, turned.z, turned.w];
}

function rayDepths(origin: Vector3, ray: Vector3, centre: Vector3, radius: number): number[] {
  // Distances t along the ray where |origin + ray·t − centre| = radius.
  const oc = origin.clone().sub(centre);
  const b = ray.dot(oc);
  const c = oc.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < 0) return [Math.max(0.01, -b)];
  const root = Math.sqrt(disc);
  return [-b - root, -b + root].filter(t => t > 0.01);
}

/**
 * Turn a limb toward or away from the camera without changing how it looks in the picture: the
 * elbow (knee) moves along its line of sight to the other place at the same distance from the
 * shoulder (hip), and the hand (foot) likewise from the new elbow. Returns false (and leaves the
 * figure alone) when no such pose bends the natural way.
 */
export function flipLimbDepth(
  figure: PoseRig3dFigure,
  camera: PoseRig3dCamera,
  aspect: number,
  side: Side,
  limb: Limb
): boolean {
  const cam = makeCamera(camera, aspect);
  const origin = cam.position.clone();
  const [l1, l2] = limbLengths(figure.body, side, limb);
  const { root, mid, end } = limbJoints(figure, side, limb);
  const depth = (p: Vector3) => p.distanceTo(origin);
  const midRay = mid.clone().sub(origin).normalize();
  const endRay = end.clone().sub(origin).normalize();
  const midOptions = rayDepths(origin, midRay, root, l1).map(t =>
    origin.clone().add(midRay.clone().multiplyScalar(t))
  );
  const otherMid = midOptions.reduce<Vector3 | null>(
    (best, p) => (!best || p.distanceTo(mid) > best.distanceTo(mid) ? p : best),
    null
  );
  const tries: Array<[Vector3, Vector3]> = [];
  const endsFrom = (m: Vector3) =>
    rayDepths(origin, endRay, m, l2).map(t => origin.clone().add(endRay.clone().multiplyScalar(t)));
  const wantEndDepth = (m: Vector3) => depth(m) - (depth(end) - depth(mid));
  if (otherMid && otherMid.distanceTo(mid) > 0.01) {
    const ends = endsFrom(otherMid).sort(
      (a, b) =>
        Math.abs(depth(a) - wantEndDepth(otherMid)) - Math.abs(depth(b) - wantEndDepth(otherMid))
    );
    for (const e of ends) tries.push([otherMid, e]);
  }
  // Only the lower bone flipped.
  const ends = endsFrom(mid).filter(e => e.distanceTo(end) > 0.01);
  for (const e of ends) tries.push([mid, e]);
  for (const [m, e] of tries) {
    const trial = cloneFigure(figure);
    placeLimb(trial, side, limb, m, e, limb === 'leg');
    if (limbTwistExcess(trial, side, limb) === 0) {
      Object.assign(figure, trial);
      return true;
    }
  }
  return false;
}

// ── Lifting a flat pose into the rig ──────────────────────────────────────────────────────

/** Damped least squares on a small parameter vector (numeric Jacobian). */
function leastSquares(
  residuals: (params: number[]) => number[],
  start: number[],
  iterations = 40
): number[] {
  let params = [...start];
  let current = residuals(params);
  let cost = current.reduce((s, r) => s + r * r, 0);
  let lambda = 1e-2;
  const h = 1e-4;
  for (let iter = 0; iter < iterations; iter += 1) {
    const J: number[][] = params.map((_, j) => {
      const nudged = [...params];
      nudged[j]! += h;
      const r = residuals(nudged);
      return r.map((value, i) => (value - current[i]!) / h);
    });
    const n = params.length;
    const A = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => J[a]!.reduce((s, v, i) => s + v * J[b]![i]!, 0))
    );
    const g = Array.from({ length: n }, (_, a) =>
      J[a]!.reduce((s, v, i) => s + v * current[i]!, 0)
    );
    let improved = false;
    for (let attempt = 0; attempt < 6 && !improved; attempt += 1) {
      const M = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)));
      const step = solveLinear(
        M,
        g.map(v => -v)
      );
      if (!step) break;
      const next = params.map((p, i) => p + step[i]!);
      const r = residuals(next);
      const c = r.reduce((s, v) => s + v * v, 0);
      if (c < cost) {
        params = next;
        current = r;
        improved = cost - c > 1e-12;
        cost = c;
        lambda = Math.max(1e-6, lambda / 3);
      } else {
        lambda *= 4;
      }
    }
    if (!improved) break;
  }
  return params;
}

function solveLinear(M: number[][], b: number[]): number[] | null {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(A[row]![col]!) > Math.abs(A[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(A[pivot]![col]!) < 1e-14) return null;
    [A[col], A[pivot]] = [A[pivot]!, A[col]!];
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const f = A[row]![col]! / A[col]![col]!;
      for (let k = col; k <= n; k += 1) A[row]![k]! -= f * A[col]![k]!;
    }
  }
  return A.map((row, i) => row[n]! / row[i]!);
}

function euler(yaw: number, pitch: number, roll: number): Quaternion {
  return new Quaternion()
    .setFromAxisAngle(new Vector3(0, 1, 0), yaw)
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), pitch))
    .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), roll));
}

const midpoint = (a: Pt | null | undefined, b: Pt | null | undefined): Pt | null =>
  a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : (a ?? b ?? null);

// Tuned on the one-person reference poses (scripts/pose-3d/lift-report.mts): the bone whose fit
// distance is at this quantile sets how far away the figure stands, and this much prior holds the
// torso upright and unbent where the picture cannot tell.
const LIFT_DEPTH_QUANTILE = 0.3;
const LIFT_W = 0.02;
// How firmly the head fit shows or hides the nose and ears as the picture does. At 0.2, 136 face
// points over the 273 references came out shown / hidden the other way — 26 heads turned away
// from the camera where the picture shows a face; at 1, 17 (and no head turned away but one).
const SEEN_W = 1;

export type LiftOptions = {
  camera?: PoseRig3dCamera;
  body?: Rig3dBodyKind;
  /**
   * The 3D postures the lift should prefer where the picture reads either way (null: none).
   * Left out, they come from the flat pose's own posture (posture.ts).
   */
  postures?: Posture[] | null;
};

const ALL_LIMBS: Array<[Side, Limb]> = [
  ['R', 'arm'],
  ['L', 'arm'],
  ['R', 'leg'],
  ['L', 'leg'],
];
const LIMB_POINTS: Record<`${Side}${Limb}`, [number, number]> = {
  Rarm: [3, 4],
  Larm: [6, 7],
  Rleg: [9, 10],
  Lleg: [12, 13],
};

type LimbReading = { m: Vector3; e: Vector3; score: number; excess: number };

/**
 * The ways one limb's middle and end joint can sit on their lines of sight at the bones' lengths
 * (each bone toward or away from the camera): the readings that bend the natural way first, then
 * nearer the camera first. Empty when the picture has neither point.
 */
function limbReadings(
  figure: PoseRig3dFigure,
  body: NormalizedBody,
  cam: PerspectiveCamera,
  side: Side,
  limb: Limb
): LimbReading[] {
  const origin = cam.position.clone();
  const [midIndex, endIndex] = LIMB_POINTS[`${side}${limb}`];
  const mid2d = body[midIndex] ?? null;
  const end2d = body[endIndex] ?? null;
  if (!mid2d && !end2d) return [];
  const [l1, l2] = limbLengths(figure.body, side, limb);
  const { root, mid, end } = limbJoints(figure, side, limb);
  const onRay = (p: Pt, centre: Vector3, length: number, fallback: Vector3) => {
    const r = pictureRay(cam, p);
    const ts = rayDepths(origin, r, centre, length);
    const points = ts.map(t => origin.clone().add(r.clone().multiplyScalar(t)));
    // Out of reach: the nearest point on the line of sight, held at the bone's length.
    return points.map(q => {
      const v = q.clone().sub(centre);
      return v.length() > 1e-6 ? centre.clone().add(v.setLength(length)) : fallback.clone();
    });
  };
  const mids = mid2d ? onRay(mid2d, root, l1, mid) : [mid];
  const options: LimbReading[] = [];
  for (const m of mids) {
    const ends = end2d ? onRay(end2d, m, l2, end) : [m.clone().add(end.clone().sub(mid))];
    for (const e of ends) {
      const trial = cloneFigure(figure);
      placeLimb(trial, side, limb, m, e, limb === 'leg');
      // Toward the camera: the nearer pair of joints reads first.
      const score = m.distanceTo(origin) + 0.5 * e.distanceTo(origin);
      options.push({ m, e, score, excess: limbTwistExcess(trial, side, limb) });
    }
  }
  return options.sort((a, b) => a.excess - b.excess || a.score - b.score);
}

/**
 * Each limb's middle and end joint on its line of sight, at the bone's length from the joint
 * before (the reading that bends the natural way, nearer the camera first).
 */
function placeLimbsOnRays(
  figure: PoseRig3dFigure,
  body: NormalizedBody,
  cam: PerspectiveCamera,
  limbs: Array<[Side, Limb]>
): void {
  for (const [side, limb] of limbs) {
    const pick = limbReadings(figure, body, cam, side, limb)[0];
    if (pick) placeLimb(figure, side, limb, pick.m, pick.e, limb === 'leg');
  }
}

/** The 3D postures a flat pose's posture (posture.ts) may lift into; null: no preference. */
function liftPostures(body: NormalizedBody, aspect: number): Posture[] | null {
  switch (classifyFlatPosture(body, aspect).posture) {
    case 'standing':
      // (Upright in the picture may still lean toward the camera: a golf putt seen head on.)
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
    case 'lying-back':
    case 'lying-side':
    case 'lying-front':
      return ['lying'];
    default:
      return null;
  }
}

/**
 * Each leg's bones can point toward or away from the camera and look the same in the picture.
 * Of those readings (both legs together, the natural bends only), take the first whose 3D
 * posture is one `want` allows (a kneel's shin back along the floor, a stand's legs under
 * her), else leave the legs as they are. The picture's points do not move.
 */
function chooseLegReadings(
  figure: PoseRig3dFigure,
  body: NormalizedBody,
  cam: PerspectiveCamera,
  want: Posture[]
): void {
  if (want.includes(classifyPosturePoints(openPoseWorld(figure)))) return;
  const right = limbReadings(figure, body, cam, 'R', 'leg');
  const left = limbReadings(figure, body, cam, 'L', 'leg');
  if (!right.length && !left.length) return;
  const natural = (options: LimbReading[]) =>
    options.length ? options.filter(o => o.excess <= options[0]!.excess + 1e-6) : [null];
  const combos: Array<{ r: LimbReading | null; l: LimbReading | null; score: number }> = [];
  for (const r of natural(right)) {
    for (const l of natural(left)) combos.push({ r, l, score: (r?.score ?? 0) + (l?.score ?? 0) });
  }
  combos.sort((a, b) => a.score - b.score);
  for (const { r, l } of combos) {
    const trial = cloneFigure(figure);
    if (r) placeLimb(trial, 'R', 'leg', r.m, r.e, true);
    if (l) placeLimb(trial, 'L', 'leg', l.m, l.e, true);
    if (want.includes(classifyPosturePoints(openPoseWorld(trial)))) {
      Object.assign(figure, trial);
      return;
    }
  }
}

/**
 * Put a lifted figure's arms (or legs) back on the picture's points after its torso was changed
 * (straightened in depth, say): each joint on its line of sight again, through `camera`.
 */
export function refitLimbs(
  figure: PoseRig3dFigure,
  body: NormalizedBody,
  aspect: number,
  camera: PoseRig3dCamera = DEFAULT_CAMERA,
  limbs: Limb[] = ['arm']
): void {
  placeLimbsOnRays(
    figure,
    body,
    makeCamera(camera, aspect),
    ALL_LIMBS.filter(([, limb]) => limbs.includes(limb))
  );
}

/** liftBody at one distance (or its own pick), with the distances worth trying. */
function liftAtDepth(
  body: NormalizedBody,
  aspect: number,
  options: LiftOptions & { depth?: number }
): { figure: PoseRig3dFigure; depths: number[]; postureDepths: number[] } {
  const kind = options.body ?? 'female';
  const camera = options.camera ?? DEFAULT_CAMERA;
  const cam = makeCamera(camera, aspect);
  const origin = cam.position.clone();
  const sk = info(kind);
  const figure = restFigure(kind);
  const P = (i: number) => body[i] ?? null;
  const ray = (p: Pt) => pictureRay(cam, p);

  const rs = P(2);
  const ls = P(5);
  const rh = P(8);
  const lh = P(11);
  const neck2d = P(1) ?? midpoint(rs, ls);
  const hip2d = midpoint(rh, lh);
  if (!neck2d || !hip2d) {
    // Too little to go on: a standing figure where the points are.
    const at = neck2d ?? hip2d ?? { x: 0.5, y: 0.5 };
    const t = origin.distanceTo(new Vector3(...camera.target));
    figure.position = origin.clone().add(ray(at).multiplyScalar(t)).toArray() as Rig3dVec3;
    return { figure, depths: [], postureDepths: [] };
  }

  // ── Distance: the nearest a bone can be and still reach its length in the picture ─────
  const rest = openPoseWorld(figure);
  const restLen = (a: number, b: number) => rest[a]!.distanceTo(rest[b]!);
  const angleBetween = (a: Pt, b: Pt) => ray(a).angleTo(ray(b));
  const SEGMENTS: Array<[number, number]> = [
    [2, 3],
    [3, 4],
    [5, 6],
    [6, 7],
    [8, 9],
    [9, 10],
    [11, 12],
    [12, 13],
    [2, 5],
    [8, 11],
  ];
  const fits: number[] = [];
  for (const [a, b] of SEGMENTS) {
    const pa = P(a);
    const pb = P(b);
    if (!pa || !pb) continue;
    const angle = angleBetween(pa, pb);
    if (angle > 1e-4) fits.push(restLen(a, b) / (2 * Math.sin(angle / 2)));
  }
  const torsoLen = rest[1]!.distanceTo(rest[8]!.clone().add(rest[11]!).multiplyScalar(0.5));
  const torsoAngle = angleBetween(neck2d, hip2d);
  const torsoFit = torsoAngle > 1e-4 ? torsoLen / (2 * Math.sin(torsoAngle / 2)) : Infinity;
  fits.sort((a, b) => a - b);
  // The torso sets the distance (it is rarely tipped toward the camera), unless the limbs say it
  // is: a figure bent over shows a short torso and full-length limbs. Taking the nearest any bone
  // allows (every bone reachable) swung every other limb along the line of sight instead.
  const limbs = fits.length ? fits[Math.floor(fits.length * LIFT_DEPTH_QUANTILE)]! : Infinity;
  const natural = Number.isFinite(Math.min(torsoFit, limbs))
    ? Math.min(torsoFit, limbs)
    : origin.distanceTo(new Vector3(...camera.target));
  const depth = options.depth ?? natural;
  // Other distances worth trying: the nearest every bone can reach (exact, but limbs swing along
  // the line of sight), and between.
  const depths = [
    natural,
    ...(fits.length ? [fits[0]!, fits[Math.floor(fits.length * 0.15)]!] : []),
  ];
  // For a posture these miss: a little farther (a stand's legs nearer full length in the
  // picture, under her rather than swung along the line of sight; the torso tipped instead),
  // or nearer.
  const postureDepths = [1.05, 1.1, 1.15, 1.2, 1.3, 0.9, 0.8].map(f => natural * f);

  const hipTarget = origin.clone().add(ray(hip2d).multiplyScalar(depth));

  // ── Which way the torso faces ─────────────────────────────────────────────────────────
  const camDir = origin.clone().sub(new Vector3(...camera.target));
  const cameraYaw = Math.atan2(camDir.x, camDir.z);
  const unit = Math.hypot((neck2d.x - hip2d.x) * aspect, neck2d.y - hip2d.y) || 0.2;
  const across = rs && ls ? (ls.x - rs.x) * aspect : 0;
  const nose = P(0);
  const shoulderMid = midpoint(rs, ls) ?? neck2d;
  const facingCamera = across > unit * 0.12 ? true : across < -unit * 0.12 ? false : Boolean(nose);
  const expectedAcross = restLen(2, 5) / depth / (2 * Math.tan(((camera.fov / 2) * Math.PI) / 180));
  const turnMagnitude = Math.acos(Math.min(1, Math.abs(across) / Math.max(1e-6, expectedAcross)));
  // A face toward one side of the shoulders, or an ear missing, says which way she turns.
  let turnSign = 0;
  if (nose && Math.abs(nose.x - shoulderMid.x) * aspect > unit * 0.03) {
    turnSign = nose.x > shoulderMid.x ? 1 : -1;
  } else if (P(16) && !P(17)) {
    turnSign = facingCamera ? -1 : 1;
  } else if (P(17) && !P(16)) {
    turnSign = facingCamera ? 1 : -1;
  }
  if (!facingCamera) turnSign = -turnSign;
  const sign = turnSign || 1;
  const baseYaw = facingCamera
    ? cameraYaw + sign * turnMagnitude
    : cameraYaw + Math.PI - sign * turnMagnitude;

  // ── Torso: the hips' turn, lean and the spine's bend, fitted to shoulders, neck and hips ──
  const restHips = new Quaternion(...sk.byName.get('hips')!.q);
  const restSpine = new Quaternion(...sk.byName.get('spine')!.q);
  const restChest = new Quaternion(...sk.byName.get('chest')!.q);
  const target2d = (index: number) => P(index);
  const applyTorso = (params: number[]) => {
    const [yaw, pitch, roll, bendPitch, bendRoll, bendYaw] = params as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const hips = euler(yaw, pitch, roll).multiply(restHips);
    figure.bones.hips = hips.toArray() as Rig3dQuat;
    figure.bones.spine = restSpine
      .clone()
      .multiply(euler(bendYaw / 2, bendPitch / 2, bendRoll / 2))
      .toArray() as Rig3dQuat;
    figure.bones.chest = restChest
      .clone()
      .multiply(euler(bendYaw / 2, bendPitch / 2, bendRoll / 2))
      .toArray() as Rig3dQuat;
    // Place the hips so the OpenPose hip midpoint lands on its target.
    figure.position = [0, 0, 0];
    const at = openPoseWorld(figure);
    const hipMid = at[8]!.clone().add(at[11]!).multiplyScalar(0.5);
    figure.position = hipTarget.clone().sub(hipMid).toArray() as Rig3dVec3;
  };
  const residual2d = (world: Vector3, index: number, weight: number, out: number[]) => {
    const want = target2d(index);
    if (!want) return;
    const p = projectPoint(cam, world);
    out.push((p.x - want.x) * aspect * weight, (p.y - want.y) * weight);
  };
  const torsoResiduals = (params: number[]) => {
    applyTorso(params);
    const at = openPoseWorld(figure);
    const out: number[] = [];
    residual2d(at[8]!, 8, 1, out);
    residual2d(at[11]!, 11, 1, out);
    residual2d(at[2]!, 2, 0.6, out);
    residual2d(at[5]!, 5, 0.6, out);
    if (P(1)) residual2d(at[1]!, 1, 1, out);
    // Prefer a straight spine and a level pelvis when the picture cannot tell.
    out.push(
      params[1]! * LIFT_W,
      params[2]! * LIFT_W,
      params[3]! * LIFT_W,
      params[4]! * LIFT_W,
      params[5]! * LIFT_W
    );
    return out;
  };
  const torsoStart = [baseYaw, 0, 0, 0, 0, 0];
  // Leaning forward or back: try both and keep whichever fits (a bow toward the camera reads
  // the same as a lean back, so a tie goes to the forward bend).
  const candidates = [torsoStart, [baseYaw, 0, 0, 0.5, 0, 0], [baseYaw, 0.4, 0, 0, 0, 0]].map(
    start => {
      const params = leastSquares(torsoResiduals, start, 50);
      const cost = torsoResiduals(params).reduce((s, v) => s + v * v, 0);
      return { params, cost };
    }
  );
  candidates.sort((a, b) => a.cost - b.cost);
  applyTorso(candidates[0]!.params);

  // ── Clavicles: shoulders where the picture has them ──────────────────────────────────
  for (const side of ['R', 'L'] as const) {
    const want = P(side === 'R' ? 2 : 5);
    if (!want) continue;
    const world = figureWorld(figure);
    const K = world.pos[`clavicle_${side}`]!;
    // The detector's shoulder (on top of the shoulder, carried by the clavicle) goes on its ray.
    const current = sk.shoulderPoint[side]
      .clone()
      .applyQuaternion(world.quat[`clavicle_${side}`]!)
      .add(K);
    const length = sk.shoulderPoint[side].length();
    const r = ray(want);
    const options = rayDepths(origin, r, K, length).map(t =>
      origin.clone().add(r.clone().multiplyScalar(t))
    );
    const point = options.sort((a, b) => a.distanceTo(current) - b.distanceTo(current))[0]!;
    const from = current.clone().sub(K).normalize();
    let to = point.clone().sub(K).normalize();
    // A shrug, not a dislocation: at most 35° from where the clavicle rests.
    const limit = (35 * Math.PI) / 180;
    const angle = from.angleTo(to);
    if (angle > limit)
      to = from
        .clone()
        .lerp(to, limit / angle)
        .normalize();
    const turn = new Quaternion().setFromUnitVectors(from, to);
    setWorldQ(figure, world, `clavicle_${side}`, turn.multiply(world.quat[`clavicle_${side}`]!));
  }

  // ── Limbs: each joint on its line of sight at the bone's length ──────────────────────
  placeLimbsOnRays(figure, body, cam, ALL_LIMBS);
  const want = options.postures === undefined ? liftPostures(body, aspect) : options.postures;
  if (want) chooseLegReadings(figure, body, cam, want);
  // Feet flat under a standing figure: a foot keeps its rest turn relative to the hips' yaw.
  for (const side of ['R', 'L'] as const) {
    const world = figureWorld(figure);
    const hipsYaw = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.atan2(
        new Vector3(0, 0, 1).applyQuaternion(world.quat.hips!).x,
        new Vector3(0, 0, 1).applyQuaternion(world.quat.hips!).z
      )
    );
    const shinDir = sk.dirLocal
      .get(`shin_${side}`)!
      .clone()
      .applyQuaternion(world.quat[`shin_${side}`]!);
    if (shinDir.y < -0.8) {
      setWorldQ(
        figure,
        world,
        `foot_${side}`,
        hipsYaw.multiply(sk.restWorldQ.get(`foot_${side}`)!)
      );
    }
  }

  // ── Head: turned and tipped to the face points ────────────────────────────────────────
  const facePoints: Array<[number, 'nose' | 'eyeR' | 'eyeL' | 'earR' | 'earL', number]> = [
    [0, 'nose', 1],
    [14, 'eyeR', 0.8],
    [15, 'eyeL', 0.8],
    [16, 'earR', 0.6],
    [17, 'earL', 0.6],
  ];
  const restNeck = figure.bones.neck!;
  const restHead = figure.bones.head!;
  const applyHead = (params: number[]) => {
    const [yaw, pitch, roll] = params as [number, number, number];
    figure.bones.neck = new Quaternion(...restNeck)
      .multiply(euler(yaw * 0.35, pitch * 0.35, roll * 0.35))
      .toArray() as Rig3dQuat;
    figure.bones.head = new Quaternion(...restHead)
      .multiply(euler(yaw * 0.65, pitch * 0.65, roll * 0.65))
      .toArray() as Rig3dQuat;
  };
  const anyFace = facePoints.some(([index]) => P(index));
  if (anyFace) {
    const headResiduals = (params: number[]) => {
      applyHead(params);
      const world = figureWorld(figure);
      const face = faceWorld(figure, world);
      const out: number[] = [];
      for (const [index, key, weight] of facePoints) residual2d(face[key], index, weight, out);
      // The face turned toward the camera exactly when the picture shows a nose.
      const toCamera = origin.clone().sub(world.pos.head!).normalize();
      const facing = face.forward.dot(toCamera);
      // (Firmly: a face turned away where the picture shows one reads as the wrong way round.)
      out.push(nose ? Math.min(0, facing - 0.1) * SEEN_W : Math.max(0, facing + 0.1) * SEEN_W);
      // And each ear shown or hidden as the picture has it (projectFigure's thresholds).
      const side = face.left.dot(toCamera);
      out.push(P(16) ? Math.max(0, side - 0.5) * SEEN_W : Math.min(0, side - 0.7) * SEEN_W);
      out.push(P(17) ? Math.min(0, side + 0.5) * SEEN_W : Math.max(0, side + 0.7) * SEEN_W);
      // A neck turns so far: past ~80° either way (and a nod or tilt past its range) costs.
      const beyond = (value: number, limit: number) => Math.max(0, Math.abs(value) - limit);
      out.push(
        params[0]! * 0.004 + beyond(params[0]!, 1.4) * 0.5,
        params[1]! * 0.004 + beyond(params[1]!, 0.9) * 0.5,
        params[2]! * 0.008 + beyond(params[2]!, 0.6) * 0.5
      );
      return out;
    };
    const starts = [
      [0, 0, 0],
      [0.8, 0, 0],
      [-0.8, 0, 0],
      [1.4, 0, 0],
      [-1.4, 0, 0],
    ];
    const fitted = starts
      .map(start => {
        const params = leastSquares(headResiduals, start, 40);
        return { params, cost: headResiduals(params).reduce((s, v) => s + v * v, 0) };
      })
      .sort((a, b) => a.cost - b.cost);
    applyHead(fitted[0]!.params);
  }
  return { figure, depths, postureDepths };
}

/** How much a figure's limbs point along the camera's line of sight (0: all flat to it). */
function depthiness(figure: PoseRig3dFigure, origin: Vector3): number {
  const world = figureWorld(figure);
  const pairs: Array<[string, string]> = [];
  for (const side of ['R', 'L'] as const) {
    for (const limb of ['arm', 'leg'] as const) {
      const [a, b, c] = limbChain(side, limb);
      pairs.push([a, b], [b, c]);
    }
  }
  let sum = 0;
  for (const [a, b] of pairs) {
    const pa = world.pos[a]!;
    const pb = world.pos[b]!;
    sum +=
      Math.abs(pa.distanceTo(origin) - pb.distanceTo(origin)) / Math.max(1e-6, pa.distanceTo(pb));
  }
  return sum / pairs.length;
}

/** What a natural reading may cost in fit: a limb swung toward the camera must buy this much. */
const DEPTHINESS_WEIGHT = 0.02;
/**
 * What a 3D posture other than the picture's (posture.ts) costs, in fit: 0.2% of the picture.
 * Over the references (scripts/pose-3d/lift-check.mts) 0.2% put 100 of 106 in the posture they
 * are filed under for 0.02% more Director error; 1% put 101 for 0.06% more, a few poses 2% off.
 */
const POSTURE_MISS = 0.002;

/**
 * Fit the rig to a flat 18-point pose, seen through `camera`: the figure's size and distance
 * from the bones it has, the torso's turn and lean from the shoulders and hips (which way it
 * faces from the nose and ears, as describe.ts reads them), each limb's depth with the natural
 * reading (toward the camera when foreshortened, never a joint bent backwards), and the head
 * from the face points. A few distances are tried; the one that reproduces the points best
 * without swinging limbs along the line of sight wins. Projecting the result through the same
 * camera gives the points back, within what the body's proportions allow.
 */
export function liftBody(
  body: NormalizedBody,
  aspect: number,
  options: LiftOptions = {}
): PoseRig3dFigure {
  // The picture's own posture (posture.ts) picks between the readings that fit it alike.
  const postures = options.postures === undefined ? liftPostures(body, aspect) : options.postures;
  const opts = { ...options, postures };
  const first = liftAtDepth(body, aspect, opts);
  if (first.depths.length < 2) return first.figure;
  const camera = options.camera ?? DEFAULT_CAMERA;
  const origin = new Vector3(...camera.position);
  const misses = (figure: PoseRig3dFigure) =>
    Boolean(postures && !postures.includes(classifyPosturePoints(openPoseWorld(figure))));
  const score = (figure: PoseRig3dFigure) =>
    meanPointError(body, projectFigure(figure, camera, aspect), aspect) +
    DEPTHINESS_WEIGHT * depthiness(figure, origin) +
    (misses(figure) ? POSTURE_MISS : 0);
  let best = { figure: first.figure, score: score(first.figure) };
  const tried = new Set([first.depths[0]!.toFixed(3)]);
  const tryDepth = (depth: number) => {
    if (tried.has(depth.toFixed(3))) return;
    tried.add(depth.toFixed(3));
    const { figure } = liftAtDepth(body, aspect, { ...opts, depth });
    const s = score(figure);
    if (s < best.score) best = { figure, score: s };
  };
  for (const depth of first.depths.slice(1)) tryDepth(depth);
  // Still the wrong posture: a little farther or nearer may let the legs read it.
  if (misses(best.figure)) for (const depth of first.postureDepths) tryDepth(depth);
  return best.figure;
}

function meanPointError(a: NormalizedBody, b: NormalizedBody, aspect: number): number {
  let sum = 0;
  let count = 0;
  for (let i = 0; i < 14; i += 1) {
    const p = a[i];
    const q = b[i];
    if (!p || !q) continue;
    sum += Math.hypot((p.x - q.x) * aspect, p.y - q.y);
    count += 1;
  }
  return count ? sum / count : 0;
}

/** A rig for flat bodies (lead first), all seen through one camera. */
export function liftBodies(
  bodies: NormalizedBody[],
  aspect: number,
  kinds: Rig3dBodyKind[] = [],
  camera: PoseRig3dCamera = DEFAULT_CAMERA
): PoseRig3d {
  const figures = bodies.map((body, index) =>
    liftBody(body, aspect, { camera, body: kinds[index] ?? (index === 0 ? 'female' : 'male') })
  );
  return { version: RIG3D_VERSION, camera: aimAtFigures(camera, figures), figures };
}

/**
 * The same view, with its target moved along the line of sight to the figures' distance: the
 * picture does not change, but orbiting turns about the figures instead of a point behind them.
 */
export function aimAtFigures(camera: PoseRig3dCamera, figures: PoseRig3dFigure[]): PoseRig3dCamera {
  const position = new Vector3(...camera.position);
  const direction = new Vector3(...camera.target).sub(position).normalize();
  if (!figures.length)
    return { ...camera, position: [...camera.position], target: [...camera.target] };
  const centre = figures
    .map(figure => {
      const world = figureWorld(figure);
      return world.pos.hips!.clone().lerp(world.pos.neck!, 0.35);
    })
    .reduce((sum, point) => sum.add(point), new Vector3())
    .multiplyScalar(1 / figures.length);
  const distance = Math.max(0.5, centre.sub(position).dot(direction));
  return {
    position: [...camera.position],
    target: position.add(direction.multiplyScalar(distance)).toArray() as Rig3dVec3,
    fov: camera.fov,
  };
}
