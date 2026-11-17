import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LINE_FIT_MAX_STRETCH,
  lineFitPlan,
  singleLineSaidTwice,
  speechBursts,
  speechSpan,
} from './line-fit';

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

describe('a one-sentence line said twice, by its sound (the flagship, 2026-11-16)', () => {
  // Bursts as read off the flagship's clips: 3D and 1C said twice (the user heard both), the rest not.
  it('two bursts of about the line’s length; a line of two sentences pauses between them', () => {
    const b = (...spans: Array<[number, number]>) => spans.map(([startSec, endSec]) => ({ startSec, endSec }));
    assert.equal(singleLineSaidTwice(b([0.3, 1.7], [3.2, 4.5]), "You can't build a shelf."), true);
    assert.equal(singleLineSaidTwice(b([0.8, 1.4], [1.9, 2.7]), "That's a key."), true);
    assert.equal(singleLineSaidTwice(b([1.4, 2.3], [3.2, 4.5]), 'To my place. Our place, maybe.'), false);
    assert.equal(singleLineSaidTwice(b([0.5, 2.3]), 'I had one cut. For you.'), false);
    assert.equal(singleLineSaidTwice(b([0.4, 1.9]), 'How many books do you own?'), false);
  });

  it('reads bursts off the sound: a breath inside a sentence is one, a gap is two', () => {
    const s = clip(5, 0.5, 1.5);
    for (let i = Math.round(1.7 * RATE); i < 1.9 * RATE; i += 1) s[i] = 0.3 * Math.sin(i * 0.7);
    for (let i = Math.round(3 * RATE); i < 4 * RATE; i += 1) s[i] = 0.3 * Math.sin(i * 0.7);
    const bursts = speechBursts(s, RATE);
    assert.equal(bursts.length, 2);
    assert.ok(Math.abs(bursts[0]!.endSec - 1.9) < 0.05 && Math.abs(bursts[1]!.startSec - 3) < 0.05);
  });
});

describe('a talking shot tightened to its line (the flagship, 2026-11-16)', () => {
  it('from just before the line to just after; a trim already there only narrows it', async () => {
    const { tightLineTrim } = await import('./line-fit');
    // 7B: "How many books do you own?" spoken 0.4–1.9 s of a 5.2 s clip.
    assert.deepEqual(tightLineTrim({ startSec: 0.4, endSec: 1.9 }), { trimStartSec: 0.05, trimEndSec: 2.5 });
    // A short line keeps 1.6 s.
    assert.deepEqual(tightLineTrim({ startSec: 3.7, endSec: 4.0 }), { trimStartSec: 3.35, trimEndSec: 4.95 });
    // 1C: ended just after its line (said twice) — the repeat stays out.
    assert.deepEqual(tightLineTrim({ startSec: 0.4, endSec: 5.0 }, { trimEndSec: 1.8 }), {
      trimStartSec: 0.05,
      trimEndSec: 1.8,
    });
    assert.equal(tightLineTrim(null), null);
  });
});
