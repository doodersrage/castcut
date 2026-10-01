import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { withFittingCustomPose } from './fitting-room';

describe('Outfit custom pose', () => {
  it('stops keeping the plate pose and points at the pose map', () => {
    const out = withFittingCustomPose(
      'Apply the exact outfit from Image 2. Keep face, hair, body, and pose from Image 1.'
    );
    assert.doesNotMatch(out, /and pose from Image 1/);
    assert.match(out, /stance from the pose map in Image 3/);
    assert.match(out, /POSE: Image 3 is a pose map \(a skeleton, not a person\)/);
  });
});
