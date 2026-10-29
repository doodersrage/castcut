/**
 * Director: moves from real motion capture (CMU Graphics Lab Motion Capture Database, free for
 * all uses; credit in docs/pose-reference-credits.md). The hand-keyed moves read as robotic
 * (user report 2026-10-29): an arm swung on its own while the body stood still, every move eased
 * evenly. A captured clip carries the weight shift, the shoulders, the wrist and the timing.
 *
 * `scripts/director-mocap/harvest.py` reads a window of a CMU clip and keeps, per frame, the
 * hips' place and the world turn of the capture bone each rig bone maps to, with the capture's
 * rest pose. Here each rig bone takes that turn, measured from the capture's rest:
 * world = turn · align · restWorld, `align` carrying the rig bone's rest direction (and the body's
 * forward or up, for its roll) onto the capture's. Rotations, not joint positions — fitted to the
 * capture's joints, the narrower rig hips sank the feet through the floor and twisted the pelvis.
 * The legs then reach the capture's ankles by IK (its stance and planted feet), the hips travel
 * scaled by standing hips height, and the neck and head keep only the capture head's turn.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';
import data from '@/lib/data/director-mocap-moves.json';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { figureWorld, restFigure, setBoneWorldRotation, solveLimbIK } from '@/lib/pose/rig3d-pose';
import { groundFigure, mixFigures } from './figure-ops';
import { restOf } from './motion';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

export type MocapClip = {
  /** CMU trial ("141_16"), its description and the window used (s). */
  trial: string;
  desc: string;
  from: number;
  to: number;
  fps: number;
  /** Left and right swapped (a move on her other side than the capture's). */
  mirrored?: boolean;
  /** Both feet stay where they start (a move in place: the performer's shuffles left out). */
  planted?: boolean;
  rest: { dirs: Record<string, Vec3>; left: Vec3; up: Vec3; hipsHeight: number };
  frames: Array<{
    /** The hips, from the floor under them at the start (capture metres, facing +Z). */
    root: Vec3;
    /** World turn per rig bone, from the capture's rest. */
    rot: Record<string, Quat>;
    /** Left hip joint, knee and ankle, then the right's, from the hips' centre. */
    legs: [Vec3, Vec3, Vec3, Vec3, Vec3, Vec3];
  }>;
};

export const MOCAP_CLIPS = data as unknown as Partial<Record<string, MocapClip>>;

/** Parents before children, as the rig composes them. */
const ORDER = [
  'hips',
  'spine',
  'chest',
  'clavicle_L',
  'upperarm_L',
  'forearm_L',
  'hand_L',
  'clavicle_R',
  'upperarm_R',
  'forearm_R',
  'hand_R',
  'thigh_L',
  'shin_L',
  'foot_L',
  'thigh_R',
  'shin_R',
  'foot_R',
] as const;

const CHILD: Record<string, string> = {
  hips: 'spine',
  spine: 'chest',
  chest: 'neck',
  clavicle_L: 'upperarm_L',
  upperarm_L: 'forearm_L',
  forearm_L: 'hand_L',
  clavicle_R: 'upperarm_R',
  upperarm_R: 'forearm_R',
  forearm_R: 'hand_R',
  thigh_L: 'shin_L',
  shin_L: 'foot_L',
  thigh_R: 'shin_R',
  shin_R: 'foot_R',
};

const UP = new Vector3(0, 1, 0);
const FORWARD = new Vector3(0, 0, 1);
const HEAD_TURN_LIMIT = 80 * (Math.PI / 180);

/** A rotation frame from a bone direction and a body axis for its roll. */
function basis(dir: Vector3, axis: Vector3): Matrix4 {
  const e1 = dir.clone().normalize();
  const e2 = axis
    .clone()
    .sub(e1.clone().multiplyScalar(axis.dot(e1)))
    .normalize();
  return new Matrix4().makeBasis(e1, e2, e1.clone().cross(e2));
}

function restDirections(kind: Rig3dBodyKind): Record<string, Vector3> {
  const world = figureWorld(restFigure(kind));
  const out: Record<string, Vector3> = {};
  for (const [bone, child] of Object.entries(CHILD)) {
    out[bone] = world.pos[child]!.clone().sub(world.pos[bone]!).normalize();
  }
  out.hand_L = out.forearm_L!.clone();
  out.hand_R = out.forearm_R!.clone();
  out.foot_L = FORWARD.clone();
  out.foot_R = FORWARD.clone();
  return out;
}

/** `align` per bone: the rig's rest frame onto the capture's. */
function alignments(kind: Rig3dBodyKind, clip: MocapClip): Record<string, Quaternion> {
  const rig = restDirections(kind);
  const capUp = new Vector3(...clip.rest.up);
  const capForward = new Vector3(...clip.rest.left).cross(capUp).normalize();
  const out: Record<string, Quaternion> = {};
  for (const bone of ORDER) {
    const cap = bone === 'hips' ? capUp : new Vector3(...clip.rest.dirs[bone]!);
    // Roll from the body's forward, unless the bone runs along it (the feet): then from up.
    const useUp = Math.abs(rig[bone]!.dot(FORWARD)) > 0.8;
    const m = basis(cap, useUp ? capUp : capForward).multiply(
      basis(rig[bone]!, useUp ? UP : FORWARD).transpose()
    );
    out[bone] = new Quaternion().setFromRotationMatrix(m);
  }
  return out;
}

/** The twist of `b` against `a` about `a`'s own up (radians, −π…π; swing-twist). */
function twistAboutUp(a: Quaternion, b: Quaternion): number {
  const relative = a.clone().invert().multiply(b);
  const angle = 2 * Math.atan2(relative.y, relative.w);
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Neck and head on the chest as at rest, turned about the chest's up by the capture head's twist
 * against its thorax (split 35 / 65, at most 80°): the capture's head bone pitches oddly (few
 * markers on the head — the pose harvester reads it the same way), which bowed her head onto her
 * chest; turned about the world's up instead, a bent-over body's head rolled onto its side.
 */
function placeHead(figure: PoseRig3dFigure, rot: Record<string, Quat>): void {
  const yaw = Math.max(
    -HEAD_TURN_LIMIT,
    Math.min(
      HEAD_TURN_LIMIT,
      twistAboutUp(new Quaternion(...rot.chest!), new Quaternion(...rot.head!))
    )
  );
  const world = figureWorld(figure);
  const axis = UP.clone().applyQuaternion(world.quat.chest!).normalize();
  const turn = (share: number) => new Quaternion().setFromAxisAngle(axis, yaw * share);
  setBoneWorldRotation(figure, 'neck', turn(0.35).multiply(world.quat.neck!.clone()));
  setBoneWorldRotation(figure, 'head', turn(1).multiply(figureWorld(figure).quat.head!.clone()));
}

/** A clip's frames as rig figures, at the clip's own rate (hips over the origin, facing +Z). */
export function retargetMocap(clip: MocapClip, kind: Rig3dBodyKind): PoseRig3dFigure[] {
  const rest = restFigure(kind);
  const restWorld = figureWorld(rest);
  const align = alignments(kind, clip);
  const k = rest.position[1] / clip.rest.hipsHeight;
  // Some bones start as the rig's own and turn as the capture's from there. The collarbones sit
  // on the chest as the rig's do: the capture's rest collarbone sits apart from a relaxed one,
  // which hunched her shoulders. The feet start flat in the hand-keyed stance: the capture's
  // ankle sits lower, so its foot bone runs flat where the rig's runs down to the ball — matched
  // by direction, her toes pointed up off the floor.
  const chestStart = new Quaternion(...clip.frames[0]!.rot.chest!).multiply(align.chest!);
  const startRelative: Record<string, Quaternion> = {};
  for (const side of ['L', 'R'] as const) {
    startRelative[`clavicle_${side}`] = chestStart
      .clone()
      .multiply(restWorld.quat[`clavicle_${side}`]!);
    // Turned out as the hand-keyed stance's feet are (moves.ts `standing`: 5° each way).
    const yaw = (side === 'L' ? 1 : -1) * STANCE_TURN;
    startRelative[`foot_${side}`] = new Quaternion()
      .setFromAxisAngle(UP, yaw)
      .multiply(restWorld.quat[`foot_${side}`]!);
  }
  const narrow = stanceNarrowing(clip, k, restWorld);
  // Drawn in about the start's hips (a fixed point, so a planted foot stays put).
  const middle = 0;
  // The legs' targets: the capture's ankles and knees, a wide stance drawn in.
  const target = (frame: MocapClip['frames'][number], p: Vec3) => {
    const x = frame.root[0] + p[0];
    return new Vector3(
      (middle + (x - middle) * narrow) * k,
      (frame.root[1] + p[1]) * k,
      (frame.root[2] + p[2]) * k
    );
  };
  // Each foot's world turn: flat at the start, then as the capture's foot turns; in a move in
  // place it stays flat (a pivot or a lifted heel moved the ball of a pinned foot).
  const footTurn = (side: 'L' | 'R', frame: MocapClip['frames'][number]) => {
    const bone = `foot_${side}`;
    if (clip.planted) return startRelative[bone]!.clone();
    return new Quaternion(...frame.rot[bone]!)
      .multiply(new Quaternion(...clip.frames[0]!.rot[bone]!).invert())
      .multiply(startRelative[bone]!.clone())
      .normalize();
  };
  const path = (side: 'L' | 'R', knee: 1 | 4, ankle: 2 | 5) =>
    lockPlantedFeet(
      clip.frames.map(f => ({
        ankle: target(f, f.legs[ankle]),
        knee: target(f, f.legs[knee]),
        foot: footTurn(side, f),
      })),
      clip.fps
    );
  const targets = { L: path('L', 1, 2), R: path('R', 4, 5) };
  // How straight each leg is in the capture (hip to ankle over the leg's length), 0–1.
  const straightness = (frame: MocapClip['frames'][number], side: 'L' | 'R') => {
    const [hip, knee, ankle] = (side === 'L' ? [0, 1, 2] : [3, 4, 5]).map(
      i => new Vector3(...frame.legs[i]!)
    ) as [Vector3, Vector3, Vector3];
    return hip.distanceTo(ankle) / Math.max(1e-6, hip.distanceTo(knee) + knee.distanceTo(ankle));
  };
  // Each foot moved by a constant so the move starts in the hand-keyed moves' stance (feet
  // STANCE_HALF either side, level), the point between them kept where it was under her:
  // blending in from a pose then matches theirs, where each performer's own stance (one foot
  // 15 cm ahead) made a planted foot slide to meet it — and moving the feet without the hips
  // left her crouched to reach them.
  if (clip.frames[0]!.root[1] * k > rest.position[1] * 0.75) {
    const l = targets.L[0]!.ankle;
    const r = targets.R[0]!.ankle;
    const mid = { x: (l.x + r.x) / 2, z: (l.z + r.z) / 2 };
    for (const [side, x] of [
      ['L', STANCE_HALF],
      ['R', -STANCE_HALF],
    ] as const) {
      const first = targets[side][0]!.ankle;
      const dx = mid.x + x - first.x;
      const dz = mid.z - first.z;
      for (const t of targets[side]) {
        t.ankle.x += dx;
        t.ankle.z += dz;
        t.knee.x += dx;
        t.knee.z += dz;
      }
    }
  }
  // A move in place keeps each foot where it starts, flat on the floor; the knee keeps its place
  // over it, and the hips sway over the feet as the capture's did, without the ground the
  // performer's shuffle covered (left in, the hips drifted off the pinned feet and the legs bent
  // or crossed to reach them).
  const hipsShift = clip.frames.map(() => ({ x: 0, z: 0 }));
  if (clip.planted) {
    // The hips' place over the point between the feet, frame by frame, as captured — its centre
    // within SWAY_CENTRE of that point and its swing within SWAY of the centre: a performer caught
    // mid-shuffle (the wave's start: hips 17 cm off their feet) swayed her 30 cm over pinned feet,
    // toward the camera and back.
    const hipsAt = (frame: MocapClip['frames'][number]) => ({
      x: (middle + (frame.root[0] - middle) * narrow) * k,
      z: frame.root[2] * k,
    });
    const offsets = clip.frames.map((frame, i) => {
      const h = hipsAt(frame);
      return {
        x: h.x - (targets.L[i]!.ankle.x + targets.R[i]!.ankle.x) / 2,
        z: h.z - (targets.L[i]!.ankle.z + targets.R[i]!.ankle.z) / 2,
      };
    });
    const clampLength = (v: { x: number; z: number }, max: number) => {
      const length = Math.hypot(v.x, v.z);
      return length > max ? { x: (v.x * max) / length, z: (v.z * max) / length } : v;
    };
    const mean = {
      x: offsets.reduce((sum, o) => sum + o.x, 0) / offsets.length,
      z: offsets.reduce((sum, o) => sum + o.z, 0) / offsets.length,
    };
    const centre = clampLength(mean, SWAY_CENTRE);
    const sway = offsets.map(o => {
      const swing = clampLength({ x: o.x - mean.x, z: o.z - mean.z }, SWAY);
      return { x: centre.x + swing.x, z: centre.z + swing.z };
    });
    // The feet where they start, the point between them under the start's hips less its sway.
    const feet = {
      x: -sway[0]!.x - (targets.L[0]!.ankle.x + targets.R[0]!.ankle.x) / 2,
      z: -sway[0]!.z - (targets.L[0]!.ankle.z + targets.R[0]!.ankle.z) / 2,
    };
    clip.frames.forEach((frame, i) => {
      const h = hipsAt(frame);
      hipsShift[i] = {
        x: sway[i]!.x - sway[0]!.x - h.x,
        z: sway[i]!.z - sway[0]!.z - h.z,
      };
    });
    const ankleH = restOf(kind).ankleH;
    for (const side of ['L', 'R'] as const) {
      // Flat on the floor: a performer's foot could start raised (7 cm, the wave's right).
      const first = targets[side][0]!.ankle.clone().setY(ankleH);
      first.x += feet.x;
      first.z += feet.z;
      for (const t of targets[side]) {
        const dx = first.x - t.ankle.x;
        const dz = first.z - t.ankle.z;
        t.ankle.copy(first);
        t.knee.x += dx;
        t.knee.z += dz;
      }
    }
  }
  return clip.frames.map((frame, index) => {
    const figure = restFigure(kind);
    // The hips' side-to-side place drawn in with the feet (a sway over a wide stance would lean
    // her off a narrower one).
    figure.position = [
      (middle + (frame.root[0] - middle) * narrow) * k + hipsShift[index]!.x,
      frame.root[1] * k,
      frame.root[2] * k + hipsShift[index]!.z,
    ];
    for (const bone of ORDER) {
      const turn = new Quaternion(...frame.rot[bone]!);
      const world = startRelative[bone]
        ? turn
            .multiply(new Quaternion(...clip.frames[0]!.rot[bone]!).invert())
            .multiply(startRelative[bone]!.clone())
        : turn.multiply(align[bone]!).multiply(restWorld.quat[bone]!.clone());
      setBoneWorldRotation(figure, bone, world.normalize());
      if (bone === 'chest') placeHead(figure, frame.rot);
    }
    // The hips at the height that bends each leg as the capture's was bent (its hip-to-ankle
    // share of the leg's length; at most a hair short of straight): drawing a wide stance in
    // otherwise left the hips low and the knees bent, and a pinned foot out of reach was dragged.
    let lift = Infinity;
    const leg = restOf(kind).legLength;
    for (const side of ['L', 'R'] as const) {
      const hip = figureWorld(figure).pos[`thigh_${side}`]!;
      const ankle = targets[side][index]!.ankle;
      const length = leg * Math.min(0.985, straightness(frame, side));
      const flat = Math.hypot(hip.x - ankle.x, hip.z - ankle.z);
      lift = Math.min(
        lift,
        ankle.y + Math.sqrt(Math.max(0, length * length - flat * flat)) - hip.y
      );
    }
    if (Number.isFinite(lift)) figure.position[1] += lift;
    // Legs by IK to those ankles, knees toward the capture's knees: its stance and planted feet,
    // though the rig's hips are narrower.
    for (const side of ['L', 'R'] as const) {
      const { ankle, knee, foot } = targets[side][index]!;
      solveLimbIK(figure, side, 'leg', ankle, knee);
      setBoneWorldRotation(figure, `foot_${side}`, foot.clone());
    }
    // Her lowest resting point on the floor, every frame: the capture's floor and the rig's feet
    // differ by a few centimetres (a turn floated 6 cm), and some foot is always down.
    return groundFigure(figure);
  });
}

/** How far a move in place's hips may sit off the point between the feet, and swing from it (m). */
const SWAY_CENTRE = 0.05;
const SWAY = 0.06;

/** Half the hand-keyed moves' standing stance (moves.ts `standing`), m, and each foot's turn out. */
const STANCE_HALF = 0.1;
const STANCE_TURN = 5 * (Math.PI / 180);

/** A foot this close to its lowest (m) and this slow (m/s) is planted. */
const PLANT_HEIGHT = 0.03;
const PLANT_SPEED = 0.3;

/**
 * Planted feet pinned: while a foot is down and all but still, its ankle holds the middle of where
 * it was over that stretch (the knee moves with it) and the foot its turn from the middle of it.
 * Capture jitter and the retarget's scaling otherwise let a standing foot creep a few millimetres
 * a frame.
 */
type FootPath = Array<{ ankle: Vector3; knee: Vector3; foot: Quaternion }>;

function lockPlantedFeet(path: FootPath, fps: number): FootPath {
  const lowest = Math.min(...path.map(p => p.ankle.y));
  const planted = path.map((p, i) => {
    const a = path[Math.max(0, i - 1)]!.ankle;
    const b = path[Math.min(path.length - 1, i + 1)]!.ankle;
    const span = (Math.min(path.length - 1, i + 1) - Math.max(0, i - 1)) / fps || 1 / fps;
    const speed = Math.hypot(b.x - a.x, b.z - a.z) / span;
    return p.ankle.y - lowest < PLANT_HEIGHT && speed < PLANT_SPEED;
  });
  const out = path.map(p => ({
    ankle: p.ankle.clone(),
    knee: p.knee.clone(),
    foot: p.foot.clone(),
  }));
  for (let i = 0; i < path.length;) {
    if (!planted[i]) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < path.length && planted[j + 1]) j += 1;
    let x = 0;
    let z = 0;
    for (let n = i; n <= j; n += 1) {
      x += path[n]!.ankle.x;
      z += path[n]!.ankle.z;
    }
    x /= j - i + 1;
    z /= j - i + 1;
    const turn = path[Math.round((i + j) / 2)]!.foot;
    for (let n = i; n <= j; n += 1) {
      out[n]!.foot = turn.clone();
      const dx = x - path[n]!.ankle.x;
      const dz = z - path[n]!.ankle.z;
      out[n]!.ankle.x += dx;
      out[n]!.ankle.z += dz;
      out[n]!.knee.x += dx;
      out[n]!.knee.z += dz;
    }
    i = j + 1;
  }
  return out;
}

/**
 * How much to draw the feet in toward her middle (1 = as captured): some performers stood with
 * their feet twice as wide as the rig's relaxed stance (a shrug, a look round), which looked
 * planted rather than relaxed on her. The start's stance is brought to within 1.3× the rig's;
 * the motion is kept (only the feet's side-to-side place is scaled).
 */
function stanceNarrowing(
  clip: MocapClip,
  k: number,
  restWorld: ReturnType<typeof figureWorld>
): number {
  const legs = clip.frames[0]!.legs;
  const captured = Math.abs(legs[2][0] - legs[5][0]) * k;
  const rig = Math.abs(restWorld.pos.foot_L!.x - restWorld.pos.foot_R!.x);
  return captured > rig * 1.3 ? (rig * 1.3) / captured : 1;
}

const cache = new Map<string, PoseRig3dFigure[]>();

/** A captured move's natural length (s), or null when the move is hand-keyed. */
export function mocapSeconds(id: string): number | null {
  const clip = MOCAP_CLIPS[id];
  return clip ? (clip.frames.length - 1) / clip.fps : null;
}

/**
 * A captured move's frames `seconds` long at `fps` (its timing stretched to fit, slerped between
 * captured frames), or null when the move is hand-keyed.
 */
export function mocapFrames(
  id: string,
  kind: Rig3dBodyKind,
  seconds: number,
  fps: number
): PoseRig3dFigure[] | null {
  const clip = MOCAP_CLIPS[id];
  if (!clip) return null;
  const key = `${id}|${kind}`;
  let source = cache.get(key);
  if (!source) {
    source = retargetMocap(clip, kind);
    cache.set(key, source);
  }
  const count = Math.max(2, Math.round(seconds * fps) + 1);
  const last = source.length - 1;
  return Array.from({ length: count }, (_, i) => {
    const f = (i / (count - 1)) * last;
    const j = Math.min(last - 1, Math.floor(f));
    return mixFigures(source[j]!, source[j + 1]!, f - j);
  });
}
