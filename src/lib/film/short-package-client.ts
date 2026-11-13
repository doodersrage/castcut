'use client';

/**
 * A short packed from this install and restored on another (short-package.ts): read from and
 * written to the stores the pages use — scripts (their own store), Scenes (`tools.scene`), the
 * Cast — so each page shows it the way it shows its own.
 */
import { getCharacter, slugCharacterName } from '../character/os';
import { exportCast, importCastData } from '../cast/transfer-client';
import { loadDayBoard } from '../day/day-board-client';
import { applySceneScriptsPatch, loadSceneScriptStore } from '../day/scene-script-store-client';
import {
  addScriptPatch,
  newScriptId,
  scriptDroppedByAdding,
  SCRIPTS_PER_CAST,
} from '../day/scene-scripts';
import { newSceneId, normalizeSavedScenes } from '../day/scenes';
import { DEFAULT_DAY_TOOL_CACHE, DEFAULT_SCENE_TOOL_CACHE } from '../play/settings';
import { loadSettingsCache, loadToolSettings, saveToolSettings } from '../settings/cache';
import { flushBrowserStorageNow } from '../storage/browser-storage';
import {
  placeShortPackage,
  shortCastIds,
  shortPackageContent,
  type ShortPackage,
  type ShortPackageBoard,
} from './short-package';

/**
 * The short of `scriptId` as it is here, its Cast as Cast files (pictures inline). Null when
 * there is no such script. `castMissing`: Cast it names that isn't on this device.
 */
export async function packShort(
  scriptId: string
): Promise<{ short: ShortPackage; castMissing: string[]; pictureMissing: boolean } | null> {
  const script = loadSceneScriptStore().scripts.find(entry => entry.id === scriptId);
  if (!script) return null;
  const scenes = normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes);
  const cast = [];
  const castMissing: string[] = [];
  let pictureMissing = false;
  for (const id of shortCastIds(
    script,
    scenes.filter(scene => scene.fromScript?.scriptId === script.id)
  )) {
    if (!getCharacter(id)) {
      castMissing.push(id);
      continue;
    }
    const exported = await exportCast(id);
    cast.push(exported.file);
    pictureMissing ||= exported.pictureMissing;
  }
  return {
    short: shortPackageContent({ script, scenes, board: loadDayBoard(), cast }),
    castMissing,
    pictureMissing,
  };
}

export type ShortRestore = {
  scriptId: string;
  scriptName: string;
  /** Its lead here, and the name it has here. */
  leadId: string;
  leadName: string;
  scenes: number;
  /** Cast added here (a Cast already here — the same id and name — is used as it is). */
  castAdded: string[];
  castReused: string[];
  /**
   * Its Short board: `live` — its lead is the Short's Cast and the board was empty; `parked` —
   * under its lead, back when the lead is picked on Short; `kept-yours` — the lead has a board
   * here already, left as it is (the short is on Script, Scene and Cut all the same).
   */
  board: 'live' | 'parked' | 'kept-yours' | 'none';
  /** The ids changed because they were taken here: package id → id here (for its cut). */
  ids: Map<string, string>;
  pictureErrors: string[];
};

/**
 * The short added here beside what's there: its Cast first (each one already here used as it
 * is), then its script and Scenes, every id that was taken given a new one. Refuses, before
 * changing anything, when its lead already keeps {@link SCRIPTS_PER_CAST} scripts.
 */
export async function restoreShortPackage(short: ShortPackage): Promise<ShortRestore> {
  const store = loadSceneScriptStore();
  const leadId = short.script.castId;
  const leadFile = short.cast.find(file => file.character.id === leadId);
  const sameCast = (id: string, name: string) => {
    const here = getCharacter(id);
    return Boolean(here && slugCharacterName(here.name) === slugCharacterName(name));
  };
  // The lead's script list is full here: say so before anything is added.
  const leadHere = leadFile && sameCast(leadId, leadFile.character.name) ? leadId : null;
  if (leadHere && scriptDroppedByAdding(store.scripts, leadHere)) {
    throw new Error(
      `${leadFile!.character.name} already keeps ${SCRIPTS_PER_CAST} scripts — archive one on Script to import this short.`
    );
  }
  const castIds = new Map<string, string>();
  const castAdded: string[] = [];
  const castReused: string[] = [];
  const pictureErrors: string[] = [];
  for (const file of short.cast) {
    const id = file.character.id?.trim();
    if (!id) continue;
    if (sameCast(id, file.character.name)) {
      castIds.set(id, id);
      castReused.push(file.character.name);
      continue;
    }
    const added = await importCastData(file);
    castIds.set(id, added.character.id);
    castAdded.push(added.character.name);
    if (added.pictureError) pictureErrors.push(`${added.character.name}: ${added.pictureError}`);
  }
  const sceneTool = loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE);
  const scenesHere = normalizeSavedScenes(sceneTool.scenes);
  const placed = placeShortPackage(short, {
    castIds,
    scriptIdTaken: id =>
      store.scripts.some(script => script.id === id) || id in (store.removedAt ?? {}),
    sceneIdTaken: id =>
      scenesHere.some(scene => scene.id === id) || id in (sceneTool.removedSceneAt ?? {}),
    newScriptId: () => newScriptId(Date.now()),
    newSceneId: () => newSceneId(),
  });
  applySceneScriptsPatch(addScriptPatch(store, placed.script));
  saveToolSettings('scene', {
    ...sceneTool,
    scenes: normalizeSavedScenes([...scenesHere, ...placed.scenes]),
  });
  const board = placed.board ? restoreBoard(placed.board, placed.script.castId) : 'none';
  // Written through before it says it's done: a reload straight after found no script (the
  // browser stores debounce their writes; CI, 2026-11-13).
  await Promise.race([
    flushBrowserStorageNow(),
    new Promise<void>(resolve => window.setTimeout(resolve, 4000)),
  ]);
  return {
    board,
    scriptId: placed.script.id,
    scriptName: placed.script.name,
    leadId: placed.script.castId,
    leadName: getCharacter(placed.script.castId)?.name ?? leadFile?.character.name ?? '',
    scenes: placed.scenes.length,
    castAdded,
    castReused,
    ids: placed.ids,
    pictureErrors,
  };
}

const boardHasMoments = (day: Partial<ShortPackageBoard>) =>
  Boolean(day.shortLink) ||
  (day.stills?.length ?? 0) > 0 ||
  (day.slots ?? []).some(slot => Boolean(slot.location || slot.sceneHints || slot.line));

/** The short's board placed for its lead, never over a board that is there (see ShortRestore). */
function restoreBoard(board: ShortPackageBoard, leadId: string): ShortRestore['board'] {
  const day = loadToolSettings('day', DEFAULT_DAY_TOOL_CACHE);
  const owner =
    day.stillsCharacterId?.trim() || loadSettingsCache().shared.activeCharacterId?.trim() || '';
  const restored = { ...board, stillsCharacterId: leadId };
  if (owner === leadId) {
    if (boardHasMoments(day)) return 'kept-yours';
    saveToolSettings('day', { ...day, ...restored });
    return 'live';
  }
  if (day.parkedDays?.[leadId]) return 'kept-yours';
  const { stillsCharacterId: _owner, ...parked } = restored;
  saveToolSettings('day', {
    ...day,
    parkedDays: { ...(day.parkedDays ?? {}), [leadId]: { ...parked, at: Date.now() } },
  });
  return 'parked';
}
