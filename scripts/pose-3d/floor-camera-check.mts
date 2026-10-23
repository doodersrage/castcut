/**
 * Does the lift read the camera height of a figure on the floor? Figures lying (on the back,
 * side, front, a knee up) and sitting on the floor are posed in 3D, turned, and drawn through
 * cameras 0°, 15°, 30° and 45° above them; each picture is lifted with liftBodyWithCamera (the
 * posture known, as for a pose filed by name) and the camera it reads is set against the true one.
 * The mocap lying references, drawn through a known camera (35°), are read the same way.
 *
 *   node --import tsx scripts/pose-3d/floor-camera-check.mts [--json FILE] [--verbose]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Quaternion, Vector3 } from 'three';
import {
  DEFAULT_CAMERA,
  cameraElevation,
  figureWorld,
  liftBodyWithCamera,
  openPoseWorld,
  orbitCamera,
  projectFigure,
  restFigure,
  setBoneWorldRotation,
  turnFigure,
} from '../../src/lib/pose/rig3d-pose';
import type { NormalizedBody } from '../../src/lib/pose/library';
import type { PoseRig3dFigure } from '../../src/lib/pose/rig3d';
import { classifyPosture } from '../../src/lib/pose/rig3d-posture';
import { posturesForReference, type Posture } from '../../src/lib/pose/rig3d-posture-points';
import { starterFigure } from '../../src/lib/director/poses';

const ROOT = new URL('../..', import.meta.url).pathname;
const ASPECT = 2 / 3;
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const verbose = process.argv.includes('--verbose');
const jsonOut = arg('--json');

const axis = (x: number, y: number, z: number, deg: number) =>
  new Quaternion().setFromAxisAngle(new Vector3(x, y, z).normalize(), (deg * Math.PI) / 180);

/** The whole figure turned by `q` about its hips, then set down with its lowest point on y = 0. */
function laid(figure: PoseRig3dFigure, q: Quaternion): PoseRig3dFigure {
  const hips = new Quaternion(...figure.bones.hips!);
  const turned = q.clone().multiply(hips);
  figure.bones.hips = [turned.x, turned.y, turned.z, turned.w];
  return grounded(figure);
}
function grounded(figure: PoseRig3dFigure): PoseRig3dFigure {
  const lowest = Math.min(...openPoseWorld(figure).map(p => p.y));
  figure.position = [figure.position[0], figure.position[1] - lowest + 0.04, figure.position[2]];
  return figure;
}
/** A bone turned by `q` in the world (its children with it). */
function bend(figure: PoseRig3dFigure, bone: string, q: Quaternion) {
  const world = figureWorld(figure);
  setBoneWorldRotation(figure, bone, q.clone().multiply(world.quat[bone]!));
}

type Floor = { id: string; posture: Posture[]; make: () => PoseRig3dFigure };
const FLOOR: Floor[] = [
  { id: 'back', posture: ['lying'], make: () => laid(restFigure('female'), axis(1, 0, 0, -90)) },
  {
    id: 'back-knee',
    posture: ['lying'],
    make: () => {
      const f = restFigure('female');
      bend(f, 'thigh_R', axis(1, 0, 0, -70));
      bend(f, 'shin_R', axis(1, 0, 0, 120));
      bend(f, 'upperarm_L', axis(0, 0, 1, 60));
      return laid(f, axis(1, 0, 0, -90));
    },
  },
  {
    id: 'front',
    posture: ['lying'],
    make: () => {
      const f = restFigure('female');
      bend(f, 'upperarm_R', axis(0, 0, 1, -40));
      return laid(f, axis(1, 0, 0, 90));
    },
  },
  {
    id: 'side',
    posture: ['lying'],
    make: () => {
      const f = restFigure('female');
      bend(f, 'thigh_L', axis(1, 0, 0, -40));
      bend(f, 'shin_L', axis(1, 0, 0, 60));
      return laid(f, axis(0, 0, 1, 90));
    },
  },
  {
    id: 'elbows',
    posture: ['lying'],
    make: () => {
      // Propped back on the elbows: the torso 30° up off the floor, legs along it.
      const f = restFigure('female');
      bend(f, 'thigh_R', axis(1, 0, 0, -30));
      bend(f, 'thigh_L', axis(1, 0, 0, -30));
      bend(f, 'upperarm_R', axis(1, 0, 0, 50));
      bend(f, 'upperarm_L', axis(1, 0, 0, 50));
      return laid(f, axis(1, 0, 0, -60));
    },
  },
  {
    id: 'floor-sit',
    posture: ['seated', 'crouch'],
    make: () => grounded(starterFigure('sit', 'female')),
  },
];

const ELEVATIONS = [0, 15, 30, 45];
const YAWS = [20, 65, 110, 155];
const EYE = cameraElevation(DEFAULT_CAMERA);

function seenFrom(figure: PoseRig3dFigure, elevation: number): NormalizedBody {
  const hips = figureWorld(figure).pos.hips!;
  const level = {
    ...DEFAULT_CAMERA,
    target: hips.toArray() as [number, number, number],
    position: hips.clone().add({ x: 0, y: 0, z: 5.4 }).toArray() as [number, number, number],
  };
  return projectFigure(figure, orbitCamera(level, elevation), ASPECT);
}

type Row = { id: string; truth: number; read: number; posture: string; ms: number };
const rows: Row[] = [];
const started = performance.now();
for (const floor of FLOOR) {
  for (const yaw of YAWS) {
    for (const elevation of ELEVATIONS) {
      const figure = floor.make();
      turnFigure(figure, (yaw * Math.PI) / 180);
      const body = seenFrom(figure, elevation);
      const t = performance.now();
      const lifted = liftBodyWithCamera(body, ASPECT, { postures: floor.posture });
      const ms = performance.now() - t;
      const read = cameraElevation(lifted.camera);
      const posture = classifyPosture(lifted.figure);
      rows.push({ id: `${floor.id}@${yaw}`, truth: elevation, read, posture, ms });
      if (verbose)
        console.log(
          `${floor.id}@${yaw} ${elevation}° → ${read.toFixed(1)}° ${posture} ${ms.toFixed(0)}ms`
        );
    }
  }
}

// The mocap lying references: drawn through a camera 35° above.
const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
  references: Array<{
    id: string;
    pose: string;
    aspect: number;
    people: NormalizedBody[];
    source?: string;
  }>;
};
const mocapRows: Row[] = [];
for (const ref of refs.references) {
  if (ref.source !== 'cmu-mocap' || !['lie', 'lie_side', 'lie_front'].includes(ref.pose)) continue;
  const t = performance.now();
  const postures = posturesForReference(ref);
  const lifted = liftBodyWithCamera(ref.people[0]!, ref.aspect, {
    body: 'female',
    ...(postures ? { postures } : {}),
  });
  const ms = performance.now() - t;
  const read = cameraElevation(lifted.camera);
  mocapRows.push({
    id: ref.id,
    truth: 35,
    read,
    posture: classifyPosture(lifted.figure),
    ms,
  });
  if (verbose) console.log(`${ref.id} 35° → ${read.toFixed(1)}° ${ms.toFixed(0)}ms`);
}

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
const report = (label: string, rs: Row[]) => {
  const off = rs.map(r => Math.abs(r.read - r.truth));
  const eyeOff = rs.map(r => Math.abs(EYE - r.truth));
  console.log(
    `${label} (${rs.length}): off by ${mean(off).toFixed(1)}° (eye level: ${mean(eyeOff).toFixed(1)}°); ` +
      ELEVATIONS.filter(e => rs.some(r => r.truth === e))
        .map(e => {
          const at = rs.filter(r => r.truth === e);
          return `${e}°→${mean(at.map(r => r.read)).toFixed(1)}°`;
        })
        .join(' ') +
      `; ${mean(rs.map(r => r.ms)).toFixed(0)} ms each`
  );
};
const lying = rows.filter(r => !r.id.startsWith('floor-sit'));
report('synthetic lying', lying);
for (const floor of FLOOR)
  report(
    `  ${floor.id}`,
    rows.filter(r => r.id.startsWith(`${floor.id}@`))
  );
report('mocap lying (35°)', mocapRows);
const wrong = rows.filter(
  r => !FLOOR.find(f => r.id.startsWith(`${f.id}@`))!.posture.includes(r.posture as Posture)
);
console.log(`posture lost: ${wrong.length}/${rows.length}`);
console.log(`total ${((performance.now() - started) / 1000).toFixed(1)} s`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ rows, mocapRows }, null, 1));
