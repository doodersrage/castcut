import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  blendPoseEngineReport,
  emptyPoseOutcomeStats,
  learnedWeakPoseLayouts,
  mergePoseOutcomeStats,
  normalizePoseOutcomeStats,
  poseEngineHint,
  poseOutcomeCounts,
  poseOutcomeEngine,
  poseOutcomeLayout,
  poseOutcomeStatsForSync,
  poseSuccessRate,
  POSE_TAKES_MAX,
  withPoseTakeOutcome,
  withPoseTakeQueued,
  type PoseEngineReportLike,
  type PoseOutcome,
  type PoseOutcomeStats,
} from './pose-outcome-stats';

const RAPID = 'qwen-rapid-aio-edit';
const EDIT = 'qwen-image-edit-2511-lightning-8';

function queued(
  stats: PoseOutcomeStats,
  takeId: string,
  poseKey = 'kneel:1',
  model = RAPID,
  replaces?: string,
  device = 'a'
): PoseOutcomeStats {
  return withPoseTakeQueued(stats, {
    takeId,
    poseKey,
    model,
    surface: 'day',
    replaces,
    device,
    at: 1,
  });
}

/** `n` takes of a pose on an engine, each judged `outcome`. */
function judged(
  stats: PoseOutcomeStats,
  n: number,
  outcome: PoseOutcome,
  poseKey = 'kneel:1',
  model = RAPID,
  prefix: string = outcome
): PoseOutcomeStats {
  let next = stats;
  for (let i = 0; i < n; i += 1) {
    const id = `${prefix}-${poseKey}-${model}-${i}`;
    next = withPoseTakeOutcome(queued(next, id, poseKey, model), id, outcome, { device: 'a' });
  }
  return next;
}

describe('pose outcome keys', () => {
  it('counts named layouts only, per engine family', () => {
    assert.equal(poseOutcomeLayout('kneel:1'), 'kneel');
    assert.equal(poseOutcomeLayout('sport_pushup:1'), 'sport_pushup');
    assert.equal(poseOutcomeLayout('photo:2'), null);
    assert.equal(poseOutcomeLayout('slot-morning:1'), null);
    assert.equal(poseOutcomeLayout(''), null);
    assert.equal(poseOutcomeEngine('qwen-rapid-aio-edit-nsfw'), 'rapid-aio');
    assert.equal(poseOutcomeEngine(EDIT), 'qwen-edit-2511');
    assert.equal(poseOutcomeEngine('qwen-image-2.1-edit'), 'qwen-image-2.1');
    assert.equal(poseOutcomeEngine('sdxl-base'), null);
  });
});

describe('take outcomes', () => {
  it('counts a take once, and a stronger signal moves its count', () => {
    let stats = queued(emptyPoseOutcomeStats(), 't1');
    stats = withPoseTakeOutcome(stats, 't1', 'pose-miss', { device: 'a' });
    assert.deepEqual(poseOutcomeCounts(stats, 'kneel', 'rapid-aio'), { good: 0, bad: 1 });
    // The same signal again changes nothing.
    assert.equal(withPoseTakeOutcome(stats, 't1', 'pose-miss', { device: 'a' }), stats);
    // Starred later: the keeper outranks the pose check.
    stats = withPoseTakeOutcome(stats, 't1', 'keeper', { device: 'a' });
    assert.deepEqual(poseOutcomeCounts(stats, 'kneel', 'rapid-aio'), { good: 1, bad: 0 });
    // A weaker signal after that is ignored.
    stats = withPoseTakeOutcome(stats, 't1', 'redone', { device: 'a' });
    assert.deepEqual(poseOutcomeCounts(stats, 'kneel', 'rapid-aio'), { good: 1, bad: 0 });
  });

  it('ignores takes it never saw queued', () => {
    const stats = emptyPoseOutcomeStats();
    assert.equal(withPoseTakeOutcome(stats, 'nope', 'deleted', { device: 'a' }), stats);
  });

  it('a requeue with the same pose on the same engine marks the old take redone', () => {
    let stats = queued(emptyPoseOutcomeStats(), 't1');
    stats = queued(stats, 't2', 'kneel:1', RAPID, 't1');
    assert.deepEqual(poseOutcomeCounts(stats, 'kneel', 'rapid-aio'), { good: 0, bad: 1 });
    assert.equal(stats.takes?.t1?.o, 'redone');
  });

  it('a requeue after the pose or engine changed says nothing about the old take', () => {
    let stats = queued(emptyPoseOutcomeStats(), 't1');
    stats = queued(stats, 't2', 'sit:1', RAPID, 't1');
    stats = queued(stats, 't3', 'sit:1', EDIT, 't2');
    assert.deepEqual(poseOutcomeCounts(stats, 'kneel', 'rapid-aio'), { good: 0, bad: 0 });
    assert.deepEqual(poseOutcomeCounts(stats, 'sit', 'rapid-aio'), { good: 0, bad: 0 });
  });

  it('"Keep the old take" turns the redone take into a kept one', () => {
    let stats = queued(emptyPoseOutcomeStats(), 'old');
    stats = queued(stats, 'new', 'kneel:1', RAPID, 'old');
    stats = withPoseTakeOutcome(stats, 'old', 'kept', { device: 'a' });
    stats = withPoseTakeOutcome(stats, 'new', 'replaced', { device: 'a' });
    assert.deepEqual(poseOutcomeCounts(stats, 'kneel', 'rapid-aio'), { good: 1, bad: 1 });
  });

  it('keeps the recent-take list bounded', () => {
    let stats = emptyPoseOutcomeStats();
    for (let i = 0; i < POSE_TAKES_MAX + 20; i += 1) {
      stats = withPoseTakeQueued(stats, {
        takeId: `t${i}`,
        poseKey: 'walk:1',
        model: RAPID,
        surface: 'story',
        device: 'a',
        at: i,
      });
    }
    assert.equal(Object.keys(stats.takes ?? {}).length, POSE_TAKES_MAX);
    assert.ok(stats.takes?.[`t${POSE_TAKES_MAX + 19}`]);
    assert.equal(stats.takes?.t0, undefined);
  });
});

describe('sync', () => {
  it('sends counts only and merges per device by event count', () => {
    const a = judged(emptyPoseOutcomeStats(), 2, 'deleted');
    const wire = poseOutcomeStatsForSync(a);
    assert.equal(wire.takes, undefined);
    // Another device's counts add up; this device's newer bucket is never rolled back.
    const b: PoseOutcomeStats = {
      version: 1,
      devices: { b: { seq: 3, cells: { 'kneel|rapid-aio': [0, 3] } } },
    };
    const merged = mergePoseOutcomeStats(a, mergePoseOutcomeStats(b, wire));
    assert.deepEqual(poseOutcomeCounts(merged, 'kneel', 'rapid-aio'), { good: 0, bad: 5 });
    const stale: PoseOutcomeStats = {
      version: 1,
      devices: { a: { seq: 1, cells: { 'kneel|rapid-aio': [0, 1] } } },
    };
    assert.equal(mergePoseOutcomeStats(a, stale), a);
    assert.ok(merged.takes, 'the local take list is kept');
  });

  it('normalizes junk', () => {
    const stats = normalizePoseOutcomeStats({
      devices: { a: { seq: 'x', cells: { 'kneel|rapid-aio': [1, 2], 'bad|nope': [1, 1] } } },
      takes: { t: { k: 'kneel', e: 'mystery' } },
    });
    assert.deepEqual(stats.devices.a, { seq: 0, cells: { 'kneel|rapid-aio': [1, 2] } });
    assert.equal(stats.takes, undefined);
    assert.deepEqual(normalizePoseOutcomeStats(null), emptyPoseOutcomeStats());
  });
});

const CARD: PoseEngineReportLike = {
  date: '2026-10-03',
  poses: {
    kneel: { 'rapid-aio': { rate: 0.5, n: 4 }, 'qwen-edit-2511': { rate: 1, n: 4 } },
    walk: { 'rapid-aio': { rate: 1, n: 4 } },
  },
};

describe('smoothed success rate', () => {
  it('is the card with no local takes, and local takes move it', () => {
    const none = poseSuccessRate({
      layout: 'kneel',
      engine: 'rapid-aio',
      stats: emptyPoseOutcomeStats(),
      report: CARD,
    });
    assert.equal(none.rate, 0.5);
    assert.equal(none.local, 0);
    const bad = judged(emptyPoseOutcomeStats(), 4, 'redone');
    const after = poseSuccessRate({ layout: 'kneel', engine: 'rapid-aio', stats: bad, report: CARD });
    assert.equal(after.rate, 2 / 8);
    assert.equal(after.local, 4);
  });

  it('uses a neutral prior where the card has no row', () => {
    const stats = judged(emptyPoseOutcomeStats(), 3, 'keeper', 'cook:1');
    const rate = poseSuccessRate({ layout: 'cook', engine: 'rapid-aio', stats });
    assert.ok(Math.abs(rate.rate - (0.7 * 2 + 3) / 5) < 1e-9);
    assert.equal(rate.prior, 0);
  });
});

describe('blended report card', () => {
  it('equals the card with no local takes and folds takes into the same shape', () => {
    assert.deepEqual(blendPoseEngineReport(CARD, emptyPoseOutcomeStats()).poses, CARD.poses);
    const stats = judged(judged(emptyPoseOutcomeStats(), 3, 'keeper', 'walk:1'), 1, 'deleted', 'walk:1');
    const blended = blendPoseEngineReport(CARD, stats);
    assert.equal(blended.poses.walk?.['rapid-aio']?.n, 8);
    assert.equal(blended.poses.walk?.['rapid-aio']?.rate, 7 / 8);
    // A pose the card lacks gets a row from local takes alone (neutral prior).
    const cook = blendPoseEngineReport(CARD, judged(emptyPoseOutcomeStats(), 4, 'redone', 'cook:1'));
    assert.equal(cook.poses.cook?.['rapid-aio']?.n, 4);
    assert.ok((cook.poses.cook?.['rapid-aio']?.rate ?? 1) < 0.5);
  });

  it('carries local takes into the mood rows of the same layout', () => {
    const card: PoseEngineReportLike = {
      date: 'x',
      poses: { 'vacation/lie': { 'rapid-aio': { rate: 1, n: 2 } } },
    };
    const blended = blendPoseEngineReport(card, judged(emptyPoseOutcomeStats(), 2, 'deleted', 'lie:1'));
    assert.equal(blended.poses['vacation/lie']?.['rapid-aio']?.n, 4);
    assert.equal(blended.poses['vacation/lie']?.['rapid-aio']?.rate, 0.5);
    assert.ok(blended.poses.lie?.['rapid-aio']);
  });
});

describe('learned weak layouts (pose pack skip)', () => {
  it('needs three takes and a poor smoothed rate on this engine', () => {
    const two = judged(emptyPoseOutcomeStats(), 2, 'redone');
    assert.equal(learnedWeakPoseLayouts(RAPID, two).size, 0);
    const four = judged(emptyPoseOutcomeStats(), 4, 'redone');
    assert.deepEqual([...learnedWeakPoseLayouts(RAPID, four)], ['kneel']);
    // Another engine's record is its own.
    assert.equal(learnedWeakPoseLayouts(EDIT, four).size, 0);
    // Mostly kept: not weak.
    const kept = judged(judged(emptyPoseOutcomeStats(), 5, 'keeper'), 2, 'redone', 'kneel:1', RAPID, 'r');
    assert.equal(learnedWeakPoseLayouts(RAPID, kept).size, 0);
  });
});

describe('Day slot hint', () => {
  const bad = judged(emptyPoseOutcomeStats(), 4, 'redone');

  it('names the engine that holds the pose better', () => {
    const hint = poseEngineHint({ poseKey: 'kneel:1', model: RAPID, stats: bad, report: CARD });
    assert.equal(hint?.text, 'Kneeling usually needs a second try on Rapid — Edit 2511 holds it better.');
    assert.equal(hint?.better, 'qwen-edit-2511');
  });

  it('skips an engine that is not installed, and says nothing without local evidence', () => {
    const hint = poseEngineHint({
      poseKey: 'kneel:1',
      model: RAPID,
      stats: bad,
      report: CARD,
      installed: engine => engine !== 'qwen-edit-2511',
    });
    assert.equal(hint?.text, 'Kneeling usually needs a second try on Rapid.');
    assert.equal(
      poseEngineHint({
        poseKey: 'kneel:1',
        model: RAPID,
        stats: emptyPoseOutcomeStats(),
        report: CARD,
      }),
      null
    );
    assert.equal(poseEngineHint({ poseKey: 'photo:1', model: RAPID, stats: bad }), null);
  });

  it('learns the better engine from local takes when there is no card', () => {
    const both = judged(bad, 4, 'keeper', 'kneel:1', EDIT);
    const hint = poseEngineHint({ poseKey: 'kneel:1', model: RAPID, stats: both });
    assert.equal(hint?.better, 'qwen-edit-2511');
  });
});
