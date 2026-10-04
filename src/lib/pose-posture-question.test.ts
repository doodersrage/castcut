import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './pose-library';
import type { GestureAnswer } from './pose-gesture';
import {
  applyPostureAnswer,
  POSTURE_QUESTION_ID,
  postureQuestion,
  wantsPostureQuestion,
} from './pose-posture-question';
import { DEFAULT_MIN_POSE_MATCH, posturePairWords, scorePoseMatch } from './pose-score';

const W = 768;
const H = 1024;
const body = (points: Array<[number, number] | null>): NormalizedBody =>
  points.map(p => (p ? { x: p[0] / W, y: p[1] / H } : null));

// On one knee (the custom-pose words A/B guide): her right knee down, the left foot planted.
const KNEEL = body([
  [384, 215], [384, 300], [309, 310], [330, 450], [420, 680], [459, 310], [480, 450], [460, 680],
  [344, 560], [340, 880], [300, 900], [424, 560], [450, 700], [455, 890], [370, 203], [398, 203],
  [355, 213], [413, 213],
]);
// Lying on the back, hands behind the head.
const LYING = body([
  [120, 625], [180, 650], [185, 655], [170, 580], [125, 640], [178, 645], [160, 570], [130, 645],
  [430, 660], [580, 665], [730, 670], [425, 655], [530, 540], [610, 665], [118, 612], null,
  [145, 650], null,
]);
// Standing, hands on the hips, legs cut at the knees (no ankles: an unsure read).
const STANDING_CROPPED = body([
  [384, 150], [384, 235], [309, 245], [280, 370], [330, 480], [459, 245], [490, 370], [440, 480],
  [344, 500], [344, 690], null, [424, 500], [430, 690], null, [370, 138], [398, 138], [355, 148],
  [413, 148],
]);
// Standing, full body: a confident read.
const STANDING = body([
  [384, 150], [384, 235], [309, 245], [280, 370], [330, 480], [459, 245], [490, 370], [440, 480],
  [344, 500], [344, 690], [344, 880], [424, 500], [430, 690], [430, 880], [370, 138], [398, 138],
  [355, 148], [413, 148],
]);

const match = (guide: NormalizedBody, still: NormalizedBody) =>
  scorePoseMatch({
    guide: [guide],
    guideAspect: W / H,
    detected: { canvas: { width: W, height: H }, people: [still] },
  });

const answer = (value: GestureAnswer['answer'], confidence = 95): GestureAnswer[] => [
  { id: POSTURE_QUESTION_ID, answer: value, confidence },
];

describe('pose posture question', () => {
  it('asks when the still standing before a kneeling guide reads unsure', () => {
    const result = match(KNEEL, STANDING_CROPPED);
    assert.equal(result.posture[0]!.guide.confident, true);
    assert.equal(result.posture[0]!.still!.confident, false);
    // The keypoints alone pass it: the gap this question closes.
    assert.ok(result.score >= DEFAULT_MIN_POSE_MATCH);
    assert.equal(wantsPostureQuestion(result), true);
    const question = postureQuestion(result);
    assert.equal(question?.id, POSTURE_QUESTION_ID);
    assert.match(question!.text, /^Is she kneeling/);
    assert.match(postureQuestion(result, 'man')!.text, /^Is he kneeling/);
  });

  it('phrases the question from the guide posture', () => {
    assert.equal(postureQuestion(match(LYING, STANDING_CROPPED))?.text,
      'Is she lying or reclining, not standing or sitting upright?');
  });

  it('a clear "no" is a posture miss; anything else keeps the match', () => {
    const result = match(KNEEL, STANDING_CROPPED);
    const question = postureQuestion(result);
    const missed = applyPostureAnswer(result, question, answer('no'));
    assert.equal(missed.postureMiss, true);
    assert.ok(missed.score < DEFAULT_MIN_POSE_MATCH);
    assert.deepEqual(posturePairWords(missed), { guide: 'kneeling', still: 'standing' });
    assert.equal(wantsPostureQuestion(missed), false);
    assert.equal(applyPostureAnswer(result, question, answer('yes')), result);
    assert.equal(applyPostureAnswer(result, question, answer('no', 60)), result);
    assert.equal(applyPostureAnswer(result, question, answer('unsure')), result);
    assert.equal(applyPostureAnswer(result, question, null), result);
    assert.equal(applyPostureAnswer(result, null, answer('no')), result);
    // Answers for the gesture questions are not the posture's.
    assert.equal(
      applyPostureAnswer(result, question, [{ id: 'drink', answer: 'no', confidence: 99 }]),
      result
    );
  });

  it('skips confident reads and stills that already missed', () => {
    // Confident standing against a confident kneel: already a miss, nothing to ask.
    const missed = match(KNEEL, STANDING);
    assert.equal(missed.postureMiss, true);
    assert.equal(wantsPostureQuestion(missed), false);
    // Confident and the same posture: nothing to ask.
    assert.equal(wantsPostureQuestion(match(STANDING, STANDING)), false);
    assert.equal(wantsPostureQuestion(null), false);
  });
});
