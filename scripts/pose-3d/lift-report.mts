/**
 * The 3D pose editor's lifting, measured: every one-person reference pose
 * (public/pose-references.json) lifted into the rig and projected back through the same camera.
 * Prints the mean and worst point error (in picture heights) and the face points whose
 * visibility changed.
 *
 *   node --import tsx scripts/pose-3d/lift-report.mts [--worst 10]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  liftBody,
  projectFigure,
  figureWorld,
  DEFAULT_CAMERA,
} from '../../src/lib/pose/rig3d-pose';
import type { NormalizedBody } from '../../src/lib/pose/library';

const ROOT = new URL('../..', import.meta.url).pathname;
const refs = JSON.parse(readFileSync(join(ROOT, 'public/pose-references.json'), 'utf8')) as {
  references: Array<{ id: string; aspect: number; people: NormalizedBody[] }>;
};
const worstCount = Number(process.argv[process.argv.indexOf('--worst') + 1]) || 0;

export function liftError(body: NormalizedBody, aspect: number) {
  const figure = liftBody(body, aspect);
  const back = projectFigure(figure, DEFAULT_CAMERA, aspect);
  let sum = 0;
  let count = 0;
  let worst = 0;
  let bodySum = 0;
  let bodyCount = 0;
  let flipped = 0;
  body.forEach((point, joint) => {
    const other = back[joint];
    if (point && other) {
      const d = Math.hypot((point.x - other.x) * aspect, point.y - other.y);
      sum += d;
      count += 1;
      worst = Math.max(worst, d);
      if (joint < 14) {
        bodySum += d;
        bodyCount += 1;
      }
    } else if (Boolean(point) !== Boolean(other)) {
      flipped += 1;
    }
  });
  // How much the limbs point along the line of sight (0 = all flat to the picture): a lift that
  // reproduces the points by swinging limbs toward the camera reads worse than it measures.
  const world = figureWorld(figure);
  const eye = DEFAULT_CAMERA.position;
  const depthOf = (bone: string) =>
    Math.hypot(...world.pos[bone]!.toArray().map((v, i) => v - eye[i]!));
  const LIMB_BONES: Array<[string, string]> = [
    ['upperarm_R', 'forearm_R'],
    ['forearm_R', 'hand_R'],
    ['upperarm_L', 'forearm_L'],
    ['forearm_L', 'hand_L'],
    ['thigh_R', 'shin_R'],
    ['shin_R', 'foot_R'],
    ['thigh_L', 'shin_L'],
    ['shin_L', 'foot_L'],
  ];
  const depthiness =
    LIMB_BONES.reduce(
      (s, [a, b]) =>
        s + Math.abs(depthOf(a) - depthOf(b)) / world.pos[a]!.distanceTo(world.pos[b]!),
      0
    ) / LIMB_BONES.length;
  return {
    mean: sum / Math.max(1, count),
    body: bodySum / Math.max(1, bodyCount),
    worst,
    flipped,
    depthiness,
  };
}

const rows = refs.references
  .filter(ref => ref.people.length === 1)
  .map(ref => ({ id: ref.id, ...liftError(ref.people[0]!, ref.aspect) }));
const mean = (key: 'mean' | 'body' | 'worst' | 'depthiness') =>
  rows.reduce((s, r) => s + r[key], 0) / rows.length;
const sorted = [...rows].sort((a, b) => a.mean - b.mean);
const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!.mean;
console.log(`${rows.length} one-person references`);
console.log(
  `mean point error ${(mean('mean') * 100).toFixed(2)}% of the picture height (body joints ${(mean('body') * 100).toFixed(2)}%), median ${(pct(0.5) * 100).toFixed(2)}%, 90th percentile ${(pct(0.9) * 100).toFixed(2)}%, mean worst point ${(mean('worst') * 100).toFixed(2)}%`
);
console.log(
  `limbs along the line of sight: ${(mean('depthiness') * 100).toFixed(1)}% of their length on average`
);
console.log(
  `face points shown / hidden differently: ${rows.reduce((s, r) => s + r.flipped, 0)} over ${rows.length} poses`
);
for (const row of worstCount ? sorted.slice(-worstCount).reverse() : []) {
  console.log(
    `  ${row.id}: mean ${(row.mean * 100).toFixed(2)}% worst ${(row.worst * 100).toFixed(2)}% flipped ${row.flipped}`
  );
}
