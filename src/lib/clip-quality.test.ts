import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clipCheckLabel,
  clipMotion,
  decideClipQuality,
  frameIsBlank,
  type FrameLuma,
} from './clip-quality';

const gradient = (shift: number): FrameLuma =>
  Array.from({ length: 64 }, (_, i) => ((i + shift) % 64) / 64);

describe('Animate clip checks', () => {
  it('measures motion between sampled frames', () => {
    assert.equal(clipMotion([gradient(0), gradient(0)]), 0);
    assert.ok(clipMotion([gradient(0), gradient(8), gradient(16)]) > 0.1);
    assert.equal(clipMotion([gradient(0)]), 0);
  });

  it('spots blank frames', () => {
    assert.equal(frameIsBlank(new Array(64).fill(0)), true);
    assert.equal(frameIsBlank(gradient(0)), false);
  });

  it('flags frozen, blank and face-drifted clips, and passes good ones', () => {
    const frozen = decideClipQuality({ clipUrl: 'a', frames: [gradient(0), gradient(0)] });
    assert.equal(frozen.status, 'warn');
    assert.deepEqual(frozen.notes, ['barely moves']);

    const blank = decideClipQuality({
      clipUrl: 'b',
      frames: [gradient(0), new Array(64).fill(0)],
    });
    assert.ok(blank.notes.includes('blank frames'));

    const drifted = decideClipQuality({
      clipUrl: 'c',
      frames: [gradient(0), gradient(10)],
      faceMatch: 0.18,
    });
    assert.equal(drifted.status, 'warn');
    assert.match(clipCheckLabel(drifted)!, /face drifted from the Cast \(18%\) — try Animate again/);

    const good = decideClipQuality({
      clipUrl: 'd',
      frames: [gradient(0), gradient(10)],
      faceMatch: 0.7,
    });
    assert.equal(good.status, 'ok');
    assert.equal(clipCheckLabel(good), null);

    const soft = decideClipQuality({ clipUrl: 'e', frames: [gradient(0), gradient(10)], faceMatch: 0.4 });
    assert.equal(soft.status, 'ok');
    assert.equal(clipCheckLabel(soft), 'Clip: face match 40% at the end');
  });
});
