import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NormalizedBody } from './library';
import {
  GROUND_SIT_REDO_MARK,
  WORDS_ONLY_MIN_LIMB_SCORE,
  groundSitLineFor,
  groundSitRedoFor,
  groundSitRedoWords,
  isGroundSitRedoPrompt,
  judgeWordsOnlyRedo,
} from './ground-sit-redo';
import { POSTURE_QUESTION_ID, applyPostureAnswer, postureQuestion } from './posture-question';
import {
  DEFAULT_MIN_POSE_MATCH,
  describePoseMatch,
  limbMissWords,
  scorePoseMatch,
  type PoseMatchResult,
} from './score';

const ref = (points: Array<[number, number] | null>): NormalizedBody =>
  points.map(p => (p ? { x: p[0], y: p[1] } : null));
// sport_ski-5 (a carving skier, feet well to one side of the hips).
const SKI_ASPECT = 0.8758;
const SKI = ref([
  [0.587, 0.186], [0.671, 0.223], [0.539, 0.178], [0.428, 0.301], [0.43, 0.458], [0.803, 0.268],
  [0.891, 0.426], [0.86, 0.588], [0.501, 0.454], [0.348, 0.709], [0.112, 0.937], [0.663, 0.511],
  [0.482, 0.637], [0.357, 0.869], [0.575, 0.158], [0.617, 0.167], [0.566, 0.131], [0.705, 0.156],
]);
// crouch-2: a deep squat.
const CROUCH_ASPECT = 0.889;
const CROUCH = ref([
  [0.854, 0.192], [0.67, 0.341], [0.47, 0.316], [0.352, 0.579], [0.329, 0.793], [0.861, 0.364],
  [0.813, 0.675], [0.82, 0.897], [0.442, 0.801], [0.109, 0.771], [0.452, 0.935], [0.603, 0.787],
  [0.852, 0.65], [0.667, 0.929], [0.825, 0.139], [0.891, 0.145], [0.706, 0.129], null,
]);
// Two words-only sport_ski-5 redos on Turbo-8 (sheet D "N1", DWPose): on her feet in a crouch.
const STILL_CANVAS = { width: 1104, height: 1472 };
const CROUCH_STILL = ref([
  [0.483, 0.24], [0.512, 0.33], [0.427, 0.333], [0.45, 0.448], [0.416, 0.532], [0.596, 0.327],
  [0.638, 0.468], [0.641, 0.592], [0.505, 0.485], [0.395, 0.583], [0.503, 0.683], [0.623, 0.494],
  [0.505, 0.601], [0.616, 0.713], [0.459, 0.224], [0.507, 0.222], [0.434, 0.237], [0.543, 0.231],
]);
const CROUCH_STILL_2 = ref([
  [0.447, 0.217], [0.493, 0.314], [0.399, 0.327], [0.439, 0.438], [0.439, 0.511], [0.587, 0.301],
  [0.688, 0.408], [0.763, 0.52], [0.502, 0.508], [0.346, 0.628], [0.469, 0.706], [0.645, 0.51],
  [0.483, 0.664], [0.68, 0.745], [0.42, 0.201], [0.472, 0.198], [0.393, 0.214], [0.508, 0.206],
]);

const ski = { body: SKI, aspect: SKI_ASPECT };
const against = (still: NormalizedBody, customPose: boolean) =>
  scorePoseMatch({
    guide: [SKI],
    guideAspect: SKI_ASPECT,
    detected: { canvas: STILL_CANVAS, people: [still] },
    customPose,
  });
/** The seated still: it draws the guide's own flat joints. */
const seated = () =>
  scorePoseMatch({
    guide: [SKI],
    guideAspect: SKI_ASPECT,
    detected: { canvas: { width: 876, height: 1000 }, people: [SKI] },
    customPose: true,
  });
const no = [{ id: POSTURE_QUESTION_ID, answer: 'no' as const, confidence: 95 }];

describe('ground-sit redo', () => {
  it('only the ground-sit miss asks for the words-only redo', () => {
    const result = seated();
    const question = postureQuestion(result, 'woman', ski);
    const missed = applyPostureAnswer(result, question, no);
    assert.equal(missed.groundSitMiss, true);
    const redo = groundSitRedoFor(missed, ski);
    assert.equal(redo?.kind, 'off-balance');
    assert.equal(redo?.words, groundSitRedoWords('off-balance', 'she', null));
    assert.match(redo!.words, /^in a low ski racer's crouch on both feet/);
    // The guide's facing goes into the words: the map no longer says it.
    assert.match(redo!.words, /leaning into a turn, facing the camera, her face and chest toward the viewer, her bottom held high/);
    // Seen from behind (the skier mirrored): her back to the camera, not "facing the camera".
    const back = SKI.map(point => (point ? { x: 1 - point.x, y: point.y } : null));
    const backRedo = groundSitRedoFor({ groundSitMiss: true }, { body: back, aspect: SKI_ASPECT });
    assert.match(backRedo!.words, /her back to the camera/);
    assert.doesNotMatch(backRedo!.words, /facing the camera/);
    assert.match(groundSitRedoFor(missed, ski, 'he')!.words, /his bottom held high/);
    // A crouch guide gets crouch words.
    assert.equal(
      groundSitRedoFor({ groundSitMiss: true }, { body: CROUCH, aspect: CROUCH_ASPECT })?.kind,
      'crouch'
    );
    // Any other miss: none.
    assert.equal(groundSitRedoFor(result, ski), null);
    assert.equal(groundSitRedoFor({ groundSitMiss: false }, ski), null);
    assert.equal(groundSitRedoFor(null, ski), null);
    // Another posture question's "no" is not a ground sit.
    const kneelGuide = applyPostureAnswer(
      result,
      { id: POSTURE_QUESTION_ID, text: 'Is she kneeling?', label: 'kneeling' },
      no
    );
    assert.equal(kneelGuide.postureMiss, true);
    assert.equal(kneelGuide.groundSitMiss, undefined);
    // A guide no seat looks like: no redo even if flagged.
    assert.equal(groundSitRedoFor({ groundSitMiss: true }, { body: null, aspect: 1 }), null);
  });

  it('marks the redo prompt and says what happened', () => {
    assert.equal(isGroundSitRedoPrompt(`POSE FIRST: she is ${groundSitRedoWords('crouch')}.`), true);
    assert.equal(isGroundSitRedoPrompt('POSE FIRST: she is crouching low.'), false);
    assert.equal(GROUND_SIT_REDO_MARK, 'Redone without the pose map — she sat on the ground');
    assert.equal(
      groundSitLineFor(GROUND_SIT_REDO_MARK, 'man'),
      'Redone without the pose map — he sat on the ground'
    );
    assert.equal(groundSitLineFor(GROUND_SIT_REDO_MARK, 'woman'), GROUND_SIT_REDO_MARK);
  });

  it('a custom-pose bar fails the on-feet crouch; the words-only judgement passes it', () => {
    for (const still of [CROUCH_STILL, CROUCH_STILL_2]) {
      const strict = against(still, true);
      assert.ok(strict.score < DEFAULT_MIN_POSE_MATCH, 'the custom-pose rule misses it');
      const judged = judgeWordsOnlyRedo(against(still, false));
      assert.equal(judged.postureMiss, false);
      assert.equal(judged.limbMiss, false);
      assert.ok(judged.score >= DEFAULT_MIN_POSE_MATCH);
      // The vision question still decides: asked, and a "no" misses it as sitting.
      const question = postureQuestion(judged, 'woman', ski);
      assert.ok(question);
      assert.equal(applyPostureAnswer(judged, question, no).groundSitMiss, true);
    }
  });

  it('keeps a seated or lying read a miss, and limbs far off a miss', () => {
    const base = against(CROUCH_STILL, false);
    const pair = base.posture[0]!;
    const seatedRead: PoseMatchResult = {
      ...base,
      posture: [
        { ...pair, mismatch: true, still: { ...pair.still!, posture: 'sitting', group: 'seated' } },
      ],
      postureMiss: true,
    };
    assert.equal(judgeWordsOnlyRedo(seatedRead).postureMiss, true);
    const crouchRead: PoseMatchResult = {
      ...base,
      posture: [{ ...pair, mismatch: true, still: { ...pair.still!, group: 'low' } }],
      postureMiss: true,
    };
    assert.equal(judgeWordsOnlyRedo(crouchRead).postureMiss, false);
    const far = judgeWordsOnlyRedo({ ...base, limbScore: WORDS_ONLY_MIN_LIMB_SCORE - 0.05 });
    assert.equal(far.limbMiss, true);
    assert.ok(far.score < DEFAULT_MIN_POSE_MATCH);
    assert.equal(limbMissWords(far)?.needed, WORDS_ONLY_MIN_LIMB_SCORE);
    assert.match(describePoseMatch(far), /40% needed/);
  });
});
