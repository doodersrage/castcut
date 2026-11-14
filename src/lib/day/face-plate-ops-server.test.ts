import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it, mock } from 'node:test';
import sharp from 'sharp';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

// The app's kept copies go to a scratch folder, never a real data folder.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'castcut-face-plate-'));
process.env.CASTCUT_INPUT_STORE_DIR = path.join(scratch, 'comfy-inputs');
process.env.PROMPT_DATA_DIR = scratch;

const COMFY = 'http://127.0.0.1:8188';

/** A fake ComfyUI: /view serves `files`, /upload/image takes pictures and names them. */
function fakeComfy(files: Record<string, Buffer>) {
  const uploads: Array<{ name: string; bytes: number }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.pathname === '/view') {
      const file = files[url.searchParams.get('filename') ?? ''];
      if (!file || init?.method === 'HEAD') return new Response(null, { status: file ? 200 : 404 });
      return new Response(new Uint8Array(file), { headers: { 'content-type': 'image/png' } });
    }
    if (url.pathname === '/upload/image' && init?.method === 'POST') {
      const form = init.body as FormData;
      const image = form.get('image') as File;
      uploads.push({ name: image.name, bytes: image.size });
      return Response.json({ name: image.name, subfolder: '', type: 'input' });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, uploads };
}

const plate = () =>
  sharp({ create: { width: 600, height: 900, channels: 3, background: '#9a7' } }).png().toBuffer();

describe('a face plate on the server (Phase 3)', () => {
  let original: typeof fetch;
  before(() => {
    original = globalThis.fetch;
  });
  after(() => {
    globalThis.fetch = original;
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('reads the page’s ComfyUI picture URL from ComfyUI’s own /view', async () => {
    const { loadPictureOnServer } = await import('./face-plate-ops-server');
    const { fetchImpl } = fakeComfy({ 'keep.png': await plate() });
    const blob = await loadPictureOnServer('/api/comfyui/view?filename=keep.png&subfolder=&type=input', {
      comfyUrl: COMFY,
      fetchImpl,
    });
    assert.ok(blob && blob.size > 0);
    const missing = await loadPictureOnServer('/api/comfyui/view?filename=gone.png&type=input', {
      comfyUrl: COMFY,
      fetchImpl,
    });
    assert.equal(missing, null);
    assert.equal(await loadPictureOnServer('/some/page/path.png', { comfyUrl: COMFY, fetchImpl }), null);
  });

  it('the Keep’s face cut where the face is, uploaded to ComfyUI and kept in the scratch store', async () => {
    const { serverFacePlateOps } = await import('./face-plate-ops-server');
    const { resolveDayVacationFaceBreakPlate, clearDayVacationFaceBreakCache } = await import(
      './vacation-face-crop'
    );
    clearDayVacationFaceBreakCache();
    const comfy = fakeComfy({ 'keep.png': await plate() });
    globalThis.fetch = comfy.fetchImpl;
    const located: Array<{ width: number; height: number }> = [];
    const ops = {
      ...serverFacePlateOps({ comfyUrl: COMFY, fetchImpl: comfy.fetchImpl }),
      // ComfyUI's face detector, answered here: a face high in the frame.
      locate: async (blob: Blob) => {
        const meta = await sharp(new Uint8Array(await blob.arrayBuffer())).metadata();
        located.push({ width: meta.width!, height: meta.height! });
        return { available: true as const, face: { x: 240, y: 90, width: 120, height: 150 } };
      },
      isolateOnWhite: async (file: File) => file,
    };
    const result = await resolveDayVacationFaceBreakPlate({
      bodyPlate: { filename: 'keep.png', source: 'keep' } as never,
      character: null,
      model: 'qwen-image-edit-2511',
      comfyUrl: COMFY,
      ops,
    });
    assert.deepEqual(located, [{ width: 600, height: 900 }]);
    assert.equal(comfy.uploads.length, 1);
    assert.match(comfy.uploads[0]!.name, /^day-vacation-face-/);
    assert.ok(result.facePlate?.filename);
    assert.equal(result.autoCropped, true);
    assert.equal(result.noFaceFound, undefined);
    // The crop is the one cut around the found face (cropFaceBoxFromBlob, the page's too).
    const kept = fs
      .readdirSync(path.join(scratch, 'comfy-inputs', 'input'))
      .map(name => fs.readFileSync(path.join(scratch, 'comfy-inputs', 'input', name)));
    assert.equal(kept.length, 1);
    const { cropFaceBoxFromBlob } = await import('../face/portrait-face-crop');
    const expected = await cropFaceBoxFromBlob(
      new Blob([new Uint8Array(await plate())], { type: 'image/png' }),
      'expected.png',
      { x: 240, y: 90, width: 120, height: 150 },
      {}
    );
    const raw = async (bytes: Uint8Array) => sharp(bytes).raw().toBuffer();
    assert.ok(
      (await raw(new Uint8Array(kept[0]!))).equals(
        await raw(new Uint8Array(await expected.arrayBuffer()))
      )
    );
  });
});
