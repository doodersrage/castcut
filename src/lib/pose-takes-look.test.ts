import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  mirrorStickSkeleton,
  normalizePhotoPose,
  resolveSceneGuidePlan,
  synthesizeSceneStickFigures,
} from './day-pose-guide';
import { normalizeDaySlots } from './day-planner';
import { planDaySlotPose } from './day-slot-pose';
import { poseLookLine } from './pose-coaching';
import { moveJoint } from './pose-joint-edit';
import {
  autoPickRoleplayStillTakePatch,
  beginRoleplayStillRetryPatch,
  pinRoleplayStillTakePatch,
  withRoleplayTakeChecks,
  type RoleplayStoryBeat,
} from './roleplay';
import { normalizeRoleplayLibrarySnapshot } from './roleplay-library';
import { betterTakeIndex, isClearlyBetterTake } from './take-scoring';

const T = { minPose: 0.6, minFace: 0.5 };

describe('which take is better', () => {
  it('prefers fewer misses, then a clearly closer pose, never a worse review', () => {
    assert.ok(isClearlyBetterTake({ pose: 0.7 }, { pose: 0.4 }, T), 'miss vs no miss');
    assert.ok(!isClearlyBetterTake({ pose: 0.72 }, { pose: 0.65 }, T), 'both fine, small gap');
    assert.ok(isClearlyBetterTake({ pose: 0.85 }, { pose: 0.65 }, T), 'both fine, big gap');
    assert.ok(
      !isClearlyBetterTake({ pose: 0.9, overall: 2.5 }, { pose: 0.4, overall: 4 }, T),
      'worse review never wins'
    );
    assert.ok(isClearlyBetterTake({ pose: 0.7, face: 0.6 }, { pose: 0.7, face: 0.3 }, T), 'face');
    assert.ok(!isClearlyBetterTake({}, { pose: 0.2 }, T), 'unmeasured never wins');
  });

  it('picks the best earlier take, or none', () => {
    assert.equal(betterTakeIndex([{ pose: 0.8 }, { pose: 0.3 }, { pose: 0.35 }], 2, T), 0);
    assert.equal(betterTakeIndex([{ pose: 0.62 }, { pose: 0.9 }, { pose: 0.3 }], 2, T), 1);
    assert.equal(betterTakeIndex([{ pose: 0.3 }, { pose: 0.7 }], 1, T), null);
    assert.equal(betterTakeIndex([{ pose: 0.3 }], 0, T), null);
  });
});

describe('Story best take', () => {
  const match = (imageUrl: string, score: number) => ({
    imageUrl,
    score,
    expectedPeople: 1,
    detectedPeople: 1,
  });
  const beat = (patch: Partial<RoleplayStoryBeat> = {}): RoleplayStoryBeat => ({
    id: 'b',
    at: 1,
    title: 'Beat',
    blurb: 'on the pier',
    stillTakes: [
      { promptId: 'p1', imageUrl: '/a.png', stillStatus: 'completed', poseMatch: match('/a.png', 0.82) },
      { promptId: 'p2', imageUrl: '/b.png', stillStatus: 'completed' },
    ],
    stillTakeIndex: 1,
    promptId: 'p2',
    imageUrl: '/b.png',
    stillStatus: 'completed',
    ...patch,
  });

  it('records checks on the take and switches to a clearly better earlier one', () => {
    const checks = { poseMatch: match('/b.png', 0.35) };
    const checked = { ...beat(), ...checks, stillTakes: withRoleplayTakeChecks(beat(), '/b.png', checks) };
    assert.equal(checked.stillTakes[1]?.poseMatch?.score, 0.35);
    assert.equal(checked.stillTakes[0]?.poseMatch?.score, 0.82, 'earlier score kept');
    const patch = autoPickRoleplayStillTakePatch(checked, T);
    assert.ok(patch);
    assert.equal(patch.stillTakeIndex, 0);
    assert.equal(patch.imageUrl, '/a.png');
    assert.equal(patch.poseMatch?.score, 0.82, 'the shown take shows its own score');
    assert.equal(patch.stillTakeAutoPicked, true);
  });

  it('never overrides a take the player picked, and a retry clears the pin', () => {
    const checks = { poseMatch: match('/b.png', 0.35) };
    const pinned = {
      ...beat(),
      ...pinRoleplayStillTakePatch(beat(), 1),
      ...checks,
    } as RoleplayStoryBeat;
    pinned.stillTakes = withRoleplayTakeChecks(pinned, '/b.png', checks);
    assert.equal(pinned.stillTakePinned, true);
    assert.equal(autoPickRoleplayStillTakePatch(pinned, T), null);
    const retry = beginRoleplayStillRetryPatch(pinned);
    assert.equal(retry.stillTakePinned, false);
  });

  it('waits until every take has finished', () => {
    const busy = beat({
      stillTakes: [
        { promptId: 'p1', imageUrl: '/a.png', stillStatus: 'completed', poseMatch: match('/a.png', 0.9) },
        { promptId: 'p2', stillStatus: 'running' },
      ],
      promptId: 'p2',
      imageUrl: undefined,
      stillStatus: 'running',
    });
    assert.equal(autoPickRoleplayStillTakePatch(busy, T), null);
  });
});

describe('Look', () => {
  const text = 'walking hand in hand with a friend along the pier';

  it('turns only the lead face, toward the partner or off frame', () => {
    const [lead, partner] = synthesizeSceneStickFigures(text, 0, {
      forcePeople: 2,
      look: 'partner',
    }).figures;
    assert.equal(lead!.gaze, partner!.pelvis.x > lead!.pelvis.x ? 'right' : 'left');
    assert.equal(partner!.gaze, undefined);
    const plain = synthesizeSceneStickFigures(text, 0, { forcePeople: 2 }).figures[0]!;
    assert.deepEqual({ ...lead, gaze: undefined }, { ...plain, gaze: undefined }, 'body unchanged');

    const solo = synthesizeSceneStickFigures('standing on the corner', 0, {
      forcePeople: 1,
      look: 'away',
    }).figures[0]!;
    assert.ok(solo.gaze === 'left' || solo.gaze === 'right');
    assert.equal(mirrorStickSkeleton({ ...solo, gaze: 'left' }).gaze, 'right');
  });

  it('moves the face keypoints: a turned nose sits to the side, a lowered one drops', () => {
    const nose = (look?: 'camera' | 'down' | 'away') => {
      const plan = resolveSceneGuidePlan('standing on the corner', 0, {
        forcePeople: 1,
        ...(look ? { look } : {}),
      });
      const body = plan.openPose.keypoints[0]!;
      return { nose: body[0]!, neck: body[1]!, lead: plan.figures[0]! };
    };
    const front = nose('camera');
    const down = nose('down');
    assert.ok(down.nose.y > front.nose.y + 0.005, 'down lowers the nose');
    const away = nose('away');
    const dir = away.lead.gaze === 'left' ? -1 : 1;
    assert.ok((away.nose.x - away.neck.x) * dir > 0.005, 'turned nose sits to that side');
  });

  it('says it in the prompt (partner means away when solo)', () => {
    assert.match(poseLookLine('camera'), /camera lens/);
    assert.match(poseLookLine('partner', 2), /other person/);
    assert.equal(poseLookLine('partner', 1), poseLookLine('away'));
    assert.equal(poseLookLine(undefined), '');
  });

  it('keeps Look through slot and beat normalization', () => {
    const [slot] = normalizeDaySlots([
      { id: 'morning', label: 'Morning', poseLook: 'down' },
      { id: 'night', label: 'Night', poseLook: 'sideways' as never },
    ]);
    assert.equal(slot?.poseLook, 'down');
    assert.equal(planDaySlotPose({ slot: slot!, dayMood: 'everyday' }).options.look, 'down');
    const beat = normalizeRoleplayLibrarySnapshot({
      story: [{ id: 'b', at: 1, title: 'Beat', blurb: 'x', poseLook: 'partner' }],
    })?.story?.[0];
    assert.equal(beat?.poseLook, 'partner');
  });
});

describe('joint editor', () => {
  const body = () =>
    Array.from({ length: 18 }, (_, i) => ({ x: 0.5, y: 0.1 + i * 0.03 }));

  it('moves one joint, carries the face with the head, and clamps to the canvas', () => {
    const bodies = [body(), body()];
    const moved = moveJoint(bodies, 0, 0, { x: 0.6, y: 0.1 });
    assert.deepEqual(moved[0]![0], { x: 0.6, y: 0.1 });
    assert.ok(Math.abs(moved[0]![14]!.x - 0.6) < 1e-9, 'eye follows the nose');
    assert.deepEqual(moved[0]![4], bodies[0]![4], 'wrist untouched');
    assert.deepEqual(moved[1], bodies[1], 'other person untouched');
    const clamped = moveJoint(bodies, 0, 4, { x: 1.4, y: -0.2 });
    assert.deepEqual(clamped[0]![4], { x: 0.99, y: 0.01 });
    const handMoved = moveJoint(bodies, 0, 4, { x: 0.3, y: 0.3 });
    assert.deepEqual(handMoved[0]![14], bodies[0]![14], 'face stays when a hand moves');
  });

  it('an edited pose is drawn exactly and survives normalization', () => {
    const pose = { aspect: 0.75, people: [body()], source: 'edited' as const };
    assert.equal(normalizePhotoPose(pose)?.source, 'edited');
    assert.equal(normalizePhotoPose({ ...pose, source: undefined })?.source, undefined);
    const plan = resolveSceneGuidePlan('standing on the corner', 0, { photoPose: pose });
    assert.equal(plan.openPose.poseKey, 'photo:1');
  });
});
