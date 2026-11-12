import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * A run over Scenes each pinned to an engine ("Engine for this shot") renders each on its own
 * engine. 2026-11-12, castcut-s12: a run over Scenes pinned to Edit 2511 rendered every take on
 * Qwen-Image 2.1 Turbo — the install's default — 25 of 25.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-run-pin';

/** ComfyUI stubbed: jobs captured and finished at once; this machine's inventory (2511 fp8, 2.1). */
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
        json: { ok: true, promptId: `e2e-run-pin-${queued.length}`, comfyUrl: 'http://127.0.0.1:8188' },
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
    if (path.startsWith('/api/comfyui/jobs')) {
      await route.fulfill({
        json: {
          status: {
            status: 'completed',
            images: [{ filename: 'e2e-run.png', subfolder: '', type: 'output' }],
          },
        },
      });
      return;
    }
    if (path === '/api/comfyui/preview') {
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
  for (const check of ['adult-check', 'play-checks', 'face-match', 'marks-check', 'outfit-check']) {
    await page.route(`**/api/${check}**`, route =>
      route.fulfill({ json: { ok: true, skipped: true } })
    );
  }
  return queued;
}

const modelOf = (body: string) => String((JSON.parse(body) as { model?: string }).model ?? '');
const isStill = (body: string) => !/outfit try-on/.test(String(JSON.parse(body).prompt ?? ''));

test('a run renders each Scene on the engine it is pinned to', async ({ page }) => {
  const queued = await stubComfy(page);
  const scene = (id: string, name: string, engine: string, at: number) => ({
    id,
    castId: CAST,
    name,
    slot: {
      id: 'morning',
      label: 'Morning',
      location: 'kitchen',
      sceneHints: 'pours coffee',
      engine,
    },
    dayMood: 'everyday',
    takes: [],
    createdAt: at,
    updatedAt: at,
  });
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: {
        version: 1,
        characters: [
          {
            id: CAST,
            name: 'Run Pin',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'a woman in her thirties with short dark hair',
            traits: { sex: 'woman' },
            ipAdapter: { imageFilename: 'e2e-run-pin.png', imageUrl: '/icon.svg' },
          },
        ],
        removedIds: [],
      },
      tools: {
        scene: {
          isolateSubject: false,
          scenes: [
            scene('pin-2511', 'On 2511', 'qwen-edit-2511', 3),
            scene('pin-21', 'On 2.1', 'qwen-image-2.1', 4),
          ],
          activeSceneId: 'pin-2511',
          stillsCharacterId: CAST,
          dayMood: 'everyday',
          run: {
            id: 'run-pin',
            castId: CAST,
            label: 'Pinned run',
            items: [
              { sceneId: 'pin-2511', include: true },
              { sceneId: 'pin-21', include: true },
            ],
            maxTakes: 8,
            maxMinutes: 60,
            skipKept: true,
            state: 'prepared',
            position: 0,
            log: [],
            createdAt: 1,
            updatedAt: 1,
          },
        },
      },
    },
    { once: true }
  );
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-run-state')).toContainText('Ready · 0 of 2 done', {
    timeout: 60_000,
  });
  await page.getByTestId('scene-run-start').click();
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'done', {
    timeout: 120_000,
  });
  const stills = queued.filter(isStill).map(modelOf);
  expect(stills).toHaveLength(2);
  expect(stills[0]).toMatch(/^qwen-image-edit-2511/);
  // 2.1 queues on the Rapid AIO edit graph, converted at runtime (resolveModelForQueueTool).
  expect(stills[1]).toMatch(/^qwen-image-2\.1|^qwen-rapid-aio-edit/);
});
