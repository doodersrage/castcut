import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bestSceneTake } from './episode-run';
import {
  FINAL_ENGINE,
  PREVIEW_ENGINE,
  previewTakeOf,
  runTierEngine,
  sceneHeldFromFinals,
  withRunTier,
} from './run-tier';
import {
  animateKeptRun,
  animatePreviewsRun,
  nextRunStep,
  normalizeSceneRun,
  previewNeedingClip,
  previewsToAnimate,
  runProgress,
  withRunOutcome,
  type SceneRun,
} from './scene-run';
import type { SavedScene, SceneTake } from './scenes';

const take = (id: string, at: number, extra: Partial<SceneTake> = {}): SceneTake => ({
  id,
  promptId: id,
  imageUrl: `/${id}.png`,
  at,
  ...extra,
});

const run = (extra: Partial<SceneRun> = {}): SceneRun => ({
  id: 'run-1',
  castId: 'cast',
  label: 'Short',
  items: [
    { sceneId: 'a', include: true },
    { sceneId: 'b', include: false },
    { sceneId: 'c', include: true },
  ],
  maxTakes: 8,
  maxMinutes: 30,
  skipKept: true,
  state: 'prepared',
  position: 0,
  log: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

describe('run tiers (FINISHING_PLAN Phase 5)', () => {
  it('renders each tier on its engine; no tier on each take’s own', () => {
    assert.equal(runTierEngine('preview'), PREVIEW_ENGINE);
    assert.equal(runTierEngine('final'), FINAL_ENGINE);
    assert.equal(runTierEngine(undefined), undefined);
  });

  it('Preview: every Scene once, on the server, nothing kept or redone', () => {
    const next = withRunTier(run({ auto: { keep: true, redo: 2, animate: true, oneRoom: true } }), 'preview', []);
    assert.equal(next.tier, 'preview');
    assert.equal(next.onServer, true);
    assert.equal(next.skipKept, false);
    assert.deepEqual(next.auto, { keep: false, redo: 0, animate: false, oneRoom: true });
    assert.deepEqual(
      next.items.map(item => item.include),
      [true, true, true]
    );
    assert.equal(next.maxMinutes, 60);
  });

  it('Final: keep the best by its checks, every Scene but one whose newest preview you rejected', () => {
    const scenes = [
      { id: 'a', takes: [take('pa', 1, { tier: 'preview' })] },
      { id: 'b', takes: [take('pb', 1, { tier: 'preview', review: 'rejected' })] },
      // Rejected once, previewed again since: it goes.
      { id: 'c', takes: [take('pc', 1, { tier: 'preview', review: 'rejected' }), take('pc2', 2, { tier: 'preview' })] },
    ];
    const next = withRunTier(run(), 'final', scenes);
    assert.equal(next.tier, 'final');
    assert.equal(next.onServer, true);
    // One room a scene on for Final (user, 2026-11-15).
    assert.deepEqual(next.auto, { keep: true, redo: 1, oneRoom: true, animate: false });
    assert.deepEqual(
      next.items.map(item => [item.sceneId, item.include]),
      [
        ['a', true],
        ['b', false],
        ['c', true],
      ]
    );
    // Room for every Scene and its redo (never under what was set).
    assert.equal(next.maxTakes, 8);
    assert.equal(withRunTier(run({ maxTakes: 2 }), 'final', scenes).maxTakes, 6);
    assert.equal(next.maxMinutes, 24 * 60);
    // Back to none: the tier goes, the rest stays as it was set.
    const none = withRunTier(next, undefined, scenes);
    assert.equal(none.tier, undefined);
    assert.equal(none.auto?.keep, true);
  });

  it('a preview is the animatic’s draft: shown before a kept take, never kept by a run', () => {
    const scene = {
      takes: [
        take('p1', 1, { tier: 'preview' }),
        take('p2', 2, { tier: 'preview', review: 'rejected' }),
      ],
    };
    assert.equal(previewTakeOf(scene)?.id, 'p1');
    assert.equal(sceneHeldFromFinals(scene), true);
    assert.equal(bestSceneTake(scene, () => ({ at: 1 })), null);
    const withFinal = { takes: [...scene.takes, take('f1', 3)] };
    assert.equal(sceneHeldFromFinals(withFinal), false);
    assert.equal(bestSceneTake(withFinal, () => ({ face: 0.7, at: 1 }))?.take.id, 'f1');
  });

  it('a stored tier is kept, renders on the server; an unknown one is dropped', () => {
    assert.equal(normalizeSceneRun(run({ tier: 'preview' }))?.onServer, true);
    assert.equal(normalizeSceneRun(run({ tier: 'final' }))?.tier, 'final');
    const old = normalizeSceneRun({ ...run(), tier: 'draft' });
    assert.equal(old?.tier, undefined);
    assert.equal(old?.onServer, undefined);
  });
});

describe('Animate the previews (Draft clips for the animatic)', () => {
  const scene = (id: string, takes: SceneTake[], keptTakeId?: string): SavedScene =>
    ({ id, castId: 'cast', name: id, slot: { id: 'morning' }, takes, ...(keptTakeId ? { keptTakeId } : {}) }) as unknown as SavedScene;
  const scenes = [
    // a: its newest preview has no clip yet.
    scene('a', [take('a1', 1, { tier: 'preview' }), take('a2', 2, { tier: 'preview' })]),
    // b: left out of the run.
    scene('b', [take('b1', 1, { tier: 'preview' })]),
    // c: kept already — its kept take is its clip, not the preview.
    scene('c', [take('c1', 1, { tier: 'preview' }), take('c2', 2)], 'c2'),
  ];
  const previewRun = run({ tier: 'preview', onServer: true, state: 'done', startedAt: 5, outcomes: { a: 'landed', c: 'landed' } });

  it('animates the newest preview of a Scene with no kept take, once, while it has no clip', () => {
    assert.equal(previewNeedingClip(scenes[0]!)?.id, 'a2');
    assert.equal(previewNeedingClip(scenes[2]!), undefined);
    const withClip = scene('a', [take('a2', 2, { tier: 'preview', clipUrl: '/a2.mp4' })]);
    assert.equal(previewNeedingClip(withClip), undefined);
    const rejected = scene('a', [take('a2', 2, { tier: 'preview', review: 'rejected' })]);
    assert.equal(previewNeedingClip(rejected), undefined);
  });

  it('a done Preview run made again on this page: no tier, no server, no stills rendered', () => {
    const next = animatePreviewsRun(previewRun, 10);
    assert.equal(next.animatePreviews, true);
    assert.equal(next.tier, undefined);
    assert.equal(next.onServer, undefined);
    assert.equal(next.state, 'prepared');
    assert.equal(next.outcomes, undefined);
    assert.equal(next.startedAt, undefined);
    assert.equal(previewsToAnimate(next, scenes), 2); // a, and b (every Scene is included again)
    assert.deepEqual(nextRunStep(next, scenes), { kind: 'animate-preview', sceneId: 'a', takeId: 'a2' });
    const afterA = withRunOutcome(next, 'a', 'landed', 'a: preview animated (Draft)');
    assert.deepEqual(nextRunStep(afterA, scenes), { kind: 'animate-preview', sceneId: 'b', takeId: 'b1' });
    const afterB = withRunOutcome(afterA, 'b', 'failed', 'b: its preview’s clip didn’t land');
    assert.deepEqual(nextRunStep(afterB, scenes), { kind: 'done', reason: 'finished' });
    assert.deepEqual(runProgress(afterA, scenes), { done: 1, total: 2 });
  });

  it('is kept when stored; a tier or Animate the kept takes ends it', () => {
    const next = animatePreviewsRun(previewRun, 10);
    assert.equal(normalizeSceneRun(next)?.animatePreviews, true);
    assert.equal(normalizeSceneRun(run({ animatePreviews: 'yes' as never }))?.animatePreviews, undefined);
    assert.equal(withRunTier(next, 'final', scenes).animatePreviews, undefined);
    assert.equal(animateKeptRun(next, 11).animatePreviews, undefined);
  });
});
