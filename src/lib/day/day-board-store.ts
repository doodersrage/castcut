/**
 * The Short's board as stored (Step 5f part 3b, 2026-11-10): slim — each moment its short's
 * Scene holds kept as its id and what a Scene doesn't hold (slimDayBoard) — and read back whole
 * (dayBoardFromShort). Registered with the settings cache, so every loadToolSettings('day') and
 * saveToolSettings('day', …) goes through it: whatever reads the board gets it whole, and
 * whatever writes it changes the whole board, stored slim only when it reads back the same.
 * 3.13 and on read a slim copy (its reader shipped there): the release to roll back to is 3.15.2.
 */
import { DEFAULT_SCENE_TOOL_CACHE, type DayToolCache } from '../play/settings';
import { loadSettingsCache, loadToolSettings, registerToolStoreCodec } from '../settings/cache';
import {
  dayBoardFromShort,
  dayMomentsFromShort,
  dayShortFingerprint,
  slimDayBoard,
} from './day-as-short';
import {
  normalizeDaySlotStills,
  normalizeDaySlots,
  type DaySlot,
  type DaySlotStill,
} from './planner';
import { normalizeSavedScenes, takeAsStill, type SavedScene } from './scenes';
// Also registers the sync merge's keeper of a card whose Scene was deleted on another device.
import { isSlimSlot } from './day-board-merge';

/** Each card's Scene in the board's short (by the card it is tied to). */
function tiedScenes(
  link: { scriptId: string; castId: string },
  scenes: readonly SavedScene[]
): Map<string, SavedScene> {
  const tied = new Map<string, SavedScene>();
  for (const scene of scenes) {
    if (
      scene.fromScript?.scriptId === link.scriptId &&
      scene.castId === link.castId &&
      scene.fromDaySlot &&
      !tied.has(scene.fromDaySlot)
    )
      tied.set(scene.fromDaySlot, scene);
  }
  return tied;
}

/**
 * A card's still stored as the take of its Scene it is (Step 5f, after 3c): `{ slotId, fromTake }`
 * — the take's id; read back as that take shows (takeAsStill), kept or not. 3.15.4 and before
 * read it as an empty still (the card's kept take put back on it in step).
 */
type TakeStill = { slotId: DaySlot['id']; fromTake: string };

function isTakeStill(still: unknown): still is TakeStill {
  return (
    Boolean(still) &&
    typeof (still as TakeStill).fromTake === 'string' &&
    Object.keys(still as object).every(key => key === 'slotId' || key === 'fromTake')
  );
}

const stillsKey = (stills: readonly DaySlotStill[] | undefined) =>
  JSON.stringify(
    normalizeDaySlotStills(stills ? [...stills] : []).sort((a, b) =>
      a.slotId.localeCompare(b.slotId)
    )
  );

/**
 * The board whole: read back from its short when in step; and a slim moment its Scene still
 * holds is filled from it even when not (something changed the stored copy since — a still, the
 * mood): never an empty card for a moment its Scene has. A moment filled that way isn't in step
 * with the link, so the board writes it into its short again — what the Scene already says.
 */
export function wholeDayBoard<T extends Partial<DayToolCache>>(
  stored: T,
  scenes: readonly SavedScene[]
): T {
  const link = stored.shortLink;
  if (!link?.scriptId || !link.castId || !Array.isArray(stored.slots)) return stored;
  const day = takeStillsRead(stored, scenes);
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

/**
 * The stored board with each still stored as its take (TakeStill) read back as that take shows;
 * one whose take is gone isn't a still any more. A link in step with the stored form stays in
 * step with it.
 */
function takeStillsRead<T extends Partial<DayToolCache>>(
  stored: T,
  scenes: readonly SavedScene[]
): T {
  const link = stored.shortLink!;
  if (!Array.isArray(stored.stills) || !stored.stills.some(isTakeStill)) return stored;
  const tied = tiedScenes(link, scenes);
  const stills = stored.stills.flatMap(still => {
    if (!isTakeStill(still)) return [still];
    const take = tied.get(still.slotId)?.takes.find(entry => entry.id === still.fromTake);
    return take ? [takeAsStill(still.slotId, take)] : [];
  });
  const day = { ...stored, stills };
  return dayShortFingerprint(stored as DayToolCache) === link.fingerprint
    ? { ...day, shortLink: { ...link, fingerprint: dayShortFingerprint(day as DayToolCache) } }
    : day;
}

/** The board as stored: slim when it reads back the same, else whole. */
export function storedDayBoard<T extends Partial<DayToolCache>>(
  day: T,
  scenes: readonly SavedScene[]
): T {
  if (!day.shortLink?.scriptId || !Array.isArray(day.slots)) return day;
  const slim =
    (slimDayBoard(day as T & Pick<DayToolCache, 'slots'>, scenes) as T | null) ??
    waitingSlimBoard(day, scenes);
  if (!slim) return day;
  return stillsLeftToScenes(day, slim, scenes) ?? slim;
}

/**
 * A slim board with each still that is exactly a take of its card's Scene, as that take shows
 * (Make the short's renders), stored as that take (TakeStill; Step 5f, after 3c). One the board
 * finished, reframed or holds a previous take of, one rendering, another Cast's, is kept. Read
 * back it must be the same board (cards, stills, link), else null (the slim board as it is).
 */
function stillsLeftToScenes<T extends Partial<DayToolCache>>(
  day: T,
  slim: T,
  scenes: readonly SavedScene[]
): T | null {
  const link = slim.shortLink;
  if (!link?.castId || !Array.isArray(slim.stills) || !slim.stills.length) return null;
  const tied = tiedScenes(link, scenes);
  const slimIds = new Set((slim.slots ?? []).filter(isSlimSlot).map(slot => slot.id));
  const owner = slim.stillsCharacterId?.trim();
  if (owner && owner !== link.castId) return null;
  let taken = false;
  const stills = slim.stills.map(still => {
    if (!slimIds.has(still.slotId)) return still;
    const key = stillsKey([still]);
    const take = tied
      .get(still.slotId)
      ?.takes.find(entry => stillsKey([takeAsStill(still.slotId, entry)]) === key);
    if (!take) return still;
    taken = true;
    return { slotId: still.slotId, fromTake: take.id } as TakeStill as unknown as DaySlotStill;
  });
  if (!taken) return null;
  const inStep = dayShortFingerprint(slim as DayToolCache) === link.fingerprint;
  const without = { ...slim, stills };
  const next = inStep
    ? {
        ...without,
        shortLink: { ...link, fingerprint: dayShortFingerprint(without as DayToolCache) },
      }
    : without;
  const back = wholeDayBoard(JSON.parse(JSON.stringify(next)) as T, scenes);
  const slots = JSON.stringify(normalizeDaySlots(day.slots, day.dayLength));
  return JSON.stringify(normalizeDaySlots(back.slots, day.dayLength)) === slots &&
    stillsKey(back.stills) === stillsKey(day.stills) &&
    back.shortLink?.fingerprint === day.shortLink?.fingerprint &&
    // Out of step it stays so (its edit still to go in).
    (inStep || dayShortFingerprint(next as DayToolCache) !== link.fingerprint)
    ? next
    : null;
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
    stillsKey(back.stills) === stillsKey(day.stills) &&
    back.shortLink?.fingerprint === link.fingerprint
    ? slim
    : null;
}

/**
 * The board's stills as stored, not filled from its short (a card's still stored as its take
 * read as that take): what the board itself keeps — the board's stills pull writes a kept take
 * in when this lacks it, so it stays the board's once the Scene unkeeps it.
 */
export function storedDayStills(): DaySlotStill[] {
  const stored = loadSettingsCache().tools.day;
  if (!stored || !Array.isArray(stored.stills)) return [];
  if (!stored.shortLink?.scriptId || !stored.shortLink.castId) return stored.stills;
  return takeStillsRead(stored, savedScenes()).stills ?? [];
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
