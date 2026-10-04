import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './pose-library';
import {
  duoRelation,
  mergePersonReads,
  ON_OTHER_SCORE,
  type PersonRead,
} from './pose-reference-duo';

type XY = [number, number];

/** A person standing square to the camera, centred on `cx` (0–1 of a square crop). */
function standing(cx: number, overrides: Partial<Record<number, XY>> = {}): NormalizedBody {
  const points: XY[] = [
    [cx, 0.12], // nose
    [cx, 0.2], // neck
    [cx - 0.06, 0.2], // right shoulder
    [cx - 0.08, 0.33], // right elbow
    [cx - 0.08, 0.45], // right wrist
    [cx + 0.06, 0.2], // left shoulder
    [cx + 0.08, 0.33], // left elbow
    [cx + 0.08, 0.45], // left wrist
    [cx - 0.04, 0.5], // right hip
    [cx - 0.04, 0.7], // right knee
    [cx - 0.04, 0.9], // right ankle
    [cx + 0.04, 0.5], // left hip
    [cx + 0.04, 0.7], // left knee
    [cx + 0.04, 0.9], // left ankle
    [cx - 0.015, 0.1], // right eye
    [cx + 0.015, 0.1], // left eye
    [cx - 0.03, 0.11], // right ear
    [cx + 0.03, 0.11], // left ear
  ];
  return points.map((p, index) => {
    const [x, y] = overrides[index] ?? p;
    return { x, y };
  });
}

/** A DWPose read of a standing person in crop pixels (a 200 × 400 crop). */
function read(cropX: number, cropY: number, score = 0.9, onOther?: boolean[]): PersonRead {
  return {
    joints: standing(0.5).map(p => [p!.x * 200, p!.y * 400, score] as const),
    crop: { x: cropX, y: cropY },
    onOther,
  };
}

describe('per-person reads merged into one picture', () => {
  it('moves each read back to image pixels and keeps both people', () => {
    const people = mergePersonReads([read(100, 50), read(400, 60)]);
    assert.equal(people.length, 2);
    const necks = people.map(body => body[1]!).sort((a, b) => a.x - b.x);
    // Neck at (0.5, 0.2) of a 200 × 400 crop: (100, 80) in the crop.
    assert.deepEqual(
      necks.map(p => [p.x, p.y]),
      [
        [200, 130],
        [500, 140],
      ]
    );
  });

  it('undoes a scaled crop', () => {
    const scaled: PersonRead = { ...read(10, 20), crop: { x: 10, y: 20, scale: 2 } };
    const [body] = mergePersonReads([scaled]);
    assert.deepEqual([body![1]!.x, body![1]!.y], [10 + 100 / 2, 20 + 80 / 2]);
  });

  it('drops a joint that landed on the other person', () => {
    const onOther = Array.from({ length: 18 }, (_, i) => i === 7);
    const [body] = mergePersonReads([read(0, 0, 0.9, onOther)]);
    assert.equal(body![7]!.score, ON_OTHER_SCORE);
    assert.equal(body![4]!.score, 0.9);
  });

  it('keeps one of two reads of the same body, the surer one', () => {
    const people = mergePersonReads([read(100, 50, 0.6), read(103, 52, 0.95), read(500, 50, 0.8)]);
    assert.equal(people.length, 2);
    assert.ok(people.some(body => body[1]!.score === 0.95));
    assert.ok(!people.some(body => body[1]!.score === 0.6));
  });

  it('lists the taller person first', () => {
    const small: PersonRead = { ...read(0, 0), crop: { x: 0, y: 0, scale: 2 } };
    const people = mergePersonReads([small, read(300, 0)]);
    assert.equal(people[0]![1]!.x, 400);
  });
});

describe('two-person contact rules', () => {
  it('passes poses without a rule', () => {
    assert.deepEqual(duoRelation('dance', [standing(0.3), standing(0.7)], 1), {
      ok: true,
      why: 'no rule',
    });
  });

  it('hug: arms around the other’s torso, not two people side by side', () => {
    const hugging = [standing(0.4, { 6: [0.55, 0.3], 7: [0.62, 0.35] }), standing(0.6)];
    assert.equal(duoRelation('hug', hugging, 1).ok, true);
    assert.equal(duoRelation('hug', [standing(0.4), standing(0.6)], 1).ok, false);
    // An arm slung over the other's shoulder (the hand up at the shoulder) is a team photo.
    const slung = [standing(0.4, { 6: [0.52, 0.17], 7: [0.62, 0.2] }), standing(0.6)];
    assert.equal(duoRelation('hug', slung, 1).ok, false);
    // Arms round the other but standing a body apart is not a hug.
    const apart = [standing(0.2, { 6: [0.75, 0.3], 7: [0.78, 0.35] }), standing(0.8)];
    assert.deepEqual(duoRelation('hug', apart, 1), { ok: false, why: 'apart' });
  });

  it('head on a shoulder: one head within a short reach of the other’s shoulder', () => {
    const resting = [
      standing(0.4, { 0: [0.52, 0.23], 14: [0.51, 0.21], 15: [0.53, 0.21] }),
      standing(0.6),
    ];
    assert.equal(duoRelation('head_shoulder', resting, 1).ok, true);
    assert.equal(duoRelation('head_shoulder', [standing(0.3), standing(0.7)], 1).ok, false);
  });

  it('piggyback: the rider’s hips up on the carrier’s back, legs at the waist', () => {
    const carrier = standing(0.5);
    const rider = standing(0.52, {
      0: [0.52, 0.06],
      1: [0.52, 0.12],
      2: [0.46, 0.12],
      5: [0.58, 0.12],
      8: [0.48, 0.38],
      11: [0.56, 0.38],
      9: [0.4, 0.45],
      12: [0.62, 0.45],
      10: [0.4, 0.6],
      13: [0.62, 0.6],
    });
    assert.equal(duoRelation('piggyback', [rider, carrier], 1).ok, true);
    // Either order: the lead may be the carrier.
    assert.equal(duoRelation('piggyback', [carrier, rider], 1).ok, true);
    assert.equal(duoRelation('piggyback', [standing(0.4), standing(0.6)], 1).ok, false);
  });

  it('toast: both raise a hand and the hands meet', () => {
    const toasting = [
      standing(0.4, { 6: [0.47, 0.32], 7: [0.49, 0.25] }),
      standing(0.6, { 3: [0.53, 0.32], 4: [0.52, 0.25] }),
    ];
    assert.equal(duoRelation('toast', toasting, 1).ok, true);
    assert.deepEqual(duoRelation('toast', [standing(0.4), standing(0.6)], 1), {
      ok: false,
      why: 'a hand not raised',
    });
    // Raised, but at the far sides: no clink.
    const apart = [
      standing(0.3, { 3: [0.22, 0.32], 4: [0.2, 0.22] }),
      standing(0.7, { 6: [0.78, 0.32], 7: [0.8, 0.22] }),
    ];
    assert.deepEqual(duoRelation('toast', apart, 1), { ok: false, why: 'raised hands apart' });
  });

  it('fight: guards up at arm’s length, no fist on a face', () => {
    const guard = (cx: number, extra: Partial<Record<number, XY>> = {}) =>
      standing(cx, { 4: [cx - 0.03, 0.15], 7: [cx + 0.03, 0.15], 3: [cx - 0.06, 0.25], 6: [cx + 0.06, 0.25], ...extra });
    assert.equal(duoRelation('fight', [guard(0.3), guard(0.7)], 1).ok, true);
    assert.deepEqual(duoRelation('fight', [standing(0.3), guard(0.7)], 1), {
      ok: false,
      why: 'guard down',
    });
    // A fist landing on the other's face is a hit, not a sparring stance.
    const hit = [guard(0.4, { 7: [0.6, 0.12] }), guard(0.6)];
    assert.deepEqual(duoRelation('fight', hit, 1), { ok: false, why: 'a fist on a face' });
    // A crop 1.5 wide: three torsos and more between the hips.
    assert.deepEqual(duoRelation('fight', [guard(0.05), guard(0.95)], 1.5), {
      ok: false,
      why: 'out of reach',
    });
  });

  it('measures across the crop’s aspect', () => {
    // On a crop twice as wide as tall the same 0–1 gap is twice the distance: out of a hug.
    const hugging = [standing(0.4, { 6: [0.55, 0.3], 7: [0.62, 0.35] }), standing(0.6)];
    assert.equal(duoRelation('hug', hugging, 2.5).ok, false);
  });

  it('needs exactly two people with a torso each', () => {
    assert.equal(duoRelation('hug', [standing(0.5)], 1).ok, false);
    const headless = standing(0.6).map((p, i) => (i === 1 || i === 2 || i === 5 ? null : p));
    assert.deepEqual(duoRelation('hug', [standing(0.4), headless], 1), {
      ok: false,
      why: 'no torso',
    });
  });
});
