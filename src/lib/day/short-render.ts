/**
 * Render the short, every shot (Step 5d, 2026-11-09: "a rendered scene in as much of real time
 * as we can get it"): a moment written as a scene (5c) has shots no Scene renders yet. Before its
 * run, each becomes a Scene — as Script's Prepare a run makes them (shotSceneDraft), dressed as
 * the board is (its mood, its outfit, the card's own Scene's way) — linked both ways, so the run
 * renders every shot of every moment. Pure.
 */

import { parseScript } from '../script/parse';
import type { DayToolCache } from '../play/settings';
import { createScene, type SavedScene } from './scenes';
import type { SavedScript } from './scene-scripts';
import type { ScriptCastMember } from './script-cast';
import { scriptShotCompanions, shotSceneDraft, shotsForScene } from './script-shots';
import { shotsToPrepare } from './scene-run';

/**
 * The short's shots with no Scene made into Scenes: the new Scenes and the script with its shots
 * naming them. Nothing to make: no Scenes, the script as it is.
 */
export function shortShotScenes(input: {
  script: SavedScript;
  scenes: readonly SavedScene[];
  /** The board: the mood and outfit its Scenes are made in. */
  day: DayToolCache;
  castId: string;
  cast: readonly ScriptCastMember[];
  locations?: Parameters<typeof shotSceneDraft>[0]['locations'];
  now?: number;
}): { script: SavedScript; created: SavedScene[] } {
  const now = input.now ?? Date.now();
  const { fit } = shotsToPrepare(input.script, input.scenes);
  if (!fit.length) return { script: input.script, created: [] };
  const parsed = parseScript(input.script.source);
  const places = parsed.scenes.map(scene => scene.place);
  const madeBy = new Map<string, string>();
  const created: SavedScene[] = [];
  fit.forEach((shot, index) => {
    const sceneIndex = parsed.scenes.findIndex(scene => scene.id === shot.sceneId);
    const scene = parsed.scenes[sceneIndex];
    if (!scene) return;
    const shotIndex = shotsForScene(input.script.shots, scene.id).findIndex(
      entry => entry.id === shot.id
    );
    const draft = shotSceneDraft({
      shot,
      scene,
      sceneIndex,
      shotIndex,
      castId: input.castId,
      cast: input.cast,
      castMap: input.script.castMap,
      placeMap: input.script.placeMap,
      places,
      ...(input.locations ? { locations: input.locations } : {}),
    });
    const made = createScene({
      castId: input.castId,
      name: draft.name,
      slot: draft.slot,
      fromScript: { scriptId: input.script.id, sceneId: shot.sceneId, shotId: shot.id },
      mood: {
        ...(input.day as Record<string, unknown>),
        ...(input.script.mood ? { dayMood: input.script.mood } : {}),
        partnerCharacterId: draft.partnerCharacterId ?? input.day.partnerCharacterId ?? '',
        ...scriptShotCompanions(
          draft.partnerCharacterId,
          draft.partnerInFrame,
          draft.othersInFrame
        ),
      },
      outfit: input.day as Record<string, unknown>,
      // Distinct times keep their order (and ids) apart.
      now: now + index,
    });
    madeBy.set(shot.id, made.id);
    created.push(made);
  });
  return {
    script: {
      ...input.script,
      shots: (input.script.shots ?? []).map(shot =>
        madeBy.has(shot.id) ? { ...shot, madeSceneId: madeBy.get(shot.id)! } : shot
      ),
      updatedAt: now,
    },
    created,
  };
}
