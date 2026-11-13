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
import { DEFAULT_SCENE_TOOL_CACHE } from '../play/settings';
import { loadToolSettings, saveToolSettings } from '../settings/cache';
import {
  placeShortPackage,
  shortCastIds,
  shortPackageContent,
  type ShortPackage,
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
  return {
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
