/**
 * A scene added on Script gets its card (Step 5f part 2, 2026-11-09): a linked Short's board
 * shows every scene of its short, so a scene written on Script — no card made it — is given one.
 * It takes an empty card (no place, beat or line, no still), else the board grows by one moment
 * (up to {@link DAY_LENGTH_MAX}). The card is tied to the scene through one of its Scenes
 * (`fromDaySlot`): the Scene on her first line, else its first shot's, else one it has loose —
 * and with none, a Scene made from the card, on a planned shot with no Scene yet. The card is
 * then what that Scene holds (dayMomentsFromShort), so nothing goes back into the script.
 * Pure; nothing is dropped — a Scene only gains its card, a script shot only its Scene.
 */

import type { DayToolCache } from '../play/settings';
import { dayMomentsFromShort } from './day-as-short';
import { dayPartOf } from './parts';
import {
  DAY_LENGTH_MAX,
  dayLengthSlotIds,
  normalizeDaySlotStills,
  normalizeDaySlots,
  orderDaySlots,
  type DaySlot,
  type DaySlotId,
} from './planner';
import { sceneFromDaySlot, type SavedScene } from './scenes';
import type { SavedScript } from './scene-scripts';
import { cueOf } from './short-dialogue';
import { shortMomentsOf, shortSlotOrder, type ShortMoment } from './short-moments';

export type ShortCardsAdded = {
  slots: DaySlot[];
  dayLength: number;
  slotOrder: DaySlotId[];
  /** The script, its shots given the Scenes made here (the same script when none was). */
  script: SavedScript;
  /** The Scenes changed (given their card) or made. */
  scenes: SavedScene[];
  /** Scenes of the short left without a card: the board is full. */
  left: number;
};

const empty = (slot: DaySlot) =>
  !slot.location?.trim() && !slot.sceneHints?.trim() && !slot.line?.trim();

/** "Kitchen" for KITCHEN, "Café terrace" for CAFÉ TERRACE: a card's title from its place. */
function titleOf(place: string): string {
  const text = place.replace(/\s+/g, ' ').trim().toLowerCase();
  return text ? (text.charAt(0).toUpperCase() + text.slice(1)).slice(0, 40) : '';
}

/**
 * The cards a linked Short's board is missing — one per scene of its short no card is tied to —
 * or null when every scene has one. `day` is the board as it is (its slots, length, order).
 */
export function shortCardsForScriptScenes(input: {
  day: DayToolCache;
  script: SavedScript;
  scenes: readonly SavedScene[];
  castId: string;
  leadName: string;
  now?: number;
}): ShortCardsAdded | null {
  const { script, castId } = input;
  if (!castId.trim() || script.castId !== castId) return null;
  const moments = shortMomentsOf(script, input.scenes);
  const missing = moments.filter(moment => !moment.daySlot);
  if (!missing.length) return null;
  const now = input.now ?? Date.now();
  const leads = new Set([
    cueOf(input.leadName),
    ...Object.entries(script.castMap ?? {})
      .filter(([, id]) => id === castId)
      .map(([speaker]) => speaker.toUpperCase()),
  ]);
  // A card some Scene of the short is tied to (even one whose scene is gone) isn't free: its
  // Scene would fill it back.
  const ours = input.scenes.filter(scene => scene.fromScript?.scriptId === script.id);
  const claimed = new Set(ours.map(scene => scene.fromDaySlot).filter(Boolean));
  let length = normalizeDaySlots(input.day.slots, input.day.dayLength).length;
  let board = normalizeDaySlots(input.day.slots, length);
  const stills = normalizeDaySlotStills(input.day.stills, board);
  const sceneIds = new Set(input.scenes.map(scene => scene.id));
  let shots = [...(script.shots ?? [])];
  const changed: SavedScene[] = [];
  let left = 0;

  const freeCard = (): DaySlotId | null => {
    const unused = board.find(
      slot =>
        empty(slot) &&
        !claimed.has(slot.id) &&
        !stills.some(still => still.slotId === slot.id && still.imageUrl)
    );
    if (unused) return unused.id;
    if (length >= DAY_LENGTH_MAX) return null;
    const grown = dayLengthSlotIds(length + 1).find(id => !board.some(slot => slot.id === id));
    // A Scene of the short is tied to it already (the board was shorter once): left be.
    if (!grown || claimed.has(grown)) return null;
    length += 1;
    board = normalizeDaySlots(board, length);
    return grown;
  };

  const leadLine = (moment: ShortMoment) =>
    moment.lines.find(line => leads.has(line.speaker.toUpperCase()) && !line.offscreen);

  for (const moment of missing) {
    const slotId = freeCard();
    if (!slotId) {
      left += 1;
      continue;
    }
    claimed.add(slotId);
    const label = titleOf(moment.place) || titleOf(moment.heading) || undefined;
    const place = moment.place.trim() || moment.heading.trim() || 'Home';
    // Her first line's Scene, else the first shot's, else one it has loose.
    const anchor =
      moment.shots.find(
        entry => entry.scene && entry.shot.speaker && leads.has(entry.shot.speaker.toUpperCase())
      )?.scene ??
      moment.shots.find(entry => entry.scene)?.scene ??
      moment.loose[0];
    if (anchor) {
      const held = anchor.slot;
      changed.push({
        ...anchor,
        fromDaySlot: slotId,
        slot: {
          ...held,
          ...(label ? { label } : {}),
          // A card with nothing on it isn't a moment (the short would drop its scene).
          ...(empty(held) ? { location: place.slice(0, 160) } : {}),
        },
        updatedAt: now,
      });
      continue;
    }
    // No Scene yet: one made from the card, on her first line's shot (else the first) with none.
    const line = leadLine(moment);
    const beat = moment.action[0]?.slice(0, 320);
    const part = moment.dayPart;
    const card: DaySlot = {
      ...board.find(slot => slot.id === slotId)!,
      ...(label ? { label } : {}),
      location: titleOf(place).slice(0, 160) || place.slice(0, 160),
      ...(beat ? { sceneHints: beat } : {}),
      ...(line ? { line: line.text } : {}),
      ...(part && part !== dayPartOf(slotId) ? { timeOfDay: part } : {}),
    } as DaySlot;
    const free =
      moment.shots.find(
        entry => !entry.scene && entry.shot.speaker && leads.has(entry.shot.speaker.toUpperCase())
      ) ?? moment.shots.find(entry => !entry.scene);
    let id = `scene-${script.id}-${slotId}`;
    for (let n = 2; sceneIds.has(id); n += 1) id = `scene-${script.id}-${slotId}-${n}`;
    const made = sceneFromDaySlot({
      day: {
        ...input.day,
        slots: board.map(slot => (slot.id === slotId ? card : slot)),
        dayLength: length,
        // A still on another card isn't this scene's.
        stills: [],
      },
      slotId,
      castId,
      name: label || moment.heading.slice(0, 60) || 'Moment',
      id,
      now,
    });
    if (!made) {
      left += 1;
      continue;
    }
    sceneIds.add(id);
    const shotId = free?.shot.id ?? `${moment.sceneId}-moment`;
    if (free) shots = shots.map(shot => (shot.id === shotId ? { ...shot, madeSceneId: id } : shot));
    changed.push({ ...made, fromScript: { scriptId: script.id, sceneId: moment.sceneId, shotId } });
  }
  if (!changed.length) return null;

  const shotsMoved = shots.some((shot, at) => shot !== script.shots?.[at]);
  const nextScript: SavedScript = shotsMoved ? { ...script, shots, updatedAt: now } : script;
  const byId = new Map(changed.map(scene => [scene.id, scene]));
  const scenesNow = [
    ...input.scenes.map(scene => byId.get(scene.id) ?? scene),
    ...changed.filter(scene => !input.scenes.some(entry => entry.id === scene.id)),
  ];
  // Each card as its Scene holds it, and the board in the script's order.
  const link = { castId, scriptId: script.id };
  const filled = dayMomentsFromShort({ slots: board, dayLength: length }, scenesNow, link) ?? board;
  const ordered = orderDaySlots(filled, input.day.slotOrder).map(slot => slot.id);
  return {
    slots: filled,
    dayLength: length,
    slotOrder: shortSlotOrder(ordered, shortMomentsOf(nextScript, scenesNow)),
    script: nextScript,
    scenes: changed,
    left,
  };
}
