import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeScenePoseSpec } from './day-pose-guide';
import { composedPoseForScene, composeWrittenPose, normalizePoseLimbs } from './pose-compose';

const ASPECT = 2 / 3;
const span = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot((a.x - b.x) * ASPECT, a.y - b.y);

describe('normalizePoseLimbs — what a language model may say', () => {
  it('keeps known limbs and directions, in several spellings', () => {
    assert.deepEqual(
      normalizePoseLimbs({ right_arm: ['up', 'up'], 'left arm': 'down-out, in', leftleg: ['OUT'] }),
      { right_arm: ['up', 'up'], left_arm: ['down_out', 'in'], left_leg: ['out', 'out'] }
    );
  });

  it('drops anything else', () => {
    assert.equal(normalizePoseLimbs({ right_arm: ['sideways'], tail: ['up', 'up'] }), undefined);
    assert.equal(normalizePoseLimbs('arms up'), undefined);
    assert.equal(normalizePoseLimbs(null), undefined);
    // Coordinates are not accepted — only directions.
    assert.equal(normalizePoseLimbs({ right_arm: [0.4, 0.2] }), undefined);
    // An unknown second segment follows the first.
    assert.deepEqual(normalizePoseLimbs({ right_arm: ['up', 'banana'] }), {
      right_arm: ['up', 'up'],
    });
  });

  it('rides on the scene pose spec', () => {
    assert.deepEqual(
      normalizeScenePoseSpec({ body: 'stand', people: 1, limbs: { right_arm: ['up', 'up'] } }),
      { body: 'stand', people: 1, limbs: { right_arm: ['up', 'up'] } }
    );
    // A leg written beside `limbs` instead of inside it is still read.
    assert.deepEqual(
      normalizeScenePoseSpec({
        body: 'stand',
        limbs: { right_arm: ['out', 'up_out'] },
        right_leg: ['out', 'down_in'],
      }),
      { body: 'stand', limbs: { right_arm: ['out', 'up_out'], right_leg: ['out', 'down_in'] } }
    );
  });
});

describe('composeWrittenPose', () => {
  it('builds a whole body with true bone lengths, inside the picture', () => {
    const plain = composeWrittenPose({ body: 'stand', limbs: { right_arm: ['down', 'down'] } })!;
    const wild = composeWrittenPose({
      body: 'jump',
      limbs: {
        right_arm: ['up_out', 'up'],
        left_arm: ['out', 'up_in'],
        right_leg: ['out', 'down'],
        left_leg: ['down_out', 'down_out'],
      },
    })!;
    const a = plain.people[0]!;
    const b = wild.people[0]!;
    assert.equal(b.filter(Boolean).length, a.filter(Boolean).length);
    for (const point of b) {
      if (point) assert.ok(point.x > 0.02 && point.x < 0.98 && point.y > 0.02 && point.y < 0.98);
    }
    // Same proportions whatever the limbs do (the figure may be scaled to fit, as a whole).
    const ratio = (body: typeof a, i: number, j: number, k: number, l: number) =>
      span(body[i]!, body[j]!) / span(body[k]!, body[l]!);
    for (const [i, j] of [
      [2, 3],
      [3, 4],
      [5, 6],
      [8, 9],
      [9, 10],
      [11, 12],
    ] as const) {
      assert.ok(Math.abs(ratio(b, i, j, 1, 8) - ratio(a, i, j, 1, 8)) < 0.02, `bone ${i}-${j}`);
    }
    assert.match(wild.words ?? '', /arm raised/);
  });

  it('puts the limbs where the words say', () => {
    const pose = composeWrittenPose({
      body: 'stand',
      limbs: { right_arm: ['up', 'up'], left_arm: ['out', 'out'] },
    })!;
    const body = pose.people[0]!;
    assert.ok(body[4]!.y < body[0]!.y, 'right hand above the head');
    assert.ok(Math.abs(body[7]!.y - body[5]!.y) < 0.03, 'left arm level with the shoulder');
    assert.ok(body[7]!.x > body[5]!.x, 'her left is the picture\'s right');
    assert.match(pose.words ?? '', /standing/);
  });

  it('seated and kneeling figures keep their legs; lying is not composed', () => {
    const seated = composeWrittenPose({
      body: 'sit',
      limbs: { right_arm: ['up', 'up'], right_leg: ['out', 'out'] },
    })!;
    assert.match(seated.words ?? '', /seated/);
    assert.match(composeWrittenPose({ body: 'kneel', limbs: { left_arm: ['up', 'up'] } })!.words ?? '', /kneel/);
    assert.equal(composeWrittenPose({ body: 'lie', limbs: { left_arm: ['up', 'up'] } }), null);
    assert.equal(composeWrittenPose({ body: 'stand', limbs: {} }), null);
  });
});

describe('what a body cannot do', () => {
  it('both thighs lifted on a standing figure: the legs stay as they stand', () => {
    const pose = composeWrittenPose({
      body: 'stand',
      limbs: {
        right_arm: ['up_out', 'up'],
        right_leg: ['out', 'down_in'],
        left_leg: ['out', 'down_in'],
      },
    })!;
    assert.match(pose.words ?? '', /^standing/);
    // One lifted leg is a pose; and a jump may lift both.
    assert.match(
      composeWrittenPose({ body: 'stand', limbs: { right_leg: ['out', 'down_in'] } })!.words ?? '',
      /right leg/
    );
    assert.ok(
      composeWrittenPose({
        body: 'jump',
        limbs: { right_leg: ['out', 'down'], left_leg: ['out', 'down'] },
      })
    );
  });
});

describe('composedPoseForScene', () => {
  const limbs = { right_arm: ['up', 'up'] } as const;

  it('applies only to a one-person scene with no named layout or act and no player pose', () => {
    assert.ok(composedPoseForScene({ pose: { body: 'stand', limbs }, sceneText: 'She hails a cab.' }));
    assert.equal(composedPoseForScene({ pose: { layout: 'wave', limbs }, sceneText: 'x' }), null);
    assert.equal(composedPoseForScene({ pose: { act: 'missionary', limbs }, sceneText: 'x' }), null);
    assert.ok(composedPoseForScene({ pose: { act: 'none', limbs }, sceneText: 'She waits.' }));
    assert.equal(composedPoseForScene({ pose: { people: 2, limbs }, sceneText: 'x' }), null);
    assert.equal(
      composedPoseForScene({ pose: { limbs }, sceneText: 'She hugs her friend at the gate.' }),
      null
    );
    assert.equal(
      composedPoseForScene({ pose: { limbs }, sceneText: 'She waits.', playerPosed: true }),
      null
    );
    assert.equal(composedPoseForScene({ pose: { body: 'stand' }, sceneText: 'She waits.' }), null);
    // The words name an action the pose list has: that pose is drawn, not a composed one.
    assert.equal(composedPoseForScene({ pose: { limbs }, sceneText: 'She waves from the pier.' }), null);
  });
});
