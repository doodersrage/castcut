import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it, mock } from 'node:test';
import sharp from 'sharp';

mock.module('server-only', { defaultExport: {}, namedExports: {} });
// The app's kept copies and server store go to a scratch folder, never a real data folder.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'castcut-dress-plate-'));
process.env.CASTCUT_INPUT_STORE_DIR = path.join(scratch, 'comfy-inputs');
process.env.PROMPT_DATA_DIR = scratch;

const COMFY = 'http://127.0.0.1:8188';
const WORKFLOW = JSON.stringify({
  '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
  '2': { class_type: 'CLIPTextEncode', inputs: { text: '{{PROMPT}}', clip: ['1', 1] } },
  '3': { class_type: 'SaveImage', inputs: { images: ['1', 0], filename_prefix: 'castcut' } },
});

/** The fake ComfyUI's installed files: what the try-on's graph loads. */
const files = (...names: string[]) => [names];
const OBJECT_INFO = {
  UNETLoader: { input: { required: { unet_name: files('qwen_image_edit_2511_bf16.safetensors') } } },
  CLIPLoader: { input: { required: { clip_name: files('qwen_2.5_vl_7b.safetensors', 'qwen_2.5_vl_7b_fp8_scaled.safetensors') } } },
  VAELoader: { input: { required: { vae_name: files('qwen_image_vae.safetensors') } } },
  LoraLoaderModelOnly: { input: { required: { lora_name: files() } } },
  CheckpointLoaderSimple: { input: { required: { ckpt_name: files('model.safetensors') } } },
  ...Object.fromEntries(
    [
      'TextEncodeQwenImageEditPlus',
      'ModelSamplingAuraFlow',
      'KSampler',
      'VAEDecode',
      'SaveImage',
      'LoadImage',
      'ImageScaleBy',
      'EmptySD3LatentImage',
      'ResizeAndPadImage',
      'VAEEncode',
      'ReferenceLatent',
      'CLIPTextEncode',
    ].map(name => [name, { input: { required: {} } }])
  ),
};

describe('a dress plate made on the server (Phase 3)', () => {
  after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  it('the try-on queued, waited for, its picture uploaded and kept in the run’s store; then reused', async () => {
    const png = await sharp({ create: { width: 64, height: 96, channels: 3, background: '#a87' } })
      .png()
      .toBuffer();
    const prompts: unknown[] = [];
    const uploads: string[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === '/prompt' && init?.method === 'POST') {
        prompts.push(JSON.parse(String(init.body)));
        return Response.json({ prompt_id: `job-${prompts.length}`, number: 1, node_errors: {} });
      }
      if (url.pathname === '/view') {
        if (init?.method === 'HEAD') return new Response(null, { status: 200 });
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
      const { loadSettingsCache } = await import('../settings/cache');
      const { loadComfyUiSettings } = await import('../comfyui/settings');
      const { ensureDayDressPlate } = await import('./dress-plate-client');
      const { serverDressPlateDeps } = await import('./dress-plate-server');
      const shared = {
        ...loadSettingsCache().shared,
        selectedWorkflowFileId: 'e2e-wf',
      };
      const kept = new Map<string, import('./dress-plate-cache').DayDressPlateEntry>();
      const store = {
        all: () => [...kept.values()],
        find: (key: string) => kept.get(key) ?? null,
        save: (entry: import('./dress-plate-cache').DayDressPlateEntry) => void kept.set(entry.key, entry),
      };
      const asked: string[] = [];
      const deps = serverDressPlateDeps({
        settings: {
          shared,
          comfyUi: { ...loadComfyUiSettings(), apiUrl: COMFY },
          workflowFiles: [
            { id: 'e2e-wf', name: 'e2e', json: WORKFLOW, createdAt: Date.now() } as never,
          ],
        },
        config: { model: 'qwen-image-edit-2511', tool: 'day' },
        comfyUrl: COMFY,
        store,
        fetchImpl,
        status: async promptId => {
          asked.push(promptId);
          return {
            promptId,
            status: 'completed',
            comfyUrl: COMFY,
            images: [{ filename: 'plate-out.png', subfolder: '', type: 'output' }],
          };
        },
        sleep: async () => undefined,
      });
      const request = {
        model: 'qwen-image-edit-2511',
        plate: { filename: 'cast-plate.png' },
        clothingKey: 'kit:dress-01',
        clothingLabel: 'black dress',
        footwear: '',
        subject: 'she' as const,
      };
      const first = await ensureDayDressPlate(request, deps);
      assert.equal(first.fresh, true);
      assert.equal(prompts.length, 1, 'one try-on queued');
      assert.deepEqual(asked, ['job-1']);
      assert.match(JSON.stringify(prompts[0]), /black dress/);
      assert.equal(uploads.length, 1, 'the finished plate put in ComfyUI’s input folder');
      assert.equal(first.entry.filename, uploads[0]);
      assert.equal(store.find(first.entry.key)?.filename, uploads[0]);

      const again = await ensureDayDressPlate(request, deps);
      assert.equal(again.fresh, false);
      assert.equal(prompts.length, 1, 'nothing queued again: the kept plate is still in ComfyUI');
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('a partner stand-in made on the server (Phase 3)', () => {
  it('the portrait queued with the server’s steps, its head cropped and uploaded', async () => {
    const png = await sharp({ create: { width: 96, height: 128, channels: 3, background: '#8a7' } })
      .png()
      .toBuffer();
    const prompts: unknown[] = [];
    const uploads: { name: string; bytes: Buffer }[] = [];
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname === '/prompt' && init?.method === 'POST') {
        prompts.push(JSON.parse(String(init.body)));
        return Response.json({ prompt_id: 'stand-in-1', number: 1, node_errors: {} });
      }
      if (url.pathname === '/view') {
        return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
      }
      if (url.pathname === '/upload/image' && init?.method === 'POST') {
        const image = (init.body as FormData).get('image') as File;
        uploads.push({ name: image.name, bytes: Buffer.from(await image.arrayBuffer()) });
        return Response.json({ name: image.name, subfolder: '', type: 'input' });
      }
      if (url.pathname.startsWith('/object_info')) return Response.json(OBJECT_INFO);
      return Response.json({});
    }) as typeof fetch;
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    try {
      const { loadSettingsCache } = await import('../settings/cache');
      const { loadComfyUiSettings } = await import('../comfyui/settings');
      const { renderDayPartnerStandIn } = await import('./partner-stand-in');
      const { serverDressPlateDeps } = await import('./dress-plate-server');
      const deps = serverDressPlateDeps({
        settings: {
          shared: { ...loadSettingsCache().shared, selectedWorkflowFileId: 'e2e-wf' },
          comfyUi: { ...loadComfyUiSettings(), apiUrl: COMFY },
          workflowFiles: [
            { id: 'e2e-wf', name: 'e2e', json: WORKFLOW, createdAt: Date.now() } as never,
          ],
        },
        config: { model: 'qwen-image-edit-2511', tool: 'day' },
        comfyUrl: COMFY,
        store: { all: () => [], find: () => null, save: () => undefined },
        fetchImpl,
        status: async promptId => ({
          promptId,
          status: 'completed',
          comfyUrl: COMFY,
          images: [{ filename: 'stand-in-out.png', subfolder: '', type: 'output' }],
        }),
        sleep: async () => undefined,
      });
      const standIn = await renderDayPartnerStandIn({
        noun: 'man',
        leadFaceFilename: 'lead-face.png',
        model: 'qwen-image-edit-2511',
        comfyUrl: COMFY,
        sendComfyUi: deps.sendComfyUi,
        steps: deps,
      });
      assert.equal(prompts.length, 1, 'one portrait queued');
      assert.match(JSON.stringify(prompts[0]), /completely different person/);
      assert.match(JSON.stringify(prompts[0]), /lead-face\.png/, 'the lead’s face is Image 1');
      assert.equal(uploads.length, 1, 'the head crop put in ComfyUI’s input folder');
      assert.match(uploads[0]!.name, /^day-partner-man-/);
      // Head only, drawn on the server's canvas: not the portrait as it came.
      const crop = await sharp(uploads[0]!.bytes).metadata();
      assert.ok(crop.width && crop.height, 'a picture was uploaded');
      assert.notDeepEqual([crop.width, crop.height], [96, 128], 'the portrait was cropped');
      assert.ok(Math.abs(crop.width! / crop.height! - 0.85) < 0.05, `head-crop aspect, got ${crop.width}x${crop.height}`);
      assert.equal(standIn?.noun, 'man');
      assert.equal(standIn?.filename, uploads[0]!.name);
      assert.match(standIn?.imageUrl ?? '', /stand-in-out\.png/);

      // Its face as the VL-only reference for a clothed still, put in ComfyUI the server's way.
      const { uploadDayPartnerVlFace } = await import('./partner-stand-in');
      const vl = await uploadDayPartnerVlFace({
        filename: standIn!.filename,
        model: 'qwen-image-edit-2511',
        comfyUrl: COMFY,
        io: deps.io!,
      });
      assert.equal(uploads.length, 2);
      assert.match(uploads[1]!.name, /^day-partner-vl-/);
      assert.equal(vl, uploads[1]!.name);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('comfyOutputViewUrl', () => {
  it('names a finished job’s picture as the page does', async () => {
    const { comfyOutputViewUrl } = await import('./dress-plate-server');
    assert.equal(
      comfyOutputViewUrl({
        comfyUrl: 'http://127.0.0.1:8188',
        images: [{ filename: 'a.png', subfolder: 'x', type: 'output' }],
      }),
      '/api/comfyui/view?filename=a.png&subfolder=x&type=output&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188'
    );
    assert.equal(comfyOutputViewUrl({ comfyUrl: '', images: [] }), null);
  });
});
