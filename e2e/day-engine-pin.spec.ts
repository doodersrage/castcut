import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { openDaySlotSheet } from './helpers/day';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * A moment pinned to an engine ("Engine for this shot") renders on that engine — on an install
 * whose ComfyUI holds Edit 2511 only as its fp8 build and whose model map hasn't been filled in
 * (2026-11-12: a Scene pinned to Edit 2511 rendered on Qwen-Image 2.1 Turbo 25 times out of 25).
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

/** ComfyUI stubbed: queued jobs captured; the inventory is this machine's (2511 fp8, 2.1 Turbo). */
async function stubComfy(page: Page) {
  const queued: string[] = [];
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.context().route(/\/api\/comfyui(?:\/|\?|$)/, async route => {
    const request = route.request();
    let path = request.url();
    try {
      path = new URL(request.url()).pathname.replace(/\/$/, '');
    } catch {
      // keep the raw url
    }
    if (request.method() === 'POST' && path === '/api/comfyui') {
      queued.push(request.postData() ?? '');
      await route.fulfill({
        json: { ok: true, promptId: `e2e-pin-${queued.length}`, comfyUrl: 'http://127.0.0.1:8188' },
      });
      return;
    }
    if (path === '/api/comfyui/upload') {
      await route.fulfill({
        json: { name: `e2e-upload-${Date.now()}.png`, subfolder: '', type: 'input' },
      });
      return;
    }
    if (path.startsWith('/api/comfyui/view')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: png });
      return;
    }
    if (path === '/api/comfyui/preview') {
      // A plain graph: the request's model is what this test reads.
      await route.fulfill({
        json: {
          ok: true,
          workflowSource: 'minimal',
          replacements: { positive: 1, negative: 0, params: {} },
          workflowJson: JSON.stringify({
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
          }),
        },
      });
      return;
    }
    if (path.startsWith('/api/comfyui/object-info')) {
      await route.fulfill({
        json: {
          ok: true,
          models: {
            checkpoints: [],
            unets: [
              'qwen_image_edit_2511_fp8mixed.safetensors',
              'qwen_image_2.1_turbo_int8_convrot.safetensors',
            ],
            vaes: ['qwen_image_vae.safetensors'],
            upscaleModels: [],
            clips: ['qwen_2.5_vl_7b_fp8_scaled.safetensors'],
            dualClipTypes: [],
            clipLoaderTypes: ['qwen_image'],
            loras: ['Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors'],
            controlNets: [],
          },
          nodeTypes: [
            'CheckpointLoaderSimple',
            'UNETLoader',
            'LoadImage',
            'SaveImage',
            'TextEncodeQwenImageEditPlus',
            'TextEncodeQwenImage21',
            'QwenImage21Cache',
          ],
        },
      });
      return;
    }
    await route.continue();
  });
  return queued;
}

async function seedPinnedDay(page: Page, engine: string | undefined) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-pin' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-pin',
          name: 'Pin',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'a woman',
          traits: { sex: 'woman' },
          ipAdapter: { imageFilename: 'e2e-pin.png', imageUrl: '/icon.svg' },
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-pin',
        isolateSubject: false,
        slots: ['morning', 'afternoon', 'evening', 'night'].map(id => ({
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          location: 'small kitchen',
          sceneHints: 'stirring a pot of risotto at the stove',
          ...(id === 'morning' && engine ? { engine } : {}),
        })),
      },
    },
  });
}

const modelOf = (body: string) => String((JSON.parse(body) as { model?: string }).model ?? '');

test('a moment pinned to Edit 2511 renders on Edit 2511, not the default engine', async ({
  page,
}) => {
  const queued = await stubComfy(page);
  await seedPinnedDay(page, 'qwen-edit-2511');
  await gotoStable(page, '/day?character=e2e-pin');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  await page.getByTestId('day-slot-queue').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const stills = queued.map(modelOf).filter(model => !/dress|try-on/i.test(model));
  expect(stills.at(-1)).toMatch(/^qwen-image-edit-2511/);
});

test('a moment pinned to Qwen-Image 2.1 renders on 2.1 (the pin is honoured, not the default)', async ({
  page,
}) => {
  const queued = await stubComfy(page);
  await seedPinnedDay(page, 'qwen-image-2.1');
  await gotoStable(page, '/day?character=e2e-pin');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  await page.getByTestId('day-slot-queue').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  // 2.1 queues on the Rapid AIO edit graph and is converted at runtime (resolveModelForQueueTool).
  expect(modelOf(queued.at(-1)!)).toMatch(/^qwen-image-2\.1|^qwen-rapid-aio-edit/);
});
