import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, afterEach, before, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

let dataDir: string;
let previousDataDir: string | undefined;

before(() => {
  previousDataDir = process.env.PROMPT_DATA_DIR;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-media-store-test-'));
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
  if (previousDataDir === undefined) {
    delete process.env.PROMPT_DATA_DIR;
  } else {
    process.env.PROMPT_DATA_DIR = previousDataDir;
  }
});

afterEach(() => {
  delete process.env.PROMPT_DATA_DIR;
});

describe('gallery-media-store', async () => {
  const {
    durableThumbRelativePath,
    persistGalleryOriginalFile,
    persistGalleryThumbFile,
    persistIdentityFile,
    readGalleryMediaVariant,
    readGalleryOriginalFile,
    readGalleryThumbFile,
    readIdentityFile,
  } = await import('./media-store');

  describe('when server storage is disabled (no PROMPT_DATA_DIR)', () => {
    it('persistGalleryOriginalFile throws', () => {
      assert.throws(() =>
        persistGalleryOriginalFile({ entryId: 'e1', buffer: Buffer.from('x') })
      );
    });

    it('persistGalleryThumbFile throws', () => {
      assert.throws(() => persistGalleryThumbFile({ entryId: 'e1', buffer: Buffer.from('x') }));
    });

    it('persistIdentityFile throws', () => {
      assert.throws(() => persistIdentityFile({ buffer: Buffer.from('x') }));
    });

    it('readGalleryOriginalFile returns null', () => {
      assert.equal(readGalleryOriginalFile({ entryId: 'e1' }), null);
    });

    it('readGalleryThumbFile returns null', () => {
      assert.equal(readGalleryThumbFile({ entryId: 'e1' }), null);
    });

    it('readIdentityFile returns null', () => {
      assert.equal(readIdentityFile({}), null);
    });
  });

  describe('when server storage is enabled', () => {
    it('round-trips an original file with metadata', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const buffer = Buffer.from('original-bytes');
      const { relativePath } = persistGalleryOriginalFile({
        userId: 'user-1',
        entryId: 'entry-1',
        buffer,
        contentType: 'image/png',
        filename: 'photo.png',
      });
      assert.equal(relativePath, 'gallery-media/user-1/entry-1/original');
      const read = readGalleryOriginalFile({ userId: 'user-1', entryId: 'entry-1' });
      assert.ok(read);
      assert.equal(read?.buffer.toString(), 'original-bytes');
      assert.equal(read?.contentType, 'image/png');
      assert.equal(read?.filename, 'photo.png');
    });

    it('defaults contentType/filename when omitted', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      persistGalleryOriginalFile({ entryId: 'entry-defaults', buffer: Buffer.from('x') });
      const read = readGalleryOriginalFile({ entryId: 'entry-defaults' });
      assert.equal(read?.contentType, 'application/octet-stream');
      assert.equal(read?.filename, 'upload.png');
    });

    it('falls back to _global owner when userId is blank or missing', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistGalleryOriginalFile({
        userId: '   ',
        entryId: 'entry-global',
        buffer: Buffer.from('x'),
      });
      assert.equal(relativePath, 'gallery-media/_global/entry-global/original');
    });

    it('falls back to _global owner when userId contains unsafe characters', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistGalleryOriginalFile({
        userId: '../../etc',
        entryId: 'entry-unsafe-owner',
        buffer: Buffer.from('x'),
      });
      assert.equal(relativePath, 'gallery-media/_global/entry-unsafe-owner/original');
    });

    it('rejects an unsafe entryId', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      assert.throws(
        () => persistGalleryOriginalFile({ entryId: '../escape', buffer: Buffer.from('x') }),
        /Invalid gallery id/
      );
    });

    it('rejects "." and ".." entryId even though they match the character class', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      assert.throws(() => persistGalleryOriginalFile({ entryId: '.', buffer: Buffer.from('x') }));
      assert.throws(() =>
        persistGalleryOriginalFile({ entryId: '..', buffer: Buffer.from('x') })
      );
    });

    it('rejects an out-of-range or non-integer index', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      assert.throws(() =>
        persistGalleryOriginalFile({ entryId: 'e-idx', index: -1, buffer: Buffer.from('x') })
      );
      assert.throws(() =>
        persistGalleryOriginalFile({ entryId: 'e-idx', index: 64, buffer: Buffer.from('x') })
      );
      assert.throws(() =>
        persistGalleryOriginalFile({ entryId: 'e-idx', index: 1.5, buffer: Buffer.from('x') })
      );
    });

    it('accepts the max valid index (63) and uses suffixed filenames for index > 0', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistGalleryOriginalFile({
        entryId: 'e-idx-max',
        index: 63,
        buffer: Buffer.from('x'),
      });
      assert.equal(relativePath, 'gallery-media/_global/e-idx-max/original-63');
    });

    it('index 0 uses the flat "original" filename (no migration needed for existing single-image entries)', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistGalleryOriginalFile({
        entryId: 'e-idx-zero',
        index: 0,
        buffer: Buffer.from('x'),
      });
      assert.equal(relativePath, 'gallery-media/_global/e-idx-zero/original');
    });

    it('readGalleryOriginalFile returns null for a missing file', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      assert.equal(readGalleryOriginalFile({ entryId: 'never-written' }), null);
    });

    it('readGalleryOriginalFile tolerates a missing/corrupt meta file, serving octet-stream', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      persistGalleryOriginalFile({ entryId: 'e-no-meta', buffer: Buffer.from('bytes') });
      const metaPath = path.join(
        dataDir,
        'gallery-media',
        '_global',
        'e-no-meta',
        'original.meta.json'
      );
      fs.writeFileSync(metaPath, 'not json');
      const read = readGalleryOriginalFile({ entryId: 'e-no-meta' });
      assert.equal(read?.buffer.toString(), 'bytes');
      assert.equal(read?.contentType, 'application/octet-stream');
      assert.equal(read?.filename, undefined);
    });

    it('round-trips a thumb file and matches durableThumbRelativePath', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistGalleryThumbFile({
        userId: 'user-2',
        entryId: 'entry-thumb',
        buffer: Buffer.from('thumb-bytes'),
      });
      assert.equal(relativePath, durableThumbRelativePath('user-2', 'entry-thumb'));
      assert.equal(relativePath, 'gallery-media/user-2/entry-thumb/thumb.webp');
      const read = readGalleryThumbFile({ userId: 'user-2', entryId: 'entry-thumb' });
      assert.equal(read?.buffer.toString(), 'thumb-bytes');
      assert.equal(read?.contentType, 'image/webp');
    });

    it('uses a suffixed thumb filename for index > 0', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistGalleryThumbFile({
        entryId: 'entry-thumb-idx',
        index: 2,
        buffer: Buffer.from('x'),
      });
      assert.equal(relativePath, 'gallery-media/_global/entry-thumb-idx/thumb-2.webp');
    });

    it('readGalleryThumbFile returns null for a missing file', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      assert.equal(readGalleryThumbFile({ entryId: 'never-written-thumb' }), null);
    });

    it('round-trips an identity file with metadata', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      const { relativePath } = persistIdentityFile({
        userId: 'user-3',
        buffer: Buffer.from('identity-bytes'),
        contentType: 'image/jpeg',
        filename: 'me.jpg',
      });
      assert.equal(relativePath, 'identity/user-3/lock');
      const read = readIdentityFile({ userId: 'user-3' });
      assert.equal(read?.buffer.toString(), 'identity-bytes');
      assert.equal(read?.contentType, 'image/jpeg');
    });

    it('readIdentityFile returns null for a missing file', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      assert.equal(readIdentityFile({ userId: 'never-set-up' }), null);
    });

    it('readIdentityFile tolerates a missing/corrupt meta file', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      persistIdentityFile({ userId: 'user-4', buffer: Buffer.from('x') });
      const metaPath = path.join(dataDir, 'identity', 'user-4', 'lock.meta.json');
      fs.rmSync(metaPath);
      const read = readIdentityFile({ userId: 'user-4' });
      assert.equal(read?.contentType, 'application/octet-stream');
    });

    it('the original variant is the original or nothing — never the thumbnail (D18)', () => {
      process.env.PROMPT_DATA_DIR = dataDir;
      persistGalleryOriginalFile({
        entryId: 'entry-gone',
        buffer: Buffer.from('full-size'),
        contentType: 'image/png',
        filename: 'still.png',
      });
      persistGalleryThumbFile({ entryId: 'entry-gone', buffer: Buffer.from('thumb') });
      const read = readGalleryMediaVariant({ entryId: 'entry-gone', variant: 'original' });
      assert.equal(read?.buffer.toString(), 'full-size');
      assert.equal(read?.contentType, 'image/png');

      fs.rmSync(path.join(dataDir, 'gallery-media', '_global', 'entry-gone', 'original'));
      assert.equal(readGalleryMediaVariant({ entryId: 'entry-gone', variant: 'original' }), null);
      // The thumbnail is still there, and still served as one.
      const thumb = readGalleryMediaVariant({ entryId: 'entry-gone', variant: 'thumb' });
      assert.equal(thumb?.buffer.toString(), 'thumb');
      assert.equal(thumb?.contentType, 'image/webp');
    });
  });
});
