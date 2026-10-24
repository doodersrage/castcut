/**
 * A motion-capture reference's own 3D as the editor's rig (no lift). The capture is a real
 * person of their own height; the joints are scaled to the rig's (the lead's neck-to-ankle
 * length), each figure's limb lengths follow the capture within the rig's range, and the camera
 * stands where the reference was seen from. Turned round, the figure stays the captured body —
 * a flat skeleton seen from her side lifts with its legs guessed (user report 2026-10-24).
 */

import { Vector3 } from 'three';
import type { PoseReferenceWorld } from '@/lib/pose/references';
import {
  RIG3D_SCALE_RANGE,
  RIG3D_SEGMENTS,
  RIG3D_VERSION,
  type PoseRig3d,
  type Rig3dBodyKind,
  type Rig3dProportions,
  type Rig3dSegment,
} from '@/lib/pose/rig3d';
import { cameraFromView } from '@/lib/pose/rig3d-camera';
import {
  DEFAULT_CAMERA,
  figureFromWorldJoints,
  openPoseWorld,
  restFigure,
} from '@/lib/pose/rig3d-pose';

type Points = ReadonlyArray<Vector3 | null>;

const SEGMENT_JOINTS: Record<Rig3dSegment, Array<[number, number]>> = {
  upperarm: [
    [2, 3],
    [5, 6],
  ],
  forearm: [
    [3, 4],
    [6, 7],
  ],
  thigh: [
    [8, 9],
    [11, 12],
  ],
  shin: [
    [9, 10],
    [12, 13],
  ],
};

function hipMid(points: Points): Vector3 | null {
  const r = points[8];
  const l = points[11];
  return r && l ? r.clone().add(l).multiplyScalar(0.5) : null;
}

/** Neck to hips, then hip to knee to ankle on both sides (halved): a body's length. */
function bodyLength(points: Points): number {
  const hips = hipMid(points);
  const neck = points[1];
  if (!hips || !neck) return 0;
  let legs = 0;
  for (const [a, b] of [...SEGMENT_JOINTS.thigh, ...SEGMENT_JOINTS.shin]) {
    const pa = points[a];
    const pb = points[b];
    if (pa && pb) legs += pa.distanceTo(pb);
  }
  return neck.distanceTo(hips) + legs / 2;
}

function proportionsFor(points: Points, kind: Rig3dBodyKind): Rig3dProportions | undefined {
  const rest = openPoseWorld(restFigure(kind));
  const out: Rig3dProportions = {};
  for (const segment of RIG3D_SEGMENTS) {
    const ratios = SEGMENT_JOINTS[segment]
      .map(([a, b]) => {
        const pa = points[a];
        const pb = points[b];
        return pa && pb ? pa.distanceTo(pb) / rest[a]!.distanceTo(rest[b]!) : null;
      })
      .filter((ratio): ratio is number => ratio !== null);
    if (!ratios.length) continue;
    const ratio = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
    const clamped = Math.min(RIG3D_SCALE_RANGE[1], Math.max(RIG3D_SCALE_RANGE[0], ratio));
    if (Math.abs(clamped - 1) > 0.01) out[segment] = Math.round(clamped * 1000) / 1000;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * The rig of a reference's 3D: one figure per person (`kinds` their bodies, lead first), seen
 * from the reference's own view and framed to `aspect`.
 */
export function rigFromWorldReference(
  world: PoseReferenceWorld,
  aspect: number,
  kinds: Rig3dBodyKind[] = []
): PoseRig3d {
  const raw = world.people.map(body => body.map(p => (p ? new Vector3(p[0], p[1], p[2]) : null)));
  const leadKind = kinds[0] ?? 'female';
  const restLength = bodyLength(openPoseWorld(restFigure(leadKind)));
  const capturedLength = bodyLength(raw[0] ?? []);
  // Scaled about the lead's hips on the floor: the floor stays at y = 0, the people keep their
  // distance in proportion.
  const k = capturedLength > 0.2 ? restLength / capturedLength : 1;
  const people = raw.map(body => body.map(p => (p ? p.clone().multiplyScalar(k) : null)));
  const figures = people.map((points, index) => {
    const kind =
      kinds[index] ?? (index === 0 ? leadKind : leadKind === 'female' ? 'male' : 'female');
    return figureFromWorldJoints(points, kind, proportionsFor(points, kind));
  });
  const rig: PoseRig3d = { version: RIG3D_VERSION, figures, camera: { ...DEFAULT_CAMERA } };
  return { ...rig, camera: cameraFromView(rig, world.view, aspect) };
}

/** Left and right swapped across COCO-18 (shoulders to ankles, eyes, ears). */
const MIRROR_INDEX = [0, 1, 5, 6, 7, 2, 3, 4, 11, 12, 13, 8, 9, 10, 15, 14, 17, 16];

/**
 * The 3D mirrored left for right, as a picture is mirrored (a duo's lead put on the other side):
 * x flipped, each joint swapped for its other-side twin, the camera on her other side.
 */
export function mirrorWorldReference(world: PoseReferenceWorld): PoseReferenceWorld {
  return {
    people: world.people.map(body =>
      MIRROR_INDEX.map(from => {
        const p = body[from];
        return p ? ([-p[0], p[1], p[2]] as const) : null;
      })
    ),
    view: { azimuthDeg: -world.view.azimuthDeg, elevationDeg: world.view.elevationDeg },
  };
}
