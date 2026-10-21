/** The joint editor's fixed tables and pure helpers (names, hints, hit tests, backdrop fit). */
import type { NormalizedBody } from '@/lib/pose/library';
import type { BodyDepth } from '@/lib/pose/joint-edit';
import { ASSUMED_SUBJECT, subjectBoxFromPixels, type FitBox } from '@/lib/pose/fit';
import { poseStarterBody } from '@/lib/pose/starters';

/** The figures' names: the Cast is the lead (Image 1), the second figure their partner. */
export function figureName(person: number): string {
  return person === 0 ? 'Lead' : 'Partner';
}

/** Draggable joints: nose, neck, arms, legs (eyes / ears ride along with the nose). */
export const EDITABLE = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;
export const JOINT_NAMES: Record<number, string> = {
  0: 'head',
  1: 'neck — drag to bend at the waist',
  2: 'right shoulder',
  3: 'right elbow',
  4: 'right wrist',
  5: 'left shoulder',
  6: 'left elbow',
  7: 'left wrist',
  8: 'right hip',
  9: 'right knee',
  10: 'right ankle',
  11: 'left hip',
  12: 'left knee',
  13: 'left ankle',
};

export const JOINT_LABELS: Record<number, string> = {
  0: 'Head',
  1: 'Neck',
  2: 'Right shoulder',
  3: 'Right elbow',
  4: 'Right wrist',
  5: 'Left shoulder',
  6: 'Left elbow',
  7: 'Left wrist',
  8: 'Right hip',
  9: 'Right knee',
  10: 'Right ankle',
  11: 'Left hip',
  12: 'Left knee',
  13: 'Left ankle',
};

export const LIMB_ENDS = new Set([4, 7, 10, 13]);

/** The bone a joint swings on, used only to separate overlapping handles in side view. */
export const JOINT_PARENT: Record<number, number> = {
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
};

/**
 * Where a joint's handle is drawn. Side view stacks both arms, and a wrist on a hip, onto one
 * dot, so a click could only move one of them. Once the shoulders have come together, handles
 * in that pile step apart across the bone. Facing the camera, the handles stay on the joints.
 * The skeleton underneath is unchanged.
 */
export function handlePosition(
  body: NormalizedBody,
  joint: number,
  aspect: number
): { x: number; y: number } | null {
  const point = body[joint];
  if (!point) return null;
  const right = body[2];
  const left = body[5];
  const shoulders = right && left ? Math.hypot((right.x - left.x) * aspect, right.y - left.y) : 1;
  if (shoulders > 0.025) return { x: point.x, y: point.y };
  const cluster = EDITABLE.filter(other => {
    const there = body[other];
    return there != null && Math.hypot((there.x - point.x) * aspect, there.y - point.y) <= 0.028;
  });
  if (cluster.length < 2) return { x: point.x, y: point.y };
  const index = cluster.indexOf(joint as (typeof EDITABLE)[number]);
  const parent = body[JOINT_PARENT[joint] ?? 1] ?? point;
  const dx = (point.x - parent.x) * aspect;
  const dy = point.y - parent.y;
  const length = Math.hypot(dx, dy) || 1;
  const across = ((index - (cluster.length - 1) / 2) * 0.036) / length;
  return {
    x: point.x + (-dy * across) / aspect,
    y: point.y + dx * across,
  };
}

export function jointHint(joint: number): string {
  const name = JOINT_LABELS[joint] ?? 'Joint';
  if (LIMB_ENDS.has(joint)) return `${name} — the limb bends to follow`;
  if (joint === 1) return 'Neck — bends at the waist, legs stay planted';
  if (joint === 0) return 'Head';
  return `${name} — swings on its own`;
}

export type PoseHover =
  | { kind: 'idle' }
  | { kind: 'joint'; person: number; joint: number }
  | { kind: 'torso'; person: number }
  | { kind: 'spin' }
  | { kind: 'space' };

export function hoverKey(hover: PoseHover): string {
  if (hover.kind === 'joint') return `joint-${hover.person}-${hover.joint}`;
  if (hover.kind === 'torso') return `torso-${hover.person}`;
  return hover.kind;
}

export function pointInPolygon(
  x: number,
  y: number,
  polygon: Array<{ x: number; y: number }>
): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const crosses = a.y > y !== b.y > y;
    const xAt = ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1) + a.x;
    if (crosses && x < xAt) inside = !inside;
  }
  return inside;
}

export function distanceToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export type PoseSnapshot = { bodies: NormalizedBody[]; depths: Array<BodyDepth | null> };

/** What a drag on the canvas is doing. */
export type Drag =
  | { kind: 'joint'; person: number; joint: number; ox?: number; oy?: number }
  /** Grabbing the torso: moves the whole figure. */
  | { kind: 'body'; person: number; x: number; y: number }
  /** Background drag: sideways turns the figure, up / down tilts it. */
  | { kind: 'orbit'; person: number; x: number; y: number }
  /** The round handle above the head: spins the figure in the picture. */
  | { kind: 'spin'; person: number; angle: number };

/**
 * What is drawn behind the figure is a taste, not part of a pose: remembered across slots and
 * sessions, so the picture does not have to be switched off again for every pose.
 */
export const SHOW_BACKDROP_KEY = 'comfy-pose-editor-backdrop-v1';
export const SHOW_START_KEY = 'comfy-pose-editor-start-ghost-v1';
export const BACKDROP_OPACITY_KEY = 'comfy-pose-editor-backdrop-opacity-v1';
/** How strongly their picture shows through: faint by default, never solid (the figure must read). */
export const BACKDROP_OPACITY = { min: 0.1, max: 0.9, step: 0.05, initial: 0.3 } as const;

/** On unless switched off; private windows and blocked storage read as on. */
export function readShown(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

export function rememberShown(key: string, shown: boolean) {
  try {
    window.localStorage.setItem(key, shown ? '1' : '0');
  } catch {
    // Not remembered: the toggle still works for this session.
  }
}

export function readBackdropOpacity(): number {
  try {
    const value = Number(window.localStorage.getItem(BACKDROP_OPACITY_KEY));
    return value >= BACKDROP_OPACITY.min && value <= BACKDROP_OPACITY.max
      ? value
      : BACKDROP_OPACITY.initial;
  } catch {
    return BACKDROP_OPACITY.initial;
  }
}

export function rememberBackdropOpacity(value: number) {
  try {
    window.localStorage.setItem(BACKDROP_OPACITY_KEY, String(value));
  } catch {
    // Not remembered: the slider still works for this session.
  }
}

/** The face points (nose, eyes, ears): the Head chips move only these. */
export const FACE_JOINTS = new Set([0, 14, 15, 16, 17]);

/**
 * A figure's pose without its face, and its face alone: a Day pose keeps its own words while the
 * body is as picked, and a Head chip only adds to them.
 */
export const poseKey = (body: NormalizedBody) =>
  JSON.stringify(body.map((point, joint) => (FACE_JOINTS.has(joint) ? null : point)));
export const faceKey = (body: NormalizedBody) =>
  JSON.stringify(body.map((point, joint) => (FACE_JOINTS.has(joint) ? point : null)));

/**
 * Where the person stands in their picture (fractions of the picture) and its shape. Measured on
 * a small copy: plates on a flat ground give their pixel box; a picture that cannot be read back
 * (another origin taints the canvas), a busy photo, or one that will not load falls back to "the
 * whole height, centred".
 */
export function measureBackdrop(url: string): Promise<{ box: FitBox; aspect: number | null }> {
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      const aspect =
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : null;
      try {
        const longest = Math.max(image.naturalWidth, image.naturalHeight, 1);
        const shrink = Math.min(1, 160 / longest);
        const width = Math.max(1, Math.round(image.naturalWidth * shrink));
        const height = Math.max(1, Math.round(image.naturalHeight * shrink));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('no 2d context');
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height);
        resolve({
          box: subjectBoxFromPixels(pixels.data, width, height) ?? ASSUMED_SUBJECT,
          aspect,
        });
      } catch {
        resolve({ box: ASSUMED_SUBJECT, aspect });
      }
    };
    image.onerror = () => resolve({ box: ASSUMED_SUBJECT, aspect: null });
    image.src = url;
  });
}

/** The unforeshortened figure depth is guessed against. */
export const STAND = poseStarterBody('stand');

export const hipCentre = (body: NormalizedBody) => {
  const hips = [body[8], body[11]].filter(Boolean) as Array<{ x: number; y: number }>;
  if (hips.length === 0) return body[1] ?? null;
  return {
    x: hips.reduce((sum, p) => sum + p.x, 0) / hips.length,
    y: hips.reduce((sum, p) => sum + p.y, 0) / hips.length,
  };
};
