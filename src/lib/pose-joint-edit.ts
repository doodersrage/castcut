/** Hand edits to a guide skeleton (the pose preview's joint editor). Pure. */

import type { NormalizedBody } from '@/lib/pose-library';

/** COCO-18 eye / ear points — they ride along when the nose (head) moves. */
const FACE = [14, 15, 16, 17] as const;

const clamp01 = (value: number) => Math.min(0.99, Math.max(0.01, value));

/** Move one joint (and the face points with the nose) — pure, for tests and keyboard nudges. */
export function moveJoint(
  bodies: NormalizedBody[],
  person: number,
  joint: number,
  to: { x: number; y: number }
): NormalizedBody[] {
  return bodies.map((body, index) => {
    if (index !== person) return body;
    const from = body[joint];
    if (!from) return body;
    const next = { x: clamp01(to.x), y: clamp01(to.y) };
    const dx = next.x - from.x;
    const dy = next.y - from.y;
    return body.map((p, i) => {
      if (i === joint) return next;
      if (joint === 0 && p && (FACE as readonly number[]).includes(i)) {
        return { x: clamp01(p.x + dx), y: clamp01(p.y + dy) };
      }
      return p;
    });
  });
}

/** COCO-18 parent of each joint (the neck is the root; eyes / ears hang off the nose). */
const PARENT: Readonly<Record<number, number>> = {
  0: 1,
  2: 1,
  3: 2,
  4: 3,
  5: 1,
  6: 5,
  7: 6,
  8: 1,
  9: 8,
  10: 9,
  11: 1,
  12: 11,
  13: 12,
  14: 0,
  15: 0,
  16: 0,
  17: 0,
};

function descendants(joint: number): number[] {
  const out: number[] = [];
  for (const [child, parent] of Object.entries(PARENT)) {
    if (parent === joint) out.push(Number(child), ...descendants(Number(child)));
  }
  return out;
}

/**
 * Move a joint without stretching the figure: every bone keeps its length. A hand / foot pulls
 * its limb (the elbow / knee bends to follow, the shoulder / hip stays); an elbow / knee swings
 * around its parent and carries the forearm / shin; a shoulder, hip or the head swings around
 * the neck and carries its limb; the neck moves the whole figure. `aspect` (width / height) makes lengths true on screen.
 */
export function moveJointRigid(
  bodies: NormalizedBody[],
  person: number,
  joint: number,
  to: { x: number; y: number },
  aspect: number
): NormalizedBody[] {
  const body = bodies[person];
  const from = body?.[joint];
  if (!body || !from) return bodies;
  const a = aspect > 0 ? aspect : 1;
  const parentIndex = PARENT[joint];
  const parent = parentIndex == null ? null : body[parentIndex];
  const replace = (next: NormalizedBody) => bodies.map((b, i) => (i === person ? next : b));

  if (joint === 1) {
    // Whole figure: clamp the shift, not the points, so nothing is squashed at the frame edge.
    const xs = body.filter(Boolean).map(p => p!.x);
    const ys = body.filter(Boolean).map(p => p!.y);
    const dx = Math.min(0.99 - Math.max(...xs), Math.max(0.01 - Math.min(...xs), to.x - from.x));
    const dy = Math.min(0.99 - Math.max(...ys), Math.max(0.01 - Math.min(...ys), to.y - from.y));
    return replace(body.map(p => (p ? { x: p.x + dx, y: p.y + dy } : null)));
  }
  if (!parent) return moveJoint(bodies, person, joint, to);

  // A hand or foot is pulled like a real limb: the shoulder / hip stays put and the elbow / knee
  // bends to let it reach (two-bone IK), instead of only swinging the forearm / shin.
  const rootIndex = parentIndex == null ? undefined : PARENT[parentIndex];
  const root = rootIndex == null ? null : body[rootIndex];
  if ((joint === 4 || joint === 7 || joint === 10 || joint === 13) && root) {
    const upper = Math.hypot((parent.x - root.x) * a, parent.y - root.y);
    const lower = Math.hypot((from.x - parent.x) * a, from.y - parent.y);
    const tx0 = (to.x - root.x) * a;
    const ty0 = to.y - root.y;
    const want = Math.hypot(tx0, ty0);
    if (upper > 1e-6 && lower > 1e-6 && want > 1e-6) {
      const reachTo = Math.min(
        upper + lower - 1e-6,
        Math.max(Math.abs(upper - lower) + 1e-6, want)
      );
      const ux = tx0 / want;
      const uy = ty0 / want;
      const cosAtRoot = Math.min(
        1,
        Math.max(-1, (upper * upper + reachTo * reachTo - lower * lower) / (2 * upper * reachTo))
      );
      const bend = Math.acos(cosAtRoot);
      // Keep the elbow / knee on the side it is already bent toward.
      const cross = ux * (parent.y - root.y) - uy * ((parent.x - root.x) * a);
      const sign = cross < 0 ? -1 : 1;
      const cosB = Math.cos(sign * bend);
      const sinB = Math.sin(sign * bend);
      const mid = {
        x: root.x + ((ux * cosB - uy * sinB) * upper) / a,
        y: root.y + (ux * sinB + uy * cosB) * upper,
      };
      const end = { x: root.x + (ux * reachTo) / a, y: root.y + uy * reachTo };
      return replace(body.map((p, i) => (i === joint ? end : i === parentIndex ? mid : p)));
    }
  }

  const vx = (from.x - parent.x) * a;
  const vy = from.y - parent.y;
  const tx = (to.x - parent.x) * a;
  const ty = to.y - parent.y;
  const length = Math.hypot(vx, vy);
  const reach = Math.hypot(tx, ty);
  if (length < 1e-6 || reach < 1e-6) return bodies;
  const turn = Math.atan2(ty, tx) - Math.atan2(vy, vx);
  const next = {
    x: parent.x + ((tx / reach) * length) / a,
    y: parent.y + (ty / reach) * length,
  };
  const riders = new Set(descendants(joint));
  // Off the neck (shoulder, hip, head) the limb is carried; further down it swings.
  const swing = parentIndex !== 1;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  return replace(
    body.map((p, i) => {
      if (i === joint) return next;
      if (!p || !riders.has(i)) return p;
      if (!swing) return { x: p.x + (next.x - from.x), y: p.y + (next.y - from.y) };
      const rx = (p.x - parent.x) * a;
      const ry = p.y - parent.y;
      return { x: parent.x + (rx * cos - ry * sin) / a, y: parent.y + rx * sin + ry * cos };
    })
  );
}

/** Depth per joint (screen-height units, + toward the camera); null where the joint is missing. */
export type BodyDepth = Array<number | null>;

/**
 * Guess depth for a flat skeleton: a bone drawn shorter than its usual share of the torso is
 * pointing toward the camera. `reference` is an unforeshortened figure (the standing starter).
 */
export function liftBodyDepth(
  body: NormalizedBody,
  reference: NormalizedBody,
  aspect: number
): BodyDepth {
  const a = aspect > 0 ? aspect : 1;
  const span = (b: NormalizedBody, i: number, j: number, scale: number) => {
    const p = b[i];
    const q = b[j];
    return p && q ? Math.hypot((p.x - q.x) * scale, p.y - q.y) : 0;
  };
  // Torso = neck → each hip, averaged: the yardstick both figures share.
  const torso = (b: NormalizedBody, scale: number) =>
    (span(b, 1, 8, scale) + span(b, 1, 11, scale)) / 2;
  const unit = torso(body, a);
  const refUnit = torso(reference, a);
  const depth: BodyDepth = body.map(p => (p ? 0 : null));
  if (unit < 1e-6 || refUnit < 1e-6) return depth;
  const order = [0, 2, 5, 8, 11, 3, 6, 9, 12, 4, 7, 10, 13, 14, 15, 16, 17];
  for (const joint of order) {
    const parent = PARENT[joint]!;
    if (!body[joint] || !body[parent]) continue;
    const base = depth[parent] ?? 0;
    const expected = (span(reference, joint, parent, a) / refUnit) * unit;
    const drawn = span(body, joint, parent, a);
    // Arms and legs only, and only when clearly short — small differences are just build.
    const limb = joint === 3 || joint === 4 || joint === 6 || joint === 7 || joint >= 9;
    depth[joint] =
      limb && joint <= 13 && expected > 0 && drawn < expected * 0.8
        ? base + Math.sqrt(expected * expected - drawn * drawn)
        : base;
  }
  return depth;
}

export type BodyRotation = { turn?: number; tilt?: number; spin?: number };

/**
 * Rotate a figure in 3D around the middle of its hips and project it flat again. `turn` is
 * around the vertical axis, `tilt` around the horizontal one, `spin` in the picture plane
 * (radians). Returns the new points and depths so further rotations keep the figure's shape.
 */
export function rotateBody(
  body: NormalizedBody,
  depth: BodyDepth,
  rotation: BodyRotation,
  aspect: number
): { body: NormalizedBody; depth: BodyDepth } {
  const a = aspect > 0 ? aspect : 1;
  const hips = [body[8], body[11]].filter(Boolean) as Array<{ x: number; y: number }>;
  const anchor = hips.length
    ? {
        x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
        y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
      }
    : body[1];
  if (!anchor) return { body, depth };
  const [ct, st] = [Math.cos(rotation.turn ?? 0), Math.sin(rotation.turn ?? 0)];
  const [cp, sp] = [Math.cos(rotation.tilt ?? 0), Math.sin(rotation.tilt ?? 0)];
  const [cr, sr] = [Math.cos(rotation.spin ?? 0), Math.sin(rotation.spin ?? 0)];
  const nextDepth: BodyDepth = [];
  const points = body.map((p, i) => {
    if (!p) {
      nextDepth.push(null);
      return null;
    }
    let x = (p.x - anchor.x) * a;
    let y = p.y - anchor.y;
    let z = depth[i] ?? 0;
    [x, z] = [x * ct + z * st, -x * st + z * ct];
    [y, z] = [y * cp - z * sp, y * sp + z * cp];
    [x, y] = [x * cr - y * sr, x * sr + y * cr];
    nextDepth.push(z);
    return { x: anchor.x + x / a, y: anchor.y + y };
  });
  // Keep the whole figure in frame by shifting it, never by squashing points.
  const xs = points.filter(Boolean).map(p => p!.x);
  const ys = points.filter(Boolean).map(p => p!.y);
  const dx = Math.max(0.01 - Math.min(...xs), 0) + Math.min(0.99 - Math.max(...xs), 0);
  const dy = Math.max(0.01 - Math.min(...ys), 0) + Math.min(0.99 - Math.max(...ys), 0);
  return {
    body: points.map(p => (p ? { x: clamp01(p.x + dx), y: clamp01(p.y + dy) } : null)),
    depth: nextDepth,
  };
}
