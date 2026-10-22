import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { describePoseFigure } from './describe';
import { poseStarterBody } from './starters';

const A = 2 / 3;

describe('vision posture vs the joints', () => {
  it('a kneel read "crouching" by vision stays a kneel (the joints show the knee down)', () => {
    const kneel = poseStarterBody('kneel');
    const words = describePoseFigure(kneel, { aspect: A, posture: { posture: 'crouching' } });
    assert.match(words.stance, /kneel/);
    assert.doesNotMatch(words.stance, /crouching/);
  });

  it('vision still decides a lying read the joints miss', () => {
    const words = describePoseFigure(poseStarterBody('kneel'), {
      aspect: A,
      posture: { posture: 'lying-back' },
    });
    assert.match(words.stance, /^lying on her back/);
  });
});
