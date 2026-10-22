import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_CAMERA_CHOICE,
  cameraChoiceLine,
  type FullCameraChoice,
} from '@/lib/pose/camera-shot';
import type { PoseRig3d } from '@/lib/pose/rig3d';
import { cameraForChoice, photoPoseCameraChoice } from '@/lib/pose/rig3d-camera';
import { cloneRig, liftBodies, projectRig } from '@/lib/pose/rig3d-pose';
import { poseStarterBody } from '@/lib/pose/starters';
import { pickedStillCamera } from './slot-pose';
import { assembleDayStillPrompt, type DayStillPromptFacts } from './still-prompt';

const aspect = 2 / 3;
const standing = () => liftBodies([poseStarterBody('stand')], aspect);
const withCamera = (rig: PoseRig3d, choice: FullCameraChoice): PoseRig3d => ({
  ...rig,
  camera: cameraForChoice(rig, choice, aspect),
});
const unpicked = (rig: PoseRig3d): PoseRig3d => {
  const copy = cloneRig(rig);
  delete copy.camera.choice;
  return copy;
};

describe('which camera a still is taken with', () => {
  const posed = (rig: PoseRig3d) => ({
    aspect,
    people: projectRig(rig, aspect),
    source: 'edited' as const,
    rig3d: rig,
  });

  it("a custom 3D pose's camera wins over the slot's Camera row", () => {
    const rig = withCamera(standing(), { height: 'low', direction: 'front', shot: 'waist', lens: 'wide' });
    const picked = pickedStillCamera({ posePhoto: posed(rig), poseCamera: { height: 'high' } });
    assert.equal(picked?.from, 'pose');
    assert.deepEqual(picked?.choice, rig.camera.choice);
  });

  it('a 3D pose with no pick reads its camera from the numbers', () => {
    const rig = unpicked(withCamera(standing(), { height: 'high', direction: 'back', shot: 'full', lens: 'normal' }));
    const picked = pickedStillCamera({ posePhoto: posed(rig) });
    assert.equal(picked?.from, 'pose');
    assert.equal(picked?.choice.height, 'high');
    assert.equal(picked?.choice.direction, 'back');
  });

  it("the slot's row otherwise; Auto is none", () => {
    assert.deepEqual(pickedStillCamera({ poseCamera: { shot: 'knees' } }), {
      choice: { shot: 'knees' },
      from: 'slot',
    });
    assert.equal(pickedStillCamera({ poseCamera: undefined }), null);
    // A pose without a 3D rig (a photo, the wireframe editor) has no camera of its own.
    const flat = { aspect, people: [poseStarterBody('stand')] };
    assert.equal(pickedStillCamera({ posePhoto: flat, poseCamera: { height: 'low' } })?.from, 'slot');
    // A rig that no longer draws its points (edited since in the wireframe editor) is not trusted.
    const rig = withCamera(standing(), { ...DEFAULT_CAMERA_CHOICE, height: 'high' });
    const stale = { ...posed(rig), people: [poseStarterBody('sit')] };
    assert.equal(photoPoseCameraChoice(stale), null);
  });
});

describe('the picked camera in a Day still', () => {
  const recipe =
    'Day photo: she waits for the bus at a city stop. She stands, full body in frame. Moment: checking the time. Photorealistic photograph, natural skin.';
  const facts = (extra: Partial<DayStillPromptFacts>): DayStillPromptFacts =>
    ({
      slotPrompt: recipe,
      beat: 'waiting for the bus',
      setting: 'a city bus stop',
      dayMood: 'everyday',
      adult: false,
      leadNoun: 'woman',
      partner: null,
      pickedShoes: '',
      footwear: '',
      footwearImage: null,
      pose: { layout: 'stand', figures: 1 },
      cueLayouts: new Set<string>(),
      kleinFace: false,
      ...extra,
    }) as DayStillPromptFacts;

  it("replaces the slot's own camera and drops framing that fights it", () => {
    const choice = { height: 'low', direction: 'three-quarter', shot: 'waist', lens: 'wide' } as const;
    const out = assembleDayStillPrompt(facts({ camera: 'high', pickedCamera: choice })).prompt;
    assert.ok(out.includes(cameraChoiceLine(choice)), out);
    assert.ok(!/slightly high angle/.test(out), 'Day\'s own camera line is replaced');
    assert.ok(!/full body in frame/.test(out), out);
    assert.equal(out.match(/Camera: /g)?.length, 1, out);
  });

  it('keeps Day\'s camera on Auto', () => {
    const out = assembleDayStillPrompt(facts({ camera: 'high', pickedCamera: null })).prompt;
    assert.ok(/slightly high angle/.test(out));
  });

  it("puts the pick in place of a long brief's camera framing, keeping its locks", () => {
    const brief = 'subject: the active Cast character\ncamera: candid three-quarter medium shot — never a stiff catalog pose\nsetting: a park';
    const out = assembleDayStillPrompt(
      facts({ slotPrompt: brief, pose: null, pickedCamera: { direction: 'front', shot: 'head' } })
    ).prompt;
    assert.ok(
      out.includes('Camera: front view, head-and-shoulders close-up — never a stiff catalog pose'),
      out
    );
    assert.ok(!/candid three-quarter/.test(out), out);
  });
});
