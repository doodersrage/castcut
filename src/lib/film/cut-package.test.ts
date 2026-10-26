import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildZipBlob } from '../gallery/zip-core';
import type { MediaUrlStatus } from './cut-missing';
import { buildCutPackage, importCutPackage } from './cut-package-client';
import { cutMediaUrls, packageAsVersion, parseCutPackageManifest, rewriteCutMedia } from './cut-package';

const cut = {
  sources: ['scenes' as const],
  extras: [{ key: 'x:1', kind: 'media' as const, title: 'Clip', url: '/clip.mp4', shotKind: 'clip' as const, thumbUrl: '/thumb.png' }],
  options: {
    crossfadeSec: 0,
    audioBedUrl: '/music.mp3',
    shotEdits: {
      shots: {
        'scenes:s1': { trimStartSec: 1, pin: { url: '/take.png', kind: 'still' as const, at: 1, previous: { url: '/old.png', kind: 'still' as const, at: 0 } } },
      },
    },
  },
  versions: [{ id: 'v1', name: 'Long cut', savedAt: 2, options: { crossfadeSec: 0, audioBedUrl: '/music.mp3' } }],
};

const bytesOf = (url: string) => new TextEncoder().encode(`bytes of ${url}`);
const fetcher = (async (url: string) =>
  url === '/gone.png'
    ? new Response('', { status: 404 })
    : new Response(bytesOf(url), {
        status: 200,
        headers: { 'content-type': url.endsWith('.mp4') ? 'video/mp4' : url.endsWith('.mp3') ? 'audio/mpeg' : 'image/png' },
      })) as typeof fetch;

describe('a portable Cut package (M4 F7)', () => {
  it('finds every medium the cut points at, and rewrites them', () => {
    assert.deepEqual(cutMediaUrls(cut).sort(), ['/clip.mp4', '/music.mp3', '/old.png', '/take.png', '/thumb.png']);
    const moved = rewriteCutMedia(cut, new Map([['/take.png', '/api/gallery/media/x?variant=original']]));
    assert.equal(moved.options.shotEdits.shots['scenes:s1'].pin.url, '/api/gallery/media/x?variant=original');
    assert.equal(moved.options.shotEdits.shots['scenes:s1'].trimStartSec, 1, 'other fields untouched');
  });

  it('a full package restores on a machine without the media, and a second import reuses it', async () => {
    const built = await buildCutPackage({ cut, name: 'Rooftop', castName: 'Nora', full: true, fetcher, now: 5 });
    assert.equal(built.media, 5);
    assert.equal(built.packed, 5);
    assert.deepEqual(built.unreadable, []);

    // A clean machine: none of the original URLs answer, nothing is stored yet.
    const storedHere = new Map<string, number>();
    const check = async (url: string): Promise<MediaUrlStatus> =>
      url.startsWith('/api/gallery/media/') && storedHere.has(url) ? 'ok' : 'missing';
    const store = async (entryId: string, file: File) => {
      const url = `/api/gallery/media/${entryId}?variant=original`;
      storedHere.set(url, file.size);
      return url;
    };
    const first = await importCutPackage(built.blob, { check, store });
    assert.ok(first.ok);
    if (!first.ok) return;
    assert.equal(first.result.stored, 5);
    assert.deepEqual(first.result.missing, []);
    const pin = first.result.cut.options!.shotEdits!.shots!['scenes:s1']!.pin!;
    assert.match(pin.url, /^\/api\/gallery\/media\/pkg-[0-9a-f]{32}\?variant=original$/);
    assert.match(pin.previous!.url, /^\/api\/gallery\/media\/pkg-/);
    assert.equal(first.result.cut.versions![0]!.options!.audioBedUrl, first.result.cut.options!.audioBedUrl);
    assert.equal(first.result.manifest.castName, 'Nora');

    const second = await importCutPackage(built.blob, { check, store });
    assert.ok(second.ok && second.result.reused === 5 && second.result.stored === 0);

    const version = packageAsVersion(first.result.manifest, first.result.cut, 9);
    assert.equal(version.name, 'Imported · Rooftop');
  });

  it('without server storage, small files are kept in the cut itself', async () => {
    const built = await buildCutPackage({ cut, name: 'Inline', full: true, fetcher, now: 1 });
    const imported = await importCutPackage(built.blob, {
      check: async () => 'missing',
      store: async () => null,
    });
    assert.ok(imported.ok);
    if (!imported.ok) return;
    assert.equal(imported.result.inlined, 5);
    assert.deepEqual(imported.result.missing, []);
    const pin = imported.result.cut.options!.shotEdits!.shots!['scenes:s1']!.pin!;
    assert.match(pin.url, /^data:image\/png;base64,/);
    assert.equal(Buffer.from(pin.url.split(',')[1]!, 'base64').toString(), 'bytes of /take.png');
  });

  it('a light package keeps URLs that answer and says what is missing', async () => {
    const built = await buildCutPackage({ cut, name: 'Light', full: false, now: 1 });
    assert.equal(built.packed, 0);
    const imported = await importCutPackage(built.blob, {
      check: async url => (url === '/music.mp3' ? 'ok' : 'missing'),
      store: async () => null,
    });
    assert.ok(imported.ok);
    if (!imported.ok) return;
    assert.equal(imported.result.kept, 1);
    assert.equal(imported.result.missing.length, 4);
  });

  it('refuses a newer format and anything that isn’t a package', async () => {
    assert.match(
      (parseCutPackageManifest({ format: 'castcut-cut-package', version: 2, cut: {} }) as { error: string }).error,
      /newer Castcut/
    );
    const notOurs = await importCutPackage(buildZipBlob([{ filename: 'a.txt', data: new Uint8Array([1]) }]));
    assert.equal(notOurs.ok, false);
    const notZip = await importCutPackage(new Blob(['hello']));
    assert.equal(notZip.ok, false);
  });
});
