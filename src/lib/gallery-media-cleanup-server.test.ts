import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import { closeStudioDb } from './sqlite/studio-db';
import { writeNamespaceStorage } from './sqlite/namespace-storage';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

type Cleanup = typeof import('./gallery-media-cleanup-server');
let scanGalleryMediaLeftovers: Cleanup['scanGalleryMediaLeftovers'];
let removeGalleryMediaLeftovers: Cleanup['removeGalleryMediaLeftovers'];
let removeDeletedGalleryEntryMedia: Cleanup['removeDeletedGalleryEntryMedia'];

before(async () => {
  ({ scanGalleryMediaLeftovers, removeGalleryMediaLeftovers, removeDeletedGalleryEntryMedia } =
    await import('./gallery-media-cleanup-server'));
});

const id = (n: number) => `0000000${n}-aaaa-4bbb-8ccc-dddddddddddd`;
const LIVE = id(1);
const LINKED = id(2);
const OLD = id(3);
const RECENT = id(4);
const BROWSER = id(5);
const PLATE = 'cast-plate-char-11111111-1111-4111-8111-111111111111-look-x';
const DAY = 86_400_000;

let dir = '';
const savedDataDir = process.env.PROMPT_DATA_DIR;

function copy(owner: string, name: string, ageDays: number) {
  const folder = path.join(dir, 'gallery-media', owner, name);
  fs.mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'original');
  fs.writeFileSync(file, 'x'.repeat(1000));
  const at = new Date(Date.now() - ageDays * DAY);
  fs.utimesSync(file, at, at);
}

const exists = (owner: string, name: string) =>
  fs.existsSync(path.join(dir, 'gallery-media', owner, name));

beforeEach(() => {
  closeStudioDb();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gallery-media-cleanup-'));
  process.env.PROMPT_DATA_DIR = dir;
});

afterEach(() => {
  closeStudioDb();
  fs.rmSync(dir, { recursive: true, force: true });
  if (savedDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
  else process.env.PROMPT_DATA_DIR = savedDataDir;
});

describe('gallery-media-cleanup-server', () => {
  it('offers only old, unused entry copies; never Cast plate copies', async () => {
    for (const name of [LIVE, LINKED, OLD, BROWSER, PLATE]) copy('_global', name, 30);
    copy('_global', RECENT, 1);
    writeNamespaceStorage('comfy-gallery', [{ id: LIVE, prompt: 'p', status: 'success' }]);
    // A Day still showing a deleted entry's copy; and a bare id in history, which keeps nothing.
    writeNamespaceStorage('settings-cache', { still: `/api/gallery/media/${LINKED}?variant=original` });
    writeNamespaceStorage('prompt-history', [{ galleryEntryId: OLD }]);

    const scan = await scanGalleryMediaLeftovers({ browserIds: [BROWSER] });
    assert.deepEqual(scan.removable, [OLD]);
    assert.equal(scan.removableBytes, 1000);
    assert.equal(scan.keptInUse, 3);
    assert.equal(scan.keptRecent, 1);

    // Asking for more than the scan offers removes only what it offers.
    const result = await removeGalleryMediaLeftovers({ browserIds: [BROWSER], ids: [OLD, LIVE, RECENT] });
    assert.deepEqual(result, { removed: 1, freedBytes: 1000 });
    assert.equal(exists('_global', OLD), false);
    for (const name of [LIVE, LINKED, RECENT, BROWSER, PLATE]) assert.ok(exists('_global', name), name);
  });

  it('deleting entries removes their copies unless something links to them', async () => {
    copy('user-1', LIVE, 0);
    copy('user-1', LINKED, 0);
    writeNamespaceStorage('settings-cache', { still: `/api/gallery/media/${LINKED}` }, 'user-1');
    const result = await removeDeletedGalleryEntryMedia({ userId: 'user-1', ids: [LIVE, LINKED] });
    assert.equal(result.removed, 1);
    assert.equal(exists('user-1', LIVE), false);
    assert.ok(exists('user-1', LINKED));
  });

  it('writing the deleted-ids list triggers that removal for the newly deleted', async () => {
    copy('_global', OLD, 0);
    copy('_global', RECENT, 0);
    writeNamespaceStorage('gallery-deleted-ids', [RECENT]);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(exists('_global', RECENT), false);
    copy('_global', RECENT, 0);
    writeNamespaceStorage('gallery-deleted-ids', [RECENT, OLD]);
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(exists('_global', OLD), false);
    // Already on the list before this write: not touched again.
    assert.ok(exists('_global', RECENT));
  });
});
