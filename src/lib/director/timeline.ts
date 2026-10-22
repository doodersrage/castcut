/**
 * Director: a direction played out over time. Each beat starts where the previous one left her:
 * a pose beat eases every bone from there into its pose (slerp, smoothstep) and holds it,
 * breathing; a move beat plays the ready-made move placed at her spot and facing, blended in
 * from however she stood. Frames are figures in world space (floor at y = 0).
 */

import type { PoseRig3dFigure } from '@/lib/pose/rig3d';
import { moveFrames } from './moves';
import { ease } from './motion';
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
      const target = fromLocal(beat.figure, at);
      const from = last ?? target;
      segments.push({ ...segment, from, target, last: target });
      last = target;
    } else {
      const local = moveFrames(beat.move, direction.body, beat.seconds, DIRECTOR_FPS);
      const start = placementOf(local[0]!);
      const frames = local.map(frame => transformFigure(frame, start, at));
      const from = last ?? frames[0]!;
      segments.push({ ...segment, from, frames, last: frames[frames.length - 1]! });
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
    const s = span > 0 ? ease(local / span) : 1;
    figure = mixFigures(segment.from, segment.target!, s);
  } else {
    const frames = segment.frames!;
    const moveLength = (frames.length - 1) / DIRECTOR_FPS;
    if (local >= moveLength) figure = frames[frames.length - 1]!;
    else {
      figure = moveAt(frames, local);
      const blend = Math.min(BLEND_IN, segment.beat.seconds / 3);
      if (segment.index > 0 && local < blend) {
        figure = mixFigures(segment.from, figure, ease(local / blend));
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
