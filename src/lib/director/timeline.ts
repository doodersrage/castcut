/**
 * Director: a direction played out over time. Each beat starts where the previous one left her:
 * a pose beat eases every bone from there into its pose (slerp, smoothstep) and holds it,
 * breathing; a move beat plays the ready-made move (or a video's motion) placed at her spot and
 * facing, blended in from however she stood. Frames are figures in world space (floor at y = 0).
 */

import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import type { Side } from '@/lib/pose/rig3d-pose';
import { moveFrames } from './moves';
import { videoBeatFrames } from './video-motion';
import { ease, SIDES } from './motion';
import {
  feetAnchor,
  footContact,
  placeFeet,
  planFeet,
  shiftFigure,
  type FeetPlan,
  type FootPose,
} from './plant';
import {
  breathe,
  fromLocal,
  mixFigures,
  placementOf,
  transformFigure,
  type Placement,
} from './figure-ops';
import {
  beatLength,
  DIRECTOR_FPS,
  directionFrameCount,
  type DirectorBeat,
  type Direction,
} from './types';

export type TimelineSegment = {
  beat: DirectorBeat;
  index: number;
  /** When the beat starts, when its move or transition ends, and when its hold ends (s). */
  start: number;
  moveEnd: number;
  end: number;
  /** How she stood when it started. */
  from: PoseRig3dFigure;
  /** Where she stood (her placement) when it started. */
  at: Placement;
  /** A pose beat's pose, placed. */
  target?: PoseRig3dFigure;
  /** A move beat's frames, placed (at DIRECTOR_FPS from `start`). */
  frames?: PoseRig3dFigure[];
  /** Feet on the floor at both ends: planted, or a step (plant.ts). */
  feet?: FeetPlan;
  /** How she ends. */
  last: PoseRig3dFigure;
};

export type Timeline = { segments: TimelineSegment[]; length: number };

/** Seconds a move takes to blend in from how she stood. */
const BLEND_IN = 0.5;
const BREATH_DEGREES = 1.1;
const BREATH_PERIOD = 3.6;

export function buildTimeline(direction: Direction): Timeline {
  const segments: TimelineSegment[] = [];
  let time = 0;
  let last: PoseRig3dFigure | null = null;
  direction.beats.forEach((beat, index) => {
    const length = beatLength(beat, index);
    const moveSeconds = index === 0 ? 0 : beat.seconds;
    const at = last ? placementOf(last) : { x: 0, z: 0, yaw: 0 };
    const segment: Omit<TimelineSegment, 'from' | 'last'> = {
      beat,
      index,
      start: time,
      moveEnd: time + moveSeconds,
      end: time + length,
      at,
    };
    if (beat.kind === 'pose') {
      let target = fromLocal(beat.figure, at);
      // Set down where a foot on the floor stays put: the hips travel, not the foot.
      if (last) target = shiftFigure(target, feetAnchor(last, target));
      const from = last ?? target;
      const feet = last ? planFeet(last, target) : undefined;
      segments.push({ ...segment, from, target, last: target, ...(feet ? { feet } : {}) });
      last = target;
    } else {
      const local =
        beat.kind === 'video'
          ? videoBeatFrames(beat.frames, beat.seconds, DIRECTOR_FPS)
          : moveFrames(beat.move, direction.body, beat.seconds, DIRECTOR_FPS);
      const start = placementOf(local[0]!);
      let frames = local.map(frame => transformFigure(frame, start, at));
      if (last) {
        const shift = feetAnchor(last, frames[0]!);
        if (shift.x || shift.z) frames = frames.map(frame => shiftFigure(frame, shift));
      }
      const from = last ?? frames[0]!;
      const feet = last ? planFeet(last, frames[0]!) : undefined;
      segments.push({
        ...segment,
        from,
        frames,
        last: frames[frames.length - 1]!,
        ...(feet ? { feet } : {}),
      });
      last = frames[frames.length - 1]!;
    }
    time += length;
  });
  return { segments, length: time };
}

function segmentAt(timeline: Timeline, t: number): TimelineSegment {
  const { segments } = timeline;
  for (const segment of segments) if (t < segment.end) return segment;
  return segments[segments.length - 1]!;
}

/** A move's placed frames at a time from its start, between frames by slerp. */
function moveAt(frames: PoseRig3dFigure[], t: number): PoseRig3dFigure {
  const f = Math.max(0, Math.min(frames.length - 1, t * DIRECTOR_FPS));
  const i = Math.min(frames.length - 2, Math.floor(f));
  if (i < 0) return frames[0]!;
  return mixFigures(frames[i]!, frames[i + 1]!, f - i);
}

/** Breath weight: none during a move, eased in and out at a pose beat's edges. */
function breathWeight(segment: TimelineSegment, t: number): number {
  if (segment.beat.kind !== 'pose') return 0;
  const edge = 0.35;
  return ease((t - segment.start) / edge) * ease((segment.end - t) / edge);
}

/** Her body at time `t` (seconds from the start). */
export function sampleTimeline(timeline: Timeline, t: number): PoseRig3dFigure {
  const segment = segmentAt(timeline, Math.max(0, t));
  const local = Math.max(0, t - segment.start);
  let figure: PoseRig3dFigure;
  if (segment.beat.kind === 'pose') {
    const span = segment.moveEnd - segment.start;
    const u = span > 0 ? local / span : 1;
    const s = ease(u);
    figure = mixFigures(segment.from, segment.target!, s);
    if (segment.feet && u > 0 && u < 1) figure = placeFeet(figure, segment.feet, u, s);
  } else {
    const frames = segment.frames!;
    const moveLength = (frames.length - 1) / DIRECTOR_FPS;
    if (local >= moveLength) figure = frames[frames.length - 1]!;
    else {
      figure = moveAt(frames, local);
      const blend = Math.min(BLEND_IN, segment.beat.seconds / 3);
      if (segment.index > 0 && local < blend) {
        const into = figure;
        const s = ease(local / blend);
        figure = mixFigures(segment.from, into, s);
        if (segment.feet) {
          // The planted feet follow the move's own feet as it takes over.
          const to: Partial<Record<Side, FootPose>> = {};
          for (const side of SIDES) if (segment.feet[side]) to[side] = footContact(into, side);
          figure = placeFeet(figure, segment.feet, local / blend, s, to);
        }
      }
    }
  }
  const weight = breathWeight(segment, t);
  return weight > 0
    ? breathe(figure, BREATH_DEGREES * weight * Math.sin((2 * Math.PI * t) / BREATH_PERIOD))
    : figure;
}

/** Every frame of the driving video (DIRECTOR_FPS, both ends). */
export function directionFrames(direction: Direction): PoseRig3dFigure[] {
  const timeline = buildTimeline(direction);
  const count = directionFrameCount(direction);
  return Array.from({ length: count }, (_, i) => sampleTimeline(timeline, i / DIRECTOR_FPS));
}

/** The beat playing at `t`, for the timeline's highlight. */
export function beatIndexAt(direction: Direction, t: number): number {
  let time = 0;
  for (let i = 0; i < direction.beats.length; i += 1) {
    time += beatLength(direction.beats[i]!, i);
    if (t < time) return i;
  }
  return Math.max(0, direction.beats.length - 1);
}

/** When each beat starts (s). */
export function beatStarts(direction: Direction): number[] {
  const starts: number[] = [];
  let time = 0;
  direction.beats.forEach((beat, index) => {
    starts.push(time);
    time += beatLength(beat, index);
  });
  return starts;
}

/** How she ends after the first `count` beats (the start for a new beat). */
export function endOfBeats(direction: Direction, count: number): PoseRig3dFigure {
  const timeline = buildTimeline({ ...direction, beats: direction.beats.slice(0, count) });
  return timeline.segments[timeline.segments.length - 1]!.last;
}
