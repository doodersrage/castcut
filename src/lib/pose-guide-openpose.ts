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

/** Design space every mannequin is authored in (normalized joints × these). */
export const POSE_DESIGN_WIDTH = 512;
export const POSE_DESIGN_HEIGHT = 768;

function toDesign(p: Point): Point {
  return { x: p.x * POSE_DESIGN_WIDTH, y: p.y * POSE_DESIGN_HEIGHT };
}

/**
 * Where the design space lands on the guide canvas: `canvas = design * scale + offset`.
 * Lets one mannequin fill a portrait, square or landscape guide (matching the Image 1 aspect
 * the still renders at) and zoom in for close-up / waist-up framing.
 */
export type PoseCanvas = {
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
};

export const DEFAULT_POSE_CANVAS: PoseCanvas = {
  width: POSE_DESIGN_WIDTH,
  height: POSE_DESIGN_HEIGHT,
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

/** A region of design space, in design pixels. */
export type PoseDesignRegion = { x0: number; y0: number; x1: number; y1: number };

const FULL_DESIGN_REGION: PoseDesignRegion = {
  x0: 0,
  y0: 0,
  x1: POSE_DESIGN_WIDTH,
  y1: POSE_DESIGN_HEIGHT,
};

/** Guide canvas size for an output aspect: long side 768, both sides multiples of 8. */
export function poseGuideCanvasSize(aspect?: { width: number; height: number } | null): {
  width: number;
  height: number;
} {
  const w = aspect?.width ?? 0;
  const h = aspect?.height ?? 0;
  if (!(w > 0 && h > 0)) {
    return { width: POSE_DESIGN_WIDTH, height: POSE_DESIGN_HEIGHT };
  }
  const long = 768;
  const snap = (n: number) => Math.max(64, Math.round(n / 8) * 8);
  return w >= h
    ? { width: long, height: snap((long * h) / w) }
    : { width: snap((long * w) / h), height: long };
}

/** Contain-fit a design region into a canvas, centered. */
export function resolvePoseCanvas(input: {
  width: number;
  height: number;
  region?: PoseDesignRegion | null;
}): PoseCanvas {
  const region = input.region ?? FULL_DESIGN_REGION;
  const regionW = Math.max(1, region.x1 - region.x0);
  const regionH = Math.max(1, region.y1 - region.y0);
  const fit = Math.min(input.width / regionW, input.height / regionH);
  return {
    width: input.width,
    height: input.height,
    scale: fit,
    offsetX: (input.width - regionW * fit) / 2 - region.x0 * fit,
    offsetY: (input.height - regionH * fit) / 2 - region.y0 * fit,
  };
}

function toCanvas(p: Point, canvas: PoseCanvas): Point {
  return { x: p.x * canvas.scale + canvas.offsetX, y: p.y * canvas.scale + canvas.offsetY };
}

function onCanvas(p: Point, canvas: PoseCanvas): boolean {
  const margin = 2;
  return (
    p.x >= -margin &&
    p.y >= -margin &&
    p.x <= canvas.width + margin &&
    p.y <= canvas.height + margin
  );
}

/**
 * Padded bounding box of the figures, in design pixels. Used instead of the full design canvas
 * when the guide is not portrait, so a square or landscape guide shows the people large rather
 * than a thin portrait column in the middle.
 */
export function poseFiguresRegion(figures: StickSkeleton[], pad = 0.12): PoseDesignRegion | null {
  const points = figures.flatMap(figure =>
    [
      figure.head,
      figure.neck,
      figure.pelvis,
      figure.lShoulder,
      figure.rShoulder,
      figure.lElbow,
      figure.rElbow,
      figure.lWrist,
      figure.rWrist,
      figure.lHip,
      figure.rHip,
      figure.lKnee,
      figure.rKnee,
      figure.lAnkle,
      figure.rAnkle,
    ].map(toDesign)
  );
  if (points.length === 0) return null;
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const padding = Math.max(x1 - x0, y1 - y0) * pad + 24;
  return { x0: x0 - padding, y0: y0 - padding, x1: x1 + padding, y1: y1 + padding };
}

/** Shot size the beat asks for; drives how far the guide zooms into a solo figure. */
export type PoseFraming = 'full' | 'three-quarter' | 'waist-up' | 'close-up';

/**
 * Framing named in the beat text. Only explicit shot words count — the default is a full-body
 * guide, since most beats are full or three-quarter stills and a crop can't be undone.
 */
export function resolvePoseFraming(text: string | null | undefined): PoseFraming {
  const hay = text?.trim() || '';
  if (!hay) return 'full';
  if (/\b(close[- ]?up|headshot|head\s+and\s+shoulders|face\s+shot|extreme\s+close)\b/i.test(hay)) {
    return 'close-up';
  }
  if (
    /\b(waist[- ]?up|half[- ]?body|medium\s+close|chest[- ]?up|selfie|bust\s+shot)\b/i.test(hay)
  ) {
    return 'waist-up';
  }
  if (/\b(three[- ]quarter|knees?[- ]up|thigh[- ]up|cowboy\s+shot)\b/i.test(hay)) {
    return 'three-quarter';
  }
  return 'full';
}

/**
 * Design region to show for a solo figure at a given framing, or null for full (use the whole
 * design canvas so layouts keep their authored placement).
 */
export function poseFramingRegion(
  figure: StickSkeleton,
  framing: PoseFraming
): PoseDesignRegion | null {
  if (framing === 'full') {
    return null;
  }
  const pts = [
    figure.head,
    figure.neck,
    figure.lShoulder,
    figure.rShoulder,
    figure.lElbow,
    figure.rElbow,
    figure.lWrist,
    figure.rWrist,
    figure.pelvis,
  ].map(toDesign);
  const head = toDesign(figure.head);
  const neck = toDesign(figure.neck);
  const pelvis = toDesign(figure.pelvis);
  const knees = [toDesign(figure.lKnee), toDesign(figure.rKnee)];
  const headR = Math.max(20, length(sub(head, neck)) * 0.7);
  const top = Math.min(...pts.map(p => p.y)) - headR * 1.2;
  const bottom =
    framing === 'close-up'
      ? neck.y + (pelvis.y - neck.y) * 0.45
      : framing === 'waist-up'
        ? pelvis.y + headR * 0.6
        : Math.max(...knees.map(p => p.y)) + headR * 0.5;
  const xs = pts.map(p => p.x);
  const pad = headR * 0.8;
  return { x0: Math.min(...xs) - pad, y0: top, x1: Math.max(...xs) + pad, y1: bottom };
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
export function inferPoseFacing(skeleton: StickSkeleton): PoseFacing {
  const width = POSE_DESIGN_WIDTH;
  const neck = toDesign(skeleton.neck);
  const pelvis = toDesign(skeleton.pelvis);
  const head = toDesign(skeleton.head);
  const lShoulder = toDesign(skeleton.lShoulder);
  const rShoulder = toDesign(skeleton.rShoulder);
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
  const wristX = (toDesign(skeleton.lWrist).x + toDesign(skeleton.rWrist).x) / 2;
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
  canvas: PoseCanvas = DEFAULT_POSE_CANVAS
): OpenPoseKeypoints {
  const facing = skeleton.facing ?? inferPoseFacing(skeleton);
  const P = toDesign;
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

  const design: Array<Point | null> = [
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
  // Joints cropped out by framing are simply absent, as in a detected crop.
  return design.map(p => {
    if (!p) return null;
    const c = toCanvas(p, canvas);
    return onCanvas(c, canvas) ? c : null;
  });
}

/** COCO hand-21 edges (controlnet_aux `draw_handpose`). */
export const OPENPOSE_HAND_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

function rotate(v: Point, radians: number): Point {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
}

/**
 * A relaxed open hand (21 keypoints) continuing the forearm, thumb on the body side.
 * Crude, but it tells the model where each hand is and which way it points — the part the
 * body map alone leaves to chance (self-touch, grips, hands on a partner).
 */
export function synthesizeHandKeypoints(elbow: Point, wrist: Point, bodyCenter: Point): Point[] {
  const e = toDesign(elbow);
  const w = toDesign(wrist);
  const center = toDesign(bodyCenter);
  const d = unit(sub(w, e), { x: 0, y: 1 });
  const forearm = length(sub(w, e));
  const H = Math.max(18, Math.min(80, forearm * 0.72));
  const n = { x: -d.y, y: d.x };
  const toCenter = sub(center, w);
  const m = n.x * toCenter.x + n.y * toCenter.y >= 0 ? 1 : -1;
  const medial = scale(n, m);
  const points: Point[] = [w];
  // Thumb: CMC near the wrist on the body side, angled out.
  const thumbDir = unit(rotate(d, 0.75 * m), d);
  let joint = add(w, add(scale(d, 0.12 * H), scale(medial, 0.14 * H)));
  points.push(joint);
  for (const seg of [0.22, 0.18, 0.15]) {
    joint = add(joint, scale(thumbDir, seg * H));
    points.push(joint);
  }
  // Index → pinky: MCPs across the palm, fingers fanned slightly.
  const fingers: Array<{ lateral: number; angle: number; len: number }> = [
    { lateral: 0.13, angle: 0.2, len: 0.95 },
    { lateral: 0.04, angle: 0.05, len: 1 },
    { lateral: -0.05, angle: -0.08, len: 0.95 },
    { lateral: -0.14, angle: -0.22, len: 0.8 },
  ];
  for (const finger of fingers) {
    const dir = unit(rotate(d, finger.angle * m), d);
    let at = add(w, add(scale(d, 0.45 * H), scale(medial, finger.lateral * H)));
    points.push(at);
    for (const seg of [0.24, 0.16, 0.13]) {
      at = add(at, scale(dir, seg * H * finger.len));
      points.push(at);
    }
  }
  return points;
}

/** One person on the map: body (COCO-18) plus optional hands (21 each), all canvas pixels. */
export type OpenPosePerson = {
  body: OpenPoseKeypoints;
  lHand?: Array<Point | null>;
  rHand?: Array<Point | null>;
};

/** Body + (optionally) hands for one mannequin on a canvas. */
export function stickToOpenPosePerson(
  skeleton: StickSkeleton,
  canvas: PoseCanvas = DEFAULT_POSE_CANVAS,
  options?: { hands?: boolean }
): OpenPosePerson {
  const body = stickToOpenPoseKeypoints(skeleton, canvas);
  if (!options?.hands) {
    return { body };
  }
  const center = {
    x: (skeleton.neck.x + skeleton.pelvis.x) / 2,
    y: (skeleton.neck.y + skeleton.pelvis.y) / 2,
  };
  const mapHand = (elbow: Point, wrist: Point) =>
    synthesizeHandKeypoints(elbow, wrist, center).map(p => {
      const c = toCanvas(p, canvas);
      return onCanvas(c, canvas) ? c : null;
    });
  // Match the body's R/L assignment: camera-facing R* is our image-left arm.
  const back = (skeleton.facing ?? inferPoseFacing(skeleton)) === 'back';
  const imageLeft = mapHand(skeleton.lElbow, skeleton.lWrist);
  const imageRight = mapHand(skeleton.rElbow, skeleton.rWrist);
  return back
    ? { body, rHand: imageRight, lHand: imageLeft }
    : { body, rHand: imageLeft, lHand: imageRight };
}

function rgb(color: readonly [number, number, number], factor = 1): string {
  const [r, g, b] = color.map(c => Math.round(c * factor));
  return `rgb(${r}, ${g}, ${b})`;
}

function hsvToRgb(h: number): [number, number, number] {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const q = 1 - f;
  const table: Array<[number, number, number]> = [
    [1, f, 0],
    [q, 1, 0],
    [0, 1, f],
    [0, q, 1],
    [f, 0, 1],
    [1, 0, q],
  ];
  const [r, g, b] = table[((i % 6) + 6) % 6]!;
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Paint people as an OpenPose map on black, same look as controlnet_aux: body limbs as
 * ellipses at 60% color with full-color joints; hands as rainbow edges with blue joints.
 */
export function drawOpenPosePeople(
  ctx: CanvasRenderingContext2D,
  people: OpenPosePerson[],
  width: number,
  height: number
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);
  const stickWidth = Math.max(3, Math.round(Math.min(width, height) / 128));
  const jointRadius = stickWidth;
  for (const person of people) {
    const keypoints = person.body;
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
    for (const hand of [person.lHand, person.rHand]) {
      if (!hand) continue;
      const lineWidth = Math.max(2, Math.round(stickWidth * 0.5));
      OPENPOSE_HAND_EDGES.forEach(([from, to], index) => {
        const a = hand[from];
        const b = hand[to];
        if (!a || !b) return;
        const [r, g, bl] = hsvToRgb(index / OPENPOSE_HAND_EDGES.length);
        ctx.strokeStyle = `rgb(${r}, ${g}, ${bl})`;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.fillStyle = 'rgb(0, 0, 255)';
      for (const kp of hand) {
        if (!kp) continue;
        ctx.beginPath();
        ctx.arc(kp.x, kp.y, Math.max(2, lineWidth + 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

/** Draw mannequins as an OpenPose map (body only unless `hands`). */
export function drawOpenPoseFigures(
  ctx: CanvasRenderingContext2D,
  figures: StickSkeleton[],
  canvas: PoseCanvas = DEFAULT_POSE_CANVAS,
  options?: { hands?: boolean }
): OpenPosePerson[] {
  const people = figures.map(figure => stickToOpenPosePerson(figure, canvas, options));
  drawOpenPosePeople(ctx, people, canvas.width, canvas.height);
  return people;
}

/** Where the lead skeleton sits relative to the others — used to name it in the prompt. */
export type PoseLeadPosition = 'left' | 'right' | 'center' | 'upper' | 'lower';

function bodyCentroid(body: OpenPoseKeypoints): Point | null {
  // Neck, shoulders, hips — the torso, which every layout keeps on canvas.
  const joints = [1, 2, 5, 8, 11].map(index => body[index]).filter((p): p is Point => Boolean(p));
  if (joints.length === 0) return null;
  const sum = joints.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return scale(sum, 1 / joints.length);
}

/**
 * Name the lead (people[0]) by position, since OpenPose colors are per-limb, not per-person.
 * Picks the axis with the larger pixel separation so stacked sex layouts read as upper/lower
 * and side-by-side layouts as left/right.
 */
export function resolvePoseLeadPosition(people: OpenPoseKeypoints[]): PoseLeadPosition | null {
  if (people.length < 2) {
    return null;
  }
  const centers = people.map(bodyCentroid);
  const lead = centers[0];
  const others = centers.slice(1).filter((c): c is Point => Boolean(c));
  if (!lead || others.length === 0) {
    return null;
  }
  const meanOther = scale(
    others.reduce((acc, p) => add(acc, p), { x: 0, y: 0 }),
    1 / others.length
  );
  const dx = lead.x - meanOther.x;
  const dy = lead.y - meanOther.y;
  if (people.length >= 3 && Math.abs(dx) >= Math.abs(dy)) {
    const xs = [lead, ...others].map(c => c.x).sort((a, b) => a - b);
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
