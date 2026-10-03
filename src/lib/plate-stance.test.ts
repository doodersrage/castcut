import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './pose-library';
import {
  currentPlateStance,
  normalizePlateStance,
  parseDismissedPlateKeys,
  plateStanceKey,
  plateStanceNote,
  plateStanceNudge,
  readPlateStance,
  withDismissedPlateKey,
} from './plate-stance';

type Joints = Partial<Record<number, [number, number]>>;

/** COCO-18 body from a few joints (normalized x, y). */
function body(joints: Joints): NormalizedBody {
  return Array.from({ length: 18 }, (_, index) => {
    const joint = joints[index];
    return joint ? { x: joint[0], y: joint[1] } : null;
  });
}

// A 3:4 plate, a woman standing square-on: neck 0.15, hips 0.48, knees 0.70, ankles 0.92.
const STANDING: Joints = {
  0: [0.5, 0.1],
  1: [0.5, 0.15],
  2: [0.42, 0.16],
  5: [0.58, 0.16],
  8: [0.45, 0.48],
  9: [0.45, 0.7],
  10: [0.45, 0.92],
  11: [0.55, 0.48],
  12: [0.55, 0.7],
  13: [0.55, 0.92],
};
const SIZE = { width: 1104, height: 1472 };

describe('readPlateStance', () => {
  it('passes a standing full-body plate', () => {
    assert.deepEqual(readPlateStance({ people: [body(STANDING)], ...SIZE }), {
      standing: true,
      reason: 'standing',
    });
  });

  it('reads a seated plate (knees level with the hips)', () => {
    const seated = body({
      ...STANDING,
      9: [0.3, 0.5],
      12: [0.4, 0.5],
      10: [0.3, 0.75],
      13: [0.4, 0.75],
    });
    assert.equal(readPlateStance({ people: [seated], ...SIZE }).reason, 'seated');
  });

  it('reads a kneeling plate (ankles back at knee height)', () => {
    const kneeling = body({
      ...STANDING,
      9: [0.45, 0.72],
      12: [0.55, 0.72],
      10: [0.4, 0.74],
      13: [0.6, 0.74],
    });
    const stance = readPlateStance({ people: [kneeling], ...SIZE });
    assert.equal(stance.standing, false);
    assert.equal(stance.reason, 'kneeling');
  });

  it('reads a crouch (deep knee bend)', () => {
    const crouch = body({
      ...STANDING,
      9: [0.65, 0.66],
      12: [0.75, 0.66],
      10: [0.48, 0.88],
      13: [0.53, 0.88],
    });
    assert.equal(readPlateStance({ people: [crouch], ...SIZE }).reason, 'crouching');
  });

  it('reads a lying plate (torso near horizontal)', () => {
    const lying = body({ 0: [0.2, 0.5], 1: [0.25, 0.52], 8: [0.6, 0.6], 11: [0.6, 0.62] });
    assert.equal(readPlateStance({ people: [lying], width: 1472, height: 1104 }).reason, 'lying');
  });

  it('flags feet out of frame', () => {
    const noAnkles = body({ ...STANDING, 10: undefined, 13: undefined });
    assert.equal(readPlateStance({ people: [noAnkles], ...SIZE }).reason, 'feet-cropped');
    const atEdge = body({ ...STANDING, 10: [0.45, 0.995], 13: [0.55, 0.995] });
    assert.equal(readPlateStance({ people: [atEdge], ...SIZE }).reason, 'feet-cropped');
  });

  it('flags head-and-shoulders and waist-up crops', () => {
    const portrait = body({ 0: [0.5, 0.3], 1: [0.5, 0.55], 2: [0.3, 0.6], 5: [0.7, 0.6] });
    assert.equal(readPlateStance({ people: [portrait], ...SIZE }).reason, 'not-full-body');
    const waistUp = body({ ...STANDING, 9: undefined, 10: undefined, 12: undefined, 13: undefined });
    assert.equal(readPlateStance({ people: [waistUp], ...SIZE }).reason, 'not-full-body');
  });

  it('has nothing to say without a person', () => {
    assert.deepEqual(readPlateStance({ people: [], ...SIZE }), {
      standing: true,
      reason: 'no-person',
    });
    // A stray limb (no neck, no nose) isn't a person.
    const limb = body({ 9: [0.4, 0.7], 10: [0.4, 0.9] });
    assert.equal(readPlateStance({ people: [limb], ...SIZE }).reason, 'no-person');
  });

  it('reads the lead, not a small figure behind her', () => {
    const background = body({ 0: [0.9, 0.3], 1: [0.9, 0.32], 8: [0.9, 0.4] });
    const seated = body({ ...STANDING, 9: [0.3, 0.5], 12: [0.4, 0.5] });
    assert.equal(readPlateStance({ people: [background, seated], ...SIZE }).reason, 'seated');
  });
});

describe('plate stance storage', () => {
  it('normalizes stored stances', () => {
    assert.deepEqual(normalizePlateStance({ standing: false, reason: 'seated' }), {
      standing: false,
      reason: 'seated',
      checkedAt: 0,
    });
    assert.deepEqual(
      normalizePlateStance({ standing: false, reason: 'lying', checkedAt: 5, plate: ' a.png ' }),
      { standing: false, reason: 'lying', checkedAt: 5, plate: 'a.png' }
    );
    assert.equal(normalizePlateStance({ standing: false, reason: 'dancing' }), undefined);
    assert.equal(normalizePlateStance('seated'), undefined);
    assert.equal(normalizePlateStance(null), undefined);
    // A missing flag follows the reason.
    assert.equal(normalizePlateStance({ reason: 'kneeling' })?.standing, false);
    assert.equal(normalizePlateStance({ reason: 'prepared' })?.standing, true);
  });

  it('keys the stance to its plate', () => {
    const plate = { filename: 'plate-a.png', imageUrl: '/media/a.png' };
    assert.equal(plateStanceKey(plate), 'plate-a.png');
    assert.equal(plateStanceKey({ imageUrl: '/media/a.png' }), '/media/a.png');
    const stance = { standing: false, reason: 'seated' as const, checkedAt: 1, plate: 'plate-a.png' };
    assert.equal(currentPlateStance(stance, plate), stance);
    assert.equal(currentPlateStance(stance, { filename: 'plate-b.png' }), null);
    // No plate key stored: it is the current plate's.
    const unkeyed = { standing: false, reason: 'seated' as const, checkedAt: 1 };
    assert.equal(currentPlateStance(unkeyed, plate), unkeyed);
    assert.equal(currentPlateStance(unkeyed, null), null);
  });

  it('writes a note only for a plate that is not standing', () => {
    assert.match(
      plateStanceNote({ standing: false, reason: 'seated', checkedAt: 0 }) ?? '',
      /^Seated — Day and Outfit pose a standing/
    );
    assert.match(plateStanceNote({ standing: false, reason: 'lying', checkedAt: 0 }) ?? '', /^Lying down/);
    assert.equal(plateStanceNote({ standing: true, reason: 'standing', checkedAt: 0 }), null);
    assert.equal(plateStanceNote(null), null);
  });

  it('writes the Day / Outfit nudge only for a plate that is not standing', () => {
    assert.equal(
      plateStanceNudge({ standing: false, reason: 'seated', checkedAt: 0 }),
      'Seated plate — poses come out better from a standing one.'
    );
    assert.match(
      plateStanceNudge({ standing: false, reason: 'feet-cropped', checkedAt: 0 }) ?? '',
      /^Feet cut off the plate — /
    );
    assert.equal(plateStanceNudge({ standing: true, reason: 'prepared', checkedAt: 0 }), null);
    assert.equal(plateStanceNudge({ standing: true, reason: 'no-person', checkedAt: 0 }), null);
    assert.equal(plateStanceNudge(undefined), null);
  });

  it('remembers dismissed plates newest first, deduped and capped', () => {
    assert.deepEqual(parseDismissedPlateKeys(null), []);
    assert.deepEqual(parseDismissedPlateKeys('not json'), []);
    assert.deepEqual(parseDismissedPlateKeys('{"a":1}'), []);
    assert.deepEqual(parseDismissedPlateKeys('[" a.png ", 3, "a.png", "", "b.png"]'), [
      'a.png',
      'b.png',
    ]);
    assert.deepEqual(withDismissedPlateKey(['a.png', 'b.png'], 'b.png'), ['b.png', 'a.png']);
    assert.deepEqual(withDismissedPlateKey(['a.png'], '  '), ['a.png']);
    assert.deepEqual(withDismissedPlateKey(['a', 'b', 'c'], 'd', 3), ['d', 'a', 'b']);
  });
});
