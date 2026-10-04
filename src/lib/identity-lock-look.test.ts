import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { CharacterLook } from './character-os';
import {
  identityLockForLook,
  identityLockLookStatus,
  identityLockPatchChanges,
  identityLockSource,
  lockPictureStem,
  lookFace,
  lookLockLabel,
  ownIdentityLockFilename,
} from './identity-lock-look';

function look(id: string, name: string, base: string): CharacterLook {
  return {
    id,
    name,
    createdAt: 1,
    reference: {
      originalFilename: `${base}-u1ab2c3d4.png`,
      isolatedFilename: `${base}-cutout-u1ab2c3d5.png`,
      originalUrl: `/api/gallery/media/owned/cast-plate-nora-${id}?v=1`,
      isolatedUrl: `/api/gallery/media/owned/cast-plate-nora-${id}?v=2`,
      isolated: true,
    },
    ipAdapter: {
      imageFilename: `${base}-cutout-u1ab2c3d5.png`,
      imageUrl: `/api/gallery/media/owned/cast-plate-nora-${id}?v=2`,
    },
  };
}

const studio = look('studio', 'Studio', 'nora-studio');
const lying = look('lying', 'Lying', 'nora-lying');
const looks = [studio, lying];

describe('identity-lock-look', () => {
  it('reads a stem without upload stamps, clash suffixes or the cut-out tag', () => {
    assert.equal(lockPictureStem('nora-lying-umust02ze-cutout.png'), 'nora-lying');
    assert.equal(lockPictureStem('nora-lying-cutout-u1ab2c3d5.png'), 'nora-lying');
    assert.equal(lockPictureStem('nora-lying-u1ab2c3d4 (1).png'), 'nora-lying');
    assert.equal(lockPictureStem('Nora.PNG'), 'nora');
    assert.equal(lockPictureStem(''), '');
  });

  it('migrates: a lock showing any look (or its cut-out) is from the look, else own', () => {
    assert.equal(identityLockSource({}, looks), null);
    assert.equal(
      identityLockSource({ ipAdapterImageFilename: 'nora-lying-cutout-u1ab2c3d5.png' }, looks),
      'look'
    );
    // The older cut-out name of the plate (stamp before "-cutout").
    assert.equal(
      identityLockSource({ ipAdapterImageFilename: 'nora-lying-umust02ze-cutout.png' }, looks),
      'look'
    );
    // Same plate URL, renamed file (a re-upload to another host).
    assert.equal(
      identityLockSource(
        {
          ipAdapterImageFilename: 'something-else.png',
          ipAdapterImageUrl: '/api/gallery/media/owned/cast-plate-nora-studio?v=9',
        },
        looks
      ),
      'look'
    );
    assert.equal(identityLockSource({ ipAdapterImageFilename: 'holiday.jpg' }, looks), 'own');
    // A ComfyUI view URL names its file in the query: another file is not the look's.
    assert.equal(
      identityLockSource(
        {
          ipAdapterImageFilename: 'holiday.jpg',
          ipAdapterImageUrl: '/api/comfyui/view?filename=holiday.jpg&type=input',
        },
        [
          {
            ipAdapter: {
              imageFilename: 'nora-cutout.png',
              imageUrl: '/api/comfyui/view?filename=nora-cutout.png&type=input',
            },
          },
        ]
      ),
      'own'
    );
    // The shared identity file is the same URL for every lock — it never proves a look.
    assert.equal(
      identityLockSource(
        { ipAdapterImageFilename: 'holiday.jpg', ipAdapterImageUrl: '/api/gallery/media/identity' },
        looks
      ),
      'own'
    );
  });

  it('keeps a lock marked as own even when it shows a look', () => {
    assert.equal(
      identityLockSource(
        { ipAdapterImageFilename: studio.ipAdapter!.imageFilename, ipAdapterSource: 'own' },
        looks
      ),
      'own'
    );
  });

  it('a plate the Cast let go of still counts as the look', () => {
    const lock = { ipAdapterImageFilename: 'nora-old-cutout-u1ab2c3d9.png' };
    assert.equal(identityLockSource(lock, looks), 'own');
    assert.equal(
      identityLockSource(lock, looks, [{ filename: 'nora-old-u1ab2c3d8.png' }]),
      'look'
    );
  });

  it('moves a lock from the look to the new look on a switch', () => {
    const patch = identityLockForLook({
      lock: {
        ipAdapterImageFilename: studio.ipAdapter!.imageFilename,
        ipAdapterImageUrl: studio.ipAdapter!.imageUrl,
      },
      looks,
      look: lying,
    });
    assert.deepEqual(patch, {
      ipAdapterImageFilename: 'nora-lying-cutout-u1ab2c3d5.png',
      ipAdapterImageFilenames: ['nora-lying-cutout-u1ab2c3d5.png'],
      ipAdapterImageUrl: '/api/gallery/media/owned/cast-plate-nora-lying?v=2',
      ipAdapterComfyUrl: undefined,
      ipAdapterSource: 'look',
    });
  });

  it("keeps the player's own face on a switch (and records it as own)", () => {
    const lock = { ipAdapterImageFilename: 'holiday.jpg' };
    assert.deepEqual(identityLockForLook({ lock, looks, look: lying }), {
      ipAdapterSource: 'own',
    });
    assert.deepEqual(
      identityLockForLook({ lock: { ...lock, ipAdapterSource: 'own' }, looks, look: lying }),
      {}
    );
  });

  it('a lock from the look goes when the new look has no picture; no lock stays none', () => {
    const blank: CharacterLook = { id: 'blank', name: 'Blank', createdAt: 2 };
    const patch = identityLockForLook({
      lock: { ipAdapterImageFilename: studio.ipAdapter!.imageFilename },
      looks: [...looks, blank],
      look: blank,
    });
    assert.equal(patch.ipAdapterImageFilename, undefined);
    assert.ok('ipAdapterImageFilename' in patch);
    assert.deepEqual(identityLockForLook({ lock: {}, looks, look: blank }), {});
    // No lock yet, the look has a face: it is locked from the look.
    assert.equal(
      identityLockForLook({ lock: {}, looks, look: studio }).ipAdapterSource,
      'look'
    );
  });

  it("a look's face: its face file, else its plate's cut-out", () => {
    assert.equal(lookFace(studio)?.filename, 'nora-studio-cutout-u1ab2c3d5.png');
    const plateOnly: CharacterLook = { ...lying, ipAdapter: undefined };
    assert.equal(lookFace(plateOnly)?.filename, 'nora-lying-cutout-u1ab2c3d5.png');
    assert.equal(lookFace({}), null);
  });

  it("an own face goes on every still; a look's lock leaves each still its look's face", () => {
    assert.equal(
      ownIdentityLockFilename({ ipAdapterImageFilename: 'holiday.jpg' }, looks),
      'holiday.jpg'
    );
    assert.equal(
      ownIdentityLockFilename({ ipAdapterImageFilename: studio.ipAdapter!.imageFilename }, looks),
      undefined
    );
  });

  it('names the look by file name before a URL shared by several looks', () => {
    const shared = '/plates/same.png';
    const a: CharacterLook = { id: 'a', name: 'A', createdAt: 1, ipAdapter: { imageFilename: 'a.png', imageUrl: shared } };
    const b: CharacterLook = { id: 'b', name: 'B', createdAt: 2, ipAdapter: { imageFilename: 'b.png', imageUrl: shared } };
    assert.deepEqual(
      identityLockLookStatus({
        lock: { ipAdapterImageFilename: 'b.png', ipAdapterImageUrl: shared },
        looks: [a, b],
        activeLook: b,
      }),
      { kind: 'look', lookName: 'B' }
    );
  });

  it('says where the face comes from', () => {
    assert.deepEqual(
      identityLockLookStatus({
        lock: { ipAdapterImageFilename: lying.ipAdapter!.imageFilename },
        looks,
        activeLook: lying,
      }),
      { kind: 'look', lookName: 'Lying' }
    );
    assert.deepEqual(
      identityLockLookStatus({
        lock: { ipAdapterImageFilename: 'holiday.jpg' },
        looks,
        activeLook: studio,
      }),
      { kind: 'own', lookName: 'Studio', canUseLook: true }
    );
    assert.deepEqual(identityLockLookStatus({ lock: {}, looks, activeLook: studio }), {
      kind: 'none',
    });
    assert.equal(lookLockLabel('Studio'), 'Studio look');
    assert.equal(lookLockLabel('Beach look'), 'Beach look');
  });

  it('tells whether a patch changes the lock', () => {
    const lock = { ipAdapterImageFilename: 'a.png', ipAdapterSource: 'look' as const };
    assert.equal(identityLockPatchChanges(lock, { ipAdapterImageFilename: 'a.png' }), false);
    assert.equal(identityLockPatchChanges(lock, { ipAdapterImageFilename: 'b.png' }), true);
    assert.equal(identityLockPatchChanges(lock, {}), false);
  });
});
