import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  normalizePhotoPose,
  normalizePoseCameraChoice,
  photoPoseKey,
  resolveSceneGuidePlan,
  SCENE_POSE_LAYOUT_IDS,
  synthesizeSceneStickFigures,
} from './day-pose-guide';
import { normalizeDaySlots } from './day-planner';
import { planDaySlotPose } from './day-slot-pose';
import {
  alignBodyToGuide,
  buildPoseMissView,
  describePoseLimbMisses,
  formatPoseLimbMisses,
  poseLayoutCue,
  poseLayoutCueLine,
  poseLimbFixNudge,
} from './pose-coaching';
import { POSE_IMPORT_GROUPS, POSE_IMPORT_LAYOUTS } from './pose-import-layouts';
import { poseLayoutLabel } from './pose-layout-labels';
import { poseGuidePromptBlock, POSE_GUIDE_CAMERA_LINES } from './pose-guide-prompt';
import { normalizeRoleplayLibrarySnapshot } from './roleplay-library';
import type { NormalizedBody } from './pose-library';

/** Lead keypoints (0–1 of the guide) for a scene, as the queue would draw them. */
const lead = (text: string): { body: NormalizedBody; aspect: number } => {
  const plan = resolveSceneGuidePlan(text, 0, { forcePeople: 1 });
  return {
    body: plan.openPose.keypoints[0]!,
    aspect: plan.openPose.canvas.width / plan.openPose.canvas.height,
  };
};

describe('pose in words', () => {
  it('has a cue for every everyday, two-person and sport layout, and none for postures', () => {
    for (const id of SCENE_POSE_LAYOUT_IDS) {
      assert.ok(poseLayoutCue(id), id);
    }
    assert.equal(poseLayoutCue('sit'), null);
    assert.equal(poseLayoutCue('photo'), null);
    assert.equal(poseLayoutCueLine('stand'), '');
    assert.match(poseLayoutCueLine('cook'), /^POSE DETAIL \(as Image 3 shows\): .*stirring/);
  });

  it('names the limbs to fix on a requeue', () => {
    assert.equal(poseLimbFixNudge([]), '');
    assert.equal(
      poseLimbFixNudge([{ part: 'left arm', guide: 'raised', still: 'down' }]),
      'Fix the pose: left arm raised, not down.'
    );
  });
});

describe('what the still got wrong', () => {
  const armsUp = lead('throws both arms up in the air at the finish line');
  const standing = lead('standing on the corner');

  it('finds nothing wrong with the pose it was asked for', () => {
    assert.deepEqual(
      describePoseLimbMisses({
        guide: armsUp.body,
        guideAspect: armsUp.aspect,
        still: armsUp.body,
        stillAspect: armsUp.aspect,
      }),
      []
    );
  });

  it('names both arms when a still kept them down', () => {
    const misses = describePoseLimbMisses({
      guide: armsUp.body,
      guideAspect: armsUp.aspect,
      still: standing.body,
      stillAspect: standing.aspect,
    });
    const arms = misses.filter(miss => miss.part.endsWith('arm'));
    assert.equal(arms.length, 2, formatPoseLimbMisses(misses, 9));
    for (const arm of arms) {
      assert.equal(arm.guide, 'raised');
      assert.notEqual(arm.still, 'raised');
    }
    assert.ok(!misses.some(miss => miss.part.endsWith('leg')), 'legs match');
  });

  it('sees a lying still against a standing guide as the body, not a limb', () => {
    const lying = lead('lying on her side on the picnic blanket, head propped on one hand');
    const misses = describePoseLimbMisses({
      guide: standing.body,
      guideAspect: standing.aspect,
      still: lying.body,
      stillAspect: lying.aspect,
    });
    assert.equal(misses[0]?.part, 'body');
    assert.equal(misses[0]?.guide, 'upright');
  });

  it('lays the still over the guide with necks together and torsos the same length', () => {
    // The same body, half size and shifted, on a square canvas.
    const moved = standing.body.map(p =>
      p ? { x: ((p.x * standing.aspect) / 2 + 0.3) / 1, y: p.y / 2 + 0.2 } : null
    );
    const aligned = alignBodyToGuide({
      still: moved,
      stillAspect: 1,
      guide: standing.body,
      guideAspect: standing.aspect,
    });
    for (let i = 0; i < 14; i += 1) {
      const a = aligned[i];
      const b = standing.body[i];
      if (!a || !b) continue;
      assert.ok(Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6, `joint ${i}`);
    }
  });

  it('builds a miss view for the lead only when both sides have one', () => {
    const view = buildPoseMissView({
      imageUrl: '/still.png',
      score: 0.31,
      guide: [armsUp.body],
      guideAspect: armsUp.aspect,
      still: [standing.body],
      stillAspect: standing.aspect,
    });
    assert.ok(view);
    assert.equal(view.imageUrl, '/still.png');
    assert.ok(view.misses.length >= 2);
    assert.equal(
      buildPoseMissView({
        imageUrl: '/x',
        score: 0.2,
        guide: [armsUp.body],
        guideAspect: 1,
        still: [undefined],
        stillAspect: 1,
      }),
      null
    );
  });
});

describe('photo pose, camera and lead side', () => {
  const photo = { aspect: 0.75, people: [lead('standing on the corner').body] };

  it('draws a photo pose exactly, keyed as a photo, and never routes it', () => {
    const plan = resolveSceneGuidePlan('stirring a pot of risotto at the stove', 0, {
      forcePeople: 1,
      photoPose: photo,
      avoidLayouts: new Set(['cook']),
    });
    assert.equal(plan.openPose.poseKey, photoPoseKey(1));
    assert.equal(plan.routedAround, undefined);
    assert.equal(plan.openPose.keypoints.length, 1);
    assert.equal(plan.openPose.libraryEntryId, undefined);
    assert.equal(poseLayoutLabel('photo'), 'Your photo pose');
  });

  it('ignores a photo pose on the legacy style (it can only draw mannequins)', () => {
    const plan = resolveSceneGuidePlan('standing on the corner', 0, {
      photoPose: photo,
      openPose: false,
    });
    assert.notEqual(plan.openPose.poseKey, photoPoseKey(1));
  });

  it("lets the player's camera win over the inferred one", () => {
    const text = 'lying on her side on the picnic blanket, head propped on one hand';
    const inferred = resolveSceneGuidePlan(text, 0, { forcePeople: 1 }).openPose.camera;
    assert.notEqual(inferred, null);
    assert.equal(
      resolveSceneGuidePlan(text, 0, { forcePeople: 1, camera: 'front' }).openPose.camera,
      null
    );
    assert.equal(
      resolveSceneGuidePlan(text, 0, { forcePeople: 1, camera: 'low' }).openPose.camera,
      'low'
    );
    assert.match(POSE_GUIDE_CAMERA_LINES.low, /low angle/i);
    assert.match(
      poseGuidePromptBlock('photo' as never, { style: 'openpose', camera: 'low', headcount: 1 }),
      /low angle/i
    );
  });

  it('puts the lead on the side the player picked', () => {
    const text = 'walking hand in hand with a friend along the pier';
    for (const side of ['left', 'right'] as const) {
      for (const variant of [0, 1]) {
        const [leadFigure, partner] = synthesizeSceneStickFigures(text, 0, {
          forcePeople: 2,
          leadSide: side,
          variant,
        }).figures;
        const leadIsLeft = leadFigure!.pelvis.x < partner!.pelvis.x;
        assert.equal(leadIsLeft, side === 'left', `${side} v${variant}`);
      }
    }
  });

  it('keeps photo, camera and lead through slot and beat normalization', () => {
    assert.equal(normalizePhotoPose({ aspect: 0, people: [] }), undefined);
    assert.equal(normalizePhotoPose({ aspect: 1, people: 'x' }), undefined);
    assert.equal(normalizePoseCameraChoice('fisheye'), undefined);
    assert.equal(normalizePoseCameraChoice('side'), 'side');

    const [slot] = normalizeDaySlots([
      {
        id: 'morning',
        label: 'Morning',
        posePhoto: photo,
        poseCamera: 'overhead',
        poseLead: 'right',
      },
    ]);
    assert.deepEqual(slot?.posePhoto, photo);
    assert.equal(slot?.poseCamera, 'overhead');
    assert.equal(slot?.poseLead, 'right');

    const plan = planDaySlotPose({ slot: slot!, dayMood: 'everyday' });
    assert.deepEqual(plan.options.photoPose, photo);
    assert.equal(plan.options.camera, 'overhead');
    assert.equal(plan.options.leadSide, 'right');

    const beat = normalizeRoleplayLibrarySnapshot({
      story: [
        {
          id: 'b1',
          at: 1,
          title: 'Beat',
          blurb: 'on the pier',
          posePhoto: photo,
          poseCamera: 'low',
          poseLead: 'left',
        },
      ],
    })?.story?.[0];
    assert.deepEqual(beat?.posePhoto, photo);
    assert.equal(beat?.poseCamera, 'low');
    assert.equal(beat?.poseLead, 'left');
  });
});

describe('import any pose from a photo', () => {
  it('offers the picker groups plus the intimate layouts', () => {
    for (const id of ['cook', 'hold_hands', 'sport_skate', 'sit', 'bent']) {
      assert.ok(POSE_IMPORT_LAYOUTS.includes(id), id);
    }
    assert.deepEqual(
      POSE_IMPORT_GROUPS.map(group => group.label),
      ['Postures', 'Everyday', 'Two people', 'Sport', 'Intimate']
    );
  });
});
