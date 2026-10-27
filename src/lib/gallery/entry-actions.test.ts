import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { galleryEntrySupportsUpscale } from './entry-actions';

describe('galleryEntrySupportsUpscale', () => {
  it('is off for distilled stacks, Qwen-Image 2.1 on the Rapid AIO graph among them', () => {
    assert.equal(galleryEntrySupportsUpscale('qwen-rapid-aio-edit-nsfw', 'final'), false);
    assert.equal(galleryEntrySupportsUpscale('qwen-image-2.1-edit-turbo-8', 'final'), false);
    assert.equal(galleryEntrySupportsUpscale('qwen-image-2512', 'final'), true);
  });
});
