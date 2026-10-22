import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describePhotoPose, describePoseFigure } from './describe';
import type { NormalizedBody } from './library';
import { fitPhotoPoseToHeadcount } from './photo-pose-fit';
import {
  heldObjectWords,
  normalizePhotoPosture,
  parseVisionPosture,
  visionPostureDecides,
  visionPostureStance,
} from './vision-posture';
import { normalizePhotoPose } from '../day/pose-guide';

const p = (x: number, y: number) => ({ x, y });

/**
 * DWPose's read of a woman reclining on a sofa, shot from above (2026-10-20): arms up overhead
 * (DWPose missed her right one), legs apart, both knees bent. From the joints alone it read
 * "standing on her right leg, left leg lifted, knee bent, foot at hip height".
 */
const RECLINING_FROM_ABOVE: NormalizedBody = [
  p(0.517, 0.27),
  p(0.438, 0.359),
  p(0.355, 0.359),
  null,
  null,
  p(0.521, 0.359),
  p(0.636, 0.261),
  p(0.725, 0.16),
  p(0.355, 0.625),
  p(0.073, 0.828),
  p(0.571, 0.873),
  p(0.498, 0.593),
  p(0.92, 0.47),
  p(0.672, 0.739),
  p(0.504, 0.248),
  p(0.546, 0.276),
  p(0.445, 0.254),
  p(0.546, 0.312),
];
const RECLINING_ASPECT = 0.8001;

/** pose-references perch_edge-1: sitting on an edge, one leg down, one tucked. */
const PERCH_EDGE: NormalizedBody = [
  p(0.766, 0.162),
  p(0.72, 0.286),
  p(0.599, 0.275),
  p(0.475, 0.422),
  p(0.374, 0.49),
  p(0.842, 0.297),
  p(0.684, 0.499),
  p(0.446, 0.525),
  p(0.663, 0.604),
  p(0.413, 0.636),
  p(0.615, 0.936),
  p(0.811, 0.629),
  p(0.403, 0.556),
  p(0.138, 0.789),
  p(0.756, 0.13),
  p(0.821, 0.16),
  p(0.706, 0.137),
  p(0.863, 0.205),
];

describe('vision posture read', () => {
  it('parses the model reply onto the fixed list', () => {
    assert.deepEqual(parseVisionPosture('{"posture": "reclining", "support": "a sofa"}'), {
      posture: 'reclining',
      support: 'a sofa',
    });
    assert.deepEqual(
      parseVisionPosture('```json\n{"posture":"lying on her back","support":"bed"}\n```'),
      { posture: 'lying-back', support: 'the bed' }
    );
    assert.deepEqual(parseVisionPosture('{"posture": "standing", "support": "the ground"}'), {
      posture: 'standing',
    });
    assert.equal(parseVisionPosture('{"posture": "floating"}'), null);
    assert.equal(parseVisionPosture('she is reclining'), null);
    assert.deepEqual(parseVisionPosture('{"posture": "sitting", "support": "nothing"}'), {
      posture: 'sitting',
    });
  });

  it('reads what each hand holds, and nothing for a hand resting on the body', () => {
    assert.deepEqual(
      parseVisionPosture(
        '{"posture": "sitting", "support": "a bench", "right_hand": "umbrella", "left_hand": "an umbrella"}'
      ),
      {
        posture: 'sitting',
        support: 'a bench',
        held: { right: 'an umbrella', left: 'an umbrella' },
      }
    );
    assert.deepEqual(
      parseVisionPosture('{"posture": "standing", "right_hand": "her hip", "left_hand": "a phone"}'),
      { posture: 'standing', held: { left: 'a phone' } }
    );
    // An old reply with no hands, or empty ones: no held key at all.
    assert.deepEqual(
      parseVisionPosture('{"posture": "sitting", "right_hand": "nothing", "left_hand": "none"}'),
      { posture: 'sitting' }
    );
    assert.deepEqual(
      normalizePhotoPosture({ posture: 'sitting', held: { right: 'umbrella', left: 7 } }),
      { posture: 'sitting', held: { right: 'an umbrella' } }
    );
    assert.equal(heldObjectWords({ right: 'an umbrella', left: 'an umbrella' }), 'holding an umbrella in both hands');
    assert.equal(heldObjectWords({ left: 'a phone' }), 'holding a phone');
    assert.equal(heldObjectWords({ right: 'a cup', left: 'a phone' }), 'holding a cup and a phone');
    assert.equal(heldObjectWords(undefined), null);
  });

  it('decides only supported postures; an upright one stays the joints’ call', () => {
    assert.equal(visionPostureDecides({ posture: 'reclining' }), true);
    assert.equal(visionPostureDecides({ posture: 'bending' }), false);
    assert.equal(visionPostureDecides({ posture: 'standing' }), false);
    assert.equal(
      visionPostureStance({ posture: 'reclining', support: 'a sofa' }),
      'reclining back against a sofa'
    );
    assert.equal(visionPostureStance({ posture: 'lying-back' }, 'his'), 'lying on his back');
    assert.equal(visionPostureStance({ posture: 'walking' }), null);
  });

  it('keeps a stored read and drops a made-up one', () => {
    assert.deepEqual(normalizePhotoPosture({ posture: 'kneeling', support: 'the floor' }), {
      posture: 'kneeling',
      support: 'the floor',
    });
    assert.equal(normalizePhotoPosture({ posture: 'levitating' }), undefined);
    assert.equal(normalizePhotoPosture('reclining'), undefined);
  });
});

describe('photo pose words', () => {
  it('a reclining body shot from above: the posture from the read, the limbs from the joints', () => {
    const joints = describePhotoPose({ aspect: RECLINING_ASPECT, people: [RECLINING_FROM_ABOVE] });
    assert.doesNotMatch(joints, /^reclining/);
    const words = describePhotoPose({
      aspect: RECLINING_ASPECT,
      people: [RECLINING_FROM_ABOVE],
      posture: { posture: 'reclining', support: 'a sofa' },
    });
    assert.match(words, /^reclining back against a sofa/);
    assert.match(words, /her left arm \(on the right of the picture\) raised overhead/);
    assert.match(words, /legs apart/);
    assert.match(words, /her right knee \(on the left of the picture\) bent/);
    assert.doesNotMatch(words, /standing|leg lifted/);
  });

  it('a seat the joints read as one-legged standing reads as sitting', () => {
    const words = describePoseFigure(PERCH_EDGE, { aspect: 0.6999 });
    assert.equal(words.stance, 'sitting');
    assert.doesNotMatch(words.text, /standing on/);
  });

  it('the read rides with a one-person photo through the headcount fit and storage', () => {
    const read = {
      aspect: RECLINING_ASPECT,
      people: [RECLINING_FROM_ABOVE],
      posture: { posture: 'reclining' as const, support: 'a sofa' },
    };
    assert.deepEqual(fitPhotoPoseToHeadcount(read, 1).pose.posture, read.posture);
    assert.deepEqual(fitPhotoPoseToHeadcount(read).pose.posture, read.posture);
    const stored = normalizePhotoPose(JSON.parse(JSON.stringify(read)));
    assert.deepEqual(stored?.posture, read.posture);
  });

  it('a named pose keeps its own words through storage (they were dropped on every reload)', () => {
    const named = {
      aspect: 2 / 3,
      people: [RECLINING_FROM_ABOVE],
      words: 'waving: one arm raised high, palm open',
    };
    assert.equal(normalizePhotoPose(named)?.words, named.words);
    assert.equal(
      describePhotoPose(normalizePhotoPose(named)!),
      'waving: one arm raised high, palm open'
    );
    assert.equal(normalizePhotoPose({ ...named, words: '   ' })?.words, undefined);
  });
});
