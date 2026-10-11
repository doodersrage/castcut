import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planMix } from './film-mix-preview';

describe('mix preview plan', () => {
  it('puts each clip line where the cut plays it, trimmed', () => {
    const plan = planMix({
      shots: [
        { title: 'A', url: '/a.png', kind: 'still', holdSec: 3 },
        { title: 'B', url: '/b.mp4', kind: 'clip', trimStartSec: 1, trimEndSec: 4 },
        { title: 'C', url: '/c.png', kind: 'still', holdSec: 2 },
      ],
      clipSecs: [null, 6, null],
      crossfadeSec: 0,
      titleCard: false,
    });
    assert.deepEqual(plan.lines, [{ shot: 1, startSec: 3, fromSec: 1, durSec: 3 }]);
    assert.equal(plan.totalSec, 8);
  });

  it('counts the title card and crossfades like the encode', () => {
    const plan = planMix({
      shots: [{ title: 'B', url: '/b.mp4', kind: 'clip' }],
      clipSecs: [5],
      crossfadeSec: 0.5,
      titleCard: true,
    });
    assert.equal(plan.lines[0]!.startSec, 1.9);
    assert.equal(plan.lines[0]!.durSec, 5);
  });
});
