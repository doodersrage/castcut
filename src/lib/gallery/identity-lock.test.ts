import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { galleryEntryCanLockFace } from './identity-lock';

describe('galleryEntryCanLockFace', () => {
  it('allows a completed still with an image filename', () => {
    assert.equal(
      galleryEntryCanLockFace({
        status: 'completed',
        images: [{ filename: 'out.png', subfolder: '', type: 'output' }],
      }),
      true
    );
  });

  it('rejects pending jobs and missing images', () => {
    assert.equal(
      galleryEntryCanLockFace({
        status: 'pending',
        images: [{ filename: 'out.png', subfolder: '', type: 'output' }],
      }),
      false
    );
    assert.equal(galleryEntryCanLockFace({ status: 'completed', images: [] }), false);
  });
});
