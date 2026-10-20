import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveFalExtendParentUrl } from './fal-extend-upload';

describe('fal extend upload', () => {
  it('returns a public Fal clip URL without uploading', async () => {
    const url = 'https://v3b.fal.media/files/clip.mp4';
    assert.deepEqual(await resolveFalExtendParentUrl({ parentUrl: url }), {
      url,
      uploadAttempted: false,
    });
  });

  it('returns null when there is no parent clip', async () => {
    assert.deepEqual(await resolveFalExtendParentUrl({}), {
      url: null,
      uploadAttempted: false,
    });
  });

  it('reports uploadError when a local clip cannot be uploaded', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('offline');
    }) as typeof fetch;
    try {
      const result = await resolveFalExtendParentUrl({
        parentUrl: '/api/comfyui/view?filename=clip.mp4',
      });
      assert.equal(result.url, null);
      assert.equal(result.uploadAttempted, true);
      assert.match(result.uploadError ?? '', /offline|Could not read|upload/i);
    } finally {
      globalThis.fetch = original;
    }
  });
});
