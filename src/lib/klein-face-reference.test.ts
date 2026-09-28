import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { shouldAppendKleinFaceReference } from './klein-face-reference';

describe('klein-face-reference', () => {
  it('appends the head crop on Klein when Image 1 is the full plate', () => {
    assert.equal(
      shouldAppendKleinFaceReference({
        model: 'flux-2-klein-9b-distilled',
        imageOneIsFaceCrop: false,
      }),
      true
    );
  });

  it('adds nothing when Image 1 already is the face crop, or off Klein', () => {
    assert.equal(
      shouldAppendKleinFaceReference({ model: 'flux-2-klein-9b', imageOneIsFaceCrop: true }),
      false
    );
    assert.equal(
      shouldAppendKleinFaceReference({ model: 'qwen-rapid-aio-edit', imageOneIsFaceCrop: false }),
      false
    );
    assert.equal(shouldAppendKleinFaceReference({ model: '', imageOneIsFaceCrop: false }), false);
  });

  it('skips two-person guides (the face reads as an extra head)', () => {
    assert.equal(
      shouldAppendKleinFaceReference({
        model: 'flux-2-klein-9b-distilled',
        imageOneIsFaceCrop: false,
        headcount: 2,
      }),
      false
    );
    assert.equal(
      shouldAppendKleinFaceReference({
        model: 'flux-2-klein-9b-distilled',
        imageOneIsFaceCrop: false,
        headcount: 1,
      }),
      true
    );
  });
});
