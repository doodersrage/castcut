/**
 * An episode run's choices (Part 19 G1): which of a Scene's takes to keep, from what the page's
 * checks recorded on each take's Gallery entry (pose, face, outfit, place, gesture, marks, a clip
 * that cuts away or has no sound). A take with no miss passes; among passing takes the best face
 * and pose scores win, then the newest. When none passes the least-bad is the one kept if the run
 * runs out of redos — noted on the take and listed for review. Pure.
 */

import type { GalleryPlayChecks } from '../gallery/comfyui-gallery-entry';
import type { SavedScene, SceneTake } from './scenes';

/** What a take's checks found wrong, in words (empty: nothing, or not checked). */
export function takeCheckMisses(checks: GalleryPlayChecks | undefined): string[] {
  if (!checks) return [];
  const misses: string[] = [];
  if (checks.poseMiss) misses.push('the pose missed');
  if (checks.faceMiss) misses.push('the face doesn’t match');
  if (checks.outfitMiss?.trim()) misses.push(`the outfit (${checks.outfitMiss.trim()})`);
  if (checks.placeMiss?.trim()) misses.push(`the place (${checks.placeMiss.trim()})`);
  if (checks.gestureMiss?.trim()) misses.push(`the action (${checks.gestureMiss.trim()})`);
  if (checks.marksMissing?.trim()) misses.push(`marks missing (${checks.marksMissing.trim()})`);
  if (typeof checks.clipCutAt === 'number') misses.push('the clip cuts away');
  if (checks.clipSilent) misses.push('the clip has no sound');
  if (checks.keyframeMiss?.trim()) misses.push(checks.keyframeMiss.trim());
  return misses;
}

export type EpisodeTakePick = { take: SceneTake; misses: string[]; checked: boolean };

/**
 * The take to keep: never a rejected one; fewest misses first, then the higher face + pose
 * score, then the newest. Null when the Scene has no take to keep.
 */
export function bestSceneTake(
  scene: Pick<SavedScene, 'takes'>,
  checksOf: (promptId: string) => GalleryPlayChecks | undefined
): EpisodeTakePick | null {
  const ranked = scene.takes
    .filter(take => take.review !== 'rejected')
    .map((take, order) => {
      const checks = checksOf(take.promptId ?? take.id);
      return {
        take,
        misses: takeCheckMisses(checks),
        checked: Boolean(checks),
        score: (checks?.face ?? 0) + (checks?.pose ?? 0),
        order,
      };
    })
    .sort(
      (a, b) =>
        a.misses.length - b.misses.length ||
        b.score - a.score ||
        b.take.at - a.take.at ||
        b.order - a.order
    );
  const best = ranked[0];
  return best ? { take: best.take, misses: best.misses, checked: best.checked } : null;
}

/** What an episode run does after each take, and how often it tries again. */
export type EpisodeRunAuto = {
  /** Keep the best take by its checks (else the run only renders, as before). */
  keep: boolean;
  /** Takes tried again when the best fails its checks (0–3). */
  redo: number;
  /** Animate the kept take (the page's own Animate) before the next Scene. */
  animate: boolean;
  /**
   * Which kept takes are animated: every one (unset), or only shots with a line — talking clips
   * where someone speaks, held stills between (a night's worth, while a whole episode's clips
   * take longer).
   */
  animateOnly?: 'lines';
  /** When the run is done, cut the film (episode autopilot: the Scene page opens Cut). */
  cutWhenDone?: boolean;
};

export const EPISODE_REDO_MAX = 3;

export function normalizeEpisodeRunAuto(raw: unknown): EpisodeRunAuto | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Partial<EpisodeRunAuto>;
  const redo =
    typeof value.redo === 'number' && Number.isFinite(value.redo)
      ? Math.min(EPISODE_REDO_MAX, Math.max(0, Math.round(value.redo)))
      : 1;
  const keep = value.keep === true;
  // Animating follows keeping: there is no kept take to move otherwise.
  const animate = keep && value.animate === true;
  return {
    keep,
    redo,
    animate,
    ...(animate && value.animateOnly === 'lines' ? { animateOnly: 'lines' } : {}),
    ...(keep && value.cutWhenDone === true ? { cutWhenDone: true } : {}),
  };
}

/** Whether a kept take is animated: every one, or only a shot with a line said in it. */
export function episodeAnimates(
  auto: Pick<EpisodeRunAuto, 'animate' | 'animateOnly'>,
  slot: { line?: string; sceneHints?: string }
): boolean {
  if (!auto.animate) return false;
  if (auto.animateOnly !== 'lines') return true;
  return Boolean(slot.line?.trim()) || /\bsays: [“"]/.test(slot.sceneHints ?? '');
}
