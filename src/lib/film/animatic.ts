/**
 * The animatic (M9 T4, ROADMAP §6.6): a script's planned shots as a cut before they render — each
 * one its Scene's kept take once it has one, else a card saying what the shot is, and either way
 * on screen for the shot's planned seconds, so the pacing holds as the takes come in. Cut plays it
 * as its "Script animatic" source (cut-room.ts). Pure.
 */
import type { StoryboardRow } from '../day/storyboard';
import type { KeyedShot } from './cut-plan';

/**
 * A planned shot's key in Cut: its id with `~` as `.` — Cut reads a key ending in `~<n>` as a copy
 * of another shot (cutCopyKey), and planned shot ids end that way ("int-cafe-day~2").
 */
export function animaticShotKey(shotId: string): string {
  return shotId.replace(/~/g, '.');
}

export function animaticShots(input: {
  /** The script's storyboard (day/storyboard.ts): its planned shots in order. */
  rows: readonly StoryboardRow[];
  /** The Cast's kept takes as Cut shots (sceneCutShots), keyed by Scene id. */
  keptBySceneId: ReadonlyMap<string, KeyedShot>;
  /** A card's picture (Cut draws its text cards in the cut's size). */
  card: (text: { text: string; sub: string }) => string;
}): KeyedShot[] {
  return input.rows.flatMap(row =>
    row.cards.map((card): KeyedShot => {
      const seconds = card.shot.seconds;
      const kept = card.sceneId ? input.keptBySceneId.get(card.sceneId) : undefined;
      const title = `${card.label} ${row.scene.place || row.scene.heading}`.trim();
      if (kept) {
        return kept.kind === 'clip'
          ? {
              ...kept,
              key: animaticShotKey(card.shot.id),
              title,
              trimStartSec: kept.trimStartSec ?? 0,
              trimEndSec: (kept.trimStartSec ?? 0) + seconds,
            }
          : {
              ...kept,
              key: animaticShotKey(card.shot.id),
              title,
              holdSec: seconds,
              holdFixed: true,
            };
      }
      return {
        key: animaticShotKey(card.shot.id),
        title,
        url: input.card({ text: card.text || card.kind, sub: `${card.label} · ${card.kind}` }),
        kind: 'still',
        holdSec: seconds,
        holdFixed: true,
        captionless: true,
      };
    })
  );
}
