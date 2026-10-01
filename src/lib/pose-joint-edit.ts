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

/** Everything above the waist: head, face points, neck, shoulders and arms. */
const UPPER_BODY: ReadonlySet<number> = new Set([0, 1, 2, 3, 4, 5, 6, 7, 14, 15, 16, 17]);

/** Slide a whole figure, stopping at the frame edge without squashing it. */
export function moveWholeBody(
  bodies: NormalizedBody[],
  person: number,
  dx: number,
  dy: number
): NormalizedBody[] {
  const body = bodies[person];
  if (!body) return bodies;
  const xs = body.filter(Boolean).map(p => p!.x);
  const ys = body.filter(Boolean).map(p => p!.y);
  const sx = Math.min(0.99 - Math.max(...xs), Math.max(0.01 - Math.min(...xs), dx));
  const sy = Math.min(0.99 - Math.max(...ys), Math.max(0.01 - Math.min(...ys), dy));
  return bodies.map((b, i) =>
    i === person ? b.map(p => (p ? { x: p.x + sx, y: p.y + sy } : null)) : b
  );
}

/** How far past a limb's reach the pointer goes before the body leans (screen heights). */
const PULL_SLACK = 0.012;

/** Limb joints → [the shoulder / hip the limb hangs from, the planted foot to lean over]. */
const LIMB_ROOT: Readonly<Record<number, readonly [number, number | null]>> = {
  3: [2, null],
  4: [2, null],
  6: [5, null],
  7: [5, null],
  9: [8, 13],
  10: [8, 13],
  12: [11, 10],
  13: [11, 10],
};

/**
 * When the pointer is further from a limb's shoulder / hip than the limb can reach, rotate the
 * rest of the body just enough to bring it within reach — the body adjusts instead of sliding:
 * - an arm bends the upper body at the waist (head, shoulders, both arms around the hips);
 * - a leg leans the whole body over the other, planted foot.
 * Returns null when no lean is needed or possible. Works in aspect-true space (`a`).
 */
function leanForPull(
  body: NormalizedBody,
  joint: number,
  to: { x: number; y: number },
  a: number
): NormalizedBody | null {
  const limb = LIMB_ROOT[joint];
  if (!limb) return null;
  const [rootIndex, plantedIndex] = limb;
  const pt = (i: number) => {
    const p = body[i];
    return p ? { x: p.x * a, y: p.y } : null;
  };
  const root = pt(rootIndex);
  if (!root) return null;
  const end = joint === 4 || joint === 7 || joint === 10 || joint === 13;
  const span = (i: number, j: number) => {
    const p = pt(i);
    const q = pt(j);
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  };
  const mid = end ? PARENT[joint]! : joint;
  const reach = end
    ? span(rootIndex, mid) + span(mid, joint)
    : span(rootIndex, joint) + PULL_SLACK * 4;
  const target = { x: to.x * a, y: to.y };
  if (Math.hypot(target.x - root.x, target.y - root.y) <= reach + (end ? PULL_SLACK : 0)) {
    return null;
  }

  let pivot: { x: number; y: number } | null;
  let moves: (i: number) => boolean;
  let limit: number;
  if (plantedIndex == null) {
    const hips = [pt(8), pt(11)].filter(Boolean) as Array<{ x: number; y: number }>;
    pivot = hips.length
      ? {
          x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
          y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
        }
      : null;
    moves = i => UPPER_BODY.has(i);
    limit = Math.PI / 2;
  } else {
    pivot = pt(plantedIndex);
    // Everything leans over the planted foot as one piece; the pulled leg is then re-posed.
    moves = () => true;
    limit = Math.PI / 4;
  }
  if (!pivot) return null;

  // Where on its circle around the pivot must the root sit to be exactly `reach` from the target?
  const radius = Math.hypot(root.x - pivot.x, root.y - pivot.y);
  const dx = target.x - pivot.x;
  const dy = target.y - pivot.y;
  const distance = Math.hypot(dx, dy);
  if (radius < 1e-6 || distance < 1e-6) return null;
  const current = Math.atan2(root.y - pivot.y, root.x - pivot.x);
  const toward = Math.atan2(dy, dx);
  const cosOffset =
    (radius * radius + distance * distance - reach * reach) / (2 * radius * distance);
  // Out of range even at full lean → point straight at the target.
  const offset = cosOffset >= 1 ? 0 : cosOffset <= -1 ? Math.PI : Math.acos(cosOffset);
  const wrap = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
  const options = [wrap(toward + offset - current), wrap(toward - offset - current)];
  const least = Math.abs(options[0]!) <= Math.abs(options[1]!) ? options[0]! : options[1]!;
  const rotated = (angle: number) => {
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    return body.map((p, i) => {
      if (!p || !moves(i)) return p;
      const rx = p.x * a - pivot.x;
      const ry = p.y - pivot.y;
      return { x: (pivot.x + rx * c - ry * sn) / a, y: pivot.y + rx * sn + ry * c };
    });
  };
  // Lean only as far as keeps the whole figure on the canvas.
  let angle = Math.max(-limit, Math.min(limit, least));
  for (let tries = 0; tries < 14; tries += 1) {
    if (Math.abs(angle) < 1e-4) return null;
    const next = rotated(angle);
    if (next.every(p => !p || (p.x >= 0.01 && p.x <= 0.99 && p.y >= 0.01 && p.y <= 0.99))) {
      return next;
    }
    angle *= 0.8;
  }
  return null;
}

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
 * the neck and carries its limb; the neck bends the upper body at the waist. A limb pulled past
 * its reach makes the rest of the body lean toward it (see leanForPull) — nothing slides. `aspect` (width / height) makes lengths true on screen.
 */
export function moveJointRigid(
  bodies: NormalizedBody[],
  person: number,
  joint: number,
  to: { x: number; y: number },
  aspect: number,
  /** Internal: the body has already leaned for this pull. */
  leaned = false
): NormalizedBody[] {
  const body = bodies[person];
  const from = body?.[joint];
  if (!body || !from) return bodies;
  const a = aspect > 0 ? aspect : 1;
  const parentIndex = PARENT[joint];
  const parent = parentIndex == null ? null : body[parentIndex];
  const replace = (next: NormalizedBody) => bodies.map((b, i) => (i === person ? next : b));

  // A limb pulled past its reach: the body leans to let it get there, feet planted.
  if (!leaned) {
    const adjusted = leanForPull(body, joint, to, a);
    if (adjusted) {
      return moveJointRigid(replace(adjusted), person, joint, to, aspect, true);
    }
  }

  if (joint === 1) {
    // The neck bends the figure at the waist: head, shoulders and arms swing around the middle
    // of the hips, the legs stay where they are.
    const hips = [body[8], body[11]].filter(Boolean) as Array<{ x: number; y: number }>;
    if (hips.length === 0) return moveWholeBody(bodies, person, to.x - from.x, to.y - from.y);
    const pivot = {
      x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
      y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
    };
    const fx = (from.x - pivot.x) * a;
    const fy = from.y - pivot.y;
    const gx = (to.x - pivot.x) * a;
    const gy = to.y - pivot.y;
    if (Math.hypot(fx, fy) < 1e-6 || Math.hypot(gx, gy) < 1e-6) return bodies;
    const angle = Math.atan2(gy, gx) - Math.atan2(fy, fx);
    const c = Math.cos(angle);
    const sn = Math.sin(angle);
    return replace(
      body.map((p, i) => {
        if (!p || !UPPER_BODY.has(i)) return p;
        const rx = (p.x - pivot.x) * a;
        const ry = p.y - pivot.y;
        return { x: pivot.x + (rx * c - ry * sn) / a, y: pivot.y + rx * sn + ry * c };
      })
    );
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
    // + tilt brings the head toward the camera (leaning forward).
    [y, z] = [y * cp + z * sp, -y * sp + z * cp];
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

export type BodyFacing = {
  /** Unit chest normal: x to the viewer's right, y down the screen, z toward the camera. */
  normal: { x: number; y: number; z: number };
  /** Degrees the chest is turned from facing the camera: + toward the viewer's right. */
  turn: number;
  /** Degrees the chest tips: + leaning forward (chest toward the floor), − leaning back. */
  lean: number;
  /** In words, for the editor readout. */
  label: string;
};

/** Which way a figure's chest points, from its shoulders, hips and their depths. */
export function bodyFacing(
  body: NormalizedBody,
  depth: BodyDepth,
  aspect: number
): BodyFacing | null {
  const a = aspect > 0 ? aspect : 1;
  const at = (i: number) => {
    const p = body[i];
    return p ? { x: p.x * a, y: p.y, z: depth[i] ?? 0 } : null;
  };
  const [neck, rs, ls] = [at(1), at(2), at(5)];
  const hips = [at(8), at(11)].filter(Boolean) as Array<{ x: number; y: number; z: number }>;
  if (!neck || !rs || !ls || hips.length === 0) return null;
  const hip = {
    x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
    y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
    z: hips.reduce((sum, p) => sum + p.z, 0) / hips.length,
  };
  // Across (her right shoulder → left) × down (neck → hips) points out of the chest.
  const across = { x: ls.x - rs.x, y: ls.y - rs.y, z: ls.z - rs.z };
  const down = { x: hip.x - neck.x, y: hip.y - neck.y, z: hip.z - neck.z };
  const n = {
    x: across.y * down.z - across.z * down.y,
    y: across.z * down.x - across.x * down.z,
    z: across.x * down.y - across.y * down.x,
  };
  const size = Math.hypot(n.x, n.y, n.z);
  if (size < 1e-9) return null;
  const normal = { x: n.x / size, y: n.y / size, z: n.z / size };
  const turn = (Math.atan2(normal.x, normal.z) * 180) / Math.PI;
  const lean = (Math.asin(Math.max(-1, Math.min(1, normal.y))) * 180) / Math.PI;
  const round = (value: number) => Math.round(Math.abs(value) / 5) * 5;
  const side = turn > 0 ? 'your right' : 'your left';
  const facing =
    Math.abs(turn) < 12
      ? 'Facing you'
      : Math.abs(turn) > 168
        ? 'Back to you'
        : Math.abs(turn) < 78
          ? `Facing you, turned ${round(turn)}° to ${side}`
          : Math.abs(turn) <= 102
            ? `Side-on, facing ${side}`
            : `Back to you, turned ${round(180 - Math.abs(turn))}° to ${side}`;
  const tip =
    Math.abs(lean) < 8 ? '' : `, leaning ${lean > 0 ? 'forward' : 'back'} ${round(lean)}°`;
  return { normal, turn, lean, label: `${facing}${tip}` };
}

/**
 * Bend at the waist in 3D: the upper body (head, shoulders, arms) folds around the line through
 * the hips, toward where the chest points (`angle` > 0 = forward), the legs stay. Facing the
 * camera this foreshortens the torso; side-on it is a plain bow.
 */
export function bendBody(
  body: NormalizedBody,
  depth: BodyDepth,
  angle: number,
  aspect: number
): { body: NormalizedBody; depth: BodyDepth } {
  const a = aspect > 0 ? aspect : 1;
  const at = (i: number) => {
    const p = body[i];
    return p ? { x: p.x * a, y: p.y, z: depth[i] ?? 0 } : null;
  };
  const rh = at(8);
  const lh = at(11);
  if (!rh || !lh) return { body, depth };
  const pivot = { x: (rh.x + lh.x) / 2, y: (rh.y + lh.y) / 2, z: (rh.z + lh.z) / 2 };
  const size = Math.hypot(lh.x - rh.x, lh.y - rh.y, lh.z - rh.z);
  if (size < 1e-6) return { body, depth };
  const u = { x: (lh.x - rh.x) / size, y: (lh.y - rh.y) / size, z: (lh.z - rh.z) / size };
  // Rodrigues' rotation; a positive turn about (her right hip → left hip) tips the head back.
  const c = Math.cos(-angle);
  const sn = Math.sin(-angle);
  const nextDepth = [...depth];
  const next = body.map((p, i) => {
    const v = at(i);
    if (!p || !v || !UPPER_BODY.has(i)) return p;
    const r = { x: v.x - pivot.x, y: v.y - pivot.y, z: v.z - pivot.z };
    const dot = u.x * r.x + u.y * r.y + u.z * r.z;
    const cross = {
      x: u.y * r.z - u.z * r.y,
      y: u.z * r.x - u.x * r.z,
      z: u.x * r.y - u.y * r.x,
    };
    const out = {
      x: r.x * c + cross.x * sn + u.x * dot * (1 - c),
      y: r.y * c + cross.y * sn + u.y * dot * (1 - c),
      z: r.z * c + cross.z * sn + u.z * dot * (1 - c),
    };
    nextDepth[i] = pivot.z + out.z;
    return { x: clamp01((pivot.x + out.x) / a), y: clamp01(pivot.y + out.y) };
  });
  return { body: next, depth: nextDepth };
}
