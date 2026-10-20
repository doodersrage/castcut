import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveCloudIdentityFallback } from './cloud-identity-fallback';

describe('resolveCloudIdentityFallback', () => {
  it('returns null when an explicit Image 1 is already set', () => {
    assert.equal(
      resolveCloudIdentityFallback({
        hasInputImage: true,
        identityFilename: 'face.png',
      }),
      null
    );
    assert.equal(
      resolveCloudIdentityFallback({
        inputImageFilename: 'figure1.png',
        identityFilename: 'face.png',
      }),
      null
    );
  });

  it('uses the locked face when cloud img2img has no Image 1', () => {
    const fallback = resolveCloudIdentityFallback({
      identityFilename: 'face.png',
      identityUrl: '/api/gallery/media/identity',
    });
    assert.equal(fallback?.inputImageFilename, 'face.png');
    assert.equal(fallback?.imageUrl, '/api/gallery/media/identity');
  });
});
