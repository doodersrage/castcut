/**
 * One-tap arm and leg positions for the pose editor ("Arms: on hips", "Legs: apart"), and
 * "match the other side". Dragging four joints to put both hands on the hips is the slow part
 * of posing by hand; these set a limb in one go and keep its bone lengths.
 *
 * Flat (in the picture plane): they place the limb as seen from the front. `aspect` is canvas
 * width / height, so lengths are true on screen.
 */

import type { NormalizedBody } from '@/lib/pose-library';

export type LimbSide = 'both' | 'right' | 'left';

export const ARM_PRESETS = [
  { id: 'sides', label: 'At sides' },
  { id: 'hips', label: 'On hips' },
  { id: 'crossed', label: 'Crossed' },
  { id: 'out', label: 'Out' },
  { id: 'up', label: 'Up' },
  { id: 'head', label: 'Behind head' },
  { id: 'wave', label: 'Wave' },
] as const;
export type ArmPresetId = (typeof ARM_PRESETS)[number]['id'];

export const LEG_PRESETS = [
  { id: 'together', label: 'Together' },
  { id: 'apart', label: 'Apart' },
  { id: 'wide', label: 'Wide' },
  { id: 'crossed', label: 'Crossed' },
  { id: 'knee', label: 'Knee up' },
] as const;
export type LegPresetId = (typeof LEG_PRESETS)[number]['id'];

type XY = { x: number; y: number };

/** COCO-18 joints of each limb: root, middle, end. */
const ARM = { right: [2, 3, 4], left: [5, 6, 7] } as const;
const LEG = { right: [8, 9, 10], left: [11, 12, 13] } as const;

const clamp = (value: number) => Math.min(0.99, Math.max(0.01, value));
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Screen-true distance between two normalized points. */
function span(a: XY, b: XY, aspect: number): number {
  return Math.hypot((a.x - b.x) * aspect, a.y - b.y);
}

/** A point `length` from `from`, at `angle` from straight down, swinging toward `out` (±1). */
function swing(from: XY, length: number, angle: number, out: number, aspect: number): XY {
  return {
    x: clamp(from.x + (Math.sin(rad(angle)) * out * length) / aspect),
    y: clamp(from.y + Math.cos(rad(angle)) * length),
  };
}

/** A point `length` from `from` toward `target` (never past it by more than the bone allows). */
function toward(from: XY, target: XY, length: number, aspect: number): XY {
  const dx = (target.x - from.x) * aspect;
  const dy = target.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  return {
    x: clamp(from.x + ((dx / distance) * length) / aspect),
    y: clamp(from.y + (dy / distance) * length),
  };
}

/**
 * Bend a two-bone limb so its end lands on `target` (or as near as the bones reach), with the
 * middle joint on the `out` side — elbows point away from the body.
 */
function reach(
  root: XY,
  target: XY,
  upper: number,
  lower: number,
  out: number,
  aspect: number,
  /** Which solution to take: the middle joint further out (elbows out), or the higher one. */
  prefer: 'out' | 'high' = 'out'
): { mid: XY; end: XY } {
  const dx = (target.x - root.x) * aspect;
  const dy = target.y - root.y;
  const wanted = Math.hypot(dx, dy) || 1e-6;
  const distance = Math.min(upper + lower - 1e-4, Math.max(Math.abs(upper - lower) + 1e-4, wanted));
  const ux = dx / wanted;
  const uy = dy / wanted;
  // Along the root → target line, then off it to the outward side.
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const off = Math.sqrt(Math.max(0, upper * upper - along * along));
  const candidates = [1, -1].map(sign => ({
    x: root.x + (ux * along - uy * off * sign) / aspect,
    y: root.y + uy * along + ux * off * sign,
  }));
  const mid = candidates.sort((a, b) => (prefer === 'high' ? a.y - b.y : (b.x - a.x) * out))[0]!;
  const end = {
    x: root.x + (ux * distance) / aspect,
    y: root.y + uy * distance,
  };
  return {
    mid: { x: clamp(mid.x), y: clamp(mid.y) },
    end: { x: clamp(end.x), y: clamp(end.y) },
  };
}

/** Which way is "away from the body" for a limb root, on screen. */
function outward(body: NormalizedBody, root: XY, fallback: number): number {
  const neck = body[1];
  const hips = [body[8], body[11]].filter(Boolean) as XY[];
  const middle =
    neck?.x ?? (hips.length ? hips.reduce((sum, p) => sum + p.x, 0) / hips.length : 0.5);
  const side = Math.sign(root.x - middle);
  return side || fallback;
}

function sides(side: LimbSide): Array<'right' | 'left'> {
  return side === 'both' ? ['right', 'left'] : [side];
}

/** Put one or both arms in a named position. Missing joints are left alone. */
export function applyArmPreset(
  body: NormalizedBody,
  preset: ArmPresetId,
  side: LimbSide,
  aspect: number
): NormalizedBody {
  const a = aspect > 0 ? aspect : 1;
  const next = body.map(point => (point ? { ...point } : null));
  for (const which of sides(side)) {
    const [rootIndex, midIndex, endIndex] = ARM[which];
    const root = next[rootIndex];
    const mid = next[midIndex];
    const end = next[endIndex];
    if (!root || !mid || !end) continue;
    const upper = span(root, mid, a) || 0.12;
    const fore = span(mid, end, a) || 0.11;
    // Their right is the picture's left when they face the camera.
    const out = outward(next, root, which === 'right' ? -1 : 1);
    const neck = next[1] ?? root;
    const hip = next[which === 'right' ? 8 : 11];
    const head = next[0] ?? neck;
    let elbow: XY;
    let wrist: XY;
    switch (preset) {
      case 'hips': {
        // Hands on the waist, a little above the hip joint, so the elbows stand out.
        const bent = hip
          ? reach(
              root,
              { x: hip.x + (out * 0.02) / a, y: neck.y + (hip.y - neck.y) * 0.78 },
              upper,
              fore,
              out,
              a
            )
          : null;
        elbow = bent?.mid ?? swing(root, upper, 40, out, a);
        wrist = bent?.end ?? swing(elbow, fore, -55, out, a);
        break;
      }
      case 'crossed': {
        // Forearm folds across the chest: the hand rests on the other upper arm.
        const torso = hip ? hip.y - neck.y : 0.3;
        const bent = reach(
          root,
          { x: neck.x - (out * 0.045) / a, y: neck.y + torso * 0.4 },
          upper,
          fore,
          out,
          a
        );
        elbow = bent.mid;
        wrist = bent.end;
        break;
      }
      case 'out':
        elbow = swing(root, upper, 88, out, a);
        wrist = swing(elbow, fore, 88, out, a);
        break;
      case 'up':
        // Elbows a little out: straight up runs off the top of a standing figure's canvas.
        elbow = swing(root, upper, 126, out, a);
        wrist = swing(elbow, fore, 178, out, a);
        break;
      case 'head': {
        // Elbows up and out, hands behind the head.
        const bent = reach(
          root,
          { x: head.x + (out * 0.025) / a, y: head.y + 0.01 },
          upper,
          fore,
          out,
          a,
          'high'
        );
        elbow = bent.mid;
        wrist = bent.end;
        break;
      }
      case 'wave':
        elbow = swing(root, upper, 98, out, a);
        wrist = swing(elbow, fore, 176, out, a);
        break;
      case 'sides':
      default:
        elbow = swing(root, upper, 7, out, a);
        wrist = swing(elbow, fore, 3, out, a);
        break;
    }
    next[midIndex] = { ...mid, ...elbow };
    next[endIndex] = { ...end, ...wrist };
  }
  return next;
}

/** Put one or both legs in a named position. "Knee up" on both lifts their right knee. */
export function applyLegPreset(
  body: NormalizedBody,
  preset: LegPresetId,
  side: LimbSide,
  aspect: number
): NormalizedBody {
  const a = aspect > 0 ? aspect : 1;
  const next = body.map(point => (point ? { ...point } : null));
  const which = preset === 'knee' && side === 'both' ? (['right'] as const) : sides(side);
  for (const leg of which) {
    const [rootIndex, midIndex, endIndex] = LEG[leg];
    const root = next[rootIndex];
    const mid = next[midIndex];
    const end = next[endIndex];
    if (!root || !mid || !end) continue;
    const thigh = span(root, mid, a) || 0.2;
    const shin = span(mid, end, a) || 0.2;
    const out = outward(next, root, leg === 'right' ? -1 : 1);
    const [upperAngle, lowerAngle] =
      preset === 'apart'
        ? [8, 7]
        : preset === 'wide'
          ? [30, 22]
          : preset === 'crossed'
            ? [-7, -22]
            : preset === 'knee'
              ? [78, -8]
              : [1, 0];
    const knee = swing(root, thigh, upperAngle, out, a);
    const ankle = swing(knee, shin, lowerAngle, out, a);
    next[midIndex] = { ...mid, ...knee };
    next[endIndex] = { ...end, ...ankle };
  }
  return next;
}

/**
 * Copy one arm or leg to the other side, mirrored across the body's middle — pose one arm by
 * hand, then match the other to it.
 */
export function matchLimb(
  body: NormalizedBody,
  limb: 'arm' | 'leg',
  from: 'right' | 'left'
): NormalizedBody {
  const next = body.map(point => (point ? { ...point } : null));
  const joints = limb === 'arm' ? ARM : LEG;
  const source = joints[from];
  const target = joints[from === 'right' ? 'left' : 'right'];
  const sourceRoot = next[source[0]];
  const targetRoot = next[target[0]];
  if (!sourceRoot || !targetRoot) return next;
  for (const index of [1, 2] as const) {
    const point = next[source[index]];
    const there = next[target[index]];
    if (!point || !there) continue;
    next[target[index]] = {
      ...there,
      x: clamp(targetRoot.x - (point.x - sourceRoot.x)),
      y: clamp(targetRoot.y + (point.y - sourceRoot.y)),
    };
  }
  return next;
}

/**
 * Leg positions are drawn for a figure on its feet. On a seated, kneeling or lying figure they
 * would straighten the legs and stand it up, so the editor offers them only when this is true.
 */
export function legsAreStanding(body: NormalizedBody, aspect: number): boolean {
  const a = aspect > 0 ? aspect : 1;
  const neck = body[1];
  return (['right', 'left'] as const).every(leg => {
    const [rootIndex, midIndex, endIndex] = LEG[leg];
    const hip = body[rootIndex];
    const knee = body[midIndex];
    const ankle = body[endIndex];
    if (!hip || !knee || !ankle) return false;
    const thigh = span(hip, knee, a) || 1;
    // Upright torso, thigh mostly downward, foot below the knee — or one knee raised.
    const torsoUpright = !neck || Math.abs((neck.x - hip.x) * a) < Math.abs(neck.y - hip.y);
    const thighDown = knee.y - hip.y > thigh * 0.55;
    return torsoUpright && (thighDown ? ankle.y > knee.y : true);
  })
    ? (['right', 'left'] as const).some(leg => {
        const hip = body[LEG[leg][0]];
        const knee = body[LEG[leg][1]];
        return Boolean(hip && knee && knee.y - hip.y > (span(hip, knee, a) || 1) * 0.55);
      })
    : false;
}
