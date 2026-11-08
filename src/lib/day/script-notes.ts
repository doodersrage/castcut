import type { ContinuityFinding } from '@/lib/checks/findings';
import type { ScriptScene } from '@/lib/script/parse';
import { coverageSubject } from './script-coverage';
import { speakerKey } from './script-cast';
import { DOING_RE } from './script-shots';

/**
 * Script notes (2026-11-08): what Castcut can't film, or films badly, found in a script's words
 * by rule — not by the LLM — the moment it's written or imported, before any shot is planned.
 * The writer is told all of this (episode-writer.ts) and still slips; an imported script was
 * never told. Each note can be fixed by the LLM (a revision of that scene) or said to be fine.
 */

/** A spoken line longer than this is a long read line and a long talking clip. */
export const NOTE_LINE_WORDS = 20;

const UNFILMABLE_RE =
  /\b(montage|flashback|flashes back|dream sequence|dreams? (?:of|that)|split screen|crowds?|audience|throng|queues? (?:of|out)|packed (?:with|room|café|bar)|the whole (?:town|room|class)|drives? (?:off|away|down)|speeding|explodes?|explosion)\b/i;
const CAMERA_RE =
  /\b(CLOSE ON|ANGLE ON|PAN (?:TO|ACROSS)|ZOOM (?:IN|OUT)|WE SEE|WE HEAR|INSERT|POV|SMASH CUT)\b/;

export function scriptNotes(input: { scriptId: string; scene: ScriptScene }): ContinuityFinding[] {
  const { scene } = input;
  const subject = coverageSubject(input.scriptId, scene.id);
  const out: ContinuityFinding[] = [];
  const add = (rule: ContinuityFinding['rule'], evidence: string, suggestion: string) =>
    out.push({
      id: `${subject}:${rule}`,
      rule,
      subject,
      severity: 'warns',
      source: 'Script notes',
      evidence,
      suggestion,
    });
  const action = scene.elements.filter(element => element.kind === 'action');
  const dialogue = scene.elements.filter(element => element.kind === 'dialogue' && element.speaker);
  // Seen in it: who speaks on screen (a voice heard, not seen, doesn't count).
  const seen = new Set(
    dialogue
      .filter(element => !/^(?:v\.?\s*o|o\.?\s*s|o\.?\s*c)\.?$/i.test(element.extension ?? ''))
      .map(element => speakerKey(element.speaker!))
  );
  if (seen.size >= 3) {
    add(
      'script-many',
      `${seen.size} people speak on screen here`,
      'A still holds two: split it into two scenes, or have one of them heard, not seen (V.O.).'
    );
  }
  const long = dialogue.filter(
    element => element.text.split(/\s+/).filter(Boolean).length > NOTE_LINE_WORDS
  );
  if (long.length) {
    add(
      'script-long-line',
      `${long.length} line${long.length === 1 ? '' : 's'} over ${NOTE_LINE_WORDS} words`,
      'Shorter lines read and animate better — split or trim them.'
    );
  }
  const unfilmable = action.map(element => UNFILMABLE_RE.exec(element.text)?.[0]).find(Boolean);
  if (unfilmable) {
    add(
      'script-unfilmable',
      `“${unfilmable.toLowerCase()}” in the action`,
      'Stills show a moment with one or two people: show it through them instead.'
    );
  }
  const camera = action.map(element => CAMERA_RE.exec(element.text)?.[0]).find(Boolean);
  if (camera) {
    add(
      'script-camera',
      `A camera direction (“${camera}”)`,
      'Shots are planned for you: say what is seen instead.'
    );
  }
  if (!action.length && dialogue.length) {
    add(
      'script-no-action',
      'Nothing is seen happening — only lines',
      'Give it an action line: where they are and what they do while they talk.'
    );
  } else if (action.length && !action.some(element => DOING_RE.test(element.text))) {
    add(
      'script-no-action',
      'Its action is only atmosphere — no one is doing anything',
      'Say what someone does — sits, pours, leans on the counter: the stills are posed from it.'
    );
  }
  return out;
}
