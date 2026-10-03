import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  comfyInputExists,
  forgetKnownComfyInputs,
  sha256Hex,
  uploadComfyInputContent,
} from './comfy-input-upload-server';

type Call = { url: string; method: string; form?: FormData };

/** Fake ComfyUI input folder: HEAD /view, POST /upload/image and /upload/mask. */
function fakeComfy(initial: Record<string, number> = {}) {
  const files = new Map(Object.entries(initial));
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const parsed = new URL(url);
    calls.push({ url, method, form: init?.body instanceof FormData ? init.body : undefined });
    if (parsed.pathname === '/view' && method === 'HEAD') {
      const size = files.get(parsed.searchParams.get('filename') ?? '');
      return size === undefined
        ? new Response(null, { status: 404 })
        : new Response(null, { status: 200, headers: { 'content-length': String(size) } });
    }
    if ((parsed.pathname === '/upload/image' || parsed.pathname === '/upload/mask') && method === 'POST') {
      const form = init!.body as FormData;
      const image = form.get('image') as File;
      files.set(image.name, image.size);
      return Response.json({ name: image.name, subfolder: '', type: 'input' });
    }
    return new Response('nope', { status: 500 });
  };
  return { files, calls, fetchImpl };
}

const BASE = 'http://comfy.test:8188';
const bytes = (text: string) => new TextEncoder().encode(text);

describe('comfy-input-upload-server', () => {
  beforeEach(() => forgetKnownComfyInputs());

  it('names the upload by content and keeps the prefix', async () => {
    const comfy = fakeComfy();
    const data = bytes('plate one');
    const result = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: data,
      filename: 'cast-plate-1790559828680.png',
      fetchImpl: comfy.fetchImpl,
    });
    assert.equal(result.name, `cast-plate-${sha256Hex(data).slice(0, 16)}.png`);
    assert.equal(result.reused, false);
    const upload = comfy.calls.find(call => call.method === 'POST');
    assert.equal(upload?.form?.get('overwrite'), 'true');
  });

  it('skips the upload when ComfyUI already has the same bytes, and remembers it', async () => {
    const data = bytes('same face crop');
    const name = `day-nude-face-${sha256Hex(data).slice(0, 16)}.png`;
    const comfy = fakeComfy({ [name]: data.byteLength });
    const first = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: data,
      filename: 'day-nude-face-1791063803863.png',
      fetchImpl: comfy.fetchImpl,
    });
    assert.deepEqual(first, { name, subfolder: '', type: 'input', reused: true });
    assert.equal(comfy.calls.filter(call => call.method === 'POST').length, 0);

    const headsBefore = comfy.calls.length;
    const second = await uploadComfyInputContent({
      baseUrl: `${BASE}/`,
      bytes: data,
      filename: 'day-nude-face-1791063809999.png',
      fetchImpl: comfy.fetchImpl,
    });
    assert.equal(second.reused, true);
    assert.equal(comfy.calls.length, headsBefore, 'second hit comes from the cache');
  });

  it('uploads again when the existing file has a different size', async () => {
    const data = bytes('truncated?');
    const name = `x-${sha256Hex(data).slice(0, 16)}.png`;
    const comfy = fakeComfy({ [name]: 3 });
    const result = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: data,
      filename: 'x.png',
      fetchImpl: comfy.fetchImpl,
    });
    assert.equal(result.reused, false);
    assert.equal(comfy.files.get(name), data.byteLength);
  });

  it('gives different pictures different names even under one filename', async () => {
    const comfy = fakeComfy();
    const a = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: bytes('nora'),
      filename: 'image-cutout.png',
      fetchImpl: comfy.fetchImpl,
    });
    const b = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: bytes('sam'),
      filename: 'image-cutout.png',
      fetchImpl: comfy.fetchImpl,
    });
    assert.notEqual(a.name, b.name);
    assert.equal(comfy.files.size, 2);
  });

  it('keepName uploads under the given name, overwriting, with no existence check', async () => {
    const comfy = fakeComfy({ 'identity.png': 4 });
    const result = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: bytes('new identity'),
      filename: 'identity.png',
      keepName: true,
      fetchImpl: comfy.fetchImpl,
    });
    assert.equal(result.name, 'identity.png');
    assert.equal(result.reused, false);
    assert.equal(comfy.calls.some(call => call.method === 'HEAD'), false);
    assert.equal(comfy.files.get('identity.png'), bytes('new identity').byteLength);
  });

  it('hashes a mask with its original, and posts original_ref to /upload/mask', async () => {
    const comfy = fakeComfy();
    const mask = bytes('mask');
    const onA = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: mask,
      filename: 'prompt-studio-inpaint-mask-1.png',
      kind: 'mask',
      originalRef: { filename: 'a.png' },
      fetchImpl: comfy.fetchImpl,
    });
    const onB = await uploadComfyInputContent({
      baseUrl: BASE,
      bytes: mask,
      filename: 'prompt-studio-inpaint-mask-1.png',
      kind: 'mask',
      originalRef: { filename: 'b.png' },
      fetchImpl: comfy.fetchImpl,
    });
    assert.notEqual(onA.name, onB.name);
    const post = comfy.calls.find(call => call.method === 'POST');
    assert.match(post!.url, /\/upload\/mask$/);
    assert.deepEqual(JSON.parse(String(post!.form!.get('original_ref'))), {
      filename: 'a.png',
      type: 'input',
      subfolder: '',
    });
  });

  it('reports upload failures with the HTTP status', async () => {
    const fetchImpl = async () => new Response('disk full', { status: 500 });
    await assert.rejects(
      uploadComfyInputContent({ baseUrl: BASE, bytes: bytes('x'), filename: 'x.png', fetchImpl }),
      (error: Error & { status?: number }) => error.status === 500 && /disk full/.test(error.message)
    );
  });

  it('comfyInputExists answers false on errors', async () => {
    const fetchImpl = async () => {
      throw new Error('offline');
    };
    assert.equal(await comfyInputExists(BASE, 'a.png', 1, fetchImpl), false);
  });
});
