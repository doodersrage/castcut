/**
 * Director: the words that go with the driving video (Copy moves' `motion` line), and the warning
 * when a beat sits or leans on something the still may not have.
 */

import type { Rig3dBodyKind } from '@/lib/pose/rig3d';
import { figureWorld } from '@/lib/pose/rig3d-pose';
import { placementOf, poseSupport, type PoseSupport } from './figure-ops';
import { DIRECTOR_MOVES } from './moves';
import type { Direction, DirectorBeat } from './types';
import { theSeat } from '@/lib/video/motion-seat';

/** Copy moves keeps 300 characters of it. */
const MAX_LINE = 300;

const STARTER_PHRASES: Record<string, string> = {
  Stand: 'stands',
  Sit: 'sits',
  Kneel: 'kneels',
  'Lie down': 'lies down',
  Walk: 'stands mid-stride',
};

function noun(body: Rig3dBodyKind): string {
  return body === 'male' ? 'man' : 'woman';
}

function possessive(text: string, body: Rig3dBodyKind): string {
  return body === 'male' ? text.replace(/\bher\b/g, 'his').replace(/\bshe\b/g, 'he') : text;
}

/** One beat as words: "waves with her right hand", "moves into a pose: arms crossed". */
function beatPhrase(beat: DirectorBeat, index: number): string {
  if (beat.kind === 'move') return DIRECTOR_MOVES[beat.move].phrase;
  const words = beat.words?.trim().replace(/[.\s]+$/, '');
  if (beat.kind === 'video') return words || 'moves as the person in her reference video does';
  if (STARTER_PHRASES[beat.name]) return STARTER_PHRASES[beat.name]!;
  if (index === 0) return words ? `starts ${words}` : 'stands';
  return words ? `moves into a new pose — ${words}` : 'moves into a new pose';
}

/**
 * "A woman stands, then waves with her right hand, then turns around." With a seat put into the
 * still, the beats that sit say on what ("sits down on the wooden chair behind her").
 */
export function directionMotionLine(direction: Direction, seat?: string | null): string {
  const phrases: string[] = [];
  const sitting = seat
    ? new Set(
        directionSupportNeeds(direction)
          .filter(n => n.support === 'sit')
          .map(n => n.index)
      )
    : null;
  direction.beats.forEach((beat, index) => {
    let phrase = beatPhrase(beat, index);
    if (seat && sitting?.has(index))
      phrase = `${phrase} on ${theSeat(seat)} behind ${direction.body === 'male' ? 'him' : 'her'}`;
    // A held start then the same again reads once.
    if (phrases[phrases.length - 1] !== phrase) phrases.push(phrase);
  });
  const [first, ...rest] = phrases;
  const body = [first, ...rest.map(p => `then ${p}`)].filter(Boolean).join(', ');
  const line = possessive(`A ${noun(direction.body)} ${body}.`, direction.body);
  if (line.length <= MAX_LINE) return line;
  return `${line.slice(0, MAX_LINE - 1).replace(/[,\s]+\S*$/, '')}.`;
}

export type SupportNote = {
  beatId: string;
  index: number;
  support: Exclude<PoseSupport, null>;
  /** For a seat: sitting back against something (a sofa) or upright (a chair). */
  reclined?: boolean;
};

/** Sitting with her shoulders well behind her hips: she needs a back to rest on. */
function sitsBack(figure: DirectorBeat & { kind: 'pose' }): boolean {
  const at = placementOf(figure.figure);
  const world = figureWorld(figure.figure);
  const neck = world.pos.neck!;
  // Along her facing: negative is behind her hips.
  const ahead = (neck.x - at.x) * Math.sin(at.yaw) + (neck.z - at.z) * Math.cos(at.yaw);
  return ahead < -0.1;
}

/** Beats where she sits or leans on something (from a pose, or the Sit down move). */
export function directionSupportNeeds(direction: Direction): SupportNote[] {
  const notes: SupportNote[] = [];
  direction.beats.forEach((beat, index) => {
    const support =
      beat.kind === 'move'
        ? DIRECTOR_MOVES[beat.move].sits
          ? 'sit'
          : null
        : poseSupport(beat.kind === 'video' ? beat.frames[beat.frames.length - 1]! : beat.figure);
    if (!support) return;
    const reclined = support === 'sit' && beat.kind === 'pose' && sitsBack(beat);
    notes.push({ beatId: beat.id, index, support, ...(reclined ? { reclined } : {}) });
  });
  return notes;
}

const SEAT_WORDS =
  /\b(chairs?|armchairs?|sofas?|couch(es)?|loveseats?|bench(es)?|stools?|seats?|beds?|ottomans?|steps|stairs|ledges?|sill)\b/i;
const LEAN_WORDS =
  /\b(walls?|counters?|railings?|rails?|door(way|frame)?s?|tables?|desks?|pillars?|posts?|columns?|fences?|bars?|trees?|cars?)\b/i;

/** Whether Place already has what the beats rest on. */
function placeHas(notes: SupportNote[], place: string | undefined): boolean {
  const text = place ?? '';
  const sits = notes.some(note => note.support === 'sit');
  const leans = notes.some(note => note.support === 'lean');
  return (!sits || SEAT_WORDS.test(text)) && (!leans || LEAN_WORDS.test(text));
}

export type SupportFix = {
  /** The button: "Add a chair to Place". */
  label: string;
  /** Place with the seat (or wall) in it. */
  place: string;
};

/**
 * A one-tap fix for the seat warning: Place gets what she sits or leans on, so Copy moves draws
 * it — a wooden chair behind her for sitting upright, a sofa when she sits back, a wall beside
 * her for leaning. Null when nothing is needed or Place already has it.
 */
export function supportFix(
  notes: SupportNote[],
  place: string | undefined,
  body: Rig3dBodyKind = 'female'
): SupportFix | null {
  if (!notes.length || placeHas(notes, place)) return null;
  const her = body === 'male' ? 'him' : 'her';
  const text = place?.trim() ?? '';
  const sits = notes.filter(note => note.support === 'sit');
  const leans = notes.some(note => note.support === 'lean');
  const parts: string[] = [];
  let label = '';
  if (sits.length && !SEAT_WORDS.test(text)) {
    const sofa = sits.some(note => note.reclined);
    parts.push(sofa ? `a sofa behind ${her}` : `a wooden chair behind ${her}`);
    label = sofa ? 'a sofa' : 'a chair';
  }
  if (leans && !LEAN_WORDS.test(text)) {
    parts.push(`a wall beside ${her}`);
    label = label ? `${label} and a wall` : 'a wall';
  }
  const thing = parts.join(' and ');
  const next = text ? `${text.replace(/[.,;\s]+$/, '')}, with ${thing}` : thing;
  return { label: `Add ${label} to Place`, place: next.slice(0, 300) };
}

/** "chairs" → "chair", "couches" → "couch"; steps and stairs stay as they are. */
function singular(word: string): string {
  const lower = word.toLowerCase();
  if (lower === 'steps' || lower === 'stairs') return lower;
  if (/(ch|sh|x|s)es$/.test(lower)) return lower.slice(0, -2);
  return lower.replace(/s$/, '');
}

/**
 * The seat Copy moves puts into the still before she sits down (video/motion-seat.ts): Wan Animate
 * draws the room from the still, so a seat only named in Place is not drawn and she sits on air.
 * Null when no beat after the start sits, or when she already sits in the still (it has a seat).
 * The seat Place names, else a wooden chair (a sofa when she sits back).
 */
export function directionSeat(notes: SupportNote[], place: string | undefined): string | null {
  const sits = notes.filter(note => note.support === 'sit');
  if (!sits.length || sits.some(note => note.index === 0)) return null;
  const named = (place ?? '').match(SEAT_WORDS)?.[0];
  if (named) {
    const word = singular(named);
    if (word === 'steps' || word === 'stairs') return `some ${word}`;
    return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
  }
  return sits.some(note => note.reclined) ? 'a sofa' : 'a wooden chair';
}

/** What to tell the player about those beats, or null. */
export function supportWarning(notes: SupportNote[], place: string | undefined): string | null {
  if (!notes.length || placeHas(notes, place)) return null;
  const sits = notes.some(note => note.support === 'sit');
  const leans = notes.some(note => note.support === 'lean');
  const what = sits && leans ? 'sit and lean' : sits ? 'sit' : 'lean';
  const thing = sits ? 'a seat' : 'something to lean on';
  if (place?.trim()) {
    return `She'll ${what} on whatever is in the picture — make sure Place mentions ${thing}.`;
  }
  return `She'll ${what} on whatever is in the picture — pick a still with ${thing}, or describe one in Place.`;
}
