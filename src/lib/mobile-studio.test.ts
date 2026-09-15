import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMobileStudioPath,
  mobileStudioTabFromPath,
  normalizeCharacterPlates,
  roleplayPatchFromPlate,
  toMobileStudioHref,
  upsertCharacterPlate,
  type CharacterPlate,
} from './mobile-studio';

const plate = (overrides: Partial<CharacterPlate> = {}): CharacterPlate => ({
  id: 'p1',
  name: 'Sam',
  createdAt: 100,
  originalUrl: '/api/gallery/media/identity?id=orig',
  originalFilename: 'sam.png',
  isolatedUrl: '/api/gallery/media/identity?id=cut',
  isolatedFilename: 'sam-cutout.png',
  isolated: true,
  ...overrides,
});

describe('mobile studio paths', () => {
  it('treats /m and nested routes as mobile studio', () => {
    assert.equal(isMobileStudioPath('/m'), true);
    assert.equal(isMobileStudioPath('/m/play'), true);
    assert.equal(isMobileStudioPath('/m/queue?x=1'), true);
    assert.equal(isMobileStudioPath('/roleplay'), false);
    assert.equal(isMobileStudioPath('/'), false);
  });

  it('maps tab ids from the pathname', () => {
    assert.equal(mobileStudioTabFromPath('/m'), 'capture');
    assert.equal(mobileStudioTabFromPath('/m/queue'), 'queue');
    assert.equal(mobileStudioTabFromPath('/m/gallery'), 'gallery');
    assert.equal(mobileStudioTabFromPath('/m/moodboard'), 'moodboard');
    assert.equal(mobileStudioTabFromPath('/m/fitting'), 'fitting');
    assert.equal(mobileStudioTabFromPath('/m/day'), 'day');
    assert.equal(mobileStudioTabFromPath('/m/play'), 'play');
  });

  it('remaps desk film paths onto /m', () => {
    assert.equal(toMobileStudioHref('/fitting?character=c1'), '/m/fitting?character=c1');
    assert.equal(toMobileStudioHref('/day?from=look'), '/m/day?from=look');
    assert.equal(toMobileStudioHref('/moodboard'), '/m/moodboard');
    assert.equal(toMobileStudioHref('/roleplay?character=c1'), '/m/play?character=c1');
    assert.equal(toMobileStudioHref('/play'), '/m/day');
    assert.equal(toMobileStudioHref('/gallery'), '/m/gallery');
    assert.equal(toMobileStudioHref('/queue'), '/m/queue');
    assert.equal(toMobileStudioHref('/characters'), '/m');
    assert.equal(
      toMobileStudioHref('/characters/c1?media=films'),
      '/m/gallery?character=c1&derivedKind=film'
    );
    assert.equal(toMobileStudioHref('/characters/c1'), '/m');
  });
});

describe('character plates', () => {
  it('upserts newest first and caps the list', () => {
    const first = plate({ id: 'a', createdAt: 1 });
    const second = plate({ id: 'b', createdAt: 2 });
    const next = upsertCharacterPlate([first], second);
    assert.equal(next[0]?.id, 'b');
    assert.equal(next[1]?.id, 'a');
  });

  it('drops plates missing both urls', () => {
    assert.deepEqual(
      normalizeCharacterPlates([{ id: 'x', name: 'Nope' }, plate()]),
      [plate()]
    );
  });

  it('applies an isolated plate to Roleplay From photo', () => {
    const patch = roleplayPatchFromPlate(plate());
    assert.equal(patch.playAs, 'photo');
    assert.equal(patch.isolateSubject, true);
    assert.equal(patch.referenceIsolated, true);
    assert.equal(patch.referenceImageUrl, '/api/gallery/media/identity?id=cut');
    assert.equal(patch.referenceOriginalUrl, '/api/gallery/media/identity?id=orig');
  });

  it('does not turn Isolate on white off when the plate is a raw gallery still', () => {
    const patch = roleplayPatchFromPlate(plate({ isolated: false, isolatedUrl: plate().originalUrl }));
    assert.equal(patch.referenceIsolated, false);
    assert.equal(patch.isolateSubject, undefined);
    assert.equal(patch.referenceImageUrl, plate().originalUrl);
  });
});
