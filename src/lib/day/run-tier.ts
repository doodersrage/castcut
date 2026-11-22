/**
 * A run's two tiers (FINISHING_PLAN Phase 5; user's choices 2026-11-14: two runs, Preview then
 * Final; Final renders every shot but those whose preview you rejected).
 *
 * - **Preview** drafts every shot once on Qwen-Image 2.1 Turbo (about a fifth of Edit 2511's time
 *   in the engine rematch), with no checks and no redos, so a 12-scene short is an animatic in
 *   minutes. Its takes are marked `tier: 'preview'` and are never kept as a Scene's take.
 * - **Final** renders on Qwen-Image Edit 2511 with the checks and keep-best, overnight on the
 *   server. A shot whose newest preview you rejected ("Change it") is held back until you preview
 *   it again or restore that take.
 *
 * Pure.
 */
import type { SavedScene, SceneTake } from './scenes';
import type { SceneRun } from './scene-run';

export type RunTier = 'preview' | 'final';

export const RUN_TIERS: readonly RunTier[] = ['preview', 'final'];

export function isRunTier(value: unknown): value is RunTier {
  return value === 'preview' || value === 'final';
}

/** The quick engine previews draft on. */
export const PREVIEW_ENGINE = 'qwen-image-2.1-edit-turbo-8';
/** The engine finals render on. */
export const FINAL_ENGINE = 'qwen-image-edit-2511';

/** The engine a tier renders on; unset (no tier): each take's own. */
export function runTierEngine(tier: RunTier | undefined): string | undefined {
  return tier === 'preview' ? PREVIEW_ENGINE : tier === 'final' ? FINAL_ENGINE : undefined;
}

export function takeIsPreview(take: Pick<SceneTake, 'tier'> | undefined): boolean {
  return take?.tier === 'preview';
}

/** The Scene's newest preview you haven't rejected: what the animatic shows before a kept take. */
export function previewTakeOf(scene: Pick<SavedScene, 'takes'>): SceneTake | undefined {
  for (let i = scene.takes.length - 1; i >= 0; i -= 1) {
    const take = scene.takes[i]!;
    if (takeIsPreview(take) && take.review !== 'rejected') return take;
  }
  return undefined;
}

/**
 * Held back from a Final run: the Scene's newest take is a preview you rejected — "change it"
 * — with no final rendered since. Preview it again (or restore the take) and it goes to finals.
 */
export function sceneHeldFromFinals(scene: Pick<SavedScene, 'takes'>): boolean {
  const newest = scene.takes[scene.takes.length - 1];
  return Boolean(newest && takeIsPreview(newest) && newest.review === 'rejected');
}

/**
 * A run set to a tier (or back to none): what that tier renders, on the server.
 * - Preview: one take a Scene, nothing kept, no redos or Animate; Scenes with a kept take too.
 * - Final: keep the best by its checks (one redo unless set), every Scene but those held back.
 * - None: the run as it was before tiers, its auto left as set.
 */
export function withRunTier(
  run: SceneRun,
  tier: RunTier | undefined,
  scenes: readonly Pick<SavedScene, 'id' | 'takes'>[]
): SceneRun {
  const byId = new Map(scenes.map(scene => [scene.id, scene]));
  // A tier set again is a render run: an Animate the previews run's mode goes.
  const { tier: _old, animatePreviews: _previews, ...rest } = run;
  if (!tier) return rest;
  if (tier === 'preview') {
    return {
      ...rest,
      tier,
      onServer: true,
      skipKept: false,
      // One room a scene and the rest stay as set; nothing is kept, redone or animated.
      auto: { ...(run.auto ?? {}), keep: false, redo: 0, animate: false },
      items: run.items.map(item => ({ ...item, include: true })),
      maxTakes: Math.max(run.maxTakes, run.items.length),
      // About 11 s a still: 70 shots in a quarter of an hour; the limit leaves room (editable).
      maxMinutes: Math.max(run.maxMinutes, 60),
    };
  }
  const redo = run.auto?.keep ? run.auto.redo : 1;
  return {
    ...rest,
    tier,
    onServer: true,
    auto: {
      ...(run.auto ?? {}),
      keep: true,
      redo,
      // One room a scene, on when Final is chosen (user, 2026-11-15, after s24: every kept take
      // in its place, each scene one room); the run panel's switch turns it off.
      oneRoom: true,
      // Animate is the page's (not on the server yet).
      animate: false,
    },
    items: run.items.map(item => {
      const scene = byId.get(item.sceneId);
      return { ...item, include: !(scene && sceneHeldFromFinals(scene)) };
    }),
    maxTakes: Math.max(run.maxTakes, run.items.length * (1 + redo)),
    // Overnight (editable after).
    maxMinutes: Math.max(run.maxMinutes, 24 * 60),
  };
}
