import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recipeShapeAndSize } from './film-recut';

describe('re-cut starting shape', () => {
  it('reads shape and size back from a resolution', () => {
    assert.deepEqual(recipeShapeAndSize('1080p-square'), { shape: 'square', quality: '1080p' });
    assert.deepEqual(recipeShapeAndSize(undefined), { shape: 'wide', quality: '720p' });
  });
});
