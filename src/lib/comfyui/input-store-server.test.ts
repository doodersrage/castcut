import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  captureComfyInputs,
  comfyInputCopyPath,
  hasComfyInputCopy,
  keepComfyInputCopy,
  readComfyInputCopy,
  removeComfyInputCopies,
  restoreComfyInputsFromStore,
} from './input-store-server';
import { forgetKnownComfyInputs, uploadComfyInputContent } from './comfy-input-upload-server';

/** Fake ComfyUI: GET/HEAD /view and POST /upload/image over an in-memory folder. */
function fakeComfy(initial: Record<string, Uint8Array> = {}) {
  const files = new Map(Object.entries(initial));
  const uploads: Array<{ name: string; type: string; subfolder: string }> = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    const method = init?.method ?? 'GET';
    if (parsed.pathname === '/view') {
      const key = `${parsed.searchParams.get('type')}/${parsed.searchParams.get('subfolder') ?? ''}/${parsed.searchParams.get('filename')}`;
      const bytes = files.get(key);
      if (!bytes) return new Response(null, { status: 404 });
      return method === 'HEAD'
        ? new Response(null, { status: 200, headers: { 'content-length': String(bytes.length) } })
        : new Response(bytes as BlobPart);
    }
    if (parsed.pathname === '/upload/image' && method === 'POST') {
      const form = init!.body as FormData;
      const image = form.get('image') as File;
      const type = String(form.get('type') ?? 'input');
      const subfolder = String(form.get('subfolder') ?? '');
      files.set(`${type}/${subfolder}/${image.name}`, new Uint8Array(await image.arrayBuffer()));
      uploads.push({ name: image.name, type, subfolder });
      return Response.json({ name: image.name, subfolder, type });
    }
    return new Response(null, { status: 404 });
  };
  return { files, uploads, fetchImpl };
}

describe('comfy input store', () => {
  let root: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'input-store-'));
    forgetKnownComfyInputs();
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('keeps names inside the store and refuses unsafe ones', () => {
    assert.equal(
      comfyInputCopyPath({ filename: 'a.png', subfolder: 'day-plates' }, root),
      path.join(root, 'input', 'day-plates', 'a.png')
    );
    assert.equal(comfyInputCopyPath({ filename: '../a.png' }, root), null);
    assert.equal(comfyInputCopyPath({ filename: 'a.png', subfolder: '../../etc' }, root), null);
    assert.equal(comfyInputCopyPath({ filename: 'a.png', type: 'temp' }, root), null);
  });

  it('keeps, reads and removes a copy', () => {
    const ref = { filename: 'cast-plate-base-1.png' };
    assert.equal(keepComfyInputCopy(ref, new Uint8Array([1, 2, 3]), root), true);
    assert.ok(hasComfyInputCopy(ref, root));
    assert.deepEqual([...readComfyInputCopy(ref, root)!], [1, 2, 3]);
    assert.equal(removeComfyInputCopies([ref], root), 1);
    assert.equal(hasComfyInputCopy(ref, root), false);
  });

  it('an upload with keepCopy leaves a copy; without it, none', async () => {
    const comfy = fakeComfy();
    const kept = await uploadComfyInputContent({
      baseUrl: 'http://comfy',
      bytes: new Uint8Array([9, 9]),
      filename: 'fitting-garment-packshot.png',
      fetchImpl: comfy.fetchImpl,
      keepCopy: true,
      storeRoot: root,
    });
    assert.ok(hasComfyInputCopy({ filename: kept.name }, root));
    const scratch = await uploadComfyInputContent({
      baseUrl: 'http://comfy',
      bytes: new Uint8Array([7]),
      filename: 'check-sample.webp',
      fetchImpl: comfy.fetchImpl,
      storeRoot: root,
    });
    assert.equal(hasComfyInputCopy({ filename: scratch.name }, root), false);
  });

  it('puts missing files back into a new ComfyUI from the copies', async () => {
    keepComfyInputCopy({ filename: 'a.png' }, new Uint8Array([1]), root);
    const comfy = fakeComfy();
    const outcome = await restoreComfyInputsFromStore(
      'http://new-comfy',
      [
        { filename: 'a.png', subfolder: '', type: 'input' },
        { filename: 'never-kept.png', subfolder: '', type: 'input' },
      ],
      { fetchImpl: comfy.fetchImpl, root }
    );
    assert.deepEqual(
      outcome.restored.map(ref => ref.filename),
      ['a.png']
    );
    assert.deepEqual(
      outcome.stillMissing.map(ref => ref.filename),
      ['never-kept.png']
    );
    assert.deepEqual(comfy.uploads, [{ name: 'a.png', type: 'input', subfolder: '' }]);
  });

  it('captures files ComfyUI has that the store lacks, once', async () => {
    const comfy = fakeComfy({ 'input//old.png': new Uint8Array([4, 5]) });
    const refs = [{ filename: 'old.png' }, { filename: 'gone.png' }, { filename: 'old.png' }];
    assert.equal(await captureComfyInputs('http://comfy', refs, { fetchImpl: comfy.fetchImpl, root }), 1);
    assert.deepEqual([...readComfyInputCopy({ filename: 'old.png' }, root)!], [4, 5]);
    assert.equal(await captureComfyInputs('http://comfy', refs, { fetchImpl: comfy.fetchImpl, root }), 0);
  });
});
