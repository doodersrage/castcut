import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  photoPoseForStill,
  photoPoseGuideLabel,
  resolveSceneGuidePlan,
  type PhotoPose,
} from './day-pose-guide';
import { planDaySlotPose } from './day-slot-pose';
import { normalizeMyPose } from './my-poses';
import { isMultiPersonPoseGuide, isPlayerPoseGuide } from './qwen-image-21-renderer';
import {
  addPartner,
  bodyCentreX,
  poseStarterBody,
  replaceLead,
  swapSides,
} from './pose-starters';

/** A two-figure custom pose from the joint editor: lead on the left, partner on the right. */
function duoPose(): PhotoPose {
  const [lead, partner] = addPartner([poseStarterBody('walk')]);
  return { aspect: 2 / 3, people: [lead!, partner!], source: 'edited' };
}

describe('two-figure custom poses', () => {
  it('adds a partner beside the lead or as a mirrored copy, lead on the left', () => {
    for (const kind of ['beside', 'mirror'] as const) {
      const bodies = addPartner([poseStarterBody('stand')], kind);
      assert.equal(bodies.length, 2, kind);
      assert.ok(bodyCentreX(bodies[0]!)! < bodyCentreX(bodies[1]!)!, kind);
      assert.equal(addPartner(bodies, kind), bodies, 'never a third figure');
    }
    // The mirrored partner is the lead flipped: its right wrist is where the lead's left one is,
    // seen from the other side.
    const lead = poseStarterBody('walk');
    const [, mirrored] = addPartner([lead], 'mirror');
    assert.ok(Math.abs(mirrored![4]!.y - lead[7]!.y) < 1e-9);
  });

  it('swap sides keeps both poses and the lead first', () => {
    const bodies = addPartner([poseStarterBody('walk')]);
    const swapped = swapSides(bodies);
    assert.ok(bodyCentreX(swapped[0]!)! > bodyCentreX(swapped[1]!)!);
    // Same pose, only moved: joint offsets from the neck are unchanged.
    const offsets = (body: (typeof bodies)[number]) =>
      body.map(p => (p ? { x: +(p.x - body[1]!.x).toFixed(6), y: p.y } : null));
    assert.deepEqual(offsets(swapped[0]!), offsets(bodies[0]!));
    assert.deepEqual(offsets(swapped[1]!), offsets(bodies[1]!));
    assert.equal(swapSides([poseStarterBody('stand')]).length, 1);
  });

  it('a new lead keeps the partner and goes on its other side', () => {
    const swapped = swapSides(addPartner([poseStarterBody('stand')]));
    const next = replaceLead(swapped, poseStarterBody('sit'));
    assert.equal(next.length, 2);
    assert.equal(next[1], swapped[1]);
    assert.ok(bodyCentreX(next[0]!)! > bodyCentreX(next[1]!)!);
    assert.equal(replaceLead([poseStarterBody('stand')], poseStarterBody('sit')).length, 1);
  });

  it('a duo still draws both figures and names the lead by where it stands', () => {
    const pose = duoPose();
    const plan = resolveSceneGuidePlan('two friends on the pier', 0, {
      photoPose: pose,
      forcePeople: 2,
    });
    assert.equal(plan.openPose.keypoints.length, 2);
    assert.equal(plan.openPose.leadPosition, 'left');
    assert.equal(plan.openPose.poseKey, 'photo:2');

    const swapped = resolveSceneGuidePlan('two friends on the pier', 0, {
      photoPose: { ...pose, people: swapSides(pose.people) },
      forcePeople: 2,
    });
    assert.equal(swapped.openPose.leadPosition, 'right');
  });

  it('a solo still draws only the lead figure', () => {
    const pose = duoPose();
    assert.equal(photoPoseForStill(pose, 1)!.people.length, 1);
    assert.equal(photoPoseForStill(pose, 1)!.people[0], pose.people[0]);
    assert.equal(photoPoseForStill(pose, 2), pose);
    assert.equal(photoPoseForStill(pose, undefined), pose);
    assert.equal(photoPoseForStill(undefined, 1), null);

    const plan = resolveSceneGuidePlan('standing on the pier', 0, {
      photoPose: pose,
      forcePeople: 1,
    });
    assert.equal(plan.openPose.keypoints.length, 1);
    assert.equal(plan.openPose.leadPosition, null);
    assert.equal(plan.openPose.poseKey, 'photo:1');
  });

  it('a Day slot without a partner uses the lead; the slot keeps the whole pose', () => {
    const pose = duoPose();
    const day = planDaySlotPose({
      slot: { id: 'morning', sceneHints: 'walking along the pier', posePhoto: pose },
      dayMood: 'everyday',
    });
    assert.equal(day.headcount, 1);
    assert.equal(day.options.photoPose, pose);
    const plan = resolveSceneGuidePlan(day.sceneText, 0, day.options);
    assert.equal(plan.openPose.keypoints.length, 1);
  });

  it('the guide file says how many figures are drawn (Qwen-Image 2.1 keeps or drops by it)', () => {
    assert.equal(photoPoseGuideLabel('hug-1a2b3c-x2', 2), 'hug-1a2b3c-x2-photo');
    assert.equal(photoPoseGuideLabel('stand-1a2b3c', 2), 'stand-1a2b3c-x2-photo');
    assert.equal(photoPoseGuideLabel('hug-1a2b3c-x2', 1), 'hug-1a2b3c-photo');
    const duoFile = `day-pose-guide-${photoPoseGuideLabel('stand-1a2b3c', 2)}-123.png`;
    assert.ok(isMultiPersonPoseGuide(duoFile));
    assert.ok(isPlayerPoseGuide(duoFile));
    const soloFile = `day-pose-guide-${photoPoseGuideLabel('hug-1a2b3c-x2', 1)}-123.png`;
    assert.ok(!isMultiPersonPoseGuide(soloFile));
    assert.ok(isPlayerPoseGuide(soloFile));
  });

  it('My poses keeps both figures, lead first', () => {
    const pose = duoPose();
    const saved = normalizeMyPose({ name: 'Pier pair', pose, savedAt: 1 });
    assert.equal(saved?.pose.people.length, 2);
    assert.deepEqual(saved?.pose.people, pose.people);
  });
});
