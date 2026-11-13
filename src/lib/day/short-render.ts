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
import {
  scriptShotCompanions,
  shotSceneDraft,
  shotsForScene,
  type PlannedShot,
} from './script-shots';
import { shotsToPrepare } from './scene-run';

/**
 * The short's shots with no Scene made into Scenes: the new Scenes and the script with its shots
 * naming them. Nothing to make: no Scenes, the script as it is.
 *
 * A card's own Scene standing in for a shot (dayAsShort gives a card's Scene its moment's first
 * free shot) holds the card's text, not the shot's — no partner wording, no stand-in, no room —
 * so it drew her twice beside her partner (live s13, 2026-11-13: Morning and Night twinned,
 * Afternoon with no shop owner and no shop). Cards don't render (the user, 2026-11-13): that shot
 * gets a Scene of its own like every other, and the card's Scene is let go of it (`untied`) —
 * kept, with its takes, as the card. A card's Scene drafted from that very shot (a shot Scene
 * taken as the card), and a one-shot moment's card (the moment is that shot), are left as they
 * are.
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
}): { script: SavedScript; created: SavedScene[]; untied: SavedScene[] } {
  const now = input.now ?? Date.now();
  const parsed = parseScript(input.script.source);
  const places = parsed.scenes.map(scene => scene.place);
  const draftOf = (shot: PlannedShot) => {
    const sceneIndex = parsed.scenes.findIndex(scene => scene.id === shot.sceneId);
    const scene = parsed.scenes[sceneIndex];
    if (!scene) return undefined;
    const shotIndex = shotsForScene(input.script.shots, scene.id).findIndex(
      entry => entry.id === shot.id
    );
    return shotSceneDraft({
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
  };
  // The cards standing in for a shot with the card's text: let go of it.
  const byId = new Map(input.scenes.map(scene => [scene.id, scene]));
  const untied: SavedScene[] = [];
  const freed = new Set<string>();
  for (const shot of input.script.shots ?? []) {
    const card = shot.madeSceneId ? byId.get(shot.madeSceneId) : undefined;
    if (!card?.fromDaySlot || card.fromScript?.scriptId !== input.script.id) continue;
    if (untied.some(entry => entry.id === card.id)) continue;
    // A one-shot moment: the card is the moment and its one shot (dayAsShort plans that shot
    // from the card again on every sync) — left as it is.
    if (shotsForScene(input.script.shots, shot.sceneId).length < 2) continue;
    const draft = draftOf(shot);
    if (!draft || flat(draft.slot.sceneHints) === flat(card.slot.sceneHints)) continue;
    freed.add(shot.id);
    untied.push({
      ...card,
      // Its moment's card, no shot's (`<scene>-card`: not a shot id — a one-shot moment's own
      // shot is `<scene>-moment` — read by the board for its picture, dayStillsFromShort).
      fromScript: { ...card.fromScript, shotId: `${shot.sceneId}-card` },
      updatedAt: now,
    });
  }
  const script: SavedScript = freed.size
    ? {
        ...input.script,
        shots: (input.script.shots ?? []).map(shot => {
          if (!freed.has(shot.id)) return shot;
          const { madeSceneId: _card, ...rest } = shot;
          return rest;
        }),
      }
    : input.script;
  const scenes = untied.length
    ? input.scenes.map(scene => untied.find(entry => entry.id === scene.id) ?? scene)
    : input.scenes;
  const { fit } = shotsToPrepare(script, scenes);
  if (!fit.length) return { script, created: [], untied };
  const madeBy = new Map<string, string>();
  const created: SavedScene[] = [];
  fit.forEach((shot, index) => {
    const draft = draftOf(shot);
    if (!draft) return;
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
      ...script,
      shots: (script.shots ?? []).map(shot =>
        madeBy.has(shot.id) ? { ...shot, madeSceneId: madeBy.get(shot.id)! } : shot
      ),
      updatedAt: now,
    },
    created,
    untied,
  };
}

/** Text compared as words (spacing and case aside). */
const flat = (text: string | undefined) => (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
