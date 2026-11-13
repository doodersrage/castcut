/**
 * A card's Scene deleted on another device, met in a sync merge (Step 5f, the tombstone gap).
 * The board here may store that card slim: only its Scene said what the card is, so after the
 * merge it would read empty — to Cut, job labels and the writers — until the Short page's pull
 * rebuilt it from the script (place, beat and line only). The card is written whole from the
 * Scene's last copy as the merge drops it, as Scene → Delete does on the device that deleted it
 * (keepShortCardOf): the card stays as it was, no longer a Scene's.
 *
 * Pure, registered with the record merge (storage never imports a feature) through
 * day-board-store, which PlayFeatures loads: the browser's pulls. The server's push merge can't
 * load Play (docs/architecture-boundaries.md), so a device that pushes a slim board before it has
 * pulled the delete leaves the card empty on the server; its next pull writes it whole again (it
 * still has the Scene), and the Short page's pull rebuilds it from the script.
 */
import type { DayToolCache } from '../play/settings';
import {
  registerToolRecordRemovalHook,
  type RemovedToolRecords,
} from '../storage/tool-record-merge';
import { dayBoardFromShort, dayMomentsFromShort } from './day-as-short';
import type { DaySlot } from './planner';
import { normalizeSavedScenes, type SavedScene } from './scenes';

/** What a slim moment keeps: the rest is its Scene's. */
const SLIM_KEYS = new Set(['id', 'eventMove', 'sceneHintsDay']);

export function isSlimSlot(
  slot: unknown
): slot is Pick<DaySlot, 'id' | 'eventMove' | 'sceneHintsDay'> {
  return (
    Boolean(slot) &&
    typeof slot === 'object' &&
    typeof (slot as { id?: unknown }).id === 'string' &&
    Object.keys(slot as object).every(key => SLIM_KEYS.has(key))
  );
}

export function keepCardsOfRemovedScenes(
  tools: Record<string, unknown>,
  removed: readonly RemovedToolRecords[]
): Record<string, unknown> {
  const gone = removed
    .filter(entry => entry.tool === 'scene' && entry.field === 'scenes')
    .flatMap(entry => entry.records);
  if (!gone.length) return tools;
  const day = tools.day as Partial<DayToolCache> | undefined;
  const link = day?.shortLink;
  if (!day || !link?.scriptId || !link.castId || !Array.isArray(day.slots)) return tools;
  const tied = (scene: SavedScene) =>
    scene.fromScript?.scriptId === link.scriptId &&
    scene.castId === link.castId &&
    Boolean(scene.fromDaySlot);
  const scene = tools.scene as { scenes?: unknown } | undefined;
  const left = normalizeSavedScenes(scene?.scenes as SavedScene[] | undefined);
  const held = new Set(left.filter(tied).map(entry => entry.fromDaySlot));
  const dropped = normalizeSavedScenes(gone as unknown as SavedScene[]).filter(
    entry => tied(entry) && !held.has(entry.fromDaySlot)
  );
  const lost = new Set(dropped.map(entry => entry.fromDaySlot));
  if (!day.slots.some(slot => isSlimSlot(slot) && lost.has(slot.id))) return tools;
  // The card as the board read before the merge dropped its Scene (wholeDayBoard's fill): read
  // back from the short when in step, else its Scene's moment.
  const before = [...left, ...dropped];
  const read = dayBoardFromShort(day as DayToolCache & Pick<DayToolCache, 'slots'>, before);
  const readById = new Map((read.slots ?? []).map(slot => [slot.id, slot]));
  const moments = dayMomentsFromShort(read, before, link) ?? [];
  const momentById = new Map(moments.map(slot => [slot.id, slot]));
  const wholeOf = (id: DaySlot['id']) => {
    const fromRead = readById.get(id);
    return fromRead && !isSlimSlot(fromRead) ? fromRead : momentById.get(id);
  };
  let filled = false;
  const slots = day.slots.map(slot => {
    const whole = isSlimSlot(slot) && lost.has(slot.id) ? wholeOf(slot.id) : undefined;
    if (!whole) return slot;
    filled = true;
    return whole;
  });
  return filled ? { ...tools, day: { ...day, slots } } : tools;
}

registerToolRecordRemovalHook(keepCardsOfRemovedScenes);
