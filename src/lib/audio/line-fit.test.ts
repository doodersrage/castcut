import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LINE_FIT_MAX_STRETCH, lineFitPlan, speechSpan } from './line-fit';

const RATE = 1000;
/** Quiet room tone with a loud stretch from `from` to `to` seconds. */
function clip(total: number, from: number, to: number): Float32Array {
  const out = new Float32Array(total * RATE);
  for (let i = 0; i < out.length; i += 1) {
    const t = i / RATE;
    out[i] = (t >= from && t < to ? 0.3 : 0.002) * Math.sin(i * 0.7);
  }
  return out;
}

describe('a read line fitted to a talking clip', () => {
  it('finds where the clip speaks, above its room tone', () => {
    const span = speechSpan(clip(4, 0.8, 2.6), RATE)!;
    assert.ok(Math.abs(span.startSec - 0.8) < 0.03);
    assert.ok(Math.abs(span.endSec - 2.6) < 0.03);
    assert.equal(speechSpan(new Float32Array(4 * RATE), RATE), null, 'silence is no speech');
  });

  it('starts the reading where the clip speaks, stretched to its length within bounds', () => {
    assert.deepEqual(lineFitPlan({ startSec: 0.8, endSec: 2.6 }, 1.98), { delaySec: 0.8, tempo: 1.1 });
    // Far apart: stretched no more than the bound — a warped voice is worse than a late lip.
    assert.equal(lineFitPlan({ startSec: 0, endSec: 1 }, 3)!.tempo, LINE_FIT_MAX_STRETCH);
    assert.equal(lineFitPlan(null, 2), null);
    assert.equal(lineFitPlan({ startSec: 1, endSec: 1.1 }, 2), null, 'a blip is not a line');
  });
});
