import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { assembleDayStillPrompt } from './day-still-prompt';
import {
  POSE_WORDS_SOLO_MAX,
  customPoseFirstLine,
  customPoseWords,
  describePhotoPose,
  describePoseFigure,
  withCustomPoseSentence,
} from './pose-describe';
import { mirrorBodies, poseStarterBody } from './pose-starters';
import type { NormalizedBody } from './pose-library';

/** Figures drawn on a 768×1024 canvas (COCO-18; R = her right, on the picture's left facing us). */
const W = 768;
const H = 1024;
const A = W / H;
const px = (points: Array<[number, number] | null>): NormalizedBody =>
  points.map(p => (p ? { x: p[0] / W, y: p[1] / H } : null));

const ARM_UP = px([
  [384, 150], [384, 235], [309, 245], [300, 150], [296, 55], [459, 245], [525, 370], [440, 480],
  [344, 500], [344, 690], [344, 880], [424, 500], [430, 690], [430, 880],
  [370, 138], [398, 138], [355, 148], [413, 148],
]);
const KNEEL_ONE = px([
  [384, 215], [384, 300], [309, 310], [330, 450], [420, 680], [459, 310], [480, 450], [460, 680],
  [344, 560], [340, 880], [300, 900], [424, 560], [450, 700], [455, 890],
  [370, 203], [398, 203], [355, 213], [413, 213],
]);
const CROSS_LEGGED = px([
  [400, 410], [400, 500], [325, 510], [285, 625], [300, 745], [475, 510], [515, 625], [500, 745],
  [360, 760], [230, 780], [400, 805], [440, 760], [570, 780], [365, 805],
  [386, 398], [414, 398], [371, 408], [429, 408],
]);
const SIDE_LUNGE = px([
  [295, 325], [300, 410], [230, 420], [215, 560], [200, 700], [370, 420], [330, 570], [240, 700],
  [300, 660], [190, 720], [200, 900], [375, 660], [507, 780], [640, 900],
  [282, 313], [309, 313], [267, 323], [324, 323],
]);
const BACK_OVER_SHOULDER = px([
  [418, 152], [384, 235], [459, 245], [468, 370], [472, 480], [309, 245], [300, 370], [296, 480],
  [424, 500], [424, 690], [424, 880], [344, 500], [344, 690], [344, 880],
  [408, 140], null, [372, 148], null,
]);
const LYING_HANDS_HEAD = px([
  [120, 625], [180, 650], [185, 655], [170, 580], [125, 640], [178, 645], [160, 570], [130, 645],
  [430, 660], [580, 665], [730, 670], [425, 655], [530, 540], [610, 665],
  [118, 612], null, [145, 650], null,
]);

const words = (body: NormalizedBody, sceneText?: string) =>
  describePoseFigure(body, { aspect: A, sceneText }).text;

describe('custom pose in words', () => {
  it('leads with the base posture, then the telling limbs, on her own sides', () => {
    assert.equal(
      words(ARM_UP),
      'standing, her right arm (on the left of the picture) raised overhead, her left hand (on the right of the picture) on her hip'
    );
    assert.match(
      words(KNEEL_ONE),
      /^on one knee: her right knee \(on the left of the picture\) down on the floor, her left foot \(on the right of the picture\) planted in front with that knee up, both hands on her left knee$/
    );
    assert.equal(words(CROSS_LEGGED), 'sitting cross-legged on the floor, leaning back on her hands');
    assert.match(
      words(SIDE_LUNGE),
      /^in a deep lunge, her right knee \(on the left of the picture\) bent, her left leg \(on the right of the picture\) straight out to the side/
    );
    assert.equal(
      words(LYING_HANDS_HEAD),
      'lying on her back, both hands behind her head, her left knee bent up'
    );
  });

  it('seen from behind her right is the picture right: looking back over her right shoulder', () => {
    assert.equal(
      words(BACK_OVER_SHOULDER),
      'standing, her back to the camera, looking back over her right shoulder (on the right of the picture)'
    );
  });

  it('a mirrored figure swaps her sides in the words', () => {
    const [mirrored] = mirrorBodies([ARM_UP]);
    assert.equal(
      words(mirrored!),
      'standing, her left arm (on the right of the picture) raised overhead, her right hand (on the left of the picture) on her hip'
    );
  });

  it('keeps plain starters plain and stays within the word cap', () => {
    assert.equal(describePoseFigure(poseStarterBody('stand')).text, 'standing');
    assert.match(describePoseFigure(poseStarterBody('sit')).text, /^seated/);
    assert.match(describePoseFigure(poseStarterBody('lie')).text, /^lying on her/);
    for (const body of [ARM_UP, KNEEL_ONE, CROSS_LEGGED, SIDE_LUNGE, BACK_OVER_SHOULDER]) {
      // The picture sides are clarifications, outside the cap.
      const capped = words(body).replace(/ \(on the (?:left|right) of the picture\)/g, '');
      assert.ok(capped.split(/\s+/).length <= POSE_WORDS_SOLO_MAX, words(body));
      const short = describePoseFigure(body, { aspect: A, maxWords: 10 });
      // The stance always stays; facts are dropped to fit.
      assert.ok(short.facts.length <= describePoseFigure(body, { aspect: A }).facts.length);
    }
  });

  it('drops "the floor" when the beat names something else to sit on', () => {
    assert.equal(
      words(CROSS_LEGGED, 'curled up on the sofa with a mug'),
      'sitting cross-legged, leaning back on her hands'
    );
  });

  it('a duo says the lead first and who stands on which side', () => {
    const lead = ARM_UP.map(p => (p ? { x: p.x - 0.2, y: p.y } : null));
    const partner = KNEEL_ONE.map(p => (p ? { x: p.x + 0.2, y: p.y } : null));
    const text = describePhotoPose({ aspect: A, people: [lead, partner] });
    assert.match(text, /^she is on the left, standing, her right arm raised overhead/);
    assert.match(text, /; the partner is on the right, on one knee: their right knee down/);
    const swapped = describePhotoPose({ aspect: A, people: [partner, lead] }, { lead: 'he' });
    assert.match(swapped, /^he is on the right, on one knee: his right knee down/);
    assert.match(swapped, /the partner is on the left, standing, their right arm raised/);
    assert.equal(customPoseFirstLine(text), `POSE FIRST: ${text}.`);
  });

  it('a named pose keeps its own words; one figure only', () => {
    const photo = { aspect: A, people: [ARM_UP], words: 'waving: one arm raised high' };
    assert.equal(customPoseWords({ photo }), 'waving: one arm raised high');
    assert.equal(customPoseWords({ photo: null }), '');
    assert.equal(
      customPoseWords({ photo: { ...photo, people: [ARM_UP, KNEEL_ONE] } }).startsWith('she is'),
      true
    );
  });

  it('goes in the recipe as its Pose: sentence, or leads a brief', () => {
    const recipe =
      'Day photo: One woman alone. Moment: posing at home. Place: a living room. Photorealistic.';
    assert.equal(
      withCustomPoseSentence(recipe, 'standing, her right arm raised overhead'),
      'Day photo: One woman alone. Moment: posing at home. Pose: standing, her right arm raised overhead. Place: a living room. Photorealistic.'
    );
    assert.match(
      withCustomPoseSentence(recipe.replace('Place: a living room.', 'Pose: waving.'), 'kneeling'),
      /Pose: kneeling\. Photorealistic/
    );
    assert.equal(customPoseFirstLine('kneeling', 'he'), 'POSE FIRST: he is kneeling.');
  });

  it('Day: the custom pose is the recipe Pose: sentence and the brief first line', () => {
    const base = {
      dayMood: 'everyday',
      adult: false,
      leadNoun: 'woman' as const,
      partner: null,
      partnerOutfit: null,
      leadOutfit: null,
      dressedPlateIsClothingImage: false,
      pickedShoes: '',
      footwear: '',
      footwearImage: null,
      pose: { layout: 'photo', poseKey: 'photo:1', figures: 1 },
      cueLayouts: new Set<string>(),
      kleinFace: false,
      customPose: 'kneeling on her right knee, her right hand on her hip',
    };
    const recipe = assembleDayStillPrompt({
      ...base,
      slotPrompt:
        'Day photo: One woman alone. Moment: posing for a photo. Place: a park. Photorealistic photograph.',
    });
    assert.match(
      recipe.prompt,
      /Moment: posing for a photo\. Pose: kneeling on her right knee, her right hand on her hip\. Place: a park\./
    );
    const brief = assembleDayStillPrompt({
      ...base,
      slotPrompt: 'SCENE: she is in a park.\nLong brief text.',
    });
    assert.match(
      brief.prompt,
      /^POSE FIRST: she is kneeling on her right knee, her right hand on her hip\.\n/
    );
    // No custom pose: nothing added.
    const plain = assembleDayStillPrompt({ ...base, customPose: null, slotPrompt: 'Long brief.' });
    assert.doesNotMatch(plain.prompt, /POSE FIRST/);
  });
});

describe('deep squat vs cross-legged sit (reference skeletons)', () => {
  const refs = (
    JSON.parse(
      readFileSync(join(process.cwd(), 'src/lib/data/pose-references.json'), 'utf8')
    ) as { references: { id: string; aspect: number; people: NormalizedBody[] }[] }
  ).references;
  const words = (id: string) => {
    const ref = refs.find(entry => entry.id === id)!;
    return describePoseFigure(ref.people[0]!, { aspect: ref.aspect }).text;
  };

  it('reads a front-on deep squat (knees above the hips) as a squat, not cross-legged', () => {
    for (const id of ['crouch-1', 'crouch-2', 'crouch-3', 'crouch-4', 'crouch-5']) {
      assert.match(words(id), /^in a deep squat, knees apart, feet flat on the floor/, id);
    }
  });

  it('reads a low cross-legged floor sit as cross-legged, not crouching', () => {
    for (const id of ['sit_floor-1', 'sit_floor-2', 'sit_floor-3', 'sit_floor-4', 'sit_floor-5']) {
      assert.match(words(id), /^sitting cross-legged on the floor/, id);
    }
  });
});
