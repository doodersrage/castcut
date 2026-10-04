import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './pose-library';
import {
  applyGestureVerdict,
  decideGesture,
  gestureFixNudge,
  gestureQuestions,
  gestureVisionPrompt,
  guideHandGestures,
  parseGestureAnswers,
  planGestureCheck,
  readHandGestures,
  type GestureVerdict,
} from './pose-gesture';
import {
  DEFAULT_MIN_POSE_MATCH,
  describePoseMatch,
  type DetectedHands,
  type PoseMatchResult,
} from './pose-score';

type P = { x: number; y: number };

/** A standing body (COCO-18, 0–1 of a 3:4 canvas), arms down unless wrists are given. */
function body(wrists: { right?: P; left?: P; rightElbow?: P; leftElbow?: P } = {}): NormalizedBody {
  return [
    { x: 0.5, y: 0.15 }, // nose
    { x: 0.5, y: 0.25 }, // neck
    { x: 0.42, y: 0.26 }, // right shoulder
    wrists.rightElbow ?? { x: 0.4, y: 0.38 },
    wrists.right ?? { x: 0.4, y: 0.48 },
    { x: 0.58, y: 0.26 }, // left shoulder
    wrists.leftElbow ?? { x: 0.6, y: 0.38 },
    wrists.left ?? { x: 0.6, y: 0.48 },
    { x: 0.45, y: 0.52 }, // right hip
    { x: 0.45, y: 0.7 },
    { x: 0.45, y: 0.9 },
    { x: 0.55, y: 0.52 }, // left hip
    { x: 0.55, y: 0.7 },
    { x: 0.55, y: 0.9 },
    { x: 0.48, y: 0.13 }, // eyes
    { x: 0.52, y: 0.13 },
    { x: 0.46, y: 0.14 }, // ears
    { x: 0.54, y: 0.14 },
  ];
}

/** The same body lying on its back across the frame. */
function lyingBody(): NormalizedBody {
  return body().map(p => (p ? { x: p.y, y: 0.5 + (p.x - 0.5) * 0.3 } : null));
}

const ASPECT = 0.75;
const RAISED = { right: { x: 0.38, y: 0.05 }, rightElbow: { x: 0.39, y: 0.15 } };
const AT_MOUTH = { right: { x: 0.48, y: 0.19 }, rightElbow: { x: 0.4, y: 0.3 } };
const ARM_OUT = { right: { x: 0.12, y: 0.27 }, rightElbow: { x: 0.27, y: 0.27 } };
const ON_HIPS = {
  right: { x: 0.44, y: 0.5 },
  rightElbow: { x: 0.36, y: 0.4 },
  left: { x: 0.56, y: 0.5 },
  leftElbow: { x: 0.64, y: 0.4 },
};

function hand(center: P): DetectedHands {
  return {
    left: Array.from({ length: 21 }, (_, i) => ({
      x: center.x + ((i % 5) - 2) * 0.005,
      y: center.y + (Math.floor(i / 5) - 2) * 0.005,
    })),
    right: null,
  };
}

describe('gesture questions from the beat', () => {
  it('asks only for beats with a visible action', () => {
    assert.deepEqual(gestureQuestions({ beat: 'walking along the river path at dusk' }), []);
    assert.deepEqual(gestureQuestions({ beat: 'lying on the rug mid-stretch before the day' }), []);
  });

  it('asks the selfie question (not a second phone one)', () => {
    const questions = gestureQuestions({
      beat: 'taking a selfie on the bridge, phone held high',
      layout: 'selfie:1',
    });
    assert.equal(questions.length, 1);
    assert.equal(questions[0]!.id, 'selfie');
    assert.match(questions[0]!.text, /taking a selfie/);
    assert.equal(questions[0]!.label, 'taking the selfie');
  });

  it('names the drink as the beat does, and only when it is in hand', () => {
    const mug = gestureQuestions({
      beat: 'pouring coffee by the window, mug in hand',
      layout: 'drink:1',
    });
    assert.deepEqual(
      mug.map(q => [q.id, q.text, q.label]),
      [['drink', 'Is she holding a mug in her hand?', 'holding the mug']]
    );
    assert.equal(
      gestureQuestions({ beat: 'standing at the rooftop railing clinking bottles' })[0]!.label,
      'holding the bottle'
    );
    // The coffee is on the table: only the laptop is asked about.
    assert.deepEqual(
      gestureQuestions({ beat: 'working on her laptop at a café table, coffee at her elbow' }).map(
        q => q.id
      ),
      ['laptop']
    );
  });

  it('asks only the drawn action when the beat names several', () => {
    assert.deepEqual(
      gestureQuestions({
        beat: 'waving from the hotel balcony rail, coffee in the other hand',
        layout: 'wave:1',
      }).map(q => q.id),
      ['wave']
    );
    // A guide with no action drawn: up to two.
    assert.deepEqual(
      gestureQuestions({
        beat: 'pointing at the menu board with a coffee cup in hand',
        layout: 'stand:1',
      }).map(q => q.id),
      ['point', 'drink']
    );
  });

  it('asks about cooking and pointing in words the model can check', () => {
    assert.match(
      gestureQuestions({ beat: 'flipping pancakes at the stove, spatula mid-air' })[0]!.text,
      /kitchen utensil .* over a pan/
    );
    assert.equal(
      gestureQuestions({ beat: 'pointing toward a storefront across the street' })[0]!.text,
      'Is she pointing at something with an outstretched arm?'
    );
  });

  it('asks about a carried bag', () => {
    assert.deepEqual(
      gestureQuestions({ beat: 'carrying a tote bag over one shoulder between errands' }).map(
        q => q.label
      ),
      ['carrying the bag']
    );
  });

  it('never reads a partner touch as a hands-on-hips gesture', () => {
    assert.deepEqual(
      gestureQuestions({
        beat: 'lying face to face on the rumpled bed — his hand on her hip',
        layout: 'hands_hips:2',
      }),
      []
    );
  });

  it('falls back to the drawn layout when there is no beat', () => {
    assert.deepEqual(
      gestureQuestions({ beat: '', layout: 'point:1' }).map(q => q.id),
      ['point']
    );
  });

  it('uses the lead pronouns', () => {
    assert.equal(
      gestureQuestions({ beat: 'hands on hips at the mirror', lead: 'man' })[0]!.text,
      'Are both of his hands on his hips?'
    );
    assert.match(
      gestureQuestions({ beat: 'taking a selfie', lead: 'person' })[0]!.text,
      /themselves/
    );
  });
});

describe('gesture vision prompt and answers', () => {
  const questions = gestureQuestions({ beat: 'pointing with a mug in hand', layout: 'stand:1' });

  it('asks every question in one strict-JSON prompt', () => {
    const prompt = gestureVisionPrompt(questions);
    assert.match(prompt, /point: Is she pointing/);
    assert.match(prompt, /drink: Is she holding a mug/);
    assert.match(prompt, /strict JSON only/);
  });

  it('reads the reply, fenced or not, and drops unknown ids', () => {
    const answers = parseGestureAnswers(
      '```json\n{"answers":[{"id":"point","answer":"No","confidence":0.9},{"id":"drink","answer":"yes","confidence":70},{"id":"x","answer":"no","confidence":99}]}\n```',
      questions
    );
    assert.deepEqual(answers, [
      { id: 'point', answer: 'no', confidence: 90 },
      { id: 'drink', answer: 'yes', confidence: 70 },
    ]);
    assert.equal(parseGestureAnswers('I cannot tell.', questions), null);
    assert.equal(parseGestureAnswers('{"answers": []}', questions), null);
  });
});

describe('hands against the guide', () => {
  it('reads what the guide defines', () => {
    assert.deepEqual(guideHandGestures(body(), ASPECT), []);
    assert.deepEqual(guideHandGestures(body(RAISED), ASPECT), ['arm-raised']);
    assert.deepEqual(guideHandGestures(body(AT_MOUTH), ASPECT), ['hand-to-face']);
    assert.deepEqual(guideHandGestures(body(ARM_OUT), ASPECT), ['arm-out']);
    assert.deepEqual(guideHandGestures(body(ON_HIPS), ASPECT), ['hands-on-hips']);
    assert.deepEqual(
      guideHandGestures(body({ ...RAISED, left: { x: 0.62, y: 0.05 } }), ASPECT),
      ['both-arms-raised']
    );
    // A lying guide defines no hand rule (no "above the shoulder" when horizontal).
    assert.deepEqual(guideHandGestures(lyingBody(), ASPECT), []);
  });

  it('calls a raised arm left down missing, and one raised either side shown', () => {
    const missing = readHandGestures({
      guide: body(RAISED),
      guideAspect: ASPECT,
      still: body(),
      stillAspect: ASPECT,
    });
    assert.deepEqual(missing, [{ kind: 'arm-raised', still: 'missing' }]);
    // The other arm (sides swapped by the detector) counts.
    const shown = readHandGestures({
      guide: body(RAISED),
      guideAspect: ASPECT,
      still: body({ left: { x: 0.62, y: 0.06 } }),
      stillAspect: ASPECT,
    });
    assert.deepEqual(shown, [{ kind: 'arm-raised', still: 'shown' }]);
  });

  it('finds a hand at the face from the hand keypoints when the wrist is lower', () => {
    const read = (stillHands: DetectedHands | null) =>
      readHandGestures({
        guide: body(AT_MOUTH),
        guideAspect: ASPECT,
        still: body({ right: { x: 0.44, y: 0.36 }, rightElbow: { x: 0.4, y: 0.4 } }),
        stillHands,
        stillAspect: ASPECT,
      })[0]!.still;
    assert.equal(read(null), 'missing');
    assert.equal(read(hand({ x: 0.49, y: 0.2 })), 'shown');
    // A hand guessed off the frame is ignored.
    assert.equal(read(hand({ x: 0.49, y: -0.3 })), 'missing');
  });

  it('reads hands on hips and an arm reaching out', () => {
    assert.equal(
      readHandGestures({
        guide: body(ON_HIPS),
        guideAspect: ASPECT,
        still: body(ON_HIPS),
        stillAspect: ASPECT,
      })[0]!.still,
      'shown'
    );
    assert.equal(
      readHandGestures({ guide: body(ARM_OUT), guideAspect: ASPECT, still: body(), stillAspect: ASPECT })[0]!
        .still,
      'missing'
    );
  });

  it('says unknown, never missing, when the still is lying or unread', () => {
    assert.deepEqual(
      readHandGestures({
        guide: body(RAISED),
        guideAspect: ASPECT,
        still: lyingBody(),
        stillAspect: ASPECT,
      }),
      [{ kind: 'arm-raised', still: 'unknown' }]
    );
    assert.deepEqual(
      readHandGestures({ guide: body(RAISED), guideAspect: ASPECT, still: null, stillAspect: ASPECT }),
      [{ kind: 'arm-raised', still: 'unknown' }]
    );
  });
});

function match(score = 0.8): PoseMatchResult {
  return {
    score,
    method: 'limb-angle',
    jointScore: 0.5,
    limbScore: 0.6,
    expectedPeople: 1,
    detectedPeople: 1,
    extraPeople: 0,
    perPerson: [0.6],
    assignment: [0],
    posture: [],
    postureMiss: false,
    postureUnsure: false,
    gestureMiss: false,
    offLimbs: [],
    limbDeltas: [],
  };
}

describe('gesture verdict', () => {
  const questions = gestureQuestions({ beat: 'sipping coffee, mug in hand', layout: 'drink:1' });

  it('misses on a confident "no", with the action in words', () => {
    const verdict = decideGesture({
      questions,
      answers: [{ id: 'drink', answer: 'no', confidence: 95 }],
    });
    assert.equal(verdict.miss, true);
    assert.equal(verdict.missed, 'holding the mug');
    assert.equal(verdict.source, 'vision');
  });

  it('keeps the still on a yes, an unsure no, or no answer at all', () => {
    for (const answers of [
      [{ id: 'drink', answer: 'yes' as const, confidence: 95 }],
      [{ id: 'drink', answer: 'no' as const, confidence: 60 }],
      null,
    ]) {
      assert.equal(decideGesture({ questions, answers }).miss, false);
    }
  });

  it('never misses on the hands alone', () => {
    const verdict = decideGesture({
      questions,
      answers: null,
      hands: [{ kind: 'hand-to-face', still: 'missing' }],
    });
    assert.equal(verdict.miss, false);
    assert.equal(
      decideGesture({
        questions,
        answers: [{ id: 'drink', answer: 'no', confidence: 90 }],
        hands: [{ kind: 'hand-to-face', still: 'missing' }],
      }).source,
      'both'
    );
  });

  it('carries a miss into the pose score and the status line', () => {
    const verdict: GestureVerdict = decideGesture({
      questions,
      answers: [{ id: 'drink', answer: 'no', confidence: 90 }],
    });
    const missed = applyGestureVerdict(match(), verdict);
    assert.ok(missed.score < DEFAULT_MIN_POSE_MATCH);
    assert.equal(missed.gestureCheck?.missed, 'holding the mug');
    assert.match(describePoseMatch(missed), /missed: holding the mug/);
    const kept = applyGestureVerdict(
      match(),
      decideGesture({ questions, answers: [{ id: 'drink', answer: 'yes', confidence: 90 }] })
    );
    assert.equal(kept.score, 0.8);
    assert.equal(applyGestureVerdict(match(), null).gestureCheck, undefined);
  });

  it('spells the missed gesture out for the redo, with the layout cue', () => {
    assert.equal(
      gestureFixNudge('holding the mug', 'drink:1'),
      'GESTURE (missed last time): she must be visibly holding the mug — one hand holds a cup or glass at chest height, elbow bent close to the body.'
    );
    assert.equal(gestureFixNudge(null, 'drink:1'), '');
    assert.match(gestureFixNudge('pointing', 'point', 'man'), /^GESTURE \(missed last time\): he /);
  });

  it('plans nothing (no vision call) for a beat without an action', () => {
    const plan = planGestureCheck({
      beat: 'walking along the river',
      poseKey: 'walk:1',
      guide: [body(RAISED)],
      guideAspect: ASPECT,
      detected: { canvas: { width: 960, height: 1280 }, people: [body()] },
      match: { assignment: [0] },
    });
    assert.deepEqual(plan, { questions: [], hands: [] });
    const waving = planGestureCheck({
      beat: 'waving hello from the balcony',
      poseKey: 'wave:1',
      guide: [body(RAISED)],
      guideAspect: ASPECT,
      detected: { canvas: { width: 960, height: 1280 }, people: [body()] },
      match: { assignment: [0] },
    });
    assert.deepEqual(waving.questions.map(q => q.id), ['wave']);
    assert.deepEqual(waving.hands, [{ kind: 'arm-raised', still: 'missing' }]);
  });
});
