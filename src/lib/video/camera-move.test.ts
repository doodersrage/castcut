import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { h3CameraWords } from '../engine/h3-renderer';
import { buildStillClipPrompt } from '../still/clip-prompt';
import { CLIP_CAMERA_MOVES, normalizeClipCameraMove, withCameraMove } from './camera-move';

describe('clip camera moves', () => {
  it('swaps the locked camera for the move, and leaves Still alone', () => {
    const prompt = buildStillClipPrompt('She sips her coffee', { durationSec: 4, people: 1 });
    assert.match(prompt, /locked-off/);
    assert.equal(withCameraMove(prompt, 'still'), prompt);
    assert.equal(withCameraMove(prompt, 'nonsense'), prompt);
    const moved = withCameraMove(prompt, 'orbit');
    assert.doesNotMatch(moved, /locked-off/);
    assert.match(moved, /circles slowly sideways around them/);
    assert.match(withCameraMove('She waves.', 'pan-left'), /^She waves\. Camera: pans slowly to the left/);
    assert.equal(normalizeClipCameraMove('rise'), 'still');
  });

  it('keeps every move through H3’s camera rewrite', () => {
    for (const move of CLIP_CAMERA_MOVES.filter(entry => entry.words)) {
      assert.equal(h3CameraWords(move.words), move.words, move.id);
    }
  });
});
