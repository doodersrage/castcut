import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PostureRead } from './pose-posture';
import {
  applyVisionPosture,
  parseVisionPosture,
  POSTURE_VISION_PROMPT,
  wantsVisionPosture,
} from './pose-posture-vision';
import { DEFAULT_MIN_POSE_MATCH, type PoseMatchResult } from './pose-score';

const read = (
  posture: PostureRead['posture'],
  group: PostureRead['group'],
  confident: boolean
): PostureRead => ({ posture, group, confident, facing: 'unknown', tiltDeg: 0 });

function unsureMatch(stillGuess: PostureRead): PoseMatchResult {
  return {
    score: 0.8,
    method: 'limb-angle',
    jointScore: 0.3,
    limbScore: 0.6,
    expectedPeople: 1,
    detectedPeople: 1,
    extraPeople: 0,
    perPerson: [0.6],
    assignment: [0],
    posture: [
      { guide: read('lying-back', 'lying', true), still: stillGuess, mismatch: false, unsure: true },
    ],
    postureMiss: false,
    postureUnsure: true,
    gestureMiss: false,
    offLimbs: [],
    limbDeltas: [],
  };
}

describe('pose posture vision check', () => {
  it('asks a two-line question', () => {
    assert.match(POSTURE_VISION_PROMPT, /POSTURE:/);
    assert.match(POSTURE_VISION_PROMPT, /FACING:/);
  });

  it('parses the model reply', () => {
    assert.deepEqual(parseVisionPosture('POSTURE: sitting\nFACING: camera'), {
      posture: 'sitting',
      group: 'seated',
      facing: 'camera',
    });
    assert.equal(parseVisionPosture('POSTURE: lying-front FACING: camera')?.posture, 'lying-front');
    assert.equal(parseVisionPosture('Posture: she is lying on her side\nFacing: away')?.facing, 'away');
    assert.equal(parseVisionPosture('POSTURE: kneeling')?.group, 'low');
    assert.equal(parseVisionPosture('no idea'), null);
    assert.equal(parseVisionPosture(''), null);
  });

  it('calls a miss only when the model agrees with the keypoint guess', () => {
    const match = unsureMatch(read('sitting', 'seated', false));
    assert.equal(wantsVisionPosture(match), true);
    const missed = applyVisionPosture(match, parseVisionPosture('POSTURE: sitting'));
    assert.equal(missed.postureMiss, true);
    assert.ok(missed.score < DEFAULT_MIN_POSE_MATCH);
    assert.equal(wantsVisionPosture(missed), false);
    // The model sees her lying: the keypoint guess was wrong, the still passes.
    const kept = applyVisionPosture(match, parseVisionPosture('POSTURE: lying-back'));
    assert.equal(kept.postureMiss, false);
    assert.equal(kept.score, match.score);
    // A third answer (standing) agrees with neither: no miss on the model's word alone.
    assert.equal(applyVisionPosture(match, parseVisionPosture('POSTURE: standing')).postureMiss, false);
    // No answer: unchanged.
    assert.equal(applyVisionPosture(match, null), match);
  });
});
