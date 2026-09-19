import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CharacterRecord } from '@/lib/character-os';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  dayNudeNeedsAutoFaceCrop,
  dayPlateIsolatePending,
  dayPlateSourceKey,
  isQwenEdit2511PoseStickyModel,
  resolveDayGarmentReinforce,
  resolveDayPlate,
  resolveDayPlateForIsolate,
  resolveDayQueueIdentityPlate,
} from '@/lib/day-plate';

function characterWithKeepers(keeperEntryIds: string[]): CharacterRecord {
  return {
    id: 'char-1',
    name: 'Rin',
    version: 1,
    updatedAt: 1,
    activeLookId: 'look-1',
    looks: [
      {
        id: 'look-1',
        name: 'Main',
        createdAt: 1,
        keeperEntryIds,
        reference: {
          originalFilename: 'face.png',
          originalUrl: 'https://example.com/face.png',
          isolateSubject: true,
        },
      },
    ],
  };
}

function galleryStill(id: string): ComfyGalleryEntry {
  return {
    id,
    promptId: `prompt-${id}`,
    prompt: 'try-on',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    characterId: 'char-1',
    queuedAt: 1,
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
  };
}

describe('resolveDayPlate', () => {
  it('prefers the latest Outfit keeper for display', () => {
    const character = characterWithKeepers(['keep-a', 'keep-b']);
    const plate = resolveDayPlate({
      character,
      gallery: [galleryStill('keep-a'), galleryStill('keep-b')],
    });
    assert.equal(plate?.source, 'keeper');
    assert.match(plate?.imageUrl ?? '', /keep-b/);
  });

  it('falls back to Cast plate when keepers are missing from gallery', () => {
    const character = characterWithKeepers(['missing']);
    const plate = resolveDayPlate({ character, gallery: [] });
    assert.equal(plate?.source, 'cast');
    assert.match(plate?.imageUrl ?? '', /face/);
  });

  it('returns null without character media', () => {
    const character: CharacterRecord = {
      id: 'char-1',
      name: 'Rin',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-1',
      looks: [{ id: 'look-1', name: 'Main', createdAt: 1 }],
    };
    assert.equal(resolveDayPlate({ character, gallery: [] }), null);
  });
});

describe('resolveDayPlateForIsolate', () => {
  it('applies a matching isolate override', () => {
    const base = {
      source: 'keeper' as const,
      imageUrl: 'https://example.com/keep.png',
      filename: 'keep.png',
      isolated: false,
    };
    const resolved = resolveDayPlateForIsolate({
      basePlate: base,
      isolateSubject: true,
      cache: {
        referenceIsolated: true,
        plateIsolateSourceKey: dayPlateSourceKey(base),
        plateImageUrl: 'https://example.com/cutout.png',
        plateImageFilename: 'cutout.png',
      },
    });
    assert.equal(resolved?.imageUrl, 'https://example.com/cutout.png');
    assert.equal(resolved?.isolated, true);
  });

  it('falls back to original when isolate is off', () => {
    const base = {
      source: 'cast' as const,
      imageUrl: 'https://example.com/iso.png',
      originalUrl: 'https://example.com/orig.png',
      filename: 'iso.png',
      originalFilename: 'orig.png',
      isolated: true,
    };
    const resolved = resolveDayPlateForIsolate({
      basePlate: base,
      isolateSubject: false,
      cache: {},
    });
    assert.equal(resolved?.imageUrl, 'https://example.com/orig.png');
    assert.equal(resolved?.isolated, false);
  });

  it('dayPlateIsolatePending is false for already-isolated cast plates', () => {
    assert.equal(
      dayPlateIsolatePending({
        basePlate: {
          source: 'cast',
          imageUrl: 'https://example.com/iso.png',
          isolated: true,
        },
        isolateSubject: true,
        cache: {},
      }),
      false
    );
    assert.equal(
      dayPlateIsolatePending({
        basePlate: {
          source: 'keeper',
          imageUrl: 'https://example.com/keep.png',
          isolated: false,
        },
        isolateSubject: true,
        cache: {},
      }),
      true
    );
  });
});

describe('resolveDayQueueIdentityPlate', () => {
  it('keeps Outfit Keep as Image 1 when present (outfit fidelity)', () => {
    const character = characterWithKeepers(['keep-b']);
    const display = resolveDayPlate({
      character,
      gallery: [galleryStill('keep-b')],
    });
    const queue = resolveDayQueueIdentityPlate({ character, displayPlate: display });
    assert.equal(queue?.source, 'keeper');
    assert.match(queue?.imageUrl ?? '', /keep-b/);
  });

  it('falls back to Cast when there is no Keep', () => {
    const character = characterWithKeepers([]);
    const display = resolveDayPlate({ character, gallery: [] });
    const queue = resolveDayQueueIdentityPlate({ character, displayPlate: display });
    assert.equal(queue?.source, 'cast');
    assert.equal(queue?.imageUrl, 'https://example.com/face.png');
  });

  it('preferCastPlate skips Outfit Keep so Sport can dress athletic kit', () => {
    const character = characterWithKeepers(['keep-floral']);
    const display = resolveDayPlate({
      character,
      gallery: [galleryStill('keep-floral')],
    });
    assert.equal(display?.source, 'keeper');
    const queue = resolveDayQueueIdentityPlate({
      character,
      displayPlate: display,
      preferCastPlate: true,
    });
    assert.equal(queue?.source, 'cast');
    assert.equal(queue?.imageUrl, 'https://example.com/face.png');
  });

  it('preferFaceOnlyPlate prefers Cast face/IP over full-body Cast underwear plate', () => {
    const character: CharacterRecord = {
      id: 'char-1',
      name: 'Rin',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-1',
      looks: [
        {
          id: 'look-1',
          name: 'Main',
          createdAt: 1,
          reference: {
            originalFilename: 'underwear-body.png',
            originalUrl: 'https://example.com/underwear-body.png',
            isolateSubject: true,
          },
          ipAdapter: {
            imageFilename: 'face-crop.png',
            imageUrl: 'https://example.com/face-crop.png',
          },
        },
      ],
    };
    const display = resolveDayPlate({ character, gallery: [] });
    assert.match(display?.imageUrl ?? '', /underwear-body/);
    const queue = resolveDayQueueIdentityPlate({
      character,
      displayPlate: display,
      preferFaceOnlyPlate: true,
    });
    assert.equal(queue?.source, 'cast');
    assert.match(queue?.imageUrl ?? '', /face-crop/);
    assert.doesNotMatch(queue?.imageUrl ?? '', /underwear/);
  });

  it('preferFaceOnlyPlate falls back to Cast body sync (queue may auto-crop)', () => {
    const character: CharacterRecord = {
      id: 'char-1',
      name: 'Rin',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-1',
      looks: [
        {
          id: 'look-1',
          name: 'Main',
          createdAt: 1,
          reference: {
            originalFilename: 'underwear-body.png',
            originalUrl: 'https://example.com/underwear-body.png',
            isolateSubject: true,
          },
        },
      ],
    };
    const display = resolveDayPlate({ character, gallery: [] });
    assert.match(display?.imageUrl ?? '', /underwear-body/);
    const queue = resolveDayQueueIdentityPlate({
      character,
      displayPlate: display,
      preferFaceOnlyPlate: true,
    });
    // Sync fallback keeps Cast body; Day queue replaces with a geometric face crop.
    assert.match(queue?.imageUrl ?? '', /underwear-body/);
  });

  it('preferFaceOnlyPlate keeps Cast body sync when face lock is the same lingerie plate', async () => {
    const { castFaceDuplicatesBodyPlate } = await import('./day-plate');
    const character: CharacterRecord = {
      id: 'char-1',
      name: 'Rin',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-1',
      ipAdapter: {
        imageFilename: 'beige-lingerie-plate.png',
        imageUrl: 'https://example.com/beige-lingerie-plate.png',
      },
      looks: [
        {
          id: 'look-1',
          name: 'Main',
          createdAt: 1,
          reference: {
            originalFilename: 'beige-lingerie-plate.png',
            originalUrl: 'https://example.com/beige-lingerie-plate.png',
            isolateSubject: true,
          },
          ipAdapter: {
            imageFilename: 'beige-lingerie-plate.png',
            imageUrl: 'https://example.com/beige-lingerie-plate.png',
          },
        },
      ],
    };
    assert.equal(castFaceDuplicatesBodyPlate(character), true);
    assert.equal(dayNudeNeedsAutoFaceCrop(character), true);
    const queue = resolveDayQueueIdentityPlate({
      character,
      displayPlate: resolveDayPlate({ character, gallery: [] }),
      preferFaceOnlyPlate: true,
    });
    assert.match(queue?.imageUrl ?? '', /beige-lingerie-plate/);
    assert.equal(queue?.source, 'cast');
  });

  it('dayNudeNeedsAutoFaceCrop is false when a distinct face crop exists', () => {
    const character: CharacterRecord = {
      id: 'char-1',
      name: 'Rin',
      version: 1,
      updatedAt: 1,
      activeLookId: 'look-1',
      looks: [
        {
          id: 'look-1',
          name: 'Main',
          createdAt: 1,
          reference: {
            originalFilename: 'underwear-body.png',
            originalUrl: 'https://example.com/underwear-body.png',
            isolateSubject: true,
          },
          ipAdapter: {
            imageFilename: 'face-crop.png',
            imageUrl: 'https://example.com/face-crop.png',
          },
        },
      ],
    };
    assert.equal(dayNudeNeedsAutoFaceCrop(character), false);
  });
});

describe('Day plate pose / garment reinforce', () => {
  it('flags Qwen Edit 2511 as pose-sticky when Keep is Image 1', () => {
    assert.equal(isQwenEdit2511PoseStickyModel('qwen-image-edit-2511-lightning-8'), true);
    assert.equal(isQwenEdit2511PoseStickyModel('qwen-image-edit-2511'), true);
    assert.equal(isQwenEdit2511PoseStickyModel('boogu-image-edit-turbo'), false);
  });

  it('resolveDayGarmentReinforce only attaches packshot for Keep plates', () => {
    assert.deepEqual(
      resolveDayGarmentReinforce({
        plateSource: 'keeper',
        packshotUrl: 'https://example.com/pack.webp',
      }),
      { imageUrl: 'https://example.com/pack.webp', source: 'packshot' }
    );
    assert.equal(
      resolveDayGarmentReinforce({
        plateSource: 'cast',
        packshotUrl: 'https://example.com/pack.webp',
      }),
      null
    );
    assert.equal(
      resolveDayGarmentReinforce({
        plateSource: 'keeper',
        packshotUrl: null,
      }),
      null
    );
  });

  it('resolveDayGarmentReinforce prefers custom BYO for Keep and Cast', () => {
    assert.deepEqual(
      resolveDayGarmentReinforce({
        plateSource: 'keeper',
        packshotUrl: 'https://example.com/pack.webp',
        customGarmentUrl: 'https://example.com/byo.png',
        customGarmentFilename: 'byo.png',
      }),
      {
        imageUrl: 'https://example.com/byo.png',
        imageFilename: 'byo.png',
        source: 'custom',
      }
    );
    assert.deepEqual(
      resolveDayGarmentReinforce({
        plateSource: 'cast',
        customGarmentUrl: 'https://example.com/byo.png',
      }),
      { imageUrl: 'https://example.com/byo.png', source: 'custom' }
    );
  });
});
