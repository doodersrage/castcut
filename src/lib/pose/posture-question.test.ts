import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './library';
import type { GestureAnswer } from './gesture';
import {
  applyPostureAnswer,
  GROUND_SIT_LABEL,
  groundSitLookalike,
  POSTURE_QUESTION_ID,
  postureQuestion,
  wantsPostureQuestion,
} from './posture-question';
import { DEFAULT_MIN_POSE_MATCH, posturePairWords, scorePoseMatch } from './score';

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

/** A reference's joints ([x, y] as shares of its canvas). */
const ref = (points: Array<[number, number] | null>): NormalizedBody =>
  points.map(p => (p ? { x: p[0], y: p[1] } : null));
// sport_ski-5 (aspect 0.8758): a carving skier, both feet well to one side of the hips — the
// flat joints of a seat on the ground with the legs out in front.
const SKI_ASPECT = 0.8758;
const SKI = ref([
  [0.587, 0.186], [0.671, 0.223], [0.539, 0.178], [0.428, 0.301], [0.43, 0.458], [0.803, 0.268],
  [0.891, 0.426], [0.86, 0.588], [0.501, 0.454], [0.348, 0.709], [0.112, 0.937], [0.663, 0.511],
  [0.482, 0.637], [0.357, 0.869], [0.575, 0.158], [0.617, 0.167], [0.566, 0.131], [0.705, 0.156],
]);
// crouch-2 (aspect 0.889): a deep squat.
const CROUCH_ASPECT = 0.889;
const CROUCH = ref([
  [0.854, 0.192], [0.67, 0.341], [0.47, 0.316], [0.352, 0.579], [0.329, 0.793], [0.861, 0.364],
  [0.813, 0.675], [0.82, 0.897], [0.442, 0.801], [0.109, 0.771], [0.452, 0.935], [0.603, 0.787],
  [0.852, 0.65], [0.667, 0.929], [0.825, 0.139], [0.891, 0.145], [0.706, 0.129], null,
]);
// sit_floor-2 (aspect 0.7635): sitting cross-legged — reads low like a squat, but it sits.
const FLOOR_ASPECT = 0.7635;
const FLOOR_SIT = ref([
  [0.658, 0.177], [0.655, 0.32], [0.473, 0.272], [0.251, 0.512], [0.421, 0.349], [0.836, 0.369],
  [0.906, 0.637], [0.836, 0.764], [0.485, 0.648], [0.117, 0.748], [0.625, 0.935], [0.731, 0.667],
  [0.885, 0.834], [0.375, 0.907], [0.611, 0.129], [0.719, 0.161], null, [0.817, 0.186],
]);

const sameAs = (guide: NormalizedBody, aspect: number) =>
  scorePoseMatch({
    guide: [guide],
    guideAspect: aspect,
    detected: { canvas: { width: Math.round(aspect * 1000), height: 1000 }, people: [guide] },
    customPose: true,
  });

describe('pose posture question: sat on the ground for a crouch', () => {
  it('knows the guides a seat on the ground looks like', () => {
    assert.equal(groundSitLookalike(SKI, SKI_ASPECT), 'off-balance');
    assert.equal(groundSitLookalike(CROUCH, CROUCH_ASPECT), 'crouch');
    assert.equal(groundSitLookalike(FLOOR_SIT, FLOOR_ASPECT), null);
    assert.equal(groundSitLookalike(STANDING, W / H), null);
    assert.equal(groundSitLookalike(KNEEL, W / H), null);
    assert.equal(groundSitLookalike(LYING, W / H), null);
    assert.equal(groundSitLookalike(null, W / H), null);
  });

  it('asks whether the still is on its feet, even when both reads are confident', () => {
    // Sat on the grass, the still draws the guide's own joints: a confident match.
    const result = sameAs(SKI, SKI_ASPECT);
    assert.equal(result.postureMiss, false);
    assert.ok(result.score >= DEFAULT_MIN_POSE_MATCH);
    // Without the guide body the old check asks nothing.
    assert.equal(postureQuestion(result), null);
    const question = postureQuestion(result, 'woman', { body: SKI, aspect: SKI_ASPECT });
    assert.equal(question?.id, POSTURE_QUESTION_ID);
    assert.equal(question?.label, GROUND_SIT_LABEL);
    assert.equal(
      question?.text,
      'Are her knees bent sharply with her feet under her hips, as in a crouch or squat?'
    );
    assert.match(
      postureQuestion(result, 'man', { body: SKI, aspect: SKI_ASPECT })!.text,
      /^Are his knees/
    );
    const crouch = sameAs(CROUCH, CROUCH_ASPECT);
    assert.equal(
      postureQuestion(crouch, 'woman', { body: CROUCH, aspect: CROUCH_ASPECT })?.label,
      GROUND_SIT_LABEL
    );
    // A floor-sit guide keeps the old rule.
    const floor = sameAs(FLOOR_SIT, FLOOR_ASPECT);
    assert.notEqual(
      postureQuestion(floor, 'woman', { body: FLOOR_SIT, aspect: FLOOR_ASPECT })?.label,
      GROUND_SIT_LABEL
    );
  });

  it('a clear "no" is a miss read as sitting; anything else keeps the match', () => {
    const result = sameAs(SKI, SKI_ASPECT);
    const question = postureQuestion(result, 'woman', { body: SKI, aspect: SKI_ASPECT });
    const missed = applyPostureAnswer(result, question, answer('no'));
    assert.equal(missed.postureMiss, true);
    assert.ok(missed.score < DEFAULT_MIN_POSE_MATCH);
    assert.deepEqual(posturePairWords(missed), { guide: 'standing', still: 'sitting' });
    assert.equal(postureQuestion(missed, 'woman', { body: SKI, aspect: SKI_ASPECT }), null);
    assert.equal(applyPostureAnswer(result, question, answer('yes')), result);
    assert.equal(applyPostureAnswer(result, question, answer('no', 60)), result);
  });

  it('asks nothing of a still that already missed', () => {
    const result = scorePoseMatch({
      guide: [SKI],
      guideAspect: SKI_ASPECT,
      detected: { canvas: { width: W, height: H }, people: [LYING] },
      customPose: true,
    });
    assert.ok(result.score < DEFAULT_MIN_POSE_MATCH);
    assert.equal(postureQuestion(result, 'woman', { body: SKI, aspect: SKI_ASPECT }), null);
  });
});
