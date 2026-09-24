/**
 * OpenPose (COCO-18) rendering for Day / Story Image 3 pose guides.
 *
 * Qwen Image Edit 2509/2511 were trained on keypoint maps as a pose condition, so a standard
 * OpenPose render reads as "pose this person" instead of "copy this picture" — the custom
 * magenta capsules and gray outlines were the source of the schematic/morphsuit/ghost leaks.
 *
 * Keypoint order and limb colors match controlnet_aux `draw_bodypose` so the map looks exactly
 * like the preprocessor output the model saw in training.
 */

import type { StickSkeleton } from '@/lib/day-pose-guide';

type Point = { x: number; y: number };

/**
 * Which way the head points in the image. `front`/`back` are camera-facing / camera-away;
 * `left`/`right`/`up`/`down` are profile views with the nose toward that image edge.
 */
export type PoseFacing = 'front' | 'back' | 'left' | 'right' | 'up' | 'down';

/** COCO-18 keypoint indices (OpenPose body_18). */
export const OPENPOSE_KEYPOINT_NAMES = [
  'nose',
  'neck',
  'rShoulder',
  'rElbow',
  'rWrist',
  'lShoulder',
  'lElbow',
  'lWrist',
  'rHip',
  'rKnee',
  'rAnkle',
  'lHip',
  'lKnee',
  'lAnkle',
  'rEye',
  'lEye',
  'rEar',
  'lEar',
] as const;

/** Limb pairs as 0-based keypoint indices (controlnet_aux limbSeq minus the unused ear→shoulder pair). */
export const OPENPOSE_LIMBS: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 5],
  [2, 3],
  [3, 4],
  [5, 6],
  [6, 7],
  [1, 8],
  [8, 9],
  [9, 10],
  [1, 11],
  [11, 12],
  [12, 13],
  [1, 0],
  [0, 14],
  [14, 16],
  [0, 15],
  [15, 17],
];

export const OPENPOSE_COLORS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 0, 0],
  [255, 85, 0],
  [255, 170, 0],
  [255, 255, 0],
  [170, 255, 0],
  [85, 255, 0],
  [0, 255, 0],
  [0, 255, 85],
  [0, 255, 170],
  [0, 255, 255],
  [0, 170, 255],
  [0, 85, 255],
  [0, 0, 255],
  [85, 0, 255],
  [170, 0, 255],
  [255, 0, 255],
  [255, 0, 170],
  [255, 0, 85],
];

/** 18 keypoints in pixel space; `null` = not visible (hidden eye/ear, nose on a back view). */
export type OpenPoseKeypoints = Array<Point | null>;

function sub(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function add(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

function scale(a: Point, s: number): Point {
  return { x: a.x * s, y: a.y * s };
}

function length(a: Point): number {
  return Math.hypot(a.x, a.y);
}

function unit(a: Point, fallback: Point): Point {
  const len = length(a);
  return len < 1e-6 ? fallback : scale(a, 1 / len);
}

function toPixels(p: Point, width: number, height: number): Point {
  return { x: p.x * width, y: p.y * height };
}

const FACING_VECTORS: Record<'left' | 'right' | 'up' | 'down', Point> = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

/**
 * Best guess at head direction from joint geometry, for figures that don't set `facing`.
 * Wide shoulders = camera-facing (also covers top-down lying figures); narrow shoulders =
 * profile, pointed the way the hands reach (or the head tips on a bent-over torso).
 */
export function inferPoseFacing(skeleton: StickSkeleton, width = 512, height = 768): PoseFacing {
  const neck = toPixels(skeleton.neck, width, height);
  const pelvis = toPixels(skeleton.pelvis, width, height);
  const head = toPixels(skeleton.head, width, height);
  const lShoulder = toPixels(skeleton.lShoulder, width, height);
  const rShoulder = toPixels(skeleton.rShoulder, width, height);
  const torso = sub(pelvis, neck);
  const torsoLen = Math.max(1, length(torso));
  const shoulderSpan = length(sub(rShoulder, lShoulder));
  if (shoulderSpan >= torsoLen * 0.42) {
    return 'front';
  }
  const horizontal = Math.abs(torso.x) > Math.abs(torso.y);
  if (horizontal) {
    // Bent-over / all-fours torso: the head leads, so profile toward the head end.
    return head.x < neck.x ? 'left' : 'right';
  }
  const wristX =
    (toPixels(skeleton.lWrist, width, height).x + toPixels(skeleton.rWrist, width, height).x) / 2;
  const reach = wristX - neck.x;
  if (Math.abs(reach) > width * 0.03) {
    return reach < 0 ? 'left' : 'right';
  }
  const tilt = head.x - neck.x;
  if (Math.abs(tilt) > width * 0.01) {
    return tilt < 0 ? 'left' : 'right';
  }
  return 'front';
}

export function mirrorPoseFacing(facing: PoseFacing | undefined): PoseFacing | undefined {
  if (facing === 'left') return 'right';
  if (facing === 'right') return 'left';
  return facing;
}

/**
 * Map the 15-joint mannequin to COCO-18 in pixel space.
 *
 * `StickSkeleton` l/r are image-left/right. A camera-facing person's right side is on the
 * image left, so OpenPose R* takes our l* — except on back views, where it flips. That swap
 * (plus which face points are drawn) is how OpenPose tells front from back.
 */
export function stickToOpenPoseKeypoints(
  skeleton: StickSkeleton,
  width = 512,
  height = 768
): OpenPoseKeypoints {
  const facing = skeleton.facing ?? inferPoseFacing(skeleton, width, height);
  const P = (p: Point) => toPixels(p, width, height);
  const back = facing === 'back';
  const imageLeft = {
    shoulder: P(skeleton.lShoulder),
    elbow: P(skeleton.lElbow),
    wrist: P(skeleton.lWrist),
    hip: P(skeleton.lHip),
    knee: P(skeleton.lKnee),
    ankle: P(skeleton.lAnkle),
  };
  const imageRight = {
    shoulder: P(skeleton.rShoulder),
    elbow: P(skeleton.rElbow),
    wrist: P(skeleton.rWrist),
    hip: P(skeleton.rHip),
    knee: P(skeleton.rKnee),
    ankle: P(skeleton.rAnkle),
  };
  const right = back ? imageRight : imageLeft;
  const left = back ? imageLeft : imageRight;

  const head = P(skeleton.head);
  const neck = P(skeleton.neck);
  // Head axis (neck → crown) and its image-left perpendicular for an upright front view.
  const axis = unit(sub(head, neck), { x: 0, y: -1 });
  const perp = { x: axis.y, y: -axis.x };
  const radius = Math.max(8, Math.min(40, length(sub(head, neck)) * 0.5));

  let nose: Point | null = null;
  let rEye: Point | null = null;
  let lEye: Point | null = null;
  let rEar: Point | null = null;
  let lEar: Point | null = null;

  if (facing === 'front') {
    nose = add(head, scale(axis, -0.05 * radius));
    rEye = add(head, add(scale(axis, 0.28 * radius), scale(perp, 0.38 * radius)));
    lEye = add(head, add(scale(axis, 0.28 * radius), scale(perp, -0.38 * radius)));
    rEar = add(head, add(scale(axis, 0.12 * radius), scale(perp, 0.85 * radius)));
    lEar = add(head, add(scale(axis, 0.12 * radius), scale(perp, -0.85 * radius)));
  } else if (back) {
    // Back of the head: ears only, person's right on the image right.
    rEar = add(head, add(scale(axis, 0.12 * radius), scale(perp, -0.8 * radius)));
    lEar = add(head, add(scale(axis, 0.12 * radius), scale(perp, 0.8 * radius)));
  } else {
    const dir = FACING_VECTORS[facing];
    nose = add(head, scale(dir, 0.85 * radius));
    const eye = add(head, add(scale(dir, 0.5 * radius), scale(axis, 0.28 * radius)));
    const ear = add(head, add(scale(dir, -0.28 * radius), scale(axis, 0.12 * radius)));
    // Turning an upright camera-facing body to face image-right shows its right side;
    // the cross product generalizes that to lying / tilted heads.
    const rightSideVisible = axis.x * dir.y - axis.y * dir.x > 0;
    if (rightSideVisible) {
      rEye = eye;
      rEar = ear;
    } else {
      lEye = eye;
      lEar = ear;
    }
  }

  return [
    nose,
    neck,
    right.shoulder,
    right.elbow,
    right.wrist,
    left.shoulder,
    left.elbow,
    left.wrist,
    right.hip,
    right.knee,
    right.ankle,
    left.hip,
    left.knee,
    left.ankle,
    rEye,
    lEye,
    rEar,
    lEar,
  ];
}

function rgb(color: readonly [number, number, number], factor = 1): string {
  const [r, g, b] = color.map(c => Math.round(c * factor));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Draw figures as an OpenPose body map on black, same look as controlnet_aux:
 * limbs as ellipses at 60% color, joints as full-color dots on top.
 */
export function drawOpenPoseFigures(
  ctx: CanvasRenderingContext2D,
  figures: StickSkeleton[],
  width = 512,
  height = 768
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  const stickWidth = Math.max(3, Math.round(Math.min(width, height) / 128));
  const jointRadius = stickWidth;
  for (const figure of figures) {
    const keypoints = stickToOpenPoseKeypoints(figure, width, height);
    OPENPOSE_LIMBS.forEach(([from, to], index) => {
      const a = keypoints[from];
      const b = keypoints[to];
      if (!a || !b) {
        return;
      }
      const mid = scale(add(a, b), 0.5);
      const len = length(sub(b, a));
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      ctx.fillStyle = rgb(OPENPOSE_COLORS[index]!, 0.6);
      ctx.beginPath();
      ctx.ellipse(mid.x, mid.y, len / 2, stickWidth, angle, 0, Math.PI * 2);
      ctx.fill();
    });
    keypoints.forEach((kp, index) => {
      if (!kp) {
        return;
      }
      ctx.fillStyle = rgb(OPENPOSE_COLORS[index]!);
      ctx.beginPath();
      ctx.arc(kp.x, kp.y, jointRadius, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

/** Where the lead skeleton sits relative to the others — used to name it in the prompt. */
export type PoseLeadPosition = 'left' | 'right' | 'center' | 'upper' | 'lower';

function centroid(skeleton: StickSkeleton, width: number, height: number): Point {
  const joints = [
    skeleton.head,
    skeleton.neck,
    skeleton.pelvis,
    skeleton.lShoulder,
    skeleton.rShoulder,
    skeleton.lHip,
    skeleton.rHip,
  ].map(p => toPixels(p, width, height));
  const sum = joints.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return scale(sum, 1 / joints.length);
}

/**
 * Name the lead (figures[0]) by position, since OpenPose colors are per-limb, not per-person.
 * Picks the axis with the larger pixel separation so stacked sex layouts read as upper/lower
 * and side-by-side layouts as left/right.
 */
export function resolvePoseLeadPosition(
  figures: StickSkeleton[],
  width = 512,
  height = 768
): PoseLeadPosition | null {
  if (figures.length < 2) {
    return null;
  }
  const centers = figures.map(figure => centroid(figure, width, height));
  const lead = centers[0]!;
  const others = centers.slice(1);
  const meanOther = scale(
    others.reduce((acc, p) => add(acc, p), { x: 0, y: 0 }),
    1 / others.length
  );
  const dx = lead.x - meanOther.x;
  const dy = lead.y - meanOther.y;
  if (figures.length >= 3 && Math.abs(dx) >= Math.abs(dy)) {
    const xs = centers.map(c => c.x).sort((a, b) => a - b);
    if (lead.x === xs[0]) return 'left';
    if (lead.x === xs[xs.length - 1]) return 'right';
    return 'center';
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'upper' : 'lower';
}

export function describePoseLeadPosition(position: PoseLeadPosition): string {
  switch (position) {
    case 'left':
      return 'leftmost';
    case 'right':
      return 'rightmost';
    case 'center':
      return 'middle';
    case 'upper':
      return 'upper (on top)';
    case 'lower':
      return 'lower (underneath)';
  }
}
