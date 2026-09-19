import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isMobileStudioPath,
  mobileStudioTabFromPath,
  normalizeCharacterPlates,
  fittingPatchFromPlate,
  moodboardPatchFromPlate,
  roleplayPatchFromPlate,
  toMobileStudioHref,
  dayToolHref,
  dayToolPathname,
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
    assert.equal(isMobileStudioPath('/m/story'), true);
    assert.equal(isMobileStudioPath('/m/queue?x=1'), true);
    assert.equal(isMobileStudioPath('/story'), false);
    assert.equal(isMobileStudioPath('/'), false);
  });

  it('maps tab ids from the pathname', () => {
    assert.equal(mobileStudioTabFromPath('/m'), 'capture');
    assert.equal(mobileStudioTabFromPath('/m/queue'), 'queue');
    assert.equal(mobileStudioTabFromPath('/m/gallery'), 'gallery');
    assert.equal(mobileStudioTabFromPath('/m/moodboard'), 'moodboard');
    assert.equal(mobileStudioTabFromPath('/m/fitting'), 'fitting');
    assert.equal(mobileStudioTabFromPath('/m/day'), 'day');
    assert.equal(mobileStudioTabFromPath('/m/story'), 'story');
    assert.equal(mobileStudioTabFromPath('/m/film'), 'film');
  });

  it('remaps desk film paths onto /m', () => {
    assert.equal(toMobileStudioHref('/fitting?character=c1'), '/m/fitting?character=c1');
    assert.equal(toMobileStudioHref('/day?from=look'), '/m/day?from=look');
    assert.equal(toMobileStudioHref('/moodboard'), '/m/moodboard');
    assert.equal(toMobileStudioHref('/story?character=c1'), '/m/story?character=c1');
    assert.equal(toMobileStudioHref('/roleplay?character=c1'), '/m/story?character=c1');
    assert.equal(toMobileStudioHref('/play'), '/m/film');
    assert.equal(toMobileStudioHref('/gallery'), '/m/gallery');
    assert.equal(toMobileStudioHref('/queue'), '/m/queue');
    assert.equal(toMobileStudioHref('/characters'), '/m');
    assert.equal(toMobileStudioHref('/characters/c1'), '/m?character=c1');
    assert.equal(
      toMobileStudioHref('/characters/c1?media=films'),
      '/m/gallery?character=c1&derivedKind=film'
    );
  });

  it('keeps Day rewrite on /m/day when already in Mobile Studio', () => {
    assert.equal(dayToolPathname('/m/day'), '/m/day');
    assert.equal(dayToolPathname('/day'), '/day');
    assert.equal(dayToolHref('starter=1&autocut=1', '/m/day'), '/m/day?starter=1&autocut=1');
    assert.equal(dayToolHref('', '/m/day'), '/m/day');
    assert.equal(dayToolHref('remix=1', '/day'), '/day?remix=1');
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

  it('seeds Look and Outfit patches from a Capture plate', () => {
    const fitting = fittingPatchFromPlate(plate());
    assert.equal(fitting.referenceImageUrl, '/api/gallery/media/identity?id=cut');
    assert.equal(fitting.referenceIsolated, true);
    const look = moodboardPatchFromPlate(plate());
    assert.equal(look.tiles.length, 1);
    assert.equal(look.tiles[0]?.imageUrl, '/api/gallery/media/identity?id=cut');
    assert.equal(look.tiles[0]?.label, 'Sam');
  });
});
