import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { isDayHardPose, setLearnedHardLayoutsSource } from './day-best-of-two';
import { DEFAULT_DAY_SLOTS, diversifyDaySlotScenes, setDayAvoidedBeatsSource } from './day-planner';
import { chronicRerollBeats, rerollBeatKey, rerollProneLayouts, type PlayMetrics } from './play-metrics';

const NONE = () => new Set<string>();

describe('learning from re-rolls', () => {
  afterEach(() => {
    setDayAvoidedBeatsSource(NONE);
    setLearnedHardLayoutsSource(NONE);
  });

  it('flags layouts re-rolled in half their renders (8+) and beats re-rolled 3+ times at 60%+', () => {
    const metrics: PlayMetrics = {
      version: 1,
      rerollsByLayout: {
        missionary: { renders: 10, rerolls: 6 },
        hug: { renders: 10, rerolls: 2 },
        wall: { renders: 4, rerolls: 4 },
      },
      rerollsByBeat: {
        'spooning sex on the couch, afternoon light': { renders: 5, rerolls: 4 },
        'kissing in a doorway': { renders: 6, rerolls: 3 },
      },
    };
    assert.deepEqual([...rerollProneLayouts(metrics)], ['missionary']);
    assert.deepEqual([...chronicRerollBeats(metrics)], ['spooning sex on the couch, afternoon light']);
    assert.equal(rerollBeatKey('  Spooning  sex on the couch, afternoon light '), 'spooning sex on the couch, afternoon light');
  });

  it('a layout the player keeps re-rolling counts as a hard pose (best of two)', () => {
    assert.equal(isDayHardPose('straddle:2'), false);
    setLearnedHardLayoutsSource(() => new Set(['straddle']));
    assert.equal(isDayHardPose('straddle:2'), true);
    // The built-in hard poses stay hard.
    assert.equal(isDayHardPose('spoon:2'), true);
  });

  it('Suggest day skips beats the player keeps re-rolling while the pool has others', () => {
    const pick = (seed: number) => {
      let state = seed;
      const random = () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
      return diversifyDaySlotScenes(DEFAULT_DAY_SLOTS, {
        fillBeats: true,
        forceBeats: true,
        dayMood: 'intimate',
        intimateMix: 'duo',
        random,
      }).slots.map(slot => slot.sceneHints ?? '');
    };
    const before = Array.from({ length: 20 }, (_, i) => pick(i + 1)).flat();
    const counts = new Map<string, number>();
    for (const beat of before) counts.set(beat, (counts.get(beat) ?? 0) + 1);
    const common = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    setDayAvoidedBeatsSource(() => new Set([rerollBeatKey(common)]));
    const after = Array.from({ length: 20 }, (_, i) => pick(i + 1)).flat();
    assert.ok(!after.includes(common), `still picked: ${common}`);
  });
});
