'use client';

/**
 * Cut's side of line delivery (line-delivery.ts): for each still with a line, its Scene's script
 * (the Scene's fromScript link) gives the parenthetical written above that line, and whether the
 * script is an adult one. Scenes made before deliveries existed need nothing new: the link and
 * the script are enough.
 */

import { normalizeSavedScenes } from '../day/scenes';
import { loadSceneScriptStore } from '../day/scene-script-store-client';
import { scriptMoodIsAdult } from '../day/script-shots-llm';
import { DEFAULT_SCENE_TOOL_CACHE } from '../play/settings';
import { parseScript, type ScriptScene } from '../script/parse';
import { loadToolSettings } from '../settings/cache';
import { splitCutRoomKey } from './cut-room';
import { scriptLineNote } from './line-delivery';

export type CutLineNotes = {
  /** Shot key → the script's note for its line. */
  notes: Record<string, string>;
  /** One of the lines comes from an adult script. */
  adult: boolean;
};

export function cutLineNotes(lines: ReadonlyArray<{ key: string; text: string }>): CutLineNotes {
  const scenes = normalizeSavedScenes(loadToolSettings('scene', DEFAULT_SCENE_TOOL_CACHE).scenes);
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  const scripts = new Map(loadSceneScriptStore().scripts.map(script => [script.id, script]));
  const parsed = new Map<string, Map<string, ScriptScene>>();
  const notes: Record<string, string> = {};
  let adult = false;
  for (const { key, text } of lines) {
    const { source, key: sceneId } = splitCutRoomKey(key);
    if (source !== 'scenes') continue;
    const link = byId.get(sceneId)?.fromScript;
    const script = link ? scripts.get(link.scriptId) : undefined;
    if (!link || !script) continue;
    if (scriptMoodIsAdult(script.mood)) adult = true;
    let sceneMap = parsed.get(script.id);
    if (!sceneMap) {
      sceneMap = new Map(parseScript(script.source).scenes.map(scene => [scene.id, scene]));
      parsed.set(script.id, sceneMap);
    }
    const scriptScene = sceneMap.get(link.sceneId);
    const note = scriptScene ? scriptLineNote(scriptScene, text) : undefined;
    if (note) notes[key] = note;
  }
  return { notes, adult };
}
