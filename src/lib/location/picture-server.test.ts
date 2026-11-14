import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it, mock } from 'node:test';
import sharp from 'sharp';

mock.module('server-only', { defaultExport: {}, namedExports: {} });
// The app's kept copies go to a scratch folder, never a real data folder.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'castcut-empty-place-'));
process.env.CASTCUT_INPUT_STORE_DIR = path.join(scratch, 'comfy-inputs');
process.env.PROMPT_DATA_DIR = scratch;

const COMFY = 'http://127.0.0.1:8188';

/** The fake ComfyUI's object_info: every node of the place's graph, its files installed. */
async function objectInfoFor() {
  const { locationPictureGraph } = await import('./picture');
  const info: Record<string, { input: { required: Record<string, unknown> } }> = {};
  for (const node of Object.values(locationPictureGraph({ name: 'x', look: 'y' } as never, 0))) {
    const required: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node.inputs)) {
      if (typeof value === 'string' && /\.(safetensors|gguf|pt|bin)$/.test(value)) {
        required[key] = [[value]];
      }
    }
    info[node.class_type] = { input: { required } };
  }
  return info;
}

describe('an empty place rendered on the server (Phase 3)', () => {
  after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  it('its fixed graph queued as it is, waited for, read back and uploaded under its name', async () => {
    const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#789' } })
      .png()
      .toBuffer();
    const OBJECT_INFO = await objectInfoFor();
    const prompts: { prompt: Record<string, { class_type: string; inputs: Record<string, unknown> }> }[] = [];
    const uploads: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === '/prompt' && init?.method === 'POST') {
        prompts.push(JSON.parse(String(init.body)));
        return Response.json({ prompt_id: 'room-1', number: 1, node_errors: {} });
      }
      if (url.pathname === '/view') {
        return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
      }
      if (url.pathname === '/upload/image' && init?.method === 'POST') {
        const image = (init.body as FormData).get('image') as File;
        uploads.push(image.name);
        return Response.json({ name: image.name, subfolder: '', type: 'input' });
      }
      if (url.pathname.startsWith('/object_info')) return Response.json(OBJECT_INFO);
      return Response.json({});
    }) as typeof fetch;
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const { renderEmptyPlace } = await import('./picture-client');
      const { locationPictureGraph } = await import('./picture');
      const { serverEmptyPlaceSteps } = await import('./picture-server');
      const asked: string[] = [];
      const place = { name: 'Salt & Sea Café', look: 'a small seaside café, blue shutters', setting: 'interior' };
      const name = await renderEmptyPlace(
        place as never,
        'scene-room-test.png',
        serverEmptyPlaceSteps({
          comfyUrl: COMFY,
          fetchImpl,
          status: async promptId => {
            asked.push(promptId);
            return {
              promptId,
              status: 'completed',
              comfyUrl: COMFY,
              images: [{ filename: 'room-out.png', subfolder: '', type: 'output' }],
            };
          },
          sleep: async () => undefined,
        })
      );
      assert.equal(prompts.length, 1, 'one render queued');
      const sent = prompts[0]!.prompt;
      const graph = locationPictureGraph(place as never, 0);
      assert.deepEqual(
        Object.keys(sent).sort(),
        Object.keys(graph).sort(),
        'the place’s own graph, not a workflow built around it'
      );
      assert.deepEqual(
        Object.values(sent).map(node => node.class_type),
        Object.values(graph).map(node => node.class_type)
      );
      assert.match(JSON.stringify(sent), /seaside café/);
      assert.deepEqual(asked, ['room-1']);
      assert.equal(uploads.length, 1, 'the picture put in ComfyUI’s inputs');
      assert.match(uploads[0]!, /^scene-room-test/);
      assert.equal(name, uploads[0], 'the name ComfyUI keeps it under');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a render ComfyUI refuses says why', async () => {
    const OBJECT_INFO = await objectInfoFor();
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === '/prompt' && init?.method === 'POST') {
        return Response.json(
          { error: { message: 'Value not in list: unet_name' }, node_errors: {} },
          { status: 400 }
        );
      }
      if (url.pathname.startsWith('/object_info')) return Response.json(OBJECT_INFO);
      return Response.json({});
    }) as typeof fetch;
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const { renderEmptyPlace } = await import('./picture-client');
      const { serverEmptyPlaceSteps } = await import('./picture-server');
      await assert.rejects(
        renderEmptyPlace(
          { name: 'Pier', look: 'a wooden pier', setting: 'exterior' } as never,
          'x.png',
          serverEmptyPlaceSteps({ comfyUrl: COMFY, fetchImpl, sleep: async () => undefined })
        ),
        /Value not in list: unet_name/
      );
    } finally {
      globalThis.fetch = original;
    }
  });
});
