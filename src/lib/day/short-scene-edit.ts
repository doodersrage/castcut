/**
 * A board edit on a Short moment that is a whole scene (Step 5b-ii, 2026-11-09): the card owns
 * the scene's heading (place, time), its first action paragraph (the beat) and the lead's line;
 * an edit rewrites only those, in the scene's own lines — another speaker's lines, the rest of
 * its action, its parentheticals stay as written. Its shots are planned again from the new
 * scene, each carrying over the shot it was (its id, its Scene) by what it covers. Pure.
 */

import type { ScriptElement, ScriptScene } from '../script/parse';
import { draftShots, type PlannedShot } from './script-shots';

/** What the card says now, and the line it said before (to find it in the scene). */
export type MomentSceneEdit = {
  heading: string;
  beat?: string;
  line?: string;
  /** The lead's line before this edit (the card's), if it had one. */
  lineBefore?: string;
  /** The lead's speaking parts (Who's who), upper-cased. */
  leadSpeakers: readonly string[];
  /** The cue a new line of the lead's is written under. */
  leadCue: string;
};

const flat = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function leadLineOf(
  scene: ScriptScene,
  leads: readonly string[],
  text: string | undefined
): ScriptElement | undefined {
  const lead = (element: ScriptElement) =>
    element.kind === 'dialogue' && leads.includes((element.speaker ?? '').toUpperCase());
  const wanted = flat(text);
  return (
    (wanted
      ? scene.elements.find(element => lead(element) && flat(element.text) === wanted)
      : undefined) ?? scene.elements.find(lead)
  );
}

/**
 * The scene's text with the card's edit in it — its lines from heading to last element (the
 * Fountain the short keeps for it). Null when there is nothing the card owns to put back (no
 * heading line to write).
 */
export function patchedMomentScene(
  lines: readonly string[],
  scene: ScriptScene,
  edit: MomentSceneEdit
): string[] | null {
  if (!scene.heading || scene.from < 1 || scene.to > lines.length) return null;
  // Line numbers are 1-based; edits keyed by the first line they replace, applied bottom-up.
  const out = lines.slice(scene.from - 1, scene.to);
  const at = (n: number) => n - scene.from;
  const replace: Array<{ from: number; to: number; with: string[] }> = [];
  replace.push({ from: scene.from, to: scene.from, with: [edit.heading] });

  const action = scene.elements.find(element => element.kind === 'action');
  const beat = flat(edit.beat);
  if (action && beat && beat !== flat(action.text)) {
    replace.push({ from: action.from, to: action.to, with: [beat] });
  }

  const line = flat(edit.line);
  const said = leadLineOf(scene, edit.leadSpeakers, edit.lineBefore);
  if (said && line && line !== flat(said.text)) {
    replace.push({ from: said.from, to: said.to, with: [line] });
  } else if (said && !line && flat(edit.lineBefore)) {
    // The card's line taken away: its words go (a parenthetical just before them too), and
    // its cue when the cue said nothing else.
    const index = scene.elements.indexOf(said);
    let cueAt = index - 1;
    while (cueAt >= 0 && scene.elements[cueAt]!.kind === 'parenthetical') cueAt -= 1;
    const cue = scene.elements[cueAt]?.kind === 'character' ? scene.elements[cueAt] : undefined;
    let end = index + 1;
    while (
      end < scene.elements.length &&
      ['dialogue', 'parenthetical'].includes(scene.elements[end]!.kind)
    )
      end += 1;
    const saysMore = scene.elements
      .slice(cueAt + 1, end)
      .some(element => element !== said && element.kind === 'dialogue');
    const first = scene.elements[index - 1]?.kind === 'parenthetical' ? index - 1 : index;
    const from = cue && !saysMore ? cue.from : scene.elements[first]!.from;
    replace.push({ from, to: said.to, with: [] });
  } else if (!said && line) {
    // A line the scene's lead didn't have: said after the action.
    out.push('', edit.leadCue, line);
  }

  for (const change of replace.sort((a, b) => b.from - a.from)) {
    out.splice(at(change.from), change.to - change.from + 1, ...change.with);
  }
  // No double blank lines where a paragraph went.
  return out.filter(
    (text, index, all) => text.trim() || index === 0 || all[index - 1]!.trim() !== ''
  );
}

const shotKey = (shot: Pick<PlannedShot, 'purpose' | 'speaker' | 'line'>) =>
  shot.purpose === 'dialogue' ? `d|${shot.speaker ?? ''}|${flat(shot.line)}` : shot.purpose;

/**
 * The scene's shots planned again (draftShots) with each carrying the shot it was: a line's
 * shot by its speaker and words (the card's own line by what it was — `lineSwap`), else by its
 * purpose in order (the establishing shot, the first reaction…). A carried shot keeps its id
 * and its Scene; a new one is unmade; one no longer planned is dropped from the plan — its
 * Scene stays (listed as loose by shortMomentsOf), never deleted.
 */
export function replannedMomentShots(
  before: readonly PlannedShot[],
  scene: ScriptScene,
  lineSwap?: { speaker: string; from?: string; to?: string }
): PlannedShot[] {
  const unused = [...before];
  const take = (key: string) => {
    const index = unused.findIndex(shot => shotKey(shot) === key);
    return index < 0 ? undefined : unused.splice(index, 1)[0];
  };
  const swapped = (shot: PlannedShot) =>
    lineSwap &&
    shot.purpose === 'dialogue' &&
    shot.speaker === lineSwap.speaker &&
    flat(shot.line) === flat(lineSwap.to)
      ? `d|${lineSwap.speaker}|${flat(lineSwap.from)}`
      : undefined;
  const drafted = draftShots(scene);
  const carried = new Set<number>();
  const planned = drafted.map((shot, index) => {
    const was = take(shotKey(shot)) ?? (swapped(shot) ? take(swapped(shot)!) : undefined);
    if (!was) return shot;
    carried.add(index);
    return {
      ...shot,
      id: was.id,
      ...(was.madeSceneId ? { madeSceneId: was.madeSceneId } : {}),
      ...(was.priority ? { priority: was.priority } : {}),
    };
  });
  // A new shot's id must not be a carried one's, nor one a dropped shot's Scene still names.
  const taken = new Set([
    ...planned.filter((_, index) => carried.has(index)).map(shot => shot.id),
    ...before.map(shot => shot.id),
  ]);
  let n = drafted.length;
  return planned.map((shot, index) => {
    if (carried.has(index)) return shot;
    let id = shot.id;
    while (taken.has(id)) id = `${scene.id}~${++n}`;
    taken.add(id);
    return id === shot.id ? shot : { ...shot, id };
  });
}
