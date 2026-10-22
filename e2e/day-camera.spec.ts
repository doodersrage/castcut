import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { openDaySlotSheet } from './helpers/day';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * The camera a player picks — in the 3D pose editor's Camera panel or a slot's Camera row —
 * reaches the still as one "Camera: …" line, with nothing in the prompt contradicting it.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const PREFIX = 'day-slot-pose-preview';
const CANDID = 'Photographed candidly by a friend from a three-quarter angle';

/** ComfyUI stubbed: queued jobs are captured, uploads accepted, pictures a 1×1 PNG. */
async function stubComfyQueue(page: Page) {
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
        json: { ok: true, promptId: `e2e-camera-${queued.length}`, comfyUrl: 'http://127.0.0.1:8188' },
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
      // A plain graph: no model on this machine to check against.
      await route.fulfill({
        json: {
          ok: true,
          workflowSource: 'minimal',
          replacements: { positive: 1, negative: 0, params: {} },
          workflowJson: JSON.stringify({
            '1': {
              class_type: 'CheckpointLoaderSimple',
              inputs: { ckpt_name: 'model.safetensors' },
            },
          }),
        },
      });
      return;
    }
    if (path.startsWith('/api/comfyui/object-info')) {
      await route.fulfill({ status: 502, json: { error: 'e2e: no ComfyUI' } });
      return;
    }
    await route.continue();
  });
  return queued;
}

async function seedDay(page: Page) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-camera' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-camera',
          name: 'Camera',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'a woman',
          traits: { sex: 'woman' },
          ipAdapter: { imageFilename: 'e2e-camera.png', imageUrl: '/icon.svg' },
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-camera',
        isolateSubject: false,
        slots: ['morning', 'afternoon', 'evening', 'night'].map(id => ({
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          location: 'small kitchen',
          sceneHints: 'stirring a pot of risotto at the stove',
        })),
      },
    },
  });
}

/** The prompt text of a queued job (the encoder's, wherever it sits in the body). */
function promptOf(body: string): string {
  return JSON.parse(body) ? body.replace(/\\n/g, '\n').replace(/\\"/g, '"') : body;
}

test("a slot's Camera row reaches the still as one Camera line", async ({ page }) => {
  const queued = await stubComfyQueue(page);
  await seedDay(page);
  await gotoStable(page, '/day?character=e2e-camera');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');

  const row = page.getByTestId(`${PREFIX}-camera`);
  await expect(row).toHaveAttribute('data-from', 'auto');
  await page.getByTestId(`${PREFIX}-camera-height`).selectOption('low');
  await page.getByTestId(`${PREFIX}-camera-direction`).selectOption('three-quarter');
  await page.getByTestId(`${PREFIX}-camera-shot`).selectOption('waist');
  await page.getByTestId(`${PREFIX}-camera-lens`).selectOption('wide');
  await expect(row).toHaveAttribute('data-from', 'slot');
  // A shot size crops the drawn figure: its legs leave the preview.
  await page.getByTestId('day-slot-queue').click();

  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const prompt = promptOf(queued[0]!);
  expect(prompt).toContain(
    'Camera: a low angle looking up at her, three-quarter view, waist-up shot, legs out of frame, wide-angle lens.'
  );
  expect(prompt).not.toContain(CANDID);
  expect(prompt).not.toContain('full body in frame');
  expect(prompt).not.toContain('her whole body in frame');
  expect(prompt).not.toContain('Keep facial identity and camera framing.');
});

test("a 3D pose's Camera panel wins over the slot row and reaches the still", async ({ page }) => {
  const queued = await stubComfyQueue(page);
  await seedDay(page);
  await gotoStable(page, '/day?character=e2e-camera');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  // A slot pick first: the pose's own camera takes over once there is one.
  await page.getByTestId(`${PREFIX}-camera-height`).selectOption('high');

  await page.getByTestId(`${PREFIX}-edit`).click();
  const canvas = page.getByTestId(`${PREFIX}-canvas`);
  await expect(canvas).toHaveAttribute('data-editor', '3d', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const panel = page.getByTestId(`${PREFIX}-camera`);
  // It opened through the slot's camera.
  await expect(page.getByTestId(`${PREFIX}-camera-height`)).toHaveAttribute('data-value', 'high');

  // Eye level (the slider), side, knees up, long lens.
  await page.getByTestId(`${PREFIX}-camera-height`).fill('1');
  await expect(page.getByTestId(`${PREFIX}-camera-height`)).toHaveAttribute('data-value', 'eye');
  await page.getByTestId(`${PREFIX}-camera-direction-side`).click();
  await page.getByTestId(`${PREFIX}-camera-shot-knees`).click();
  await page.getByTestId(`${PREFIX}-camera-lens-long`).click();
  await expect(panel).toHaveAttribute('data-picked', 'true');
  await expect(page.getByTestId(`${PREFIX}-camera-shot-knees`)).toHaveAttribute(
    'aria-checked',
    'true'
  );
  // Knees up: the ankles are out of the picture, so out of the pose map.
  const body = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]!);
  expect(body[10]).toBeNull();
  expect(body[13]).toBeNull();
  expect(body[1]).not.toBeNull();
  await expect(page.getByTestId(`${PREFIX}-camera-words`)).toContainText(
    'Camera: at eye level, side view, in profile, knees-up shot'
  );
  await page.getByTestId(`${PREFIX}-editor-save`).click();

  // The row says the camera is the pose's now.
  await expect(page.getByTestId(`${PREFIX}-camera`)).toHaveAttribute('data-from', 'pose');
  await expect(page.getByTestId(`${PREFIX}-camera-from-pose`)).toContainText(
    'Eye level · Side · Knees up · Long lens'
  );

  await page.getByTestId('day-slot-queue').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const prompt = promptOf(queued[0]!);
  expect(prompt).toContain(
    'Camera: at eye level, side view, in profile, knees-up shot, cut off just below the knees, long telephoto lens.'
  );
  expect(prompt).not.toMatch(/a high angle from above/);
  expect(prompt).not.toContain(CANDID);
  expect(prompt).not.toContain('full body in frame');
});
