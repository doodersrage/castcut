import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { synthesizeStickSkeleton } from './day-pose-guide';
import { stickToOpenPoseKeypoints } from './pose-guide-openpose';
import type { NormalizedBody } from './pose-library';
import { guideAsymmetry, scoreLimbAngles } from './pose-limb-score';
import {
  DEFAULT_MIN_POSE_MATCH,
  describePoseMatch,
  limbVerdictScore,
  POSE_MISS_SCORE_CAP,
  posturePairWords,
  scorePoseMatch,
} from './pose-score';
import { buildPoseMissView } from './pose-coaching';

type Base = 'stand' | 'walk' | 'sit' | 'crouch' | 'kneel' | 'lie';
type Arm = 'down' | 'up' | 'out';

function figure(base: Base, arms: [Arm, Arm] = ['down', 'down']): NormalizedBody {
  return stickToOpenPoseKeypoints(
    synthesizeStickSkeleton(
      {
        base,
        armLeft: arms[0],
        armRight: arms[1],
        lean: 0,
        stride: 0.2,
        seed: 11,
        people: 1,
        label: base,
      },
      { centerX: 0.5 }
    )
  ).map(p => (p ? { x: p.x / 512, y: p.y / 768 } : null));
}

const aspects = { guide: 2 / 3, detected: 2 / 3 };
const detected = (people: NormalizedBody[]) => ({ canvas: { width: 512, height: 768 }, people });

describe('limb-angle pose score', () => {
  it('scores the same pose 1 and is blind to position and size', () => {
    const sit = figure('sit');
    assert.ok(scoreLimbAngles(sit, sit, aspects)!.score > 0.99);
    // A small figure in a corner (a wide shot) points its limbs the same way.
    const small = sit.map(p => (p ? { x: 0.75 + p.x * 0.2, y: 0.05 + p.y * 0.25 } : null));
    // Uniform scale in true proportions: x and y shrink by the same factor on a 2:3 canvas.
    const uniform = sit.map(p => (p ? { x: 0.1 + p.x * 0.3, y: 0.5 + p.y * 0.3 } : null));
    assert.ok(scoreLimbAngles(sit, uniform, aspects)!.score > 0.99);
    assert.ok(scoreLimbAngles(sit, small, aspects)!.score > 0.9);
  });

  it('tolerates detection jitter', () => {
    const guide = figure('walk');
    const jittered = guide.map((p, i) =>
      p ? { x: p.x + Math.sin(i * 7.1) * 0.01, y: p.y + Math.cos(i * 3.3) * 0.01 } : null
    );
    assert.ok(scoreLimbAngles(guide, jittered, aspects)!.score > 0.85);
  });

  it('skips joints missing in either body', () => {
    const guide = figure('stand', ['up', 'up']);
    const noArms = figure('stand').map((p, i) => ([3, 4, 6, 7].includes(i) ? null : p));
    const match = scoreLimbAngles(guide, noArms, aspects)!;
    assert.ok(!match.limbs.some(limb => limb.part.includes('arm')));
    assert.ok(match.score > 0.95);
    // Without a torso there is nothing to score.
    const noHips = guide.map((p, i) => (i === 8 || i === 11 ? null : p));
    assert.equal(scoreLimbAngles(noHips, guide, aspects), null);
  });

  it('names the limbs that are off', () => {
    const match = scoreLimbAngles(figure('stand', ['up', 'up']), figure('stand'), aspects)!;
    assert.ok(match.off.includes('left upper arm') && match.off.includes('right upper arm'));
    assert.ok(!match.off.includes('torso'));
    assert.equal(match.gestureMiss, true);
    assert.ok(match.definingOff.length >= 3);
  });

  it('weighs legs and torso over arms', () => {
    const stand = figure('stand');
    const oneArm = scoreLimbAngles(figure('stand', ['up', 'down']), stand, aspects)!.score;
    const seated = scoreLimbAngles(stand, figure('sit'), aspects)!.score;
    assert.ok(seated < oneArm, `sit ${seated} vs one arm ${oneArm}`);
  });

  it('accepts a mirrored pose only as far as the guide is symmetric', () => {
    const lie = figure('lie');
    const flipped = lie.map(p => (p ? { x: 1 - p.x, y: p.y } : null));
    const lying = scoreLimbAngles(lie, flipped, aspects)!;
    assert.ok(lying.score > 0.8, `mirrored lie ${lying.score}`);
    // One arm raised: the mirrored still raises the other arm and pays for it.
    const oneUp = figure('stand', ['up', 'down']);
    const otherUp = oneUp.map(p => (p ? { x: 1 - p.x, y: p.y } : null));
    assert.ok(guideAsymmetry(oneUp, 2 / 3) > guideAsymmetry(figure('stand'), 2 / 3));
    assert.ok(scoreLimbAngles(oneUp, otherUp, aspects)!.score < scoreLimbAngles(oneUp, oneUp, aspects)!.score);
  });
});

describe('pose check verdict', () => {
  it('passes natural variation and fails a different posture whatever the limbs say', () => {
    const lying = scorePoseMatch({ guide: [figure('lie')], guideAspect: 2 / 3, detected: detected([figure('sit')]) });
    assert.equal(lying.postureMiss, true);
    assert.ok(lying.score < DEFAULT_MIN_POSE_MATCH);
    assert.deepEqual(posturePairWords(lying), { guide: 'lying on the back', still: 'sitting' });
    assert.match(describePoseMatch(lying), /sitting, guide lying on the back/);
    const walk = scorePoseMatch({ guide: [figure('walk')], guideAspect: 2 / 3, detected: detected([figure('stand')]) });
    assert.equal(walk.postureMiss, false);
    assert.ok(walk.score >= DEFAULT_MIN_POSE_MATCH);
    // The old joint-distance score is kept for comparison.
    assert.ok(walk.jointScore > 0 && walk.jointScore < 1);
  });

  it('maps the verdict across the gate', () => {
    assert.equal(limbVerdictScore(1, false), 1);
    assert.equal(limbVerdictScore(0, false), DEFAULT_MIN_POSE_MATCH);
    assert.ok(limbVerdictScore(1, true) <= POSE_MISS_SCORE_CAP);
    assert.ok(POSE_MISS_SCORE_CAP < DEFAULT_MIN_POSE_MATCH);
  });

  it('puts the posture first in the miss view', () => {
    const guide = [figure('lie')];
    const still = [figure('sit')];
    const match = scorePoseMatch({ guide, guideAspect: 2 / 3, detected: detected(still) });
    const view = buildPoseMissView({
      imageUrl: 'x.png',
      score: match.score,
      guide,
      guideAspect: 2 / 3,
      still,
      stillAspect: 2 / 3,
      posture: posturePairWords(match),
    })!;
    assert.deepEqual(view.misses[0], { part: 'body', guide: 'lying on the back', still: 'sitting' });
  });
});
