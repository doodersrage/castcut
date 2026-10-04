/**
 * Reference skeletons from sources other than photos (pure): the two mappings the pose-reference
 * harvesters (`scripts/pose-refs/mocap.py`, `coco.py`) run through the bridge so the app's own
 * code decides what a body looks like.
 *
 * - COCO person keypoints (17 points, `[x, y, v]` triples) → the app's COCO-18 / OpenPose body,
 *   with the neck as the shoulder midpoint, the way DWPose reports one.
 * - A 3D skeleton (motion capture, metres, Y up) → that body as a perspective camera would see
 *   it from a chosen view, with joints hidden behind the torso, the head or a limb marked low
 *   confidence the way a 2D detector reads them (hidden behind the torso: guessed at best).
 *
 * Both return a confidence per joint so the harvester can apply the photo harvest's own
 * full-body rule (every major joint ≥ 0.45) instead of a second one.
 */

import type { NormalizedBody } from '@/lib/pose-library';

export type Point3 = readonly [number, number, number];

/** COCO-17 keypoint order, as the annotations list them. */
export const COCO17_NAMES = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
] as const;

/** For each COCO-18 joint, the COCO-17 keypoint it is (−1: the neck, a shoulder midpoint). */
export const BODY18_FROM_COCO17: readonly number[] = [
  0, // nose
  -1, // neck
  6, // right shoulder
  8, // right elbow
  10, // right wrist
  5, // left shoulder
  7, // left elbow
  9, // left wrist
  12, // right hip
  14, // right knee
  16, // right ankle
  11, // left hip
  13, // left knee
  15, // left ankle
  2, // right eye
  1, // left eye
  4, // right ear
  3, // left ear
];

/** A COCO keypoint labelled but hidden (`v = 1`) reads at this confidence; visible (`v = 2`) at 1. */
export const COCO_OCCLUDED_CONFIDENCE = 0.5;

export type MappedBody = {
  /** 0–1 of the frame; null where the source has no point. */
  body: NormalizedBody;
  /** Per joint, 0 where the body has no point. */
  confidence: number[];
};

/**
 * COCO person keypoints (`[x, y, v] × 17`, pixels) as the app's body, 0–1 of `frame` (the crop
 * the skeleton is normalized to). The neck is the shoulder midpoint when both shoulders are
 * labelled, at the lower of their confidences.
 */
export function cocoKeypointsToBody(
  keypoints: readonly number[],
  frame: { x: number; y: number; width: number; height: number }
): MappedBody | null {
  if (keypoints.length !== 51 || !(frame.width > 0) || !(frame.height > 0)) return null;
  const point = (index: number) => {
    const v = keypoints[index * 3 + 2]!;
    if (v <= 0) return null;
    return {
      x: (keypoints[index * 3]! - frame.x) / frame.width,
      y: (keypoints[index * 3 + 1]! - frame.y) / frame.height,
      confidence: v >= 2 ? 1 : COCO_OCCLUDED_CONFIDENCE,
    };
  };
  const body: NormalizedBody = [];
  const confidence: number[] = [];
  for (const source of BODY18_FROM_COCO17) {
    let mapped: { x: number; y: number; confidence: number } | null;
    if (source === -1) {
      const left = point(5);
      const right = point(6);
      mapped =
        left && right
          ? {
              x: (left.x + right.x) / 2,
              y: (left.y + right.y) / 2,
              confidence: Math.min(left.confidence, right.confidence),
            }
          : null;
    } else {
      mapped = point(source);
    }
    body.push(mapped ? { x: round(mapped.x), y: round(mapped.y) } : null);
    confidence.push(mapped ? mapped.confidence : 0);
  }
  return { body, confidence };
}

// --- 3D → 2D ----------------------------------------------------------------------------------

export type Skeleton3D = {
  /** COCO-18 joints in metres, Y up; null where the capture has none. */
  joints: ReadonlyArray<Point3 | null>;
  /** Top of the head and the skull's base, for the head's volume. */
  headTop?: Point3;
  headBase?: Point3;
};

export type CameraView = {
  /**
   * Where the camera stands around the lead, degrees: 0 straight in front (the face toward the
   * camera), positive toward the lead's left, ±90 side on, 180 behind.
   */
  azimuthDeg: number;
  /** Camera height, degrees above the lead's centre (a little high looks down at a floor pose). */
  elevationDeg?: number;
  /** Camera distance, metres (closer = more perspective). */
  distance?: number;
};

export type ProjectedSkeletons = {
  /** Bodies 0–1 of the crop, in the order given. */
  people: NormalizedBody[];
  /** Per body, per joint: 1 in the clear, lower behind something, 0 missing. */
  confidence: number[][];
  /** Crop width / height. */
  aspect: number;
  /** Views the camera stood at (as given, for the record). */
  view: Required<CameraView>;
};

/** Behind the torso or the head: a detector only guesses it. */
export const HIDDEN_BY_BODY_CONFIDENCE = 0.3;
/** A shoulder or hip behind the torso (a side view): read from the near side, less surely. */
export const HIDDEN_PAIR_CONFIDENCE = 0.5;
/** Behind an arm or a leg: thin, usually still read. */
export const HIDDEN_BY_LIMB_CONFIDENCE = 0.55;

const DEFAULT_DISTANCE_M = 3.5;
const DEFAULT_ELEVATION_DEG = 8;
/** The crop around the people, shares of their span (as the photo harvest crops). */
const CROP_SIDE = 0.12;
const CROP_TOP = 0.16;
const CROP_BOTTOM = 0.08;

const TORSO_PAIR = new Set([2, 5, 8, 11]);

type Capsule = {
  a: Point3;
  b: Point3;
  radius: number;
  owner: number;
  kind: 'torso' | 'head' | 'limb';
  /** The owner's joints this volume never hides (the limb's own ends). */
  joints: Set<number>;
  /** A joint is hidden when the ray enters the volume this share of the radius before it. */
  tolerance: number;
};

const sub = (a: Point3, b: Point3): Point3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Point3, b: Point3): Point3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Point3, s: number): Point3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Point3, b: Point3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point3, b: Point3): Point3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Point3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Point3): Point3 => {
  const n = norm(a);
  return n > 1e-9 ? scale(a, 1 / n) : [0, 0, 0];
};
const mean3 = (points: Point3[]): Point3 =>
  scale(
    points.reduce((sum, p) => add(sum, p), [0, 0, 0] as Point3),
    1 / Math.max(1, points.length)
  );
const round = (value: number) => Math.round(value * 10000) / 10000;

/**
 * Which way the body faces, horizontal unit vector: perpendicular to the hip line (else the
 * shoulder line), on the side the nose points to.
 */
export function skeletonFacing(skeleton: Skeleton3D): Point3 {
  const j = skeleton.joints;
  const pair = j[8] && j[11] ? [j[8], j[11]] : j[2] && j[5] ? [j[2], j[5]] : null;
  if (!pair) return [0, 0, 1];
  // Her left side is at the right of her forward direction: forward = (left − right) × up.
  const across: Point3 = [pair[1]![0] - pair[0]![0], 0, pair[1]![2] - pair[0]![2]];
  let forward = unit(cross(across, [0, 1, 0]));
  if (norm(forward) < 1e-6) return [0, 0, 1];
  // A twisted torso: trust the nose over the hips when they disagree outright.
  const neck = j[1];
  const nose = j[0];
  if (neck && nose) {
    const toNose = unit([nose[0] - neck[0], 0, nose[2] - neck[2]]);
    if (norm(toNose) > 0 && dot(toNose, forward) < -0.3) forward = scale(forward, -1);
  }
  return forward;
}

function volumesOf(skeleton: Skeleton3D, owner: number): Capsule[] {
  const j = skeleton.joints;
  const out: Capsule[] = [];
  const neck = j[1] ?? (j[2] && j[5] ? mean3([j[2], j[5]]) : null);
  const hip = j[8] && j[11] ? mean3([j[8], j[11]]) : (j[8] ?? j[11]);
  if (neck && hip) {
    const width = j[2] && j[5] ? norm(sub(j[2], j[5])) : 0.36;
    // Shoulders and hips sit on the torso's surface: the near ones stay clear, the far ones
    // (a side view) fall behind it.
    out.push({
      a: neck,
      b: hip,
      radius: Math.max(0.1, 0.42 * width),
      owner,
      kind: 'torso',
      joints: new Set([1]),
      tolerance: 0.5,
    });
  }
  const top = skeleton.headTop;
  const base = skeleton.headBase ?? neck;
  if (top && base) {
    const centre = mean3([top, base]);
    const radius = Math.max(0.08, 0.55 * norm(sub(top, base)));
    // The face sits on the front of the skull: seen from behind the nose and eyes are gone,
    // the ears (on its sides) just about stay.
    out.push({
      a: centre,
      b: centre,
      radius,
      owner,
      kind: 'head',
      joints: new Set([1]),
      tolerance: 0.85,
    });
  }
  const limbs: Array<[number, number, number]> = [
    [2, 3, 0.045],
    [3, 4, 0.04],
    [5, 6, 0.045],
    [6, 7, 0.04],
    [8, 9, 0.075],
    [9, 10, 0.055],
    [11, 12, 0.075],
    [12, 13, 0.055],
  ];
  for (const [from, to, radius] of limbs) {
    const a = j[from];
    const b = j[to];
    if (a && b) {
      out.push({ a, b, radius, owner, kind: 'limb', joints: new Set([from, to]), tolerance: 0.5 });
    }
  }
  return out;
}

/** Closest approach between the ray `origin + t·dir` (t ≥ 0) and the segment a–b. */
function rayToSegment(
  origin: Point3,
  dir: Point3,
  a: Point3,
  b: Point3
): { distance: number; t: number } {
  const ab = sub(b, a);
  const abLen2 = dot(ab, ab);
  if (abLen2 < 1e-12) {
    // A point: project onto the ray.
    const t = Math.max(0, dot(sub(a, origin), dir));
    const closest = add(origin, scale(dir, t));
    return { distance: norm(sub(closest, a)), t };
  }
  // Minimize |origin + t·dir − (a + s·ab)| over t ≥ 0, 0 ≤ s ≤ 1 (iterate the two clamps).
  let s = 0.5;
  let t = 0;
  for (let i = 0; i < 6; i += 1) {
    const target = add(a, scale(ab, s));
    t = Math.max(0, dot(sub(target, origin), dir));
    const onRay = add(origin, scale(dir, t));
    s = Math.max(0, Math.min(1, dot(sub(onRay, a), ab) / abLen2));
  }
  const target = add(a, scale(ab, s));
  const onRay = add(origin, scale(dir, t));
  return { distance: norm(sub(onRay, target)), t };
}

/**
 * Project 3D skeletons (the lead first) onto a camera standing `view` around the lead, and crop
 * to the people as the photo harvest does. Null when the lead has no torso to aim at.
 */
export function projectSkeletons(
  skeletons: readonly Skeleton3D[],
  view: CameraView
): ProjectedSkeletons | null {
  const lead = skeletons[0];
  if (!lead) return null;
  const all = skeletons.flatMap(s => s.joints.filter((p): p is Point3 => p !== null));
  if (all.length < 6) return null;
  const facing = skeletonFacing(lead);
  const up: Point3 = [0, 1, 0];
  const elevationDeg = view.elevationDeg ?? DEFAULT_ELEVATION_DEG;
  const distance = view.distance ?? DEFAULT_DISTANCE_M;
  const az = (view.azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  // Rotate the facing direction about Y by the azimuth (positive toward her left).
  const left = unit(cross(up, facing));
  const horizontal = add(scale(facing, Math.cos(az)), scale(left, Math.sin(az)));
  const target = mean3(all);
  const camera = add(
    target,
    scale(add(scale(horizontal, Math.cos(el)), scale(up, Math.sin(el))), distance)
  );
  const forward = unit(sub(target, camera));
  const right = unit(cross(forward, up));
  const cameraUp = cross(right, forward);
  const project = (p: Point3) => {
    const d = sub(p, camera);
    const depth = dot(d, forward);
    return { x: dot(d, right) / depth, y: -dot(d, cameraUp) / depth, depth };
  };

  const volumes = skeletons.flatMap((skeleton, owner) => volumesOf(skeleton, owner));
  const raw = skeletons.map((skeleton, owner) => {
    const body = skeleton.joints.map((joint, index) => {
      if (!joint) return null;
      const image = project(joint);
      if (image.depth <= 0.2) return null;
      const dir = unit(sub(joint, camera));
      const jointDepth = norm(sub(joint, camera));
      let confidence = 1;
      for (const volume of volumes) {
        if (volume.owner === owner && volume.joints.has(index)) continue;
        const hit = rayToSegment(camera, dir, volume.a, volume.b);
        if (hit.distance >= volume.radius) continue;
        // Behind it: the ray enters the volume well before reaching the joint.
        const entry = hit.t - Math.sqrt(volume.radius ** 2 - hit.distance ** 2);
        // Her own shoulders and hips sit on the torso: only one clean radius behind it counts.
        const tolerance =
          volume.kind === 'torso' && volume.owner === owner && TORSO_PAIR.has(index)
            ? 1
            : volume.tolerance;
        if (entry < jointDepth - volume.radius * tolerance) {
          const level =
            volume.kind === 'limb'
              ? HIDDEN_BY_LIMB_CONFIDENCE
              : volume.kind === 'torso' && TORSO_PAIR.has(index) && volume.owner === owner
                ? HIDDEN_PAIR_CONFIDENCE
                : HIDDEN_BY_BODY_CONFIDENCE;
          confidence = Math.min(confidence, level);
        }
      }
      return { ...image, confidence };
    });
    // The neck is the shoulder midpoint a detector derives: as sure as the shoulders are.
    const neck = body[1];
    if (neck && body[2] && body[5]) {
      neck.confidence = Math.min(body[2].confidence, body[5].confidence);
    }
    return body;
  });
  const seen = raw.flat().filter((p): p is NonNullable<typeof p> => p !== null);
  if (seen.length < 6) return null;
  const xs = seen.map(p => p.x);
  const ys = seen.map(p => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const span = Math.max(x1 - x0, y1 - y0);
  if (span < 1e-6) return null;
  const cropX = x0 - CROP_SIDE * span;
  const cropY = y0 - CROP_TOP * span;
  const width = x1 - x0 + 2 * CROP_SIDE * span;
  const height = y1 - y0 + (CROP_TOP + CROP_BOTTOM) * span;
  return {
    people: raw.map(body =>
      body.map(p =>
        p ? { x: round((p.x - cropX) / width), y: round((p.y - cropY) / height) } : null
      )
    ),
    confidence: raw.map(body => body.map(p => (p ? p.confidence : 0))),
    aspect: round(width / height),
    view: { azimuthDeg: view.azimuthDeg, elevationDeg, distance },
  };
}

/** Plain words for a camera view ("three-quarter view from her left"). */
export function cameraViewLabel(view: CameraView): string {
  const az = (((view.azimuthDeg % 360) + 540) % 360) - 180; // −180…180, her left positive
  const abs = Math.abs(az);
  const side = az > 0 ? 'her left' : 'her right';
  const where =
    abs < 20
      ? 'front view'
      : abs < 65
        ? `three-quarter view from ${side}`
        : abs < 115
          ? `side view from ${side}`
          : abs < 160
            ? `rear three-quarter view from ${side}`
            : 'back view';
  const high = (view.elevationDeg ?? DEFAULT_ELEVATION_DEG) >= 18 ? ', slightly high' : '';
  return `${where}${high}`;
}
