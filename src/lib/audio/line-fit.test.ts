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
    assert.deepEqual(tightLineTrim({ startSec: 0.4, endSec: 1.9 }), { trimStartSec: 0.05, trimEndSec: 2.7 });
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

describe('the shot that ends a scene keeps room for its dip (2026-11-17)', () => {
  it('a tightened last shot of a scene runs on by the dip; others, and untightened ones, do not', async () => {
    const { roomForSceneBreaks } = await import('./line-fit');
    const shot = (key: string, sceneGroup: string, trimEndSec?: number) => ({ key, kind: 'clip', sceneGroup, trimEndSec });
    const out = roomForSceneBreaks(
      [shot('a', 's|1', 2.5), shot('b', 's|1', 3), shot('c', 's|2', 2), shot('d', 's|2')],
      1,
      s => s.key !== 'c'
    );
    assert.deepEqual(
      out.map(s => s.trimEndSec),
      [2.5, 4, 2, undefined]
    );
    // Run on no further than speech starting again after the line (H3 talking on).
    const capped = roomForSceneBreaks(
      [shot('a', 's|1', 3), shot('b', 's|2', 2)],
      1,
      () => true,
      s => (s.key === 'a' ? 3.4 : undefined)
    );
    assert.deepEqual(capped.map(s => s.trimEndSec), [3.4, 2]);
  });
});

describe('where a clip’s line can end, and whether it has been said (the flagship’s 1B and 1C, 2026-11-18)', () => {
  const RATE = 16000;
  /** Sound where `loud` says so, silence elsewhere. */
  const clip = (seconds: number, loud: Array<[number, number]>) =>
    Float32Array.from({ length: Math.round(seconds * RATE) }, (_, i) => {
      const t = i / RATE;
      return loud.some(([a, b]) => t >= a && t < b) ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : 0;
    });

  it('lists each pause in the speech, then its last sound', async () => {
    const { speechPauses } = await import('./line-fit');
    // 1C: "That's a key." (0.25–1.10), a 60 ms breath, then H3 talking on to the end.
    const babble = speechPauses(clip(5.2, [[0.25, 1.1], [1.16, 5.1]]), RATE);
    assert.equal(babble.length, 2);
    assert.ok(Math.abs(babble[0]! - 1.1) < 0.05, `paused at ${babble[0]}`);
    assert.ok(Math.abs(babble[1]! - 5.1) < 0.05, `last at ${babble[1]}`);
    // 1B: a beat inside the line — both its parts are places it could end.
    const beat = speechPauses(clip(5.2, [[0.4, 1.9], [3.85, 4.26]]), RATE);
    assert.equal(beat.length, 2);
    assert.ok(Math.abs(beat[1]! - 4.26) < 0.05, `last at ${beat[1]}`);
    // 1C remade: the line runs into babble with only a dip between — the dip is a place too.
    const dip = Float32Array.from({ length: Math.round(4.6 * RATE) }, (_, i) => {
      const t = i / RATE;
      const loud = t >= 1.0 && t < 4.3 ? 0.3 : 0;
      const breath = t >= 1.9 && t < 2.0 ? 0.04 : 1;
      return loud * breath * Math.sin(2 * Math.PI * 220 * t);
    });
    const dipped = speechPauses(dip, RATE);
    assert.ok(dipped.some(at => Math.abs(at - 1.95) < 0.08), `places ${dipped}`);
    assert.deepEqual(speechPauses(clip(2, []), RATE), []);
  });

  it('hears the whole line only once its last words are said', async () => {
    const { heardWholeLine } = await import('./line-fit');
    assert.equal(heardWholeLine(' I had one cut.', 'I had one cut. For you.'), false);
    assert.equal(heardWholeLine(' I had one cut. For you.', 'I had one cut. For you.'), true);
    assert.equal(heardWholeLine("That's a key.", "That's a key."), true);
    // Whisper's small slips pass: one word of seven missed, apostrophes dropped.
    assert.equal(heardWholeLine('Youre asking me to move in over coffee', 'You’re asking me to move in. Over coffee.'), true);
    assert.equal(heardWholeLine('', 'Hi.'), false);
  });
});

describe('a tightened shot ends before speech starts again (the remade 1C, 2026-11-18)', () => {
  it('cuts the tail at the babble and starts earlier to keep its length', async () => {
    const { tightLineTrim, speechResumesAt } = await import('./line-fit');
    // "That's a key." 1.00–1.66, babble from 1.92: the shot ends at 1.87, starting 1.6 s before.
    assert.deepEqual(tightLineTrim({ startSec: 1, endSec: 1.66, resumeSec: 1.92 }), {
      trimStartSec: 0.27,
      trimEndSec: 1.87,
    });
    // Sound straight after the heard end (a dip inside the last word): the line going on, not new
    // speech — the usual tail ("Where would my books go?", 3B).
    assert.deepEqual(tightLineTrim({ startSec: 1.53, endSec: 2.74, resumeSec: 2.78 }), {
      trimStartSec: 1.18,
      trimEndSec: 3.54,
    });
    // Nothing after it: the usual tail.
    assert.deepEqual(tightLineTrim({ startSec: 1, endSec: 1.66 }), {
      trimStartSec: 0.65,
      trimEndSec: 2.46,
    });
    const RATE = 16000;
    const sound = Float32Array.from({ length: 3 * RATE }, (_, i) => {
      const t = i / RATE;
      return (t < 1 || t >= 1.7) && t >= 0.2 ? 0.3 * Math.sin(2 * Math.PI * 220 * t) : 0;
    });
    const at = speechResumesAt(sound, RATE, 1.04)!;
    assert.ok(Math.abs(at - 1.7) < 0.05, `resumed at ${at}`);
  });
});
