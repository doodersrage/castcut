/**
 * Director: the words that go with the driving video (Copy moves' `motion` line), and the warning
 * when a beat sits or leans on something the still may not have.
 */

import type { Rig3dBodyKind } from '@/lib/pose/rig3d';
import { poseSupport, type PoseSupport } from './figure-ops';
import { DIRECTOR_MOVES } from './moves';
import type { Direction, DirectorBeat } from './types';

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
  if (STARTER_PHRASES[beat.name]) return STARTER_PHRASES[beat.name]!;
  if (index === 0) return words ? `starts ${words}` : 'stands';
  return words ? `moves into a new pose — ${words}` : 'moves into a new pose';
}

/** "A woman stands, then waves with her right hand, then turns around." */
export function directionMotionLine(direction: Direction): string {
  const phrases: string[] = [];
  direction.beats.forEach((beat, index) => {
    const phrase = beatPhrase(beat, index);
    // A held start then the same again reads once.
    if (phrases[phrases.length - 1] !== phrase) phrases.push(phrase);
  });
  const [first, ...rest] = phrases;
  const body = [first, ...rest.map(p => `then ${p}`)].filter(Boolean).join(', ');
  const line = possessive(`A ${noun(direction.body)} ${body}.`, direction.body);
  if (line.length <= MAX_LINE) return line;
  return `${line.slice(0, MAX_LINE - 1).replace(/[,\s]+\S*$/, '')}.`;
}

export type SupportNote = { beatId: string; index: number; support: Exclude<PoseSupport, null> };

/** Beats where she sits or leans on something (from a pose, or the Sit down move). */
export function directionSupportNeeds(direction: Direction): SupportNote[] {
  const notes: SupportNote[] = [];
  direction.beats.forEach((beat, index) => {
    const support =
      beat.kind === 'move'
        ? DIRECTOR_MOVES[beat.move].sits
          ? 'sit'
          : null
        : poseSupport(beat.figure);
    if (support) notes.push({ beatId: beat.id, index, support });
  });
  return notes;
}

/** What to tell the player about those beats, or null. */
export function supportWarning(notes: SupportNote[], place: string | undefined): string | null {
  if (!notes.length) return null;
  const sits = notes.some(note => note.support === 'sit');
  const leans = notes.some(note => note.support === 'lean');
  const what = sits && leans ? 'sit and lean' : sits ? 'sit' : 'lean';
  const thing = sits ? 'a seat' : 'something to lean on';
  if (place?.trim()) {
    return `She'll ${what} on whatever is in the picture — make sure Place mentions ${thing}.`;
  }
  return `She'll ${what} on whatever is in the picture — pick a still with ${thing}, or describe one in Place.`;
}
