/**
 * A Short's moments as its script has them (Step 5a, 2026-11-09: "a moment is now just part of
 * scene as a whole"): each script scene is a moment — its heading, its action, the lines its
 * people say — with the shots planned for it (`script.shots`) and, on each, the Scene made from
 * it and that Scene's kept take. Today's shorts (one shot, one Scene per moment, dayAsShort) read
 * as one-shot scenes. Read-only and pure: nothing is written, nothing is dropped — a Scene of the
 * scene that no planned shot points at is listed as `loose`, not left out.
 */

import { parseScript, type ScriptDayPart } from '../script/parse';
import { keptTakeOf, type SavedScene, type SceneTake } from './scenes';
import type { SavedScript } from './scene-scripts';
import type { PlannedShot } from './script-shots';
import type { DaySlotId } from './planner';

/** A line said in the moment: who, the words, how (a parenthetical), heard but not seen. */
export type ShortMomentLine = {
  speaker: string;
  text: string;
  how?: string;
  offscreen?: boolean;
};

/** One planned shot of the moment, its Scene and the take kept there. */
export type ShortMomentShot = {
  shot: PlannedShot;
  scene?: SavedScene;
  kept?: SceneTake;
};

export type ShortMoment = {
  /** The script scene (script/parse.ts id). */
  sceneId: string;
  heading: string;
  place: string;
  dayPart?: ScriptDayPart;
  /** The action, paragraph by paragraph. */
  action: string[];
  lines: ShortMomentLine[];
  /** Who speaks, in order of their first line. */
  speakers: string[];
  shots: ShortMomentShot[];
  /** This scene's Scenes no planned shot points at (a shot re-planned away): kept, listed. */
  loose: SavedScene[];
  /** Shots with a kept take. */
  rendered: number;
  /** The board moment it was made from (a Short's own, before Step 5), when its Scenes say. */
  daySlot?: DaySlotId;
};

const OFFSCREEN = /^(?:V\.?O\.?|O\.?S\.?|O\.?C\.?)$/i;

/**
 * Every scene of a Short's script as a moment, in script order, with its shots, their Scenes
 * and kept takes. A shot finds its Scene by `madeSceneId`, else by the Scene's own link to it
 * (`fromScript.shotId`). Pure.
 */
export function shortMomentsOf(
  script: Pick<SavedScript, 'id' | 'source' | 'shots'>,
  scenes: readonly SavedScene[]
): ShortMoment[] {
  const parsed = parseScript(script.source);
  const ours = scenes.filter(scene => scene.fromScript?.scriptId === script.id);
  const byId = new Map(ours.map(scene => [scene.id, scene]));
  const byShot = new Map(
    ours.map(scene => [scene.fromScript!.shotId, scene] as const).filter(([shotId]) => shotId)
  );
  return parsed.scenes.map(scene => {
    const action: string[] = [];
    const lines: ShortMomentLine[] = [];
    let how: string | undefined;
    for (const element of scene.elements) {
      if (element.kind === 'action' && element.text.trim())
        action.push(element.text.replace(/\s+/g, ' ').trim());
      else if (element.kind === 'parenthetical') how = element.text.replace(/^\(|\)$/g, '').trim();
      else if (element.kind === 'dialogue' && element.speaker && element.text.trim()) {
        lines.push({
          speaker: element.speaker,
          text: element.text.replace(/\s+/g, ' ').trim(),
          ...(how ? { how } : {}),
          ...(element.extension && OFFSCREEN.test(element.extension.trim())
            ? { offscreen: true }
            : {}),
        });
        how = undefined;
      } else if (element.kind === 'character') how = undefined;
    }
    const used = new Set<string>();
    const shots = (script.shots ?? [])
      .filter(shot => shot.sceneId === scene.id)
      .map(shot => {
        const made =
          (shot.madeSceneId ? byId.get(shot.madeSceneId) : undefined) ?? byShot.get(shot.id);
        // A Scene answers one shot: a second shot pointing at it is not rendered by it.
        const sceneOf = made && !used.has(made.id) ? made : undefined;
        if (sceneOf) used.add(sceneOf.id);
        const kept = keptTakeOf(sceneOf);
        return {
          shot,
          ...(sceneOf ? { scene: sceneOf } : {}),
          ...(kept ? { kept } : {}),
        };
      });
    const loose = ours.filter(
      entry => entry.fromScript?.sceneId === scene.id && !used.has(entry.id)
    );
    const daySlot = [...shots.map(entry => entry.scene), ...loose].find(
      entry => entry?.fromDaySlot
    )?.fromDaySlot;
    return {
      sceneId: scene.id,
      heading: scene.heading,
      place: scene.place,
      ...(scene.dayPart ? { dayPart: scene.dayPart } : {}),
      action,
      lines,
      speakers: scene.speakers,
      shots,
      loose,
      rendered: shots.filter(entry => entry.kept).length,
      ...(daySlot ? { daySlot } : {}),
    };
  });
}

/** Whether the card has more to show than its own beat and line (another voice, more shots). */
export function shortMomentHasMore(
  moment: ShortMoment | undefined,
  leadSpeakers: readonly string[]
): boolean {
  if (!moment) return false;
  return (
    moment.shots.length > 1 ||
    moment.lines.length > 1 ||
    moment.lines.some(line => !leadSpeakers.includes(line.speaker.toUpperCase()))
  );
}

/**
 * The board's order as its short has it (Step 5f, 2026-11-09 — the user: cards in the script's
 * order): the moments with a scene in the script's scene order; a moment with none (an empty
 * card, one whose scene went) stays after the one it followed. Pure.
 */
export function shortSlotOrder(
  /** The board's moments, in its order now. */
  slotIds: readonly DaySlotId[],
  moments: readonly Pick<ShortMoment, 'daySlot'>[]
): DaySlotId[] {
  const inScript = moments
    .map(moment => moment.daySlot)
    .filter((id, index, all): id is DaySlotId =>
      Boolean(id && slotIds.includes(id) && all.indexOf(id) === index)
    );
  const out = [...inScript];
  slotIds.forEach((id, index) => {
    if (out.includes(id)) return;
    // After the nearest moment before it that is placed already; else first.
    const before = slotIds
      .slice(0, index)
      .reverse()
      .find(previous => out.includes(previous));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id);
  });
  return out;
}
