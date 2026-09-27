import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  cacheBustIdentityMediaUrl,
  durableGalleryOriginalUrl,
  durableGalleryThumbUrl,
  castPlateMediaId,
  IDENTITY_MEDIA_URL,
  isDurableGalleryMediaUrl,
  isIdentityMediaUrl,
  resolveDurableGalleryStillUrl,
} from './gallery-media-client';

describe('cacheBustIdentityMediaUrl', () => {
  it('appends v= to the identity lock URL', () => {
    const next = cacheBustIdentityMediaUrl(IDENTITY_MEDIA_URL);
    assert.match(next, /^\/api\/gallery\/media\/identity\?v=\d+$/);
  });

  it('replaces an existing v= so the src actually changes', () => {
    const first = cacheBustIdentityMediaUrl(`${IDENTITY_MEDIA_URL}?v=1`);
    const params = new URLSearchParams(first.split('?')[1] ?? '');
    assert.notEqual(params.get('v'), '1');
    assert.match(params.get('v') ?? '', /^\d+$/);
  });

  it('leaves non-identity URLs alone', () => {
    assert.equal(cacheBustIdentityMediaUrl('/api/gallery/media/abc'), '/api/gallery/media/abc');
    assert.equal(cacheBustIdentityMediaUrl('blob:http://localhost/1'), 'blob:http://localhost/1');
  });

  it('detects the identity lock path with or without a cache-bust query', () => {
    assert.equal(isIdentityMediaUrl(IDENTITY_MEDIA_URL), true);
    assert.equal(isIdentityMediaUrl(`${IDENTITY_MEDIA_URL}?v=9`), true);
    assert.equal(isIdentityMediaUrl('/api/gallery/media/abc'), false);
  });
});

describe('castPlateMediaId', () => {
  it('gives each Cast its own plate file id', () => {
    assert.equal(castPlateMediaId('char-abc'), 'cast-plate-char-abc');
    assert.equal(castPlateMediaId('  char-abc  '), 'cast-plate-char-abc');
    assert.equal(castPlateMediaId('../etc'), null);
  });
});

describe('resolveDurableGalleryStillUrl', () => {
  it('uses the durable original when a Studio upload path is present', () => {
    assert.equal(
      resolveDurableGalleryStillUrl({
        id: 'upload-1',
        durableOriginalPath: 'gallery/upload-1/original.jpg',
        sourceImageUrl: '/api/comfyui/view?filename=772904885_n.jpg',
      }),
      durableGalleryOriginalUrl('upload-1')
    );
  });

  it('accepts an existing durable media source URL', () => {
    assert.equal(
      resolveDurableGalleryStillUrl({
        sourceImageUrl: '/api/gallery/media/upload-1?variant=original',
      }),
      '/api/gallery/media/upload-1?variant=original'
    );
    assert.equal(isDurableGalleryMediaUrl('/api/gallery/media/upload-1?variant=original'), true);
    assert.equal(isDurableGalleryMediaUrl(IDENTITY_MEDIA_URL), false);
  });

  it('ignores Comfy /view URLs so generated stills stay on the host', () => {
    assert.equal(
      resolveDurableGalleryStillUrl({
        id: 'job-1',
        sourceImageUrl: '/api/comfyui/view?filename=out.png&type=output',
      }),
      undefined
    );
  });
});

describe('durable media URLs with a batch index', () => {
  it('omits the index param for the primary output (index 0 or unset)', () => {
    assert.equal(durableGalleryThumbUrl('job-1'), '/api/gallery/media/job-1');
    assert.equal(durableGalleryThumbUrl('job-1', 0), '/api/gallery/media/job-1');
    assert.equal(durableGalleryOriginalUrl('job-1'), '/api/gallery/media/job-1?variant=original');
    assert.equal(
      durableGalleryOriginalUrl('job-1', 0),
      '/api/gallery/media/job-1?variant=original'
    );
  });

  it('adds the index param for later outputs in a multi-image batch', () => {
    assert.equal(durableGalleryThumbUrl('job-1', 2), '/api/gallery/media/job-1?index=2');
    assert.equal(
      durableGalleryOriginalUrl('job-1', 3),
      '/api/gallery/media/job-1?variant=original&index=3'
    );
  });

  it('still matches isDurableGalleryMediaUrl once cache-busted with an index', () => {
    assert.equal(isDurableGalleryMediaUrl(durableGalleryOriginalUrl('job-1', 1)), true);
  });
});
