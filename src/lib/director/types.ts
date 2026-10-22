/**
 * Director: a direction is a short list of beats for one Cast member — a start pose, then poses
 * she moves into and ready-made moves (moves.ts) — plus a camera. It renders to a driving video
 * for Copy moves (Wan Animate 2), which puts the still's person through it.
 */

import { MOTION_MAX_FRAMES, MOTION_SEGMENT_FRAMES } from '@/lib/video/motion-transfer';
import {
  CAMERA_DIRECTIONS,
  CAMERA_HEIGHTS,
  CAMERA_LENSES,
  CAMERA_SHOTS,
  type CameraDirection,
  type CameraHeight,
  type CameraLens,
  type CameraShot,
} from '@/lib/pose/camera-shot';
import type { PoseRig3dFigure, Rig3dBodyKind } from '@/lib/pose/rig3d';
import { normalizePoseRig3d, RIG3D_VERSION } from '@/lib/pose/rig3d';
import { poseSupport } from './figure-ops';
import { clampMoveSeconds, DIRECTOR_MOVES, isDirectorMoveId, type DirectorMoveId } from './moves';

/** Wan's rate: the driving video is rendered at it. */
export const DIRECTOR_FPS = 16;
/** One Wan Animate segment (81 frames): about 5 s, the quickest render. */
export const DIRECTOR_ONE_PART_SECONDS = (MOTION_SEGMENT_FRAMES - 1) / DIRECTOR_FPS;
/** Copy moves chains segments up to MOTION_MAX_FRAMES (about 30 s). */
export const DIRECTOR_MAX_SECONDS = (MOTION_MAX_FRAMES - 1) / DIRECTOR_FPS;
/** Copy moves needs at least about a second (17 frames); a little more reads as a move. */
export const DIRECTOR_MIN_SECONDS = 1.5;
export const DIRECTOR_MAX_BEATS = 24;

export type DirectorPoseBeat = {
  id: string;
  kind: 'pose';
  /** "Stand", "Her pose in the picture", "Pose 3". */
  name: string;
  /** The pose in words, for the motion line ("sitting with her legs crossed"). */
  words?: string;
  /**
   * The body, in her own frame where the beat starts (the hips over the origin, facing +z are
   * where the previous beat left her): moving an earlier beat carries this one along.
   */
  figure: PoseRig3dFigure;
  /** Seconds to move into the pose (0 for the start pose). */
  seconds: number;
  /** Seconds she holds it. */
  hold: number;
};

export type DirectorMoveBeat = {
  id: string;
  kind: 'move';
  move: DirectorMoveId;
  /** The move's length (its natural length, stretched or squeezed). */
  seconds: number;
  hold: number;
};

export type DirectorBeat = DirectorPoseBeat | DirectorMoveBeat;

export type DirectorCameraMove = 'none' | 'push-in' | 'pull-out' | 'pan-left' | 'pan-right';
export const DIRECTOR_CAMERA_MOVES: readonly DirectorCameraMove[] = [
  'none',
  'push-in',
  'pull-out',
  'pan-left',
  'pan-right',
];
export const DIRECTOR_CAMERA_MOVE_LABELS: Record<DirectorCameraMove, string> = {
  none: 'Still',
  'push-in': 'Slow push in',
  'pull-out': 'Slow pull out',
  'pan-left': 'Pan left',
  'pan-right': 'Pan right',
};

export type DirectorCamera = {
  height: CameraHeight;
  direction: CameraDirection;
  /** Which side of her a three-quarter or side view stands on: her left (1) or right (−1). */
  side: 1 | -1;
  /** How much of her is in frame; 'picture' frames her as the still does. */
  shot: CameraShot | 'picture';
  lens: CameraLens;
  move: DirectorCameraMove;
};

export const DEFAULT_DIRECTOR_CAMERA: DirectorCamera = {
  height: 'eye',
  direction: 'front',
  side: 1,
  shot: 'picture',
  lens: 'normal',
  move: 'none',
};

export type Direction = {
  version: 1;
  body: Rig3dBodyKind;
  /** The first is the start pose. */
  beats: DirectorBeat[];
  camera: DirectorCamera;
  /** Where she is, when the still's background is not enough (a seat to sit on). */
  place?: string;
};

export function newBeatId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().slice(0, 12);
  }
  return `beat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** A beat's whole length: getting there (or the move) plus the hold. */
export function beatLength(beat: DirectorBeat, index: number): number {
  return (index === 0 ? 0 : beat.seconds) + beat.hold;
}

export function directionLength(direction: Pick<Direction, 'beats'>): number {
  return direction.beats.reduce((sum, beat, index) => sum + beatLength(beat, index), 0);
}

/** Frames the driving video has: one per 1/16 s, both ends included. */
export function directionFrameCount(direction: Pick<Direction, 'beats'>): number {
  return Math.min(MOTION_MAX_FRAMES, Math.round(directionLength(direction) * DIRECTOR_FPS) + 1);
}

/** Wan Animate segments the render takes (each about 5 s). */
export function directionParts(direction: Pick<Direction, 'beats'>): number {
  const frames = directionFrameCount(direction);
  return Math.max(1, Math.ceil((frames - 1) / (MOTION_SEGMENT_FRAMES - 1)));
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const clampSec = (value: unknown, min: number, max: number, fallback: number) => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return round2(Math.min(max, Math.max(min, n)));
};

export const POSE_MOVE_SECONDS = { min: 0.3, max: 6, default: 1.2 } as const;
export const HOLD_SECONDS = { min: 0, max: 10, default: 0.6 } as const;

function normalizeFigure(raw: unknown): PoseRig3dFigure | null {
  const rig = normalizePoseRig3d({
    version: RIG3D_VERSION,
    figures: [raw],
    camera: { position: [0, 1, 5], target: [0, 1, 0], fov: 30 },
  });
  return rig?.figures[0] ?? null;
}

function pick<T extends string>(raw: unknown, allowed: readonly T[], fallback: T): T {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

export function normalizeDirectorCamera(raw: unknown): DirectorCamera {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_DIRECTOR_CAMERA;
  return {
    height: pick(r.height, CAMERA_HEIGHTS, d.height),
    direction: pick(r.direction, CAMERA_DIRECTIONS, d.direction),
    side: r.side === -1 ? -1 : 1,
    shot: pick(r.shot, [...CAMERA_SHOTS, 'picture'] as const, d.shot),
    lens: pick(r.lens, CAMERA_LENSES, d.lens),
    move: pick(r.move, DIRECTOR_CAMERA_MOVES, d.move),
  };
}

function normalizeBeat(raw: unknown, index: number): DirectorBeat | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim().slice(0, 40) : newBeatId();
  const hold = clampSec(r.hold, HOLD_SECONDS.min, HOLD_SECONDS.max, HOLD_SECONDS.default);
  if (r.kind === 'move' && index > 0) {
    if (!isDirectorMoveId(r.move)) return null;
    const seconds = round2(
      clampMoveSeconds(r.move, typeof r.seconds === 'number' ? r.seconds : NaN)
    );
    return { id, kind: 'move', move: r.move, seconds, hold };
  }
  if (r.kind !== 'pose') return null;
  const figure = normalizeFigure(r.figure);
  if (!figure) return null;
  const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 60) : 'Pose';
  const words = typeof r.words === 'string' && r.words.trim() ? r.words.trim().slice(0, 200) : '';
  return {
    id,
    kind: 'pose',
    name,
    ...(words ? { words } : {}),
    figure,
    seconds:
      index === 0
        ? 0
        : clampSec(
            r.seconds,
            POSE_MOVE_SECONDS.min,
            POSE_MOVE_SECONDS.max,
            POSE_MOVE_SECONDS.default
          ),
    hold,
  };
}

/** A stored direction, checked field by field; null when it has no start pose. */
export function normalizeDirection(raw: unknown): Direction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.beats)) return null;
  const beats: DirectorBeat[] = [];
  for (const entry of r.beats.slice(0, DIRECTOR_MAX_BEATS)) {
    const beat = normalizeBeat(entry, beats.length);
    if (beat) beats.push(beat);
    else if (!beats.length) return null;
  }
  if (!beats.length || beats[0]!.kind !== 'pose') return null;
  const body = r.body === 'male' ? 'male' : 'female';
  const place = typeof r.place === 'string' ? r.place.trim().slice(0, 300) : '';
  return {
    version: 1,
    body,
    beats,
    camera: normalizeDirectorCamera(r.camera),
    ...(place ? { place } : {}),
  };
}

export type DirectionCheck = {
  /** Why it cannot render yet. */
  errors: string[];
  /** What may go wrong. */
  warnings: string[];
};

/** Whether a direction can render, and what to watch for. */
export function checkDirection(direction: Direction): DirectionCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const length = directionLength(direction);
  if (direction.beats.length < 2 && length < DIRECTOR_MIN_SECONDS) {
    errors.push('Add a beat — a pose to move into, or a ready-made move.');
  } else if (length < DIRECTOR_MIN_SECONDS) {
    errors.push(`Make it at least ${DIRECTOR_MIN_SECONDS} seconds long.`);
  }
  if (length > DIRECTOR_MAX_SECONDS + 1e-6) {
    errors.push(`Keep it to ${DIRECTOR_MAX_SECONDS} seconds — Copy moves takes no more.`);
  }
  if (direction.beats.length > DIRECTOR_MAX_BEATS) {
    errors.push(`${DIRECTOR_MAX_BEATS} beats at most.`);
  }
  let seated = false;
  direction.beats.forEach((beat, index) => {
    if (beat.kind === 'move') {
      const move = DIRECTOR_MOVES[beat.move];
      if (move.fromSitting && !seated) {
        warnings.push(`Beat ${index + 1}: ${move.label} works after she sits down.`);
      }
      if (move.sits) seated = true;
      if (move.fromSitting) seated = false;
    } else {
      seated = poseSupport(beat.figure) === 'sit';
    }
  });
  return { errors, warnings };
}
