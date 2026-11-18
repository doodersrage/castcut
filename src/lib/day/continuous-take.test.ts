import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CHAIN_MAX_DEPTH,
  chainCutSec,
  chainDepth,
  chainIsStale,
  chainPlanFor,
  previousShotOf,
  sharpestFrameIndex,
} from './continuous-take';
import { createScene, normalizeSavedScene, type SavedScene, type SceneTake } from './scenes';

/** A script scene's shot, its kept take with a clip (or not). */
function shot(
  label: string,
  extra: { continuous?: boolean; clip?: string; chainFrom?: SceneTake['chainFrom']; scene?: string } = {}
): SavedScene {
  const base = createScene({
    castId: 'slyne',
    name: `${label} KITCHEN · Dialogue`,
    id: label,
    fromScript: { scriptId: 'sk', sceneId: extra.scene ?? 'kitchen', shotId: `kitchen~${label}` },
    now: 1,
  });
  const take: SceneTake = {
    id: `${label}-take`,
    promptId: `${label}-take`,
    imageUrl: `/${label}.png`,
    ...(extra.clip ? { clipUrl: extra.clip } : {}),
    ...(extra.chainFrom ? { chainFrom: extra.chainFrom } : {}),
    at: 1,
  };
  return {
    ...base,
    takes: [take],
    keptTakeId: take.id,
    ...(extra.continuous ? { continuousTake: true } : {}),
  };
}

describe('a continuous take (the H3 brief, 2026-11-18)', () => {
  it('continues the shot before it in its script scene, in script order', () => {
    const a = shot('3A', { clip: '/a.mp4' });
    const b = shot('3B', { continuous: true });
    const c = shot('3C');
    const elsewhere = shot('4A', { scene: 'store' });
    // Out of order in the list; 3B's parent is still 3A, and 4A starts its own scene.
    const scenes = [c, elsewhere, b, a];
    assert.equal(previousShotOf(b, scenes)?.id, '3A');
    assert.equal(previousShotOf(a, scenes), undefined);
    assert.equal(previousShotOf(elsewhere, scenes), undefined);
    // 3A10 after 3A9, not after 3A1.
    const nine = shot('3A9');
    const ten = shot('3A10', { continuous: true });
    assert.equal(previousShotOf(ten, [ten, nine, shot('3A1')])?.id, '3A9');
  });

  it('chains only when marked, after a shot whose kept take has its clip', () => {
    const a = shot('3A', { clip: '/a.mp4' });
    const b = shot('3B', { continuous: true });
    const plan = chainPlanFor(b, [a, b]);
    assert.equal(plan.chain, true);
    assert.equal(plan.chain && plan.parentClipUrl, '/a.mp4');
    assert.equal(plan.chain && plan.parentEntryId, '3A-take');
    assert.deepEqual(chainPlanFor(shot('3B'), [a]), { chain: false, why: 'not-marked' });
    assert.deepEqual(chainPlanFor(shot('3A', { continuous: true }), []), { chain: false, why: 'first' });
    // The shot before has no clip yet: its own still, until it does.
    assert.deepEqual(chainPlanFor(b, [shot('3A'), b]), { chain: false, why: 'no-parent-clip' });
  });

  it(`starts again from its own still after ${CHAIN_MAX_DEPTH} chained shots`, () => {
    const scenes = [
      shot('5A', { clip: '/a.mp4' }),
      shot('5B', { continuous: true, clip: '/b.mp4' }),
      shot('5C', { continuous: true, clip: '/c.mp4' }),
      shot('5D', { continuous: true, clip: '/d.mp4' }),
      shot('5E', { continuous: true }),
    ];
    assert.deepEqual(scenes.map(scene => chainDepth(scene, scenes)), [0, 1, 2, 3, 4]);
    assert.equal(chainPlanFor(scenes[3]!, scenes).chain, true);
    assert.deepEqual(chainPlanFor(scenes[4]!, scenes), { chain: false, why: 're-anchor' });
  });

  it('is stale when the shot before has another clip now; the parent is cut on its frame', () => {
    const chainFrom = { sceneId: '3A', clipUrl: '/a.mp4', atSec: 4.958 };
    const a = shot('3A', { clip: '/a.mp4' });
    const b = shot('3B', { continuous: true, clip: '/b.mp4', chainFrom });
    assert.equal(chainIsStale(b, [a, b]), false);
    // 3A animated again: 3B's clip no longer starts where 3A's ends.
    const again = shot('3A', { clip: '/a2.mp4' });
    assert.equal(chainIsStale(b, [again, b]), true);
    // Never chained: never stale.
    assert.equal(chainIsStale(shot('3B', { clip: '/b.mp4' }), [a]), false);
    // 3A's clip plays to just after the frame 3B opens on (one frame at 24 fps).
    assert.equal(chainCutSec(a, [a, b]), Math.round((4.958 + 1 / 24) * 1000) / 1000);
    // Not cut for a stale chain, nor for a shot no longer marked.
    assert.equal(chainCutSec(again, [again, b]), undefined);
    assert.equal(chainCutSec(a, [a, { ...b, continuousTake: undefined }]), undefined);
  });

  it('picks the sharpest of the last frames, the later of near-ties', () => {
    assert.equal(sharpestFrameIndex([10, 30, 12, 8]), 1);
    // Within 3 %: the later one (less of the parent's clip is cut).
    assert.equal(sharpestFrameIndex([10, 30, 29.5, 8]), 2);
    assert.equal(sharpestFrameIndex([Number.NaN, 5]), 1);
    assert.equal(sharpestFrameIndex([]), -1);
  });

  it('keeps the mark and the chain through a save; drops a broken chain', () => {
    const chainFrom = { sceneId: '3A', clipUrl: '/a.mp4', atSec: 4.9584 };
    const b = shot('3B', { continuous: true, clip: '/b.mp4', chainFrom });
    const saved = normalizeSavedScene(JSON.parse(JSON.stringify(b)), 2)!;
    assert.equal(saved.continuousTake, true);
    assert.deepEqual(saved.takes[0]!.chainFrom, { sceneId: '3A', clipUrl: '/a.mp4', atSec: 4.958 });
    // Saved by an earlier release: no mark, no chain.
    const old = normalizeSavedScene({ ...JSON.parse(JSON.stringify(b)), continuousTake: 'yes' }, 2)!;
    assert.equal(old.continuousTake, undefined);
    const broken = normalizeSavedScene(
      { ...b, takes: [{ ...b.takes[0], chainFrom: { sceneId: '3A', atSec: -1 } }] },
      2
    )!;
    assert.equal(broken.takes[0]!.chainFrom, undefined);
    // No clip, no chain (it was the clip's).
    const noClip = normalizeSavedScene(
      { ...b, takes: [{ ...b.takes[0], clipUrl: undefined, chainFrom }] },
      2
    )!;
    assert.equal(noClip.takes[0]!.chainFrom, undefined);
  });
});

describe('a continuous take in the Cut and the run (2026-11-18)', () => {
  it('cuts the shot before on its frame and marks both edges of the join', async () => {
    const { sceneCutShots } = await import('./scenes');
    const chainFrom = { sceneId: '3A', clipUrl: '/a.mp4', atSec: 4.5 };
    const a = shot('3A', { clip: '/a.mp4' });
    const b = shot('3B', { continuous: true, clip: '/b.mp4', chainFrom });
    const c = shot('3C', { clip: '/c.mp4' });
    const [shotA, shotB, shotC] = sceneCutShots([a, b, c], 'slyne', 3, true);
    assert.equal(shotA!.trimEndSec, Math.round((4.5 + 1 / 24) * 1000) / 1000);
    assert.equal(shotA!.chainOut, true);
    assert.equal(shotB!.chainIn, true);
    assert.equal(shotB!.trimEndSec, undefined);
    assert.equal(shotC!.chainIn, undefined);
    // Stale (3A animated again): no join, 3A plays as cut otherwise.
    const [staleA, staleB] = sceneCutShots(
      [shot('3A', { clip: '/a2.mp4' }), b],
      'slyne',
      3,
      true
    );
    assert.equal(staleA!.chainOut, undefined);
    assert.equal(staleB!.chainIn, undefined);
  });

  it('tightening a talking shot leaves its joined edges where they are', async () => {
    const { tightLineTrim } = await import('../audio/line-fit');
    const span = { startSec: 1.2, endSec: 2.0 };
    // Unjoined: from just before the line to just after.
    assert.deepEqual(tightLineTrim(span), { trimStartSec: 0.85, trimEndSec: 2.8 });
    // Its start is a join: it opens on the frame the shot before ended on.
    assert.deepEqual(tightLineTrim(span, { chainIn: true }), { trimStartSec: 0, trimEndSec: 2.8 });
    // Its end is a join: it ends on the frame the next one starts on.
    assert.deepEqual(tightLineTrim(span, { chainOut: true, trimEndSec: 4.54 }), {
      trimStartSec: 0.85,
      trimEndSec: 4.54,
    });
    assert.equal(tightLineTrim(span, { chainIn: true, chainOut: true, trimEndSec: 4.54 }), null);
  });

  it('wants a clip again when stale, or marked after it was animated on its own', async () => {
    const { keptClipNeeded } = await import('./continuous-take');
    const a = shot('3A', { clip: '/a.mp4' });
    const chained = shot('3B', {
      continuous: true,
      clip: '/b.mp4',
      chainFrom: { sceneId: '3A', clipUrl: '/a.mp4', atSec: 4.5 },
    });
    assert.equal(keptClipNeeded(chained, [a, chained]), false);
    assert.equal(keptClipNeeded(chained, [shot('3A', { clip: '/a2.mp4' }), chained]), true);
    // Marked after its own clip: animated again, from 3A's frame.
    const markedLate = shot('3B', { continuous: true, clip: '/b.mp4' });
    assert.equal(keptClipNeeded(markedLate, [a, markedLate]), true);
    // Not marked, with a clip: nothing to do; no clip: as always.
    assert.equal(keptClipNeeded(shot('3B', { clip: '/b.mp4' }), [a]), false);
    assert.equal(keptClipNeeded(shot('3B'), [a]), true);
    // Marked, but the shot before has no clip yet: its own clip stands.
    assert.equal(keptClipNeeded(markedLate, [shot('3A'), markedLate]), false);
  });
});
