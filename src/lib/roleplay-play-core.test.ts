import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ISOLATE_QUEUE_BLOCKED_MESSAGE } from './isolate-subject';
import { buildRoleplayQueueStillOptions, buildRoleplayRequestBody } from './roleplay-play-core';
import { DEFAULT_SHARED_SETTINGS } from './settings-cache';

describe('roleplay-play-core', () => {
  it('omits still identity options when not in photo mode', () => {
    assert.equal(
      buildRoleplayQueueStillOptions({
        photoMode: false,
        isolateSubject: false,
        referenceIsolated: false,
        filename: 'face.png',
        imageUrl: '/media/face.png',
      }),
      undefined,
    );
  });

  it('locks identity from the reference still in photo mode', () => {
    const options = buildRoleplayQueueStillOptions({
      photoMode: true,
      isolateSubject: false,
      referenceIsolated: false,
      filename: 'face.png',
      imageUrl: '/media/face.png',
      identityLockStrength: 0.7,
      identityKind: 'ipadapter',
    });
    assert.deepEqual(options, {
      inputImageFilename: 'face.png',
      inputImageUrl: '/media/face.png',
      identityLock: true,
      identityLockStrength: 0.7,
      identityKind: 'ipadapter',
      queueTool: 'image-prompt',
      turboEditStrength: 'strong',
    });
  });

  it('blocks queue until isolate-on-white finishes', () => {
    assert.throws(
      () =>
        buildRoleplayQueueStillOptions({
          photoMode: true,
          isolateSubject: true,
          referenceIsolated: false,
          filename: 'face.png',
        }),
      (err: Error) => err.message === ISOLATE_QUEUE_BLOCKED_MESSAGE,
    );
  });

  it('builds a bio request without prior story', () => {
    const body = buildRoleplayRequestBody({
      action: 'bio',
      shared: DEFAULT_SHARED_SETTINGS,
      personaId: 'raccoon-pirate',
      tone: 'silly',
      content: 'pg13',
      hasReferenceImage: true,
      isolatedSubject: true,
      bio: { name: 'Rin', look: 'raccoon pirate', personality: 'chirpy' },
      story: [{ id: 'old', at: 1, title: 'Old', blurb: 'skip', prompt: 'skip' }],
    });
    assert.equal(body.action, 'bio');
    assert.equal(body.personaId, 'raccoon-pirate');
    assert.equal(body.bio, undefined);
    assert.deepEqual(body.story, []);
    assert.equal(body.hasReferenceImage, true);
    assert.equal(body.isolatedSubject, true);
  });

  it('attaches wardrobe kit + Image 2 garment on photo stills', () => {
    const options = buildRoleplayQueueStillOptions({
      photoMode: true,
      isolateSubject: false,
      referenceIsolated: false,
      filename: 'face.png',
      imageUrl: '/media/face.png',
      customGarmentUrl: 'https://example.com/coat.png',
      customGarmentFilename: 'coat.png',
    });
    assert.equal(options?.inputImageFilename, 'face.png');
    assert.deepEqual(options?.inputImageUrls, [undefined, 'https://example.com/coat.png']);
    assert.deepEqual(options?.inputImageFilenames, ['', 'coat.png']);
  });

  it('attaches Image 3 pose guide with a sparse Image 2 slot', () => {
    const options = buildRoleplayQueueStillOptions({
      photoMode: true,
      isolateSubject: false,
      referenceIsolated: false,
      filename: 'face.png',
      imageUrl: '/media/face.png',
      poseGuideFilename: 'pose.png',
      poseGuideUrl: 'https://example.com/pose.png',
    });
    assert.deepEqual(options?.inputImageUrls, [
      undefined,
      undefined,
      'https://example.com/pose.png',
    ]);
    assert.deepEqual(options?.inputImageFilenames, ['', '', 'pose.png']);
  });

  it('omits Image 2 garment packshot when intimate nude/sex beats request it', () => {
    const options = buildRoleplayQueueStillOptions({
      photoMode: true,
      isolateSubject: false,
      referenceIsolated: false,
      filename: 'face.png',
      imageUrl: '/media/face.png',
      customGarmentUrl: 'https://example.com/lingerie.png',
      customGarmentFilename: 'lingerie.png',
      poseGuideFilename: 'pose.png',
      poseGuideUrl: 'https://example.com/pose.png',
      omitGarment: true,
    });
    assert.deepEqual(options?.inputImageUrls, [
      undefined,
      undefined,
      'https://example.com/pose.png',
    ]);
    assert.deepEqual(options?.inputImageFilenames, ['', '', 'pose.png']);
  });

  it('passes wardrobe cues on prompt requests', () => {
    const body = buildRoleplayRequestBody({
      action: 'prompt',
      shared: DEFAULT_SHARED_SETTINGS,
      personaId: 'raccoon-pirate',
      tone: 'silly',
      content: 'pg13',
      hasReferenceImage: true,
      isolatedSubject: true,
      wardrobeLabel: 'linen set',
      garmentDescription: 'cream linen shirt',
      hasGarmentReference: true,
    });
    assert.equal(body.wardrobeLabel, 'linen set');
    assert.equal(body.garmentDescription, 'cream linen shirt');
    assert.equal(body.hasGarmentReference, true);
  });
});
