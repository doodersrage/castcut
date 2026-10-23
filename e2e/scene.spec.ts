import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { openDaySlotSheet } from './helpers/day';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Scene — one shot, exactly as you want it: Day's slot editor and engine on one shot, the Cast's
 * saved scenes, takes kept, Make it move from the kept take, Day ↔ Scene links and Cut's Scenes
 * source.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-scene';
const SHOTS = process.env.SCENE_SHOTS_DIR;
const PREFIX = 'day-slot-pose-preview';

const cast = {
  version: 1,
  characters: [
    {
      id: CAST,
      name: 'Scene Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties with short dark hair',
      traits: { sex: 'woman' },
      ipAdapter: { imageFilename: 'e2e-scene.png', imageUrl: '/icon.svg' },
    },
  ],
  removedIds: [],
};

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
        json: { ok: true, promptId: `e2e-scene-${queued.length}`, comfyUrl: 'http://127.0.0.1:8188' },
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

/** A saved scene with two finished takes, open on the page. */
function sceneWithTakes() {
  const slot = {
    id: 'evening',
    label: 'Evening',
    location: 'small kitchen',
    sceneHints: 'stirring a pot of risotto at the stove',
  };
  const takes = [
    { id: 'take-1', promptId: 'take-1', imageUrl: '/icon.svg?take=1', at: 1 },
    { id: 'take-2', promptId: 'take-2', imageUrl: '/icon.svg?take=2', at: 2 },
  ];
  return {
    isolateSubject: false,
    scenes: [
      {
        id: 'scene-e2e',
        castId: CAST,
        name: 'Kitchen',
        slot,
        dayMood: 'everyday',
        takes,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    activeSceneId: 'scene-e2e',
    slots: [slot],
    stills: [{ slotId: 'evening', promptId: 'take-2', imageUrl: '/icon.svg?take=2', status: 'completed' }],
    stillsCharacterId: CAST,
    dayMood: 'everyday',
  };
}

/** The prompt text of a queued job (the encoder's, wherever it sits in the body). */
function promptOf(body: string): string {
  return body.replace(/\\n/g, '\n').replace(/\\"/g, '"');
}

/** The first stored scene, read from the app's IndexedDB settings ("count|cast|slot|place|cam"). */
async function storedScene(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => resolve('');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.close();
            resolve('');
            return;
          }
          const get = db
            .transaction('kv', 'readonly')
            .objectStore('kv')
            .get('comfy-prompt-tool-settings-tools-v1');
          get.onsuccess = () => {
            db.close();
            const scenes = get.result?.value?.tools?.scene?.scenes;
            const scene = Array.isArray(scenes) ? scenes[0] : null;
            resolve(
              scene
                ? `${scenes.length}|${scene.castId}|${scene.slot?.id}|${scene.slot?.location}|${scene.slot?.poseCamera?.height}`
                : ''
            );
          };
          get.onerror = () => {
            db.close();
            resolve('');
          };
        };
      })
  );
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test('a new scene: the shot, its pose camera, and a take queued on Day’s engine', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { isolateSubject: false } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);

  await expect(page.getByTestId('scene-empty')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('scene-new').click();
  await expect(page.getByTestId('scene-shot')).toBeVisible();
  await expect(page.getByTestId('scene-name')).toHaveValue('Scene 1');
  // Not a Day: no length, one shot.
  await expect(page.getByTestId('scene-plan-bar')).toBeVisible();
  await expect(page.getByTestId('day-length')).toHaveCount(0);

  await page.getByTestId('scene-time-evening').click();
  await expect(page.getByTestId('scene-time-evening')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('day-slot-location').fill('small kitchen');
  await page.getByTestId('day-slot-beat').fill('stirring a pot of risotto at the stove');
  // The slot's Camera row (Day's pose preview).
  await page.getByTestId(`${PREFIX}-camera-height`).selectOption('low');
  await page.getByTestId(`${PREFIX}-camera-shot`).selectOption('waist');
  await expect(page.getByTestId(`${PREFIX}-camera`)).toHaveAttribute('data-from', 'slot');
  await shot(page, 'scene-desk-new');

  await page.getByTestId('scene-queue-take').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const prompt = promptOf(queued[0]!);
  expect(prompt).toContain('Camera: a low angle looking up at her');
  expect(prompt).toContain('waist-up shot');
  expect(prompt).toMatch(/risotto/);

  // Saved with the Cast: the tools settings (IndexedDB — what syncs and what a reload reads; a
  // real reload here would run the seed again).
  await expect.poll(() => storedScene(page), { timeout: 30_000 }).toBe(
    `1|${CAST}|evening|small kitchen|low`
  );
  await expect(page.getByTestId('scene-list-items')).toBeVisible();
});

test('keep a take, the Director from it, and the kept take in Cut', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: sceneWithTakes() },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);

  const takes = page.getByTestId('scene-take');
  await expect(takes).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId('scene-move-needs-keep')).toBeVisible();
  await expect(page.getByTestId('scene-director')).toBeDisabled();

  // Keep the first take: it goes on the card and Make it move starts from it.
  await page.getByTestId('scene-take-keep-0').click();
  await expect(takes.nth(0)).toHaveAttribute('data-kept', 'true');
  await expect(takes.nth(0)).toHaveAttribute('data-on-card', 'true');
  await expect(page.getByTestId('scene-kept')).toBeVisible();
  await shot(page, 'scene-desk-kept');

  await page.getByTestId('scene-director').click();
  await expect(page.getByTestId('scene-director-sheet')).toBeVisible({ timeout: 60_000 });
  await shot(page, 'scene-desk-director');
  await page.getByTestId('scene-director-sheet-cancel').click();
  await expect(page.getByTestId('scene-director-sheet')).toHaveCount(0);

  // Cut: Scenes is a source, with the kept take (its link, so the seed does not run again).
  await page.getByTestId('scene-open-cut').click();
  await expect(page).toHaveURL(/\/cut\?from=scenes/, { timeout: 60_000 });
  await dismissBlockingOverlays(page);
  const source = page.getByTestId('cut-source-scenes');
  await expect(source).toContainText('Scenes · 1 shot', { timeout: 60_000 });
  await expect(source).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'scene-cut-source');
});

test('Open as Scene from a Day slot copies its shot and take', async ({ page }) => {
  await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      day: {
        stillsCharacterId: CAST,
        isolateSubject: false,
        dayMood: 'everyday',
        slots: ['morning', 'afternoon', 'evening', 'night'].map(id => ({
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          location: id === 'evening' ? 'rooftop bar' : 'small kitchen',
          sceneHints: id === 'evening' ? 'laughing at the rail' : 'making coffee',
        })),
        stills: [
          { slotId: 'evening', promptId: 'day-evening', imageUrl: '/icon.svg', status: 'completed' },
        ],
      },
    },
  });
  await gotoStable(page, `/day?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'evening');
  await page.getByTestId('day-slot-open-as-scene').click();

  await expect(page).toHaveURL(/\/scene/, { timeout: 60_000 });
  await expect(page.getByTestId('scene-name')).toHaveValue('Scene 1', { timeout: 60_000 });
  await expect(page.getByTestId('day-slot-location')).toHaveValue('rooftop bar');
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('laughing at the rail');
  await expect(page.getByTestId('scene-time-evening')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('scene-take')).toHaveCount(1);
});

test('phone: the Scene page fits the width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: sceneWithTakes() },
  });
  await gotoStable(page, `/m/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-shot')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('scene-take')).toHaveCount(2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  if (overflow > 1) {
    const wide = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .filter(el => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 12)
        .map(el => `${el.tagName}.${el.className}`.slice(0, 160) + ' ' + (el.dataset.testid ?? '') + ' ' + Math.round(el.getBoundingClientRect().right))
    );
    console.log(wide.join('\n'));
  }
  expect(overflow).toBeLessThanOrEqual(1);
  await shot(page, 'scene-phone');
});
