/**
 * The storyboard (M9 T3, ROADMAP §6.6): a script's planned shots as a board, in script order,
 * scene by scene — each with its kept take, else its latest take you didn't reject, else a card
 * saying what the shot is. Read from what the script and its Scenes already hold. Pure.
 */
import type { ScriptScene } from '../script/parse';
import type { SavedScene } from './scenes';
import {
  SHOT_FRAMING_LABELS,
  SHOT_PURPOSE_LABELS,
  shotLabel,
  shotsForScene,
  type PlannedShot,
} from './script-shots';

export type StoryboardCard = {
  shot: PlannedShot;
  /** "1A", "1B" … */
  label: string;
  /** "Establishing · Full body". */
  kind: string;
  /** The beat, or who says what. */
  text: string;
  /** Its picture: the kept take's, else the latest take's; none yet: undefined. */
  pictureUrl?: string;
  picture?: 'kept' | 'take';
  /** The Scene made from it, when it is still there. */
  sceneId?: string;
};

export type StoryboardRow = {
  scene: Pick<ScriptScene, 'id' | 'heading' | 'place'>;
  cards: StoryboardCard[];
};

export function storyboard(input: {
  scenes: readonly ScriptScene[];
  shots: readonly PlannedShot[] | undefined;
  /** The Cast's Scenes (the ones the shots were made into). */
  made: readonly SavedScene[];
}): StoryboardRow[] {
  const byId = new Map(input.made.map(scene => [scene.id, scene]));
  return input.scenes.flatMap((scene, sceneIndex) => {
    const shots = shotsForScene(input.shots, scene.id);
    if (!shots.length) return [];
    const number = scene.number ?? String(sceneIndex + 1);
    return [
      {
        scene: { id: scene.id, heading: scene.heading, place: scene.place },
        cards: shots.map((shot, index): StoryboardCard => {
          const made = shot.madeSceneId ? byId.get(shot.madeSceneId) : undefined;
          const kept = made?.takes.find(take => take.id === made.keptTakeId);
          const latest = made?.takes.filter(take => take.review !== 'rejected').at(-1);
          const shown = kept ?? latest;
          return {
            shot,
            label: shotLabel(number, index),
            kind: `${SHOT_PURPOSE_LABELS[shot.purpose]} · ${SHOT_FRAMING_LABELS[shot.framing]}`,
            text: shot.line
              ? `${shot.speaker ? `${shot.speaker}: ` : ''}“${shot.line}”`
              : (shot.action ?? ''),
            ...(shown ? { pictureUrl: shown.imageUrl, picture: kept ? 'kept' : 'take' } : {}),
            ...(made ? { sceneId: made.id } : {}),
          };
        }),
      },
    ];
  });
}
