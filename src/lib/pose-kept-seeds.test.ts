import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  chooseKeptSeed,
  emptyPoseOutcomeStats,
  KEPT_SEEDS_MAX,
  mergePoseOutcomeStats,
  normalizePoseOutcomeStats,
  normalizeSeed,
  poseOutcomeCounts,
  poseOutcomeStatsForSync,
  rememberedPoseSeeds,
  withKeptSeedChoice,
  withPoseTakeOutcome,
  withPoseTakeQueued,
  type PoseOutcome,
  type PoseOutcomeStats,
} from './pose-outcome-stats';

const RAPID = 'qwen-rapid-aio-edit';
const EDIT = 'qwen-image-edit-2511-lightning-8';

/** Queue a Day take and judge it. */
function take(
  stats: PoseOutcomeStats,
  id: string,
  options: {
    seed?: string | number | null;
    intimate?: boolean;
    outcome?: PoseOutcome;
    poseKey?: string;
    model?: string;
    device?: string;
  } = {}
): PoseOutcomeStats {
  const device = options.device ?? 'a';
  let next = withPoseTakeQueued(stats, {
    takeId: id,
    poseKey: options.poseKey ?? 'missionary:2',
    model: options.model ?? RAPID,
    surface: 'day',
    seed: options.seed,
    intimate: options.intimate ?? true,
    device,
    at: 1,
  });
  if (options.outcome) next = withPoseTakeOutcome(next, id, options.outcome, { device });
  return next;
}

describe('remembering kept seeds', () => {
  it('remembers the seed of a kept intimate still per layout × engine', () => {
    let stats = take(emptyPoseOutcomeStats(), 't1', { seed: 111, outcome: 'keeper' });
    stats = take(stats, 't2', { seed: '222', outcome: 'kept' });
    assert.deepEqual(rememberedPoseSeeds(stats, 'missionary', 'rapid-aio'), ['222', '111']);
    // Another engine, another layout: nothing.
    assert.deepEqual(rememberedPoseSeeds(stats, 'missionary', 'qwen-edit-2511'), []);
    assert.deepEqual(rememberedPoseSeeds(stats, 'straddle', 'rapid-aio'), []);
    // The counts are still counted.
    assert.deepEqual(poseOutcomeCounts(stats, 'missionary', 'rapid-aio'), { good: 2, bad: 0 });
  });

  it('ignores takes that are not intimate, have no seed, or were not kept', () => {
    let stats = take(emptyPoseOutcomeStats(), 'c1', {
      seed: 5,
      intimate: false,
      outcome: 'keeper',
      poseKey: 'kneel:1',
    });
    stats = take(stats, 'n1', { outcome: 'keeper' });
    stats = take(stats, 'r1', { seed: 7, outcome: 'redone' });
    stats = take(stats, 'p1', { seed: 8, outcome: 'pose-pass' });
    assert.deepEqual(rememberedPoseSeeds(stats, 'kneel', 'rapid-aio'), []);
    assert.deepEqual(rememberedPoseSeeds(stats, 'missionary', 'rapid-aio'), []);
  });

  it('keeps a small rolling list, newest first, each seed once', () => {
    let stats = emptyPoseOutcomeStats();
    for (let i = 0; i < KEPT_SEEDS_MAX + 3; i += 1) {
      stats = take(stats, `k${i}`, { seed: 100 + i, outcome: 'keeper' });
    }
    // The same seed kept again moves to the front instead of repeating.
    stats = take(stats, 'again', { seed: 104, outcome: 'keeper' });
    const seeds = rememberedPoseSeeds(stats, 'missionary', 'rapid-aio');
    assert.equal(seeds.length, KEPT_SEEDS_MAX);
    assert.equal(seeds[0], '104');
    assert.equal(new Set(seeds).size, seeds.length);
    assert.ok(!seeds.includes('100'));
  });

  it('forgets a remembered seed whose still the player throws out', () => {
    let stats = take(emptyPoseOutcomeStats(), 't1', { seed: 111, outcome: 'keeper' });
    stats = take(stats, 't2', { seed: 222, outcome: 'keeper' });
    // A later still on seed 111 looked wrong.
    stats = take(stats, 't3', { seed: 111, outcome: 'looks-wrong' });
    assert.deepEqual(rememberedPoseSeeds(stats, 'missionary', 'rapid-aio'), ['222']);
    stats = take(stats, 't4', { seed: 222, outcome: 'deleted' });
    assert.deepEqual(rememberedPoseSeeds(stats, 'missionary', 'rapid-aio'), []);
  });

  it('reads seeds the way the queue writes them', () => {
    assert.equal(normalizeSeed(42), '42');
    assert.equal(normalizeSeed(' 9007199254740991 '), '9007199254740991');
    assert.equal(normalizeSeed('-1'), null);
    assert.equal(normalizeSeed('abc'), null);
    assert.equal(normalizeSeed(null), null);
  });
});

describe('choosing a seed', () => {
  it('rotates through the kept seeds, then rolls one random seed, then round again', () => {
    const remembered = ['91', '92'];
    let turn = 0;
    const picks: Array<string | null> = [];
    for (let i = 0; i < 6; i += 1) {
      const choice = chooseKeptSeed({ remembered, turn });
      picks.push(choice.seed);
      turn = choice.turn;
    }
    assert.deepEqual(picks, ['91', '92', null, '91', '92', null]);
  });

  it('rolls a random seed with nothing kept', () => {
    assert.deepEqual(chooseKeptSeed({ remembered: [], turn: 3 }), { seed: null, turn: 3 });
  });

  it('a Looks wrong redo always gets a new seed, and the turn does not move', () => {
    assert.deepEqual(chooseKeptSeed({ remembered: ['1', '2'], turn: 0, fresh: true }), {
      seed: null,
      turn: 0,
    });
  });

  it('never reuses the seed of the take being replaced', () => {
    assert.deepEqual(chooseKeptSeed({ remembered: ['1', '2'], turn: 0, exclude: ['1'] }), {
      seed: '2',
      turn: 2,
    });
    // Only that one kept: the round's random roll instead.
    assert.deepEqual(chooseKeptSeed({ remembered: ['1'], turn: 0, exclude: ['1'] }), {
      seed: null,
      turn: 2,
    });
  });

  it('keeps its rotation per layout × engine in the local stats', () => {
    let stats = take(emptyPoseOutcomeStats(), 't1', { seed: 111, outcome: 'keeper' });
    stats = take(stats, 't2', { seed: 222, outcome: 'keeper' });
    const picks: Array<string | null> = [];
    for (let i = 0; i < 4; i += 1) {
      const choice = withKeptSeedChoice(stats, {
        poseKey: 'missionary:2',
        model: RAPID,
        device: 'a',
      });
      picks.push(choice.seed);
      stats = choice.stats;
    }
    assert.deepEqual(picks, ['222', '111', null, '222']);
    // Another engine has its own (empty) list.
    assert.equal(
      withKeptSeedChoice(stats, { poseKey: 'missionary:2', model: EDIT, device: 'a' }).seed,
      null
    );
    // A redo that must be fresh leaves the rotation alone.
    const fresh = withKeptSeedChoice(stats, {
      poseKey: 'missionary:2',
      model: RAPID,
      fresh: true,
    });
    assert.equal(fresh.seed, null);
    assert.equal(fresh.stats, stats);
    // No named layout: nothing to remember.
    assert.equal(withKeptSeedChoice(stats, { poseKey: 'photo:1', model: RAPID }).seed, null);
  });
});

describe('kept seeds sync', () => {
  it('travel with the device buckets; the take list and rotation stay local', () => {
    let stats = take(emptyPoseOutcomeStats(), 't1', { seed: 111, outcome: 'keeper' });
    stats = withKeptSeedChoice(stats, { poseKey: 'missionary:2', model: RAPID }).stats;
    const wire = poseOutcomeStatsForSync(stats);
    assert.deepEqual(wire.devices.a?.seeds, { 'missionary|rapid-aio': ['111'] });
    assert.equal(wire.takes, undefined);
    assert.equal(wire.seedTurns, undefined);
    const back = normalizePoseOutcomeStats(JSON.parse(JSON.stringify(stats)));
    assert.deepEqual(rememberedPoseSeeds(back, 'missionary', 'rapid-aio'), ['111']);
    assert.deepEqual(back.seedTurns, { 'missionary|rapid-aio': 1 });
    assert.equal(back.takes?.t1?.sd, '111');
    assert.equal(back.takes?.t1?.i, 1);
  });

  it('merges two browsers without losing either one’s seeds, and a stale copy rolls nothing back', () => {
    // Browser A keeps a missionary still; browser B keeps another, then pushes.
    let a = take(emptyPoseOutcomeStats(), 'a1', { seed: 111, outcome: 'keeper', device: 'A' });
    const staleA = poseOutcomeStatsForSync(a);
    a = take(a, 'a2', { seed: 333, outcome: 'keeper', device: 'A' });
    const b = take(emptyPoseOutcomeStats(), 'b1', { seed: 222, outcome: 'keeper', device: 'B' });
    // The server holds B's push plus A's older copy.
    const server = mergePoseOutcomeStats(poseOutcomeStatsForSync(b), staleA);
    const merged = mergePoseOutcomeStats(a, normalizePoseOutcomeStats(server));
    // A's own seeds first (its newer copy wins over the stale one), then B's.
    assert.deepEqual(rememberedPoseSeeds(merged, 'missionary', 'rapid-aio', 'A'), [
      '333',
      '111',
      '222',
    ]);
    // Local takes and rotation survive the merge.
    assert.equal(merged.takes?.a2?.sd, '333');
    // B sees A's seeds too once it pulls.
    const onB = mergePoseOutcomeStats(b, poseOutcomeStatsForSync(merged));
    assert.deepEqual(rememberedPoseSeeds(onB, 'missionary', 'rapid-aio', 'B'), [
      '222',
      '333',
      '111',
    ]);
  });

  it('drops malformed seeds from a server copy', () => {
    const stats = normalizePoseOutcomeStats({
      version: 1,
      devices: {
        X: {
          seq: 3,
          cells: {},
          seeds: {
            'missionary|rapid-aio': ['12', 'nope', 12, '12', -4],
            'missionary|not-an-engine': ['5'],
            bogus: ['6'],
          },
        },
      },
    });
    assert.deepEqual(stats.devices.X?.seeds, { 'missionary|rapid-aio': ['12'] });
  });
});
