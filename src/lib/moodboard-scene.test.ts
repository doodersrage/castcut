import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOOK_PREVIEW_HINT,
  consumeMoodboardGalleryPlatePick,
  markMoodboardGalleryPlatePick,
  moodboardExtractBlockReason,
  moodboardQueueBlockReason,
  moodboardSessionStatusLine,
  newMoodboardTileId,
  normalizeMoodboardTemplateId,
  normalizeMoodboardTiles,
  resolveLookPlayPhase,
  synthesizeMoodboardPrompt,
} from './moodboard-scene';

describe('moodboard-scene', () => {
  it('normalizeMoodboardTemplateId falls back to scene-blend', () => {
    assert.equal(normalizeMoodboardTemplateId('bogus'), 'scene-blend');
    assert.equal(normalizeMoodboardTemplateId('location'), 'location');
  });

  it('normalizeMoodboardTiles caps at four tiles', () => {
    const tiles = normalizeMoodboardTiles(
      Array.from({ length: 6 }, (_, index) => ({
        id: `t${index}`,
        role: 'mood' as const,
      }))
    );
    assert.equal(tiles.length, 4);
  });

  it('normalizeMoodboardTiles keeps spaces in label and notes while typing', () => {
    const tiles = normalizeMoodboardTiles([
      {
        id: 't1',
        role: 'mood',
        label: 'rainy neon ',
        notes: 'soft rim light ',
      },
    ]);
    assert.equal(tiles[0]?.label, 'rainy neon ');
    assert.equal(tiles[0]?.notes, 'soft rim light ');
  });

  it('synthesizeMoodboardPrompt merges tiles and instruction', () => {
    const prompt = synthesizeMoodboardPrompt({
      templateId: 'lighting-mood',
      characterName: 'Kai',
      instruction: 'wide cinematic frame',
      tiles: [
        {
          id: newMoodboardTileId(),
          role: 'lighting',
          notes: 'golden hour rim light',
        },
      ],
    });
    assert.match(prompt, /lighting/i);
    assert.match(prompt, /Kai/);
    assert.match(prompt, /golden hour rim light/);
    assert.match(prompt, /wide cinematic frame/);
  });

  it('synthesizeMoodboardPrompt requires tiles or instruction', () => {
    assert.throws(
      () => synthesizeMoodboardPrompt({ tiles: [] }),
      /Add at least one moodboard tile/
    );
  });

  it('moodboardExtractBlockReason and moodboardQueueBlockReason mirror Outfit-style copy', () => {
    assert.match(
      moodboardExtractBlockReason({
        hasTiles: false,
        hasInstruction: false,
      }) ?? '',
      /tile or scene direction/i
    );
    assert.equal(
      moodboardExtractBlockReason({
        hasTiles: true,
        hasInstruction: false,
      }),
      null
    );
    assert.match(
      moodboardQueueBlockReason({
        hasTiles: false,
        hasInstruction: false,
        busy: true,
      }) ?? '',
      /Already queueing/i
    );
    assert.match(
      moodboardQueueBlockReason({
        hasTiles: true,
        hasInstruction: false,
        tileUploading: true,
      }) ?? '',
      /tile upload/i
    );
  });

  it('resolveLookPlayPhase walks Tiles → Extract → Plate → Continue', () => {
    assert.equal(
      resolveLookPlayPhase({
        tileCount: 0,
        hasLookPack: false,
        hasPlate: false,
      }),
      'tiles'
    );
    assert.equal(
      resolveLookPlayPhase({
        tileCount: 2,
        hasLookPack: false,
        hasPlate: false,
      }),
      'extract'
    );
    assert.equal(
      resolveLookPlayPhase({
        tileCount: 2,
        hasLookPack: true,
        hasPlate: false,
      }),
      'plate'
    );
    assert.equal(
      resolveLookPlayPhase({
        tileCount: 2,
        hasLookPack: true,
        hasPlate: true,
      }),
      'continue'
    );
    assert.equal(
      resolveLookPlayPhase({
        tileCount: 0,
        hasLookPack: false,
        hasPlate: false,
        softAdvanceActive: true,
      }),
      'continue'
    );
  });

  it('moodboardSessionStatusLine names tiles · plate · pack', () => {
    assert.match(
      moodboardSessionStatusLine({ tileCount: 0, hasPlate: false, hasLookPack: false }),
      /No tiles/
    );
    assert.match(
      moodboardSessionStatusLine({ tileCount: 2, hasPlate: true, hasLookPack: true }),
      /2 tiles · Plate ready · Pack ready/
    );
    assert.match(LOOK_PREVIEW_HINT, /Preview prompt/);
  });

  it('mark/consumeMoodboardGalleryPlatePick round-trips in sessionStorage', () => {
    markMoodboardGalleryPlatePick();
    assert.equal(consumeMoodboardGalleryPlatePick(), true);
    assert.equal(consumeMoodboardGalleryPlatePick(), false);
  });
});
