import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { greyValues, looksLikeSamePicture, meanGreyDifference } from './image-similarity';

describe('same picture check', () => {
  const plate = Array.from({ length: 24 * 24 }, (_, i) => (i * 37) % 255);
  it('a resampled copy is the same picture', () => {
    const copy = plate.map(value => Math.min(255, value + 3));
    assert.equal(looksLikeSamePicture(plate, copy), true);
  });
  it('a changed outfit is not', () => {
    const changed = plate.map((value, i) => (i > 200 && i < 480 ? 255 - value : value));
    assert.equal(looksLikeSamePicture(plate, changed), false);
  });
  it('different sizes are not compared', () => {
    assert.equal(meanGreyDifference(plate, plate.slice(1)), null);
  });
  it('reads grey from RGBA', () => {
    assert.deepEqual(greyValues([255, 255, 255, 255, 0, 0, 0, 255]).map(Math.round), [255, 0]);
  });
});
