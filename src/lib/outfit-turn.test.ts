import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signatureDiff, turnFrameAfterDrag, turnLoop } from './outfit-turn';

/** A signature whose pixels are all `value`. */
const flat = (value: number) => new Uint8Array(16).fill(value);

describe('outfit turn', () => {
  it('measures mean absolute difference', () => {
    assert.equal(signatureDiff(flat(10), flat(14)), 4);
    assert.equal(signatureDiff(flat(10), flat(10)), 0);
  });

  it('ends the turn where she stops moving and wraps when she is back where she began', () => {
    // 40 frames turning (a ramp up and back down to the start), then 40 standing still.
    const turn = Array.from({ length: 40 }, (_, i) => flat(Math.round(100 * Math.sin((Math.PI * i) / 40))));
    const stand = Array.from({ length: 40 }, () => flat(0));
    const loop = turnLoop([...turn, ...stand]);
    assert.ok(loop.turns);
    assert.ok(loop.end >= 36 && loop.end <= 42, `end ${loop.end}`);
    assert.equal(loop.full, true);
  });

  it('keeps every frame and stops at the ends when the turn never comes back round', () => {
    const half = Array.from({ length: 60 }, (_, i) => flat(i * 2));
    const loop = turnLoop(half);
    assert.equal(loop.end, 60);
    assert.equal(loop.full, false);
  });

  it('says there is no turn when nothing moves', () => {
    assert.equal(turnLoop(Array.from({ length: 30 }, () => flat(50))).turns, false);
  });

  it('maps a drag to a frame, wrapping only on a full turn', () => {
    const drag = { start: 2, count: 10, pixelsPerTurn: 100 };
    assert.equal(turnFrameAfterDrag({ ...drag, dx: 30, full: true }), 5);
    assert.equal(turnFrameAfterDrag({ ...drag, dx: -50, full: true }), 7);
    assert.equal(turnFrameAfterDrag({ ...drag, dx: -50, full: false }), 0);
    assert.equal(turnFrameAfterDrag({ ...drag, dx: 500, full: false }), 9);
  });
});
