import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inheritsActiveCharacterStamp,
  isForeignCharacterStamp,
  resolveGalleryCharacterStamp,
} from './gallery-character-stamp';

describe('gallery-character-stamp', () => {
  it('does not stamp compose from the leftover active character', () => {
    assert.equal(inheritsActiveCharacterStamp('compose'), false);
    assert.equal(isForeignCharacterStamp({ tool: 'compose' }), true);
    assert.equal(
      resolveGalleryCharacterStamp({
        tool: 'compose',
        activeCharacterId: 'char-rin',
      }),
      undefined
    );
  });

  it('stamps generate / roleplay / video from the active character', () => {
    assert.equal(
      resolveGalleryCharacterStamp({
        tool: 'generate',
        activeCharacterId: 'char-rin',
      }),
      'char-rin'
    );
    assert.equal(
      resolveGalleryCharacterStamp({
        tool: 'roleplay',
        activeCharacterId: 'char-rin',
      }),
      'char-rin'
    );
  });

  it('keeps Look / Outfit / Day stamps on Cast media (not foreign)', () => {
    for (const tool of ['moodboard', 'fitting', 'day', 'image-prompt'] as const) {
      assert.equal(inheritsActiveCharacterStamp(tool), true);
      assert.equal(isForeignCharacterStamp({ tool }), false);
      assert.equal(
        resolveGalleryCharacterStamp({
          tool,
          activeCharacterId: 'char-rin',
        }),
        'char-rin'
      );
    }
  });

  it('still treats compose leftovers as foreign', () => {
    assert.equal(isForeignCharacterStamp({ tool: 'compose' }), true);
    assert.equal(isForeignCharacterStamp({ tool: 'refine' }), true);
  });

  it('lets an explicit id win, then a parent on derived work', () => {
    assert.equal(
      resolveGalleryCharacterStamp({
        characterId: 'char-kai',
        parentCharacterId: 'char-rin',
        activeCharacterId: 'char-rin',
        tool: 'compose',
      }),
      'char-kai'
    );
    assert.equal(
      resolveGalleryCharacterStamp({
        parentCharacterId: 'char-rin',
        tool: 'compose',
        derivedKind: 'i2v',
      }),
      'char-rin'
    );
    assert.equal(
      resolveGalleryCharacterStamp({
        parentCharacterId: 'char-rin',
        tool: 'compose',
      }),
      undefined
    );
  });
});
