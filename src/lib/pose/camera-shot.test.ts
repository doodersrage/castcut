import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAMERA_DIRECTIONS,
  CAMERA_HEIGHTS,
  CAMERA_LENSES,
  CAMERA_SHOTS,
  cameraChoiceLine,
  cameraChoiceSummary,
  normalizeFullCameraChoice,
  normalizePoseCameraChoice,
  pickedCameraLineIn,
  promptHasPickedCamera,
  withoutConflictingFraming,
} from './camera-shot';
import { applyTurboEditStrengthToPrompt } from '../engine/turbo-edit-strength';
import { withNaturalPoses, QWEN_IMAGE_21_CANDID_LINE } from '../engine/qwen-image-21-renderer';

describe('camera pick words', () => {
  it('builds one camera line from the pick', () => {
    assert.equal(
      cameraChoiceLine({ height: 'low', direction: 'three-quarter', shot: 'waist', lens: 'wide' }),
      'Camera: a low angle looking up at her, three-quarter view, waist-up shot, legs out of frame, wide-angle lens.'
    );
    assert.equal(
      cameraChoiceLine({ height: 'low', shot: 'full' }),
      'Camera: a low angle from about knee height looking up at her, full-body shot, her whole body in frame.'
    );
    assert.equal(
      cameraChoiceLine({ direction: 'back', shot: 'head' }, { who: 'him' }),
      'Camera: from behind, his back to the camera, head-and-shoulders close-up.'
    );
    // Straight down there is no front or side to name.
    assert.equal(
      cameraChoiceLine({ height: 'overhead', direction: 'side' }),
      'Camera: from directly overhead looking straight down at her.'
    );
    assert.equal(cameraChoiceLine({}), '');
    assert.equal(cameraChoiceLine(null), '');
  });

  it('recognises every line it can build, for any pronoun', () => {
    for (const height of [undefined, ...CAMERA_HEIGHTS])
      for (const direction of [undefined, ...CAMERA_DIRECTIONS])
        for (const shot of [undefined, ...CAMERA_SHOTS])
          for (const lens of [undefined, ...CAMERA_LENSES])
            for (const who of ['her', 'him', 'them'] as const) {
              const line = cameraChoiceLine({ height, direction, shot, lens }, { who });
              if (!line) continue;
              assert.ok(promptHasPickedCamera(`SCENE: a park. ${line} Moment: x.`), line);
              assert.equal(pickedCameraLineIn(`x ${line} y`), line);
            }
    // Day's own camera lines are not a pick.
    assert.equal(
      promptHasPickedCamera(
        'Camera: a low angle from about knee height, looking slightly up at her — her whole body in frame.'
      ),
      false
    );
    assert.equal(promptHasPickedCamera('camera: eye-level documentary framing'), false);
  });

  it('reads the older single picks and drops junk', () => {
    assert.deepEqual(normalizePoseCameraChoice('low'), { height: 'low' });
    assert.deepEqual(normalizePoseCameraChoice('front'), { height: 'eye', direction: 'front' });
    assert.equal(normalizePoseCameraChoice('fisheye'), undefined);
    assert.deepEqual(normalizePoseCameraChoice({ shot: 'waist', lens: 'zoom', height: 3 }), {
      shot: 'waist',
    });
    assert.equal(normalizePoseCameraChoice({}), undefined);
    assert.equal(normalizeFullCameraChoice({ shot: 'waist' }), undefined);
    assert.deepEqual(
      normalizeFullCameraChoice({ height: 'eye', direction: 'side', shot: 'head', lens: 'long' }),
      { height: 'eye', direction: 'side', shot: 'head', lens: 'long' }
    );
    assert.equal(
      cameraChoiceSummary({ height: 'eye', shot: 'knees', lens: 'long' }),
      'Eye level · Knees up · Long lens'
    );
  });

  it('takes out framing words that fight a closer shot, never the pick itself', () => {
    const line = cameraChoiceLine({ shot: 'waist' });
    const prompt = `She walks mid-step, full body in frame. ${line} full or three-quarter framing.`;
    const out = withoutConflictingFraming(prompt, { shot: 'waist' });
    assert.ok(!/full body in frame/.test(out));
    assert.ok(out.includes(line));
    assert.ok(out.includes('framing as the Camera line says'));
    // A full-body pick keeps them.
    assert.equal(withoutConflictingFraming(prompt, { shot: 'full' }), prompt);
    // The full-body pick's own "whole body in frame" stays.
    const full = cameraChoiceLine({ shot: 'full' });
    assert.equal(withoutConflictingFraming(full, { height: 'low' }), full);
  });
});

describe('engine wrappers and a picked camera', () => {
  const picked = cameraChoiceLine({ direction: 'front', shot: 'waist' });

  it('drops the candid three-quarter camera on Qwen-Image 2.1', () => {
    const solo = `Edit <image1>: POSE FIRST: cooking pasta at the stove, full body in frame. ${picked} SCENE: home.`;
    const out = withNaturalPoses(solo);
    assert.ok(!out.includes(QWEN_IMAGE_21_CANDID_LINE));
    assert.ok(!/three-quarter angle/.test(out));
    assert.ok(out.includes(picked));
    assert.ok(!/full body in frame/.test(out));
    // Without a pick the candid line still joins.
    assert.ok(
      withNaturalPoses('Edit <image1>: POSE FIRST: cooking pasta. SCENE: home.').includes(
        QWEN_IMAGE_21_CANDID_LINE
      )
    );
  });

  it('wraps an edit without "keep … camera framing"', () => {
    const out = applyTurboEditStrengthToPrompt(`Her at the cafe. ${picked}`, 'flux-2-klein-9b-distilled', 'balanced');
    assert.ok(!/camera framing/.test(out), out);
    const plain = applyTurboEditStrengthToPrompt('Her at the cafe.', 'flux-2-klein-9b-distilled', 'balanced');
    assert.ok(/camera framing/.test(plain), plain);
    // Re-wrapping a wrapped prompt keeps one closer.
    assert.equal(
      applyTurboEditStrengthToPrompt(out, 'flux-2-klein-9b-distilled', 'balanced'),
      out
    );
  });
});
