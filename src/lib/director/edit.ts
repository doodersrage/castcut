/**
 * Director: editing a direction — add, move, remove and resize beats, and the ready-made
 * directions (a few moves in a row, about five seconds: one Copy moves part).
 */

import { clampMoveSeconds, DIRECTOR_MOVES, type DirectorMoveId } from './moves';
import {
  beatLength,
  DIRECTOR_MAX_BEATS,
  HOLD_SECONDS,
  newBeatId,
  POSE_MOVE_SECONDS,
  type DirectorBeat,
  type DirectorMoveBeat,
  type Direction,
} from './types';

const round2 = (value: number) => Math.round(value * 100) / 100;

export function moveBeat(move: DirectorMoveId, seconds?: number, hold = 0): DirectorMoveBeat {
  return {
    id: newBeatId(),
    kind: 'move',
    move,
    seconds: round2(clampMoveSeconds(move, seconds ?? DIRECTOR_MOVES[move].seconds)),
    hold,
  };
}

export function addBeat(direction: Direction, beat: DirectorBeat): Direction {
  if (direction.beats.length >= DIRECTOR_MAX_BEATS) return direction;
  return { ...direction, beats: [...direction.beats, beat] };
}

export function replaceBeat(direction: Direction, index: number, beat: DirectorBeat): Direction {
  return { ...direction, beats: direction.beats.map((b, i) => (i === index ? beat : b)) };
}

/** Remove a beat (never the start). */
export function removeBeat(direction: Direction, index: number): Direction {
  if (index <= 0) return direction;
  return { ...direction, beats: direction.beats.filter((_, i) => i !== index) };
}

/** Swap a beat with the one before (-1) or after (+1); the start stays first. */
export function shiftBeat(direction: Direction, index: number, by: -1 | 1): Direction {
  const to = index + by;
  if (index <= 0 || to <= 0 || to >= direction.beats.length) return direction;
  const beats = direction.beats.slice();
  [beats[index], beats[to]] = [beats[to]!, beats[index]!];
  return { ...direction, beats };
}

/**
 * A beat made `length` seconds long (dragging its end on the timeline): a move stretches first
 * and holds for the rest; a pose keeps its move-in time and changes its hold, then its move-in.
 */
export function resizeBeat(beat: DirectorBeat, index: number, length: number): DirectorBeat {
  const want = Math.max(0, length);
  if (beat.kind === 'move') {
    const natural = DIRECTOR_MOVES[beat.move].seconds;
    const seconds = round2(clampMoveSeconds(beat.move, Math.min(want, natural * 2)));
    const hold = round2(Math.min(HOLD_SECONDS.max, Math.max(0, want - seconds)));
    return { ...beat, seconds, hold };
  }
  if (index === 0) {
    return { ...beat, hold: round2(Math.min(HOLD_SECONDS.max, Math.max(0, want))) };
  }
  const hold = round2(Math.min(HOLD_SECONDS.max, Math.max(0, want - beat.seconds)));
  const seconds = round2(
    Math.min(POSE_MOVE_SECONDS.max, Math.max(POSE_MOVE_SECONDS.min, want - hold))
  );
  return { ...beat, seconds, hold };
}

/** Set a beat's move-in (or move) seconds, or its hold, from a number field. */
export function setBeatTime(
  beat: DirectorBeat,
  field: 'seconds' | 'hold',
  value: number
): DirectorBeat {
  if (!Number.isFinite(value)) return beat;
  if (field === 'hold') {
    return { ...beat, hold: round2(Math.min(HOLD_SECONDS.max, Math.max(HOLD_SECONDS.min, value))) };
  }
  if (beat.kind === 'move') return { ...beat, seconds: round2(clampMoveSeconds(beat.move, value)) };
  return {
    ...beat,
    seconds: round2(Math.min(POSE_MOVE_SECONDS.max, Math.max(POSE_MOVE_SECONDS.min, value))),
  };
}

export type DirectorPreset = {
  id: string;
  label: string;
  startHold: number;
  moves: Array<{ move: DirectorMoveId; seconds: number; hold?: number }>;
};

export const DIRECTOR_PRESETS: DirectorPreset[] = [
  {
    id: 'wave-turn',
    label: 'Wave, then turn away',
    startHold: 0.3,
    moves: [
      { move: 'wave', seconds: 2.2 },
      { move: 'turn', seconds: 2.4, hold: 0.1 },
    ],
  },
  {
    id: 'walk-wave',
    label: 'Walk up and wave',
    startHold: 0.2,
    moves: [
      { move: 'walk', seconds: 2.9 },
      { move: 'wave', seconds: 1.9 },
    ],
  },
  { id: 'sit', label: 'Sit down', startHold: 0.6, moves: [{ move: 'sit', seconds: 3, hold: 1.4 }] },
  {
    id: 'look-back',
    label: 'Turn and look back',
    startHold: 0.2,
    moves: [
      { move: 'turn', seconds: 2.2 },
      { move: 'look-back', seconds: 2.6 },
    ],
  },
  {
    id: 'stretch',
    label: 'Stretch up',
    startHold: 0.4,
    moves: [{ move: 'reach', seconds: 4.2, hold: 0.4 }],
  },
];

/** The start pose kept, the beats after it replaced by a ready-made direction. */
export function applyPreset(direction: Direction, preset: DirectorPreset): Direction {
  const start = direction.beats[0]!;
  return {
    ...direction,
    beats: [
      { ...start, hold: preset.startHold },
      ...preset.moves.map(entry => moveBeat(entry.move, entry.seconds, entry.hold ?? 0)),
    ],
  };
}

/** Total of a list of beats (for a preset's label). */
export function beatsLength(beats: DirectorBeat[]): number {
  return beats.reduce((sum, beat, index) => sum + beatLength(beat, index), 0);
}
