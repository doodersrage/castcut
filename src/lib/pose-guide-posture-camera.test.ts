import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  synthesizeIntimateStickFigures,
  synthesizeSceneStickFigures,
  synthesizeStickSkeleton,
  parsePoseGuideIntent,
  type PoseGuideBase,
} from './day-pose-guide';
import { dayPoseSpecForBeat } from './day-planner';
import { resolvePoseCameraAngle } from './pose-guide-openpose';
import { poseGuidePromptBlock, POSE_GUIDE_CAMERA_LINES } from './pose-guide-prompt';
import { nextStoryPoseCheck, storyPoseMatchLabel } from './roleplay-pose-check';
import { orderImportedBodies, POSE_IMPORT_LAYOUTS } from './pose-library-import';

function posture(base: PoseGuideBase, sceneText = '') {
  return synthesizeStickSkeleton(
    {
      base,
      armLeft: 'down',
      armRight: 'down',
      lean: 0,
      stride: 0.2,
      seed: 11,
      people: 1,
      label: base,
      sceneText,
    },
    { centerX: 0.5 }
  );
}

describe('generic posture drawings', () => {
  it('draws every upright sit hips-on-seat, even with no chair word', () => {
    const sit = posture('sit', 'on the rooftop at dusk');
    assert.ok(sit.pelvis.y >= 0.7, `pelvis ${sit.pelvis.y}`);
    assert.ok(Math.abs(sit.rKnee.y - sit.rHip.y) < 0.05, 'knee at hip height');
  });

  it('draws a crouch low with knees near hip height', () => {
    const crouch = posture('crouch');
    const stand = posture('stand');
    assert.ok(crouch.pelvis.y > stand.pelvis.y + 0.15);
    assert.ok(Math.abs(crouch.lKnee.y - crouch.lHip.y) < 0.08);
    assert.ok(crouch.lAnkle.y > 0.85);
  });

  it('draws a kneel with knees on the floor and shins folded back', () => {
    const kneel = posture('kneel');
    assert.ok(kneel.lKnee.y > 0.84);
    assert.ok(Math.abs(kneel.lAnkle.y - kneel.lKnee.y) < 0.08, 'shin along the floor');
    assert.ok(kneel.head.y > posture('stand').head.y + 0.15, 'body sits a thigh lower');
  });
});

describe('camera angle from the guide', () => {
  it('overhead for top-down lying layouts, side for profiles, none for upright', () => {
    const missionary = synthesizeIntimateStickFigures({
      ...parsePoseGuideIntent('missionary on the bed', 0),
      intimate: 'missionary',
      people: 2,
    });
    assert.equal(resolvePoseCameraAngle(missionary[0]), 'overhead');
    const desk = synthesizeSceneStickFigures('bent over the desk, he takes her from behind', 0, {
      forcePeople: 2,
    });
    assert.equal(resolvePoseCameraAngle(desk.figures[0]), 'side');
    assert.equal(resolvePoseCameraAngle(posture('stand')), null);
    assert.equal(resolvePoseCameraAngle(undefined), null);
  });

  it('names the angle in the OpenPose cue only when there is one', () => {
    assert.ok(
      poseGuidePromptBlock('realistic', { headcount: 2, camera: 'overhead' }).includes(
        POSE_GUIDE_CAMERA_LINES.overhead
      )
    );
    assert.doesNotMatch(poseGuidePromptBlock('realistic', { headcount: 1 }), /Camera:/);
  });
});

describe('Day pose spec from the posture class', () => {
  it('maps everyday and vacation classes to a body, and skips adult moods', () => {
    assert.deepEqual(dayPoseSpecForBeat('sitting on the café terrace', 'everyday'), {
      body: 'sit',
    });
    assert.deepEqual(dayPoseSpecForBeat('crouching to tie a lace', 'everyday'), {
      body: 'crouch',
    });
    assert.deepEqual(dayPoseSpecForBeat('MID-STRIDE along the promenade', 'vacation'), {
      body: 'walk',
    });
    assert.equal(dayPoseSpecForBeat('waving hello', 'everyday'), undefined);
    assert.equal(dayPoseSpecForBeat('sitting on the bed', 'intimate'), undefined);
    assert.equal(dayPoseSpecForBeat('', 'everyday'), undefined);
  });
});

describe('Story pose check', () => {
  const expect = { promptId: 'p2', keypoints: [], aspect: 2 / 3, style: 'openpose' as const, poseKey: 'sit:1' };
  const beat = {
    id: 'b',
    at: 1,
    promptId: 'p2',
    imageUrl: '/api/comfyui/view?filename=b.png',
    stillStatus: 'completed',
    poseGuideExpect: expect,
  };

  it('picks finished stills queued with a guide, once', () => {
    assert.equal(nextStoryPoseCheck([beat])?.id, 'b');
    assert.equal(nextStoryPoseCheck([{ ...beat, stillStatus: 'running' }]), null);
    // An older take picked from the strip was drawn from a different guide.
    assert.equal(nextStoryPoseCheck([{ ...beat, promptId: 'p1' }]), null);
    const scored = {
      ...beat,
      poseMatch: { imageUrl: beat.imageUrl, score: 0.9, expectedPeople: 1, detectedPeople: 1 },
    };
    assert.equal(nextStoryPoseCheck([scored]), null);
    assert.equal(nextStoryPoseCheck([beat], new Set([beat.imageUrl])), null);
  });

  it('labels the shown still and flags a miss', () => {
    const miss = storyPoseMatchLabel(
      {
        ...beat,
        poseMatch: { imageUrl: beat.imageUrl, score: 0.42, expectedPeople: 2, detectedPeople: 1 },
      },
      0.6
    );
    assert.equal(miss?.miss, true);
    assert.match(miss!.text, /42% · 1 of 2 people found — the still didn't follow its guide/);
    assert.equal(
      storyPoseMatchLabel(
        { ...beat, poseMatch: { imageUrl: 'other', score: 0.9, expectedPeople: 1, detectedPeople: 1 } },
        0.6
      ),
      null
    );
  });
});

describe('import pose from photo', () => {
  it('offers body postures and sex layouts, and orders the main subject first', () => {
    assert.ok(POSE_IMPORT_LAYOUTS.includes('sit'));
    assert.ok(POSE_IMPORT_LAYOUTS.includes('bent'));
    assert.ok(!POSE_IMPORT_LAYOUTS.includes('none'));
    const small = [{ x: 0.1, y: 0.1 }, { x: 0.1, y: 0.2 }, null];
    const big = [{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.5 }, { x: 0.5, y: 0.9 }];
    assert.deepEqual(orderImportedBodies([small, big]), [big, small]);
  });
});

describe('pose import layout list', () => {
  it('matches the scene pose vocabulary (bodies, gesture / duo / sport layouts, sex layouts minus none/generic)', async () => {
    const { SCENE_POSE_ACT_IDS, SCENE_POSE_BODY_IDS, SCENE_POSE_LAYOUT_IDS } = await import(
      './day-pose-guide'
    );
    const { POSE_IMPORT_LAYOUTS: list } = await import('./pose-import-layouts');
    assert.deepEqual(
      [...list].sort(),
      [
        ...SCENE_POSE_BODY_IDS,
        ...SCENE_POSE_LAYOUT_IDS,
        ...SCENE_POSE_ACT_IDS.filter(id => id !== 'none' && id !== 'generic'),
      ].sort()
    );
  });
});
