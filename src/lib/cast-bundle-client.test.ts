import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  castBundleDressPlates,
  castBundleEntries,
  galleryMediaIdsIn,
  parseCastBundleData,
  withoutOldComfyHost,
} from './cast-bundle-client';
import type { CharacterRecord } from './character-os';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

const entry = (id: string, extra: Partial<ComfyGalleryEntry>): ComfyGalleryEntry => ({
  id,
  promptId: `p-${id}`,
  prompt: 'x',
  comfyUrl: 'http://old-box:8188',
  status: 'completed',
  queuedAt: 1,
  images: [],
  ...extra,
});

describe('cast-bundle-client', () => {
  it('carries the Cast films, and its stills only when asked', () => {
    const gallery = [
      entry('film', { characterId: 'c1', derivedKind: 'film' }),
      entry('still', { characterId: 'c1' }),
      entry('other', { characterId: 'c2', derivedKind: 'film' }),
      entry('pending', { characterId: 'c1', status: 'pending' }),
    ];
    assert.deepEqual(
      castBundleEntries(gallery, 'c1', false).map(e => e.id),
      ['film']
    );
    assert.deepEqual(
      castBundleEntries(gallery, 'c1', true).map(e => e.id),
      ['film', 'still']
    );
  });

  it('picks dress plates made from any of its plates, earlier ones included', () => {
    const character = {
      id: 'c1',
      name: 'Ada',
      version: 1,
      updatedAt: 1,
      activeLookId: 'l1',
      looks: [
        {
          id: 'l1',
          name: 'Look',
          createdAt: 1,
          reference: { isolatedFilename: 'plate-now.png' },
          plateHistory: [{ reference: { originalFilename: 'plate-old.png' }, replacedAt: 2 }],
        },
      ],
    } as CharacterRecord;
    const plates = [
      { key: 'dress|plate-now.png|kit:red|heels', filename: 'd1.png', at: 1 },
      { key: 'dress|plate-old.png|kit:blue|', filename: 'd2.png', at: 1 },
      { key: 'dress|someone-else.png|kit:red|', filename: 'd3.png', at: 1 },
    ];
    assert.deepEqual(
      castBundleDressPlates(plates, character).map(p => p.filename),
      ['d1.png', 'd2.png']
    );
  });

  it('drops the old install host from view links, wherever the parameter sits', () => {
    const cleaned = withoutOldComfyHost({
      a: '/api/comfyui/view?filename=x.png&type=input&comfyUrl=http%3A%2F%2Fold%3A8188',
      b: '/api/comfyui/view?comfyUrl=http%3A%2F%2Fold%3A8188&filename=y.png',
      c: '/api/gallery/media/abc?variant=original',
    });
    assert.equal(cleaned.a, '/api/comfyui/view?filename=x.png&type=input');
    assert.equal(cleaned.b, '/api/comfyui/view?filename=y.png');
    assert.equal(cleaned.c, '/api/gallery/media/abc?variant=original');
  });

  it('reads only its own data file', () => {
    assert.equal(parseCastBundleData('{"kind":"castcut-cast","version":1}'), null);
    assert.equal(parseCastBundleData('not json'), null);
    const ok = parseCastBundleData(
      JSON.stringify({ kind: 'castcut-cast-bundle', version: 1, character: { name: 'Ada' } })
    );
    assert.equal(ok?.character.name, 'Ada');
    assert.deepEqual(ok?.galleryEntries, []);
  });

  it('finds the kept copies the Cast record links to (look plates live there)', () => {
    assert.deepEqual(
      galleryMediaIdsIn({
        looks: [
          { reference: { isolatedUrl: '/api/gallery/media/cast-plate-char-1-look-2?variant=original' } },
          { reference: { originalUrl: '/api/comfyui/view?filename=x.png&type=input' } },
        ],
        film: '/api/gallery/media/0f8a-film?variant=original&v=3',
      }),
      ['cast-plate-char-1-look-2', '0f8a-film']
    );
  });
});
