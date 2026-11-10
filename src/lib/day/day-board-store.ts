/**
 * The Short's board as stored (Step 5f part 3b, 2026-11-10): slim — each moment its short's
 * Scene holds kept as its id and what a Scene doesn't hold (slimDayBoard) — and read back whole
 * (dayBoardFromShort). Registered with the settings cache, so every loadToolSettings('day') and
 * saveToolSettings('day', …) goes through it: whatever reads the board gets it whole, and
 * whatever writes it changes the whole board, stored slim only when it reads back the same.
 * 3.13 and on read a slim copy (its reader shipped there): the release to roll back to is 3.15.2.
 */
import { DEFAULT_SCENE_TOOL_CACHE, type DayToolCache } from '../play/settings';
import { loadToolSettings, registerToolStoreCodec } from '../settings/cache';
import {
  dayBoardFromShort,
  dayMomentsFromShort,
  dayShortFingerprint,
  slimDayBoard,
} from './day-as-short';
import { normalizeDaySlots, type DaySlot } from './planner';
import { normalizeSavedScenes, type SavedScene } from './scenes';

/** What a slim moment keeps: the rest is its Scene's. */
const SLIM_KEYS = new Set(['id', 'eventMove', 'sceneHintsDay']);

function isSlimSlot(slot: unknown): slot is Pick<DaySlot, 'id' | 'eventMove' | 'sceneHintsDay'> {
  return (
    Boolean(slot) &&
    typeof slot === 'object' &&
    typeof (slot as { id?: unknown }).id === 'string' &&
    Object.keys(slot as object).every(key => SLIM_KEYS.has(key))
  );
}

/**
 * The board whole: read back from its short when in step; and a slim moment its Scene still
 * holds is filled from it even when not (something changed the stored copy since — a still, the
 * mood): never an empty card for a moment its Scene has. A moment filled that way isn't in step
 * with the link, so the board writes it into its short again — what the Scene already says.
 */
export function wholeDayBoard<T extends Partial<DayToolCache>>(
  day: T,
  scenes: readonly SavedScene[]
): T {
  const link = day.shortLink;
  if (!link?.scriptId || !link.castId || !Array.isArray(day.slots)) return day;
  const read = dayBoardFromShort(day as T & Pick<DayToolCache, 'slots'>, scenes);
  const slots = read.slots ?? [];
  if (!slots.some(isSlimSlot)) return read;
  // Its Scene's moment, as the reader makes it (time of day, what stays the board's).
  const moments = dayMomentsFromShort(read as T & Pick<DayToolCache, 'slots'>, scenes, link);
  if (!moments) return read;
  const byId = new Map(moments.map(slot => [slot.id, slot]));
  const held = new Set(
    scenes
      .filter(
        scene =>
          scene.fromScript?.scriptId === link.scriptId &&
          scene.castId === link.castId &&
          scene.fromDaySlot
      )
      .map(scene => scene.fromDaySlot)
  );
  let filled = false;
  const next = slots.map(slot => {
    const moment = isSlimSlot(slot) && held.has(slot.id) ? byId.get(slot.id) : undefined;
    if (!moment) return slot;
    filled = true;
    return moment;
  });
  return filled ? { ...read, slots: next } : read;
}

/** The board as stored: slim when it reads back the same, else whole. */
export function storedDayBoard<T extends Partial<DayToolCache>>(
  day: T,
  scenes: readonly SavedScene[]
): T {
  if (!day.shortLink?.scriptId || !Array.isArray(day.slots)) return day;
  return (
    (slimDayBoard(day as T & Pick<DayToolCache, 'slots'>, scenes) as T | null) ??
    waitingSlimBoard(day, scenes) ??
    day
  );
}

/**
 * Slim with an edit waiting to go into its short (Step 5f part 3c): its Scenes took the card
 * edits at once (shortScenesWithBoard), so they hold every card already — only the script's
 * update is to come. The link stays as it was (the edit still waiting, the board writes it), and
 * it must read back as the same board with the same edit waiting, else it is stored whole.
 * 3.15.3 reads it (wholeDayBoard fills a slim card out of step): the release to roll back to.
 */
function waitingSlimBoard<T extends Partial<DayToolCache>>(
  day: T,
  scenes: readonly SavedScene[]
): T | null {
  const link = day.shortLink!;
  if (!link.castId) return null;
  const board = day as T & Pick<DayToolCache, 'slots'>;
  if (dayShortFingerprint(board as DayToolCache) === link.fingerprint) return null;
  if (dayMomentsFromShort(board, scenes, link)) return null;
  const held = new Set(
    scenes
      .filter(
        scene =>
          scene.fromScript?.scriptId === link.scriptId &&
          scene.castId === link.castId &&
          scene.fromDaySlot
      )
      .map(scene => scene.fromDaySlot)
  );
  const slots = normalizeDaySlots(board.slots, board.dayLength);
  if (!slots.some(slot => held.has(slot.id))) return null;
  const slim = {
    ...day,
    slots: slots.map(slot =>
      held.has(slot.id)
        ? ({
            id: slot.id,
            ...(slot.eventMove ? { eventMove: slot.eventMove } : {}),
            ...(slot.sceneHintsDay ? { sceneHintsDay: slot.sceneHintsDay } : {}),
          } as DaySlot)
        : slot
    ),
  };
  const back = wholeDayBoard(JSON.parse(JSON.stringify(slim)) as T, scenes);
  return JSON.stringify(normalizeDaySlots(back.slots, board.dayLength)) === JSON.stringify(slots) &&
    back.shortLink?.fingerprint === link.fingerprint
    ? slim
    : null;
}

function savedScenes(): SavedScene[] {
  return normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes);
}

// Read on every load: the last one kept while the stored board and the Scenes are the same.
let last: { stored: unknown; scenes: unknown; whole: unknown } | null = null;

registerToolStoreCodec('day', {
  fromStore: stored => {
    if (!stored?.shortLink?.scriptId) return stored;
    const scenesStored = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes;
    if (last && last.stored === stored && last.scenes === scenesStored) {
      return last.whole as typeof stored;
    }
    const whole = wholeDayBoard(stored, normalizeSavedScenes(scenesStored));
    last = { stored, scenes: scenesStored, whole };
    return whole;
  },
  toStore: settings => storedDayBoard(settings, savedScenes()),
});
