import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, before, beforeEach, describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

type Server = typeof import('./media-backup-server');
let appendMediaRestoreChunk: Server['appendMediaRestoreChunk'];
let mediaBackupTar: Server['mediaBackupTar'];
let runMediaRestore: Server['runMediaRestore'];
let startMediaRestoreUpload: Server['startMediaRestoreUpload'];

before(async () => {
  ({ appendMediaRestoreChunk, mediaBackupTar, runMediaRestore, startMediaRestoreUpload } =
    await import('./media-backup-server'));
});

let dir = '';
const savedDataDir = process.env.PROMPT_DATA_DIR;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-backup-'));
  process.env.PROMPT_DATA_DIR = dir;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  if (savedDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
  else process.env.PROMPT_DATA_DIR = savedDataDir;
});

function write(rel: string, text: string) {
  const file = path.join(dir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** A ComfyUI with an input and an output folder, for view / HEAD / upload. */
function fakeComfy(files: Map<string, Uint8Array>) {
  return async (url: string, init?: RequestInit): Promise<Response> => {
    const parsed = new URL(url);
    if (parsed.pathname === '/view') {
      const p = parsed.searchParams;
      const key = `${p.get('type')}/${p.get('subfolder')}/${p.get('filename')}`;
      const bytes = files.get(key);
      if (!bytes) return new Response('missing', { status: 404 });
      return new Response(init?.method === 'HEAD' ? null : (bytes as BodyInit), { status: 200 });
    }
    if (parsed.pathname === '/upload/image') {
      const form = init?.body as FormData;
      const image = form.get('image') as File;
      const key = `${form.get('type')}/${form.get('subfolder')}/${image.name}`;
      files.set(key, new Uint8Array(await image.arrayBuffer()));
      return Response.json({ name: image.name });
    }
    return new Response('no', { status: 404 });
  };
}

async function collect(stream: AsyncGenerator<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const part of stream) parts.push(part);
  return Buffer.concat(parts);
}

describe('media-backup-server', () => {
  it('backs up one owner and restores into another, with ComfyUI pictures', async () => {
    write('gallery-media/user-admin-default/e1/original', 'ORIGINAL');
    write('gallery-media/user-admin-default/e1/thumb.webp', 'THUMB');
    write('gallery-media/someone-else/e9/original', 'NOT MINE');
    write('identity/user-admin-default/lock', 'LOCK');
    const oldComfy = new Map<string, Uint8Array>([
      ['input//lock.png', new TextEncoder().encode('LOCKPNG')],
      ['output/cast/ref.png', new TextEncoder().encode('REFPNG')],
    ]);

    const tar = await collect(
      mediaBackupTar({
        owner: 'user-admin-default',
        comfyUrl: 'http://old:8188',
        comfyFiles: [
          { filename: 'lock.png', subfolder: '', type: 'input' },
          { filename: 'ref.png', subfolder: 'cast', type: 'output' },
          { filename: 'gone.png', subfolder: '', type: 'input' },
        ],
        fetchImpl: fakeComfy(oldComfy),
      })
    );
    fs.rmSync(path.join(dir, 'gallery-media'), { recursive: true });
    fs.rmSync(path.join(dir, 'identity'), { recursive: true });

    // Upload in uneven chunks, one repeated, as a retrying browser would.
    const id = startMediaRestoreUpload();
    let held = 0;
    held = appendMediaRestoreChunk(id, 0, tar.subarray(0, 700));
    held = appendMediaRestoreChunk(id, 0, tar.subarray(0, 700));
    held = appendMediaRestoreChunk(id, held, tar.subarray(held));
    assert.equal(held, tar.length);

    const newComfy = new Map<string, Uint8Array>();
    const job = await runMediaRestore({
      uploadId: id,
      owner: '_global',
      comfyUrl: 'http://new:8188',
      fetchImpl: fakeComfy(newComfy),
    });
    assert.equal(job.state, 'done', job.message);
    assert.deepEqual(job.errors, []);
    assert.equal(job.galleryFiles, 2);
    assert.equal(job.identityFiles, 1);
    assert.equal(job.comfyUploaded, 2);
    assert.equal(fs.readFileSync(path.join(dir, 'gallery-media/_global/e1/original'), 'utf8'), 'ORIGINAL');
    assert.equal(fs.readFileSync(path.join(dir, 'identity/_global/lock'), 'utf8'), 'LOCK');
    assert.equal(fs.existsSync(path.join(dir, 'gallery-media/_global/e9')), false);
    assert.equal(new TextDecoder().decode(newComfy.get('output/cast/ref.png')), 'REFPNG');
    assert.equal(new TextDecoder().decode(newComfy.get('input//lock.png')), 'LOCKPNG');

    // A second restore of the same file skips everything already there.
    const again = startMediaRestoreUpload();
    appendMediaRestoreChunk(again, 0, tar);
    const second = await runMediaRestore({
      uploadId: again,
      owner: '_global',
      comfyUrl: 'http://new:8188',
      fetchImpl: fakeComfy(newComfy),
    });
    assert.equal(second.state, 'done');
    assert.equal(second.skipped, 5);
    assert.equal(second.galleryFiles + second.comfyUploaded, 0);
  });

  it('fails a truncated upload instead of half-restoring silently', async () => {
    write('gallery-media/_global/e1/original', 'x'.repeat(5000));
    const tar = await collect(
      mediaBackupTar({ owner: '_global', comfyUrl: 'http://c', comfyFiles: [] })
    );
    const id = startMediaRestoreUpload();
    appendMediaRestoreChunk(id, 0, tar.subarray(0, 2048));
    const job = await runMediaRestore({ uploadId: id, owner: 'other', comfyUrl: 'http://c' });
    assert.equal(job.state, 'failed');
  });

  it('rejects a chunk that skips ahead', () => {
    const id = startMediaRestoreUpload();
    assert.throws(() => appendMediaRestoreChunk(id, 10, new Uint8Array(4)), /at 0 bytes/);
  });
});
