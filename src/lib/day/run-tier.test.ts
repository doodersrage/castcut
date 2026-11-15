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
import { normalizeSceneRun, type SceneRun } from './scene-run';
import type { SceneTake } from './scenes';

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
