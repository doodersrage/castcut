import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scrubPlayToolCachesOnCastChange } from './settings-cache';

describe('scrubPlayToolCachesOnCastChange', () => {
  it('clears Day stills and isolate plate overrides', () => {
    const next = scrubPlayToolCachesOnCastChange({
      day: {
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: '/a.webp' }],
        stillsCharacterId: 'char-a',
        plateImageUrl: '/old-plate.webp',
        plateImageFilename: 'old.png',
        plateIsolateSourceKey: 'src-a',
        referenceIsolated: true,
      },
    });
    assert.deepEqual(next.day?.stills, []);
    assert.equal(next.day?.stillsCharacterId, undefined);
    assert.equal(next.day?.plateImageUrl, undefined);
    assert.equal(next.day?.plateIsolateSourceKey, undefined);
    assert.equal(next.day?.referenceIsolated, false);
  });

  it('clears Outfit try-on refs and allows Cast reseed', () => {
    const next = scrubPlayToolCachesOnCastChange({
      fitting: {
        referenceImageUrl: '/old.webp',
        referenceImageFilename: 'old.png',
        suppressAutoPlateSeed: true,
        pendingOutfitPlatePromptId: 'p1',
        previewPlateUrl: '/preview.webp',
      },
    });
    assert.equal(next.fitting?.referenceImageUrl, undefined);
    assert.equal(next.fitting?.referenceImageFilename, undefined);
    assert.equal(next.fitting?.pendingOutfitPlatePromptId, undefined);
    assert.equal(next.fitting?.previewPlateUrl, undefined);
    assert.equal(next.fitting?.suppressAutoPlateSeed, false);
  });

  it('clears Story From-photo refs', () => {
    const next = scrubPlayToolCachesOnCastChange({
      roleplay: {
        referenceImageUrl: '/story.webp',
        referenceImageFilename: 'story.png',
        referenceIsolated: true,
        playAs: 'photo',
      },
    });
    assert.equal(next.roleplay?.referenceImageUrl, undefined);
    assert.equal(next.roleplay?.referenceImageFilename, undefined);
    assert.equal(next.roleplay?.referenceIsolated, false);
    assert.equal(next.roleplay?.playAs, 'photo');
  });
});
