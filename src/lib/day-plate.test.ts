import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CharacterRecord } from '@/lib/character-os';
import type { ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import {
  isQwenEdit2511PoseStickyModel,
  resolveDayGarmentReinforce,
  resolveDayPlate,
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
      { imageUrl: 'https://example.com/pack.webp' }
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
});
