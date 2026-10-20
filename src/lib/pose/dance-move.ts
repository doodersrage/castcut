/**
 * A solo dance's move. Every dance still used to be the same one — both arms raised overhead, one
 * knee lifted — because the pose map, the recipe's pose sentence, the Pose cue and the beats all
 * said so (it beat Edit's habit of keeping the try-on plate's arms-at-sides stand). Now a beat
 * gets one of a few moves, and the map and every line of wording name the same one: a beat that
 * names a move keeps it, any other dance picks one from its own dance words, so the drawing and
 * the prompt (which both read the beat) agree without sharing a seed.
 *
 * A fifth move, a groove with elbows bent at the waist, was dropped: on Edit 2511 she stood with
 * her hands at her waist, the catalog stand this all started from (0/2, live 2026-10-16). The
 * others read as dancing: spin 4/4, one arm up 2/2, hands in hair 2/2.
 */

export type DanceMove = 'overhead' | 'one_up' | 'spin' | 'hair';

type Point = { x: number; y: number };
type DanceArmsLegs = Record<
  'lElbow' | 'rElbow' | 'lWrist' | 'rWrist' | 'lKnee' | 'rKnee' | 'lAnkle' | 'rAnkle',
  Point
>;

/** What she does, in the words every dance line uses ("She dances, <words>."). */
export const DANCE_MOVE_WORDS: Record<DanceMove, string> = {
  overhead: 'both arms raised overhead, one knee lifted mid-step, hips mid-sway',
  one_up:
    'one arm raised high, the other bent in front of her chest, weight on one leg, hips mid-sway',
  spin: 'turning mid-spin, both arms out to the sides at shoulder height, one foot stepping',
  hair: 'both hands lifting her hair, elbows out, hips swaying to one side, one knee bent',
};

/** Picked when the beat names no move. */
const ROTATION: readonly DanceMove[] = ['one_up', 'spin', 'hair', 'overhead'];

const NAMED: readonly [DanceMove, RegExp][] = [
  ['spin', /\b(?:mid-?spin|spin(?:s|ning)?|twirl(?:s|ing)?)\b|\barms?\s+(?:out|wide)\b/i],
  [
    'hair',
    /\bhands?\s+(?:in|through|lifting|running\s+through)\s+(?:her|his)\s+hair\b|\blifting\s+(?:her|his)\s+hair\b/i,
  ],
  ['one_up', /\bone\s+(?:arm|hand)\s+(?:raised|up|high)\b/i],
  [
    'overhead',
    /\b(?:both\s+)?arms\s+(?:raised|up|overhead|in\s+the\s+air)\b|\barms\s+(?:raised\s+)?overhead\b/i,
  ],
];

/** The words of the first clause about dancing — the same in the beat, the guide text and the prompt. */
function danceClause(text: string): string {
  const match = /[^.;:—–·,\n]*\bdanc(?:e|es|ing)\b[^.;:—–·,\n]*/i.exec(text);
  return (match?.[0] ?? text)
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** The move a dance beat (or a prompt holding it) calls for. */
export function danceMoveFor(text: string | null | undefined): DanceMove {
  const hay = text?.trim() ?? '';
  // A move named in the sentence about the dance (not elsewhere in a long prompt).
  const sentence = /[^.;:·\n]*\bdanc(?:e|es|ing)\b[^.;:·\n]*/i.exec(hay)?.[0] ?? '';
  for (const [move, re] of NAMED) {
    if (re.test(sentence)) return move;
  }
  return ROTATION[hash(danceClause(hay)) % ROTATION.length]!;
}

export function danceMoveWords(text: string | null | undefined): string {
  return DANCE_MOVE_WORDS[danceMoveFor(text)];
}

/**
 * The limbs of the one-person dance guide for a move (torso, head and hips are the drawing's
 * own). Lifted feet stay below the hip: a kick above it made Edit drop the map for the plate.
 */
export const DANCE_MOVE_LIMBS: Record<DanceMove, DanceArmsLegs> = {
  overhead: {
    lElbow: { x: 0.26, y: 0.08 },
    rElbow: { x: 0.72, y: 0.06 },
    lWrist: { x: 0.22, y: 0.02 },
    rWrist: { x: 0.78, y: 0.02 },
    lKnee: { x: 0.3, y: 0.72 },
    rKnee: { x: 0.66, y: 0.4 },
    lAnkle: { x: 0.26, y: 0.92 },
    rAnkle: { x: 0.7, y: 0.52 },
  },
  one_up: {
    lElbow: { x: 0.28, y: 0.32 },
    lWrist: { x: 0.44, y: 0.28 },
    rElbow: { x: 0.7, y: 0.08 },
    rWrist: { x: 0.72, y: 0.0 },
    lKnee: { x: 0.36, y: 0.72 },
    lAnkle: { x: 0.34, y: 0.93 },
    rKnee: { x: 0.56, y: 0.7 },
    rAnkle: { x: 0.62, y: 0.86 },
  },
  spin: {
    lElbow: { x: 0.2, y: 0.22 },
    lWrist: { x: 0.06, y: 0.22 },
    rElbow: { x: 0.78, y: 0.19 },
    rWrist: { x: 0.94, y: 0.2 },
    lKnee: { x: 0.38, y: 0.71 },
    lAnkle: { x: 0.36, y: 0.93 },
    rKnee: { x: 0.58, y: 0.7 },
    rAnkle: { x: 0.68, y: 0.88 },
  },
  hair: {
    lElbow: { x: 0.26, y: 0.1 },
    lWrist: { x: 0.42, y: 0.05 },
    rElbow: { x: 0.74, y: 0.08 },
    rWrist: { x: 0.56, y: 0.04 },
    lKnee: { x: 0.36, y: 0.72 },
    lAnkle: { x: 0.34, y: 0.93 },
    rKnee: { x: 0.52, y: 0.7 },
    rAnkle: { x: 0.56, y: 0.9 },
  },
};
