import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { replaceGalleryIdb, seedSettingsCacheOnNextLoad } from './helpers/idb';
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

/**
 * The Scene page's stored settings (tools.scene), as JSON, read from the app's IndexedDB — with
 * `scripts` from their own store (M6 V6: castcut-scene-scripts-v1) once they have moved there.
 */
async function storedSceneTool(page: Page): Promise<string> {
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
          const store = db.transaction('kv', 'readonly').objectStore('kv');
          const get = store.get('comfy-prompt-tool-settings-tools-v1');
          const own = store.get('castcut-scene-scripts-v1');
          own.onsuccess = () => {
            db.close();
            const scene = get.result?.value?.tools?.scene ?? {};
            const scripts = own.result?.value?.scripts;
            resolve(JSON.stringify(Array.isArray(scripts) ? { ...scene, scripts } : scene));
          };
          own.onerror = () => {
            db.close();
            resolve('');
          };
        };
      })
  );
}

/** The stored scripts ("count|cast|name" of the first), from where they are kept. */
async function storedScripts(page: Page): Promise<string> {
  const scripts = JSON.parse((await storedSceneTool(page)) || '{}').scripts;
  const first = Array.isArray(scripts) ? scripts[0] : null;
  return first ? `${scripts.length}|${first.castId}|${first.name}` : '0';
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

// M7 T3: a verdict on a take without rendering it again — good, rejected (hidden, restorable),
// never the kept one — kept after a reload; and two takes compared side by side.
test('takes are marked good or rejected, survive a reload, and compare side by side', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: { scene: sceneWithTakes() },
    },
    // The reload must read what the page saved, not the seed again.
    { once: true }
  );
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const takes = page.getByTestId('scene-take');
  await expect(takes).toHaveCount(2, { timeout: 60_000 });

  // Take 2 is on the card; keep it. The kept take can't be rejected.
  await page.getByTestId('scene-take-keep-1').click();
  await expect(takes.nth(1)).toHaveAttribute('data-kept', 'true');
  await expect(page.getByTestId('scene-take-reject-1')).toBeDisabled();
  await page.getByTestId('scene-take-approve-1').click();
  await expect(takes.nth(1)).toHaveAttribute('data-review', 'approved');
  await shot(page, 'scene-take-review');

  // Reject take 1: it leaves the strip (it isn't on the card), and can be shown and restored.
  await page.getByTestId('scene-take-reject-0').click();
  await expect(takes).toHaveCount(1);
  await expect(page.getByTestId('scene-takes-show-rejected')).toHaveText('Show 1 rejected');
  // Saved before the reload (settings are written to IndexedDB on a short debounce).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>(resolve => {
            const request = indexedDB.open('comfy-prompt-studio-v1');
            request.onerror = () => resolve('');
            request.onsuccess = () => {
              const get = request.result
                .transaction('kv', 'readonly')
                .objectStore('kv')
                .get('comfy-prompt-tool-settings-tools-v1');
              get.onsuccess = () => {
                const scene = get.result?.value?.tools?.scene?.scenes?.[0];
                resolve(
                  (scene?.takes ?? [])
                    .map((take: { review?: string }) => take.review ?? '-')
                    .join(',')
                );
              };
              get.onerror = () => resolve('');
            };
          })
      )
    )
    .toBe('rejected,approved');

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(takes).toHaveCount(1, { timeout: 60_000 });
  await expect(takes.first()).toHaveAttribute('data-review', 'approved');
  await expect(takes.first()).toHaveAttribute('data-kept', 'true');
  await page.getByTestId('scene-takes-show-rejected').click();
  await expect(takes).toHaveCount(2);
  await expect(takes.nth(0)).toHaveAttribute('data-review', 'rejected');
  await page.getByTestId('scene-take-restore-0').click();
  await expect(takes.nth(0)).toHaveAttribute('data-review', 'candidate');
  await expect(page.getByTestId('scene-takes-show-rejected')).toHaveCount(0);

  // Compare: the kept take and the other, side by side; keep the other from there.
  await page.getByTestId('scene-takes-compare').click();
  const compare = page.getByTestId('scene-take-compare');
  await expect(compare).toBeVisible();
  await expect(page.getByTestId('scene-take-compare-0')).toHaveAttribute('data-take', 'take-2');
  await expect(page.getByTestId('scene-take-compare-1')).toHaveAttribute('data-take', 'take-1');
  // No Gallery entries in this fixture: each side says so (the rows are R4's, tested there).
  await expect(page.getByTestId('scene-take-compare-1')).toContainText(
    'no longer has this take’s Gallery entry'
  );
  await page.getByTestId('scene-take-compare-keep-1').click();
  await expect(page.getByTestId('scene-take-compare-keep-1')).toHaveAttribute('aria-pressed', 'true');
  await shot(page, 'scene-take-compare');
  await page.keyboard.press('Escape');
  await expect(takes.nth(0)).toHaveAttribute('data-kept', 'true');
  await expect(takes.nth(1)).toHaveAttribute('data-kept', 'false');
});

// The last edit before a reload: settings reach IndexedDB on a short debounce, and a reload inside
// it lost the edit; the page journals what's pending as it goes, and the next load replays it.
test('an edit made just before a reload is kept', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: { scene: sceneWithTakes() },
    },
    { once: true }
  );
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const takes = page.getByTestId('scene-take');
  await expect(takes).toHaveCount(2, { timeout: 60_000 });
  // The page goes before IndexedDB has the edit (here: IndexedDB refuses settings writes, so the
  // timing is the same on every machine).
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args) {
      if (this.name === 'kv') throw new DOMException('Settings writes refused', 'UnknownError');
      return put.apply(this, args);
    } as typeof put;
  });
  await page.getByTestId('scene-take-reject-0').click();
  await expect(takes).toHaveCount(1);
  await page.waitForTimeout(1000);

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-takes-show-rejected')).toHaveText('Show 1 rejected', {
    timeout: 60_000,
  });
  await expect(takes).toHaveCount(1);
});

// M8 T1: a location is a record of its own — made once, described, kept after a reload — and it
// can't be deleted while a Scene is set there (an unused one can, after asking).
test('a location is made, described, kept after a reload, and not deleted while a Scene uses it', async ({
  page,
}) => {
  const seed = (scene: ReturnType<typeof sceneWithTakes>) =>
    seedSettingsCacheOnNextLoad(
      page,
      { shared: { activeCharacterId: CAST }, characters: cast, tools: { scene } },
      { once: true }
    );
  await seed(sceneWithTakes());
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const section = page.getByTestId('locations-section');
  await expect(section.getByTestId('locations-empty')).toBeVisible({ timeout: 60_000 });

  await section.getByTestId('location-new-name').fill('Corner café');
  await section.getByTestId('location-add').click();
  const rows = section.locator('[data-testid^="location-loc-"]');
  await expect(rows).toHaveCount(1);
  const cafe = rows.first();
  await expect(cafe.getByTestId('location-name')).toHaveValue('Corner café');
  await expect(cafe.getByTestId('location-aliases')).toHaveValue('corner cafe');
  await cafe.getByTestId('location-look').fill('green tiled counter, brass espresso machine');
  await cafe.getByTestId('location-aliases').fill('cafe, the corner cafe');
  await cafe.getByTestId('location-aliases').blur();
  const id = (await cafe.getAttribute('data-testid'))!.slice('location-'.length);

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(cafe.getByTestId('location-look')).toHaveValue(
    'green tiled counter, brass espresso machine',
    { timeout: 60_000 }
  );
  await expect(cafe.getByTestId('location-aliases')).toHaveValue('cafe, corner cafe');

  // The Scene is set there now (its shot, as the engine holds it): Delete says so and keeps it.
  const setThere = sceneWithTakes();
  const shot = { ...setThere.slots[0]!, locationId: id };
  setThere.scenes[0] = { ...setThere.scenes[0]!, slot: shot };
  setThere.slots = [shot];
  await seed(setThere);
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(rows).toHaveCount(1, { timeout: 60_000 });
  await cafe.getByTestId('location-delete').click();
  await expect(cafe.getByTestId('location-delete-refused')).toContainText('Kitchen is set here');
  await expect(rows).toHaveCount(1);

  // One no Scene uses goes, after asking.
  await section.getByTestId('location-new-name').fill('Hotel bar');
  await section.getByTestId('location-add').click();
  await expect(rows).toHaveCount(2);
  await rows.nth(1).getByTestId('location-delete').click();
  await page.getByRole('button', { name: 'Delete location' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByTestId('location-name')).toHaveValue('Corner café');
});

// M8 T2: a Scene set in a location draws that place's look — its words in the queued prompt.
test('a Scene set in a location queues its take with the location\'s look', async ({ page }) => {
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

  const section = page.getByTestId('locations-section');
  await section.getByTestId('location-new-name').fill('Corner café');
  await section.getByTestId('location-add').click();
  const cafe = section.locator('[data-testid^="location-loc-"]').first();
  await cafe.getByTestId('location-look').fill('green tiled counter, brass espresso machine');
  await cafe.getByTestId('location-look').blur();

  // Picked with no words yet: the Setting starts as its name.
  const picker = page.getByTestId('day-slot-location-record');
  await picker.selectOption({ label: 'Corner café' });
  await expect(page.getByTestId('day-slot-location')).toHaveValue('Corner café');
  await page.getByTestId('day-slot-location').fill('at the counter by the window');
  await page.getByTestId('day-slot-beat').fill('orders a coffee from the barista');
  await expect(picker).not.toHaveValue('');

  await page.getByTestId('scene-queue-take').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(promptOf(queued[0]!)).toContain(
    'at the counter by the window, at Corner café: green tiled counter, brass espresso machine'
  );
});

// M8 T2: a script's place resolves to a location by its script names, and a shot made a Scene is
// set there.
test('a script place resolves to a location, and its shot\'s Scene is set there', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { isolateSubject: false } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const section = page.getByTestId('locations-section');
  await expect(section).toBeVisible({ timeout: 60_000 });
  await section.getByTestId('location-new-name').fill('Corner café');
  await section.getByTestId('location-add').click();
  const cafe = section.locator('[data-testid^="location-loc-"]').first();
  await cafe.getByTestId('location-aliases').fill('cafe');
  await cafe.getByTestId('location-aliases').blur();
  const id = (await cafe.getAttribute('data-testid'))!.slice('location-'.length);

  await page.getByTestId('script-import').click();
  await page
    .getByTestId('script-import-text')
    .fill('INT. CAFE - DAY\n\nNora orders a coffee at the counter.\n');
  await page.getByTestId('script-keep').click();
  await expect(page.getByTestId('script-reading')).toBeVisible();
  const place = page.getByTestId('script-place-CAFE');
  await expect(place).toHaveAttribute('data-choice', `location:${id}`);
  await expect(place).toContainText('matched by name');

  const scene = page.getByTestId('script-scene-int-cafe-day');
  if ((await scene.getAttribute('open')) === null) await scene.locator('summary').click();
  await page.getByTestId('script-shots-draft-int-cafe-day').click();
  await page.locator('[data-testid^="script-shot-make-"]').first().click();
  await expect(page.getByTestId('day-slot-location-record')).toHaveValue(id, { timeout: 30_000 });
  await expect(page.getByTestId('day-slot-location')).toHaveValue('cafe');
});

// M8 T3: a location's picture — a photo of the empty place — is added, shown and removed. (Sent as
// Image 3 with a take set there only beside a dressed plate, which this Cast has none of: the
// prompt side is unit-tested, cast/places.test.ts.)
test('a location\'s picture is added, shown and removed', async ({ page }) => {
  await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { isolateSubject: false } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const section = page.getByTestId('locations-section');
  await expect(section).toBeVisible({ timeout: 60_000 });
  await section.getByTestId('location-new-name').fill('Corner café');
  await section.getByTestId('location-add').click();
  const cafe = section.locator('[data-testid^="location-loc-"]').first();
  await cafe.getByTestId('location-photo-input').setInputFiles({
    name: 'cafe.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    ),
  });
  await expect(cafe.getByRole('img', { name: 'Corner café, as it looks' })).toHaveAttribute(
    'src',
    /filename=e2e-upload-\d+\.png&type=input/,
    { timeout: 30_000 }
  );
  await cafe.getByTestId('location-photo-remove').click();
  await expect(cafe.getByRole('img')).toHaveCount(0);
  await expect(cafe.getByTestId('location-photo-input')).toBeVisible();
});

// M8 T5: a shot's story state — what she carries, what changed, the story day — is kept with the
// Scene and shown on its shot in Cut.
test('a shot\'s story state is kept after a reload and shown on its Cut card', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(
    page,
    { shared: { activeCharacterId: CAST }, characters: cast, tools: { scene: sceneWithTakes() } },
    { once: true }
  );
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
  await page.getByTestId('scene-take-keep-0').click();

  const fields = page.getByTestId('shot-story-state');
  await fields.getByTestId('shot-state-carries').fill('the red umbrella, a paper bag');
  await fields.getByTestId('shot-state-changes').fill('left hand bandaged');
  await fields.getByTestId('shot-state-changes').blur();
  await fields.getByTestId('shot-state-day').fill('2');

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(fields.getByTestId('shot-state-carries')).toHaveValue(
    'the red umbrella, a paper bag',
    { timeout: 60_000 }
  );
  await expect(fields.getByTestId('shot-state-changes')).toHaveValue('left hand bandaged');
  await expect(fields.getByTestId('shot-state-day')).toHaveValue('2');
  // M8 T6: marked to carry over to the shots after it.
  const carry = fields.getByTestId('shot-state-carry-the red umbrella');
  await carry.click();
  await expect(carry).toHaveAttribute('aria-pressed', 'true');
  await expect(carry).toContainText('carries over');

  await page.getByTestId('scene-open-cut').click();
  await expect(page).toHaveURL(/\/cut\?from=scenes/, { timeout: 60_000 });
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-shot-state-scenes:scene-e2e')).toContainText(
    'Day 2 · Evening · carries the red umbrella, a paper bag · left hand bandaged',
    { timeout: 60_000 }
  );
});

// M8 T6: the audit's example — 6A carries the red umbrella; 7A, at the same story time, doesn't.
test('Cut flags a shot that drops what the shot before it carries over', async ({ page }) => {
  const base = sceneWithTakes();
  const shot = (state: Record<string, unknown>) => ({ ...base.slots[0]!, state });
  const keptScene = (id: string, name: string, state: Record<string, unknown>, at: number) => ({
    ...base.scenes[0]!,
    id,
    name,
    slot: shot(state),
    takes: base.scenes[0]!.takes.map(take => ({ ...take, id: `${id}-${take.id}` })),
    keptTakeId: `${id}-take-1`,
    createdAt: at,
    updatedAt: at,
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...base,
        scenes: [
          keptScene('scene-6a', '6A BUS STOP', {
            carries: [{ text: 'the red umbrella', carriesOver: true }],
            storyDay: 2,
          }),
          keptScene('scene-7a', '7A BUS STOP', { storyDay: 2 }, 3),
        ].map((entry, index) => ({ ...entry, createdAt: index + 1, updatedAt: index + 1 })),
        activeSceneId: 'scene-6a',
      },
    },
  });
  await gotoStable(page, `/cut?from=scenes&character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-finding-scenes:scene-7a:state-dropped')).toContainText(
    'the red umbrella',
    { timeout: 60_000 }
  );
  await expect(page.locator('[data-testid="cut-finding-scenes:scene-6a:state-dropped"]')).toHaveCount(0);
});

// M8 T3: "Make its picture" — the empty place rendered from its words (a finished graph), kept as
// the location's photo.
test('a location\'s picture is made from its words and kept', async ({ page }) => {
  const queued = await stubComfyQueue(page);
  await page.route('**/api/comfyui/jobs**', route =>
    route.fulfill({
      json: {
        status: {
          status: 'completed',
          images: [{ filename: 'e2e-location.png', subfolder: '', type: 'output' }],
        },
      },
    })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { isolateSubject: false } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const section = page.getByTestId('locations-section');
  await expect(section).toBeVisible({ timeout: 60_000 });
  await section.getByTestId('location-new-name').fill('Harbour café');
  await section.getByTestId('location-add').click();
  const cafe = section.locator('[data-testid^="location-loc-"]').first();
  // Made from its words: none yet, nothing to make.
  await expect(cafe.getByTestId('location-picture-make')).toBeDisabled();
  await cafe.getByTestId('location-look').fill('pale blue wooden counter, a copper espresso machine');
  await cafe.getByTestId('location-look').blur();
  await cafe.getByTestId('location-picture-make').click();

  await expect(cafe.getByRole('img', { name: 'Harbour café, as it looks' })).toHaveAttribute(
    'src',
    /filename=e2e-upload-\d+\.png&type=input/,
    { timeout: 60_000 }
  );
  const body = JSON.parse(queued[0]!) as { comfy?: { workflowFinal?: boolean; workflowJson?: string } };
  expect(body.comfy?.workflowFinal).toBe(true);
  expect(body.comfy?.workflowJson).toContain(
    'A wide photograph of Harbour café, indoors: pale blue wooden counter, a copper espresso machine. Empty'
  );
  await expect(cafe.getByTestId('location-picture-again')).toBeEnabled();
});

// M9 T1: global search finds a Scene by name and opens it.
test('a Scene is found by name in the command palette and opens', async ({ page }) => {
  const scene = sceneWithTakes();
  scene.scenes[0] = { ...scene.scenes[0]!, name: 'Rooftop proposal' };
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { ...scene, activeSceneId: undefined } },
  });
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await page.waitForTimeout(1500);
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible({ timeout: 30_000 });
  await palette.locator('input').fill('Rooftop proposal');
  const result = palette.getByRole('button', { name: /Rooftop proposal/ }).first();
  await expect(result).toBeVisible({ timeout: 30_000 });
  await result.click();
  await expect(page).toHaveURL(/\/scene\?character=e2e-scene&scene=scene-e2e/, { timeout: 60_000 });
  await expect(page.getByTestId('scene-name')).toHaveValue('Rooftop proposal', { timeout: 60_000 });
});

// M9 T2: a nearly-right shot list is fixed in place — split, moved, merged — its ids kept.
test('a shot list is split, reordered and merged in place', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { isolateSubject: false } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-scripts')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('script-import').click();
  await page
    .getByTestId('script-import-text')
    .fill('INT. CAFE - DAY\n\nNora opens the door. She looks around. She sits by the window.\n');
  await page.getByTestId('script-keep').click();
  await expect(page.getByTestId('script-reading')).toBeVisible();
  const scene = page.getByTestId('script-scene-int-cafe-day');
  if ((await scene.getAttribute('open')) === null) await scene.locator('summary').click();
  await page.getByTestId('script-shots-draft-int-cafe-day').click();
  const rows = page.locator('[data-testid^="script-shot-int-cafe-day~"]');
  await expect(rows).toHaveCount(1);
  const first = rows.first();
  const id = (await first.getAttribute('data-testid'))!.slice('script-shot-'.length);
  await expect(first.getByRole('textbox')).toHaveValue(
    'Nora opens the door. She looks around. She sits by the window.'
  );

  // Split: the first keeps its id and the first half; a new shot takes the rest.
  await page.getByTestId(`script-shot-split-${id}`).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-testid', `script-shot-${id}`);
  await expect(rows.nth(0).getByRole('textbox')).toHaveValue('Nora opens the door. She looks around.');
  await expect(rows.nth(1).getByRole('textbox')).toHaveValue('She sits by the window.');

  // Move it down, then merge the other back into it.
  await page.getByTestId(`script-shot-down-${id}`).click();
  await expect(rows.nth(1)).toHaveAttribute('data-testid', `script-shot-${id}`);
  await page.getByTestId(`script-shot-merge-${id}`).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first().getByRole('textbox')).toHaveValue(
    'She sits by the window. Nora opens the door. She looks around.'
  );
  await page.getByTestId(`script-shot-priority-${(await rows.first().getAttribute('data-testid'))!.slice('script-shot-'.length)}`).selectOption('must');
});

// M9 T3: a script's planned shots as a storyboard — the kept take where there is one, a card where
// there isn't, and a card that makes its Scene.
test('a script is seen as a storyboard: kept takes and cards, a card makes its Scene', async ({ page }) => {
  const scene = sceneWithTakes();
  scene.scenes[0] = { ...scene.scenes[0]!, keptTakeId: 'take-1' };
  const planShot = (n: number, extra: Record<string, unknown>) => ({
    id: `int-kitchen-morning~${n}`,
    sceneId: 'int-kitchen-morning',
    purpose: 'action',
    framing: 'waist',
    who: [],
    seconds: 3,
    ...extra,
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...scene,
        scripts: [
          {
            id: 'script-board',
            castId: CAST,
            name: 'Board test',
            source: 'INT. KITCHEN - MORNING\n\nShe pours coffee. She sits down.\n',
            shots: [
              planShot(1, { action: 'She pours coffee.', madeSceneId: 'scene-e2e' }),
              planShot(2, { action: 'She sits down.' }),
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}&script=script-board`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('script-reading')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('script-board-toggle').click();
  const board = page.getByTestId('storyboard');
  await expect(board).toBeVisible();
  const kept = board.getByTestId('storyboard-card-int-kitchen-morning~1');
  await expect(kept).toHaveAttribute('data-picture', 'kept');
  await expect(kept.getByRole('img', { name: 'Shot 1A' })).toHaveAttribute('src', '/icon.svg?take=1');
  const planned = board.getByTestId('storyboard-card-int-kitchen-morning~2');
  await expect(planned).toHaveAttribute('data-picture', 'none');
  await expect(planned).toContainText('She sits down.');
  await expect(planned).toContainText('Planned');
  await planned.click();
  await expect(planned).toContainText('Scene made', { timeout: 30_000 });
  await shot(page, 'scene-storyboard');

  // M9 T4: the board as an animatic in Cut — the kept take, then a timed card.
  await page.getByTestId('script-animatic').click();
  await expect(page).toHaveURL(/\/cut\?from=script&script=script-board/, { timeout: 60_000 });
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-source-script')).toHaveAttribute('aria-checked', 'true', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('cut-source-scenes')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cut-animatic')).toBeVisible();
  const list = page.getByTestId('cut-shot-list');
  await expect(list.locator('[data-testid^="cut-shot-script:"]')).toHaveCount(2);
  await expect(page.getByTestId('cut-shot-script:int-kitchen-morning.1')).toBeVisible();
  await expect(page.getByTestId('cut-shot-script:int-kitchen-morning.2')).toBeVisible();
  await shot(page, 'cut-animatic');
});

// M3 S2: a screenplay is imported, read scene by scene, kept with the Cast, and deleted.
test('a script is imported, read scene by scene, kept after a reload, and deleted', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: sceneWithTakes() },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-scripts')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('script-import').click();
  await page
    .getByTestId('script-import-text')
    .fill(
      'Title: The Rooftop\n\nINT. KITCHEN - MORNING\n\nShe pours coffee. [[check the cup\n\nNORA\nCoffee first.\n\nEXT. ROOFTOP - NIGHT\n\nThe city.\n'
    );
  // Read before it is kept: two scenes, one speaking part, and the unclosed note said.
  await expect(page.getByTestId('script-summary')).toContainText('2 scenes · 1 speaking part');
  await expect(page.getByTestId('script-issues')).toContainText('never closed');
  await page.getByTestId('script-keep').click();
  await expect(page.getByTestId('script-reading')).toBeVisible();
  await expect(page.getByTestId('script-name')).toHaveValue('The Rooftop');
  await expect(page.getByTestId('script-scene-int-kitchen-morning')).toBeVisible();

  // Who's who (S3): NORA isn't in this Cast — unknown until you say; the kitchen reads as home.
  const nora = page.getByTestId('script-speaker-NORA');
  await expect(nora).toHaveAttribute('data-status', 'unknown');
  await nora.getByRole('combobox').selectOption('none');
  await expect(nora).toHaveAttribute('data-status', 'confirmed');
  await expect(nora).toContainText('Not in the Cast');
  await expect(page.getByTestId('script-place-KITCHEN')).toHaveAttribute('data-choice', 'home');
  await expect(page.getByTestId('script-place-ROOFTOP')).toHaveAttribute('data-choice', 'elsewhere');

  // Kept with the Cast in the app's settings (IndexedDB — what syncs and what a reload reads;
  // a reload here would run the seed again, which replaces the Scene settings).
  await expect
    .poll(() => storedScripts(page), { timeout: 30_000 })
    .toBe(`1|${CAST}|The Rooftop`);

  await page.getByTestId('script-delete').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByRole('button', { name: 'The Rooftop' })).toHaveCount(0);
  await expect.poll(() => storedScripts(page), { timeout: 30_000 }).toBe('0');
});

// M3 S4: a script scene's shots are drafted, one is made a Scene — filled in and linked both ways.
// M6 V6: scripts saved in the Scene settings (before they had their own store) move there, leave
// the settings, and go to the server one script at a time.
test('a script kept in the settings moves to its own store and is sent on its own', async ({
  page,
}) => {
  const sent: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && /\/api\/scene-scripts$/.test(request.url())) {
      sent.push((request.postDataJSON() as { script?: { id?: string } }).script?.id ?? '');
    }
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...sceneWithTakes(),
        scripts: [
          {
            id: 'script-old',
            castId: CAST,
            name: 'Kept before',
            source: 'INT. KITCHEN - MORNING\n\nShe pours coffee.\n',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('script-open-script-old')).toBeVisible({ timeout: 60_000 });
  await expect.poll(() => storedScripts(page), { timeout: 30_000 }).toBe(`1|${CAST}|Kept before`);
  // Out of the settings: their record no longer carries it.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>(resolve => {
              const request = indexedDB.open('comfy-prompt-studio-v1');
              request.onsuccess = () => {
                const get = request.result
                  .transaction('kv', 'readonly')
                  .objectStore('kv')
                  .get('comfy-prompt-tool-settings-tools-v1');
                get.onsuccess = () => {
                  request.result.close();
                  resolve(Array.isArray(get.result?.value?.tools?.scene?.scripts));
                };
              };
            })
        ),
      { timeout: 30_000 }
    )
    .toBe(false);
  await expect.poll(() => sent, { timeout: 30_000 }).toContain('script-old');
});

test('a script scene is drafted into shots and a shot is made a Scene', async ({ page }) => {
  const source = [
    'INT. KITCHEN - MORNING',
    '',
    'She pours coffee.',
    '',
    'NORA',
    'Coffee first.',
    '',
    'TOMAS',
    'You always say that.',
    '',
  ].join('\n');
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...sceneWithTakes(),
        scripts: [
          {
            id: 'script-e2e',
            castId: CAST,
            name: 'Morning',
            source,
            castMap: { NORA: CAST },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('script-open-script-e2e').click({ timeout: 60_000 });
  await page.getByTestId('script-scene-int-kitchen-morning').locator('summary').click();
  await page.getByTestId('script-shots-draft-int-kitchen-morning').click();

  // The draft: establishing wide, her line, his line, his reaction... as planned shots.
  const lead = page.getByTestId('script-shot-int-kitchen-morning~2');
  await expect(page.getByTestId('script-shot-int-kitchen-morning~1')).toBeVisible();
  await expect(lead).toContainText('Coffee first.');
  await expect(lead).toHaveAttribute('data-status', 'planned');

  await page.getByTestId('script-shot-make-int-kitchen-morning~2').click();
  // Opened as the Scene page's scene, named for the shot.
  await expect(page.getByTestId('scene-name')).toHaveValue('1B KITCHEN · Dialogue', {
    timeout: 30_000,
  });
  await expect(lead).toHaveAttribute('data-status', 'made');
  await expect(page.getByTestId('script-shot-status-int-kitchen-morning~2')).toHaveText(
    'Scene made'
  );

  // Stored: the Scene filled in from the script and linked to the shot, and the shot to it.
  await expect
    .poll(
      async () => {
        const tool = JSON.parse((await storedSceneTool(page)) || '{}');
        const made = (tool.scenes ?? []).find(
          (scene: { fromScript?: { shotId: string } }) =>
            scene.fromScript?.shotId === 'int-kitchen-morning~2'
        );
        const shot = tool.scripts?.[0]?.shots?.find(
          (entry: { id: string }) => entry.id === 'int-kitchen-morning~2'
        );
        return made
          ? [
              made.slot.id,
              made.slot.location,
              made.slot.line,
              made.slot.poseCamera?.shot,
              shot?.madeSceneId === made.id,
              tool.activeSceneId === made.id,
            ].join('|')
          : '';
      },
      { timeout: 30_000 }
    )
    .toBe('morning|kitchen at home|Coffee first.|waist|true|true');

  // Coverage (S5): how far the scene has got, and what looks missing — decided like Cut's.
  await expect(page.getByTestId('script-coverage')).toContainText(
    '1 of 1 scene planned · 1 shot made · 0 kept · 0 in the Cut · 1 to look at'
  );
  await expect(page.getByTestId('script-coverage-int-kitchen-morning')).toContainText(
    '4 planned · 1 made · 0 kept · 0 in the Cut'
  );
  const nothingKept = page.getByTestId('script-finding-coverage-kept');
  await expect(nothingKept).toContainText('1 shot made, none kept');
  await page.getByTestId('script-finding-dismiss-coverage-kept').click();
  await expect(nothingKept).toHaveAttribute('data-decision', 'dismissed');
  await expect(page.getByTestId('script-coverage')).not.toContainText('to look at');
});

// M3 S6: a new version is reviewed before it replaces the script; made shots are never lost.
test('a new version of a script is reviewed, and a removed scene keeps its made shots', async ({
  page,
}) => {
  const v1 = 'INT. KITCHEN - MORNING\n\nShe pours coffee.\n\nEXT. ROOFTOP - NIGHT\n\nThe city hums.\n\nINT. OFFICE - DAY\n\nPhones ring.\n';
  const v2 = 'INT. KITCHEN - MORNING\n\nShe pours coffee.\n\nEXT. ROOFTOP - LATE NIGHT\n\nThe city hums. Sirens.\n\nINT. BAR - NIGHT\n\nGlasses clink.\n';
  const shot = (sceneId: string, extra: Record<string, unknown> = {}) => ({
    id: `${sceneId}~1`,
    sceneId,
    purpose: 'establishing',
    framing: 'full',
    who: [],
    seconds: 3,
    ...extra,
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...sceneWithTakes(),
        scripts: [
          {
            id: 'script-e2e',
            castId: CAST,
            name: 'Versions',
            source: v1,
            shots: [
              shot('int-kitchen-morning'),
              shot('ext-rooftop-night'),
              // The office's shot became the seeded Scene (with its two takes).
              shot('int-office-day', { madeSceneId: 'scene-e2e' }),
              { ...shot('int-office-day'), id: 'int-office-day~2', purpose: 'action' },
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('script-open-script-e2e').click({ timeout: 60_000 });
  await page.getByTestId('script-reimport-open').click();
  await page.getByTestId('script-reimport-text').fill(v2);

  await expect(page.getByTestId('script-reimport-summary')).toHaveText(
    '1 same · 1 changed · 1 new · 1 removed'
  );
  await expect(page.getByTestId('script-reimport-row-ext-rooftop-night')).toContainText(
    'matched by heading'
  );
  const office = page.getByTestId('script-reimport-row-int-office-day');
  await expect(office).toHaveAttribute('data-status', 'removed');
  await expect(office).toContainText('1 shot made into Scenes stay');
  // Drop the office's planned shot; the made one stays whatever.
  await page.getByTestId('script-reimport-drop-int-office-day').check();
  await page.getByTestId('script-reimport-apply').click();
  await page.getByTestId('confirm-dialog-confirm').click();

  await expect(page.getByTestId('script-reimport')).toHaveCount(0);
  await expect(page.getByTestId('script-scene-int-bar-night')).toBeVisible();
  // The office's made shot, listed as no longer in the script, with its Scene's takes.
  const orphan = page.getByTestId('script-orphan-int-office-day~1');
  await expect(orphan).toBeVisible();
  await expect(orphan).toContainText('2 takes');
  await expect(page.getByTestId('script-orphan-int-office-day~2')).toHaveCount(0);

  await expect
    .poll(async () => {
      const tool = JSON.parse((await storedSceneTool(page)) || '{}');
      const script = tool.scripts?.[0];
      return script
        ? [
            script.source.includes('INT. BAR - NIGHT'),
            (script.shots ?? []).map((entry: { id: string; sceneId: string }) => `${entry.id}>${entry.sceneId}`).join(','),
          ].join('|')
        : '';
    })
    .toBe(
      'true|int-kitchen-morning~1>int-kitchen-morning,ext-rooftop-night~1>ext-rooftop-late-night,int-office-day~1>int-office-day'
    );
});

// M5 W3: a run is prepared from a script — Scenes made, the list and its limits — nothing renders.
test('a run is prepared from a script: its Scenes made, listed within limits, nothing queued', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  const shot = (id: string, sceneId: string, purpose: string, framing: string) => ({
    id,
    sceneId,
    purpose,
    framing,
    who: [],
    seconds: 3,
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...sceneWithTakes(),
        scripts: [
          {
            id: 'script-run',
            castId: CAST,
            name: 'Morning',
            source: 'INT. KITCHEN - MORNING\n\nShe pours coffee.\n\nEXT. ROOF - NIGHT\n\nWind.\n',
            shots: [
              shot('int-kitchen-morning~1', 'int-kitchen-morning', 'establishing', 'full'),
              shot('int-kitchen-morning~2', 'int-kitchen-morning', 'action', 'waist'),
              shot('ext-roof-night~1', 'ext-roof-night', 'establishing', 'full'),
            ],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}&script=script-run`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('script-prepare-run').click({ timeout: 60_000 });
  await expect(page.getByTestId('script-prepare-note')).toContainText(
    '3 planned shots made into Scenes'
  );
  const run = page.getByTestId('scene-run');
  await expect(run).toBeVisible();
  await expect(page.getByTestId('scene-run-summary')).toContainText('3 takes, one at a time');
  await expect(page.getByTestId('scene-run-summary')).toContainText('it never keeps a take');

  // Limits: one take; the rest wait. A Scene can be left out.
  await page.getByTestId('scene-run-max-takes').fill('1');
  await expect(page.getByTestId('scene-run-summary')).toContainText('1 take, one at a time');
  await expect(page.getByTestId('scene-run-summary')).toContainText('2 past the limits');
  await expect(run.locator('li[data-queued="true"]')).toHaveCount(1);

  // Stored: three new Scenes linked to their shots, the open Scene unchanged, and nothing queued.
  await expect
    .poll(async () => {
      const tool = JSON.parse((await storedSceneTool(page)) || '{}');
      const made = (tool.scenes ?? []).filter((entry: { fromScript?: unknown }) => entry.fromScript);
      const linked = (tool.scripts?.[0]?.shots ?? []).filter(
        (entry: { madeSceneId?: string }) => entry.madeSceneId
      );
      return [made.length, linked.length, tool.activeSceneId, tool.run?.state, tool.run?.maxTakes].join('|');
    })
    .toBe('3|3|scene-e2e|prepared|1');
  expect(queued).toHaveLength(0);

  await page.getByTestId('scene-run-discard').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(run).toHaveCount(0);
});

// M5 W4: a run renders its Scenes one at a time with the page's own Render, never keeps a take,
// and after a reload waits for the take in flight instead of queueing it again.
test('a run renders Scene by Scene, keeps nothing, and resumes without a second job', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  // Every job the engine is asked about has finished, with a picture.
  await page.route('**/api/comfyui/jobs**', route =>
    route.fulfill({
      json: {
        status: {
          status: 'completed',
          images: [{ filename: 'e2e-run.png', subfolder: '', type: 'output' }],
        },
      },
    })
  );
  for (const check of ['adult-check', 'play-checks', 'face-match', 'marks-check']) {
    await page.route(`**/api/${check}**`, route => route.fulfill({ json: { ok: true, skipped: true } }));
  }
  const empty = (id: string, name: string, at: number) => ({
    id,
    castId: CAST,
    name,
    slot: { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
    takes: [],
    createdAt: at,
    updatedAt: at,
  });
  const base = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: {
        scene: {
          ...base,
          scenes: [
            { ...base.scenes[0]!, keptTakeId: 'take-1' },
            empty('run-a', 'Run A', 3),
            empty('run-b', 'Run B', 4),
          ],
          run: {
            id: 'run-e2e',
            castId: CAST,
            label: 'E2E run',
            // The kept-take Scene is left out; A then B.
            items: [
              { sceneId: 'scene-e2e', include: true },
              { sceneId: 'run-a', include: true },
              { sceneId: 'run-b', include: true },
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
  await expect(page.getByTestId('scene-run-state')).toContainText('2 of 2 done');
  expect(queued).toHaveLength(2);

  // Each Scene got its take; none was kept for you.
  await expect
    .poll(async () => {
      const tool = JSON.parse((await storedSceneTool(page)) || '{}');
      const byId = Object.fromEntries(
        (tool.scenes ?? []).map((entry: { id: string; takes: unknown[]; keptTakeId?: string }) => [
          entry.id,
          `${entry.takes.length}${entry.keptTakeId ? 'k' : ''}`,
        ])
      );
      return [byId['run-a'], byId['run-b'], tool.run?.outcomes?.['run-a'], tool.run?.outcomes?.['run-b']].join('|');
    }, { timeout: 30_000 })
    .toBe('1|1|landed|landed');
  await page.getByTestId('scene-run-log').locator('summary').click();
  await expect(page.getByTestId('scene-run-log').locator('[data-event="queued"]')).toHaveCount(2);
});

// M5 W4: a run left running by a reload shows as paused; Resume waits for the take in flight.
test('after a reload a run is paused, and Resume waits for the take in flight', async ({ page }) => {
  const queued = await stubComfyQueue(page);
  await page.route('**/api/comfyui/jobs**', route =>
    route.fulfill({
      json: {
        status: {
          status: 'completed',
          images: [{ filename: 'e2e-run.png', subfolder: '', type: 'output' }],
        },
      },
    })
  );
  for (const check of ['adult-check', 'play-checks', 'face-match', 'marks-check']) {
    await page.route(`**/api/${check}**`, route => route.fulfill({ json: { ok: true, skipped: true } }));
  }
  const empty = (id: string, name: string, at: number) => ({
    id,
    castId: CAST,
    name,
    slot: { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
    takes: [],
    createdAt: at,
    updatedAt: at,
  });
  const base = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: {
        scene: {
          ...base,
          scenes: [base.scenes[0]!, empty('run-a', 'Run A', 3), empty('run-b', 'Run B', 4)],
          run: {
            id: 'run-reload',
            castId: CAST,
            label: 'Reloaded run',
            items: [
              { sceneId: 'run-a', include: true },
              { sceneId: 'run-b', include: true },
            ],
            maxTakes: 8,
            maxMinutes: 60,
            skipKept: true,
            // Left running, Run A's take queued when the page went away.
            state: 'running',
            position: 0,
            current: { sceneId: 'run-a', promptId: 'e2e-inflight', at: Date.now() },
            startedAt: Date.now(),
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
  const now = Date.now();
  await replaceGalleryIdb(page, [
    {
      id: 'e2e-inflight',
      promptId: 'e2e-inflight',
      prompt: 'Run A',
      tool: 'day',
      characterId: CAST,
      comfyUrl: 'http://127.0.0.1:8188',
      status: 'pending',
      queuedAt: now - 2000,
      images: [],
    },
  ]);
  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'paused', {
    timeout: 60_000,
  });
  await expect(page.getByTestId('scene-run-stop-reason')).toContainText('reloaded');

  await page.getByTestId('scene-run-start').click();
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'done', {
    timeout: 120_000,
  });
  // Run A's take was waited for, not queued again: the only new job is Run B's.
  expect(queued).toHaveLength(1);
  await expect
    .poll(async () => {
      const tool = JSON.parse((await storedSceneTool(page)) || '{}');
      return [tool.run?.outcomes?.['run-a'], tool.run?.outcomes?.['run-b']].join('|');
    })
    .toBe('landed|landed');
});

// M5 W4: Pause stops after the take in flight; nothing else is queued.
test('Pause stops the run after the take rendering now', async ({ page }) => {
  const queued = await stubComfyQueue(page);
  let finish = false;
  await page.route('**/api/comfyui/jobs**', route =>
    route.fulfill({
      json: {
        status: finish
          ? { status: 'completed', images: [{ filename: 'e2e-run.png', subfolder: '', type: 'output' }] }
          : { status: 'running' },
      },
    })
  );
  for (const check of ['adult-check', 'play-checks', 'face-match', 'marks-check']) {
    await page.route(`**/api/${check}**`, route => route.fulfill({ json: { ok: true, skipped: true } }));
  }
  const empty = (id: string, name: string, at: number) => ({
    id,
    castId: CAST,
    name,
    slot: { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
    takes: [],
    createdAt: at,
    updatedAt: at,
  });
  const base = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: {
        scene: {
          ...base,
          scenes: [base.scenes[0]!, empty('run-a', 'Run A', 3), empty('run-b', 'Run B', 4)],
          run: {
            id: 'run-pause',
            castId: CAST,
            label: 'Paused run',
            items: [
              { sceneId: 'run-a', include: true },
              { sceneId: 'run-b', include: true },
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
  await page.getByTestId('scene-run-start').click({ timeout: 60_000 });
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBe(1);
  await page.getByTestId('scene-run-pause').click();
  await expect(page.getByTestId('scene-run-state')).toContainText('pausing after this take');
  finish = true;
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'paused', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('scene-run-state')).toContainText('1 of 2 done');
  expect(queued).toHaveLength(1);
  await expect(page.getByTestId('scene-run-start')).toHaveText('Resume');
});

/** A Scene page with two empty Scenes and a run over them (M5 W4 / W5), the engine stubbed. */
async function seedRunPage(
  page: Page,
  run: Record<string, unknown>,
  jobs: () => Record<string, unknown> = () => ({
    status: 'completed',
    images: [{ filename: 'e2e-run.png', subfolder: '', type: 'output' }],
  })
) {
  const queued = await stubComfyQueue(page);
  await page.route('**/api/comfyui/jobs**', route => route.fulfill({ json: { status: jobs() } }));
  for (const check of ['adult-check', 'play-checks', 'face-match', 'marks-check']) {
    await page.route(`**/api/${check}**`, route =>
      route.fulfill({ json: { ok: true, skipped: true } })
    );
  }
  const empty = (id: string, name: string, at: number) => ({
    id,
    castId: CAST,
    name,
    slot: { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
    takes: [],
    createdAt: at,
    updatedAt: at,
  });
  const base = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: {
        scene: {
          ...base,
          scenes: [base.scenes[0]!, empty('run-a', 'Run A', 3), empty('run-b', 'Run B', 4)],
          run: {
            id: 'run-w5',
            castId: CAST,
            label: 'W5 run',
            items: [
              { sceneId: 'run-a', include: true },
              { sceneId: 'run-b', include: true },
            ],
            maxTakes: 8,
            maxMinutes: 60,
            skipKept: true,
            state: 'prepared',
            position: 0,
            log: [],
            createdAt: 1,
            updatedAt: 1,
            ...run,
          },
        },
      },
    },
    { once: true }
  );
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  return queued;
}

// M5 W5: the take limit holds, and Film Director shows what the run did.
test('a run stops at its take limit, and Film Director shows its log', async ({ page }) => {
  const queued = await seedRunPage(page, { maxTakes: 1 });
  await page.getByTestId('scene-run-start').click({ timeout: 60_000 });
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'done', {
    timeout: 120_000,
  });
  expect(queued).toHaveLength(1);

  await gotoStable(page, '/production');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('director-run-state')).toHaveAttribute('data-state', 'done', {
    timeout: 30_000,
  });
  const log = page.getByTestId('director-run-log');
  await expect(log.locator('[data-event="queued"]')).toHaveCount(1);
  await expect(log.locator('[data-event="landed"]')).toHaveCount(1);
  await expect(log.locator('[data-event="done"]')).toContainText('take limit');
});

// M5 W5: Cancel stops after the take in flight; nothing else is queued.
test('Cancel stops the run after the take in flight, and nothing else is queued', async ({
  page,
}) => {
  let finish = false;
  const queued = await seedRunPage(page, {}, () =>
    finish
      ? { status: 'completed', images: [{ filename: 'e2e-run.png', subfolder: '', type: 'output' }] }
      : { status: 'running' }
  );
  await page.getByTestId('scene-run-start').click({ timeout: 60_000 });
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBe(1);
  await page.getByTestId('scene-run-cancel').click();
  await expect(page.getByTestId('scene-run-state')).toContainText('cancelling after this take');
  finish = true;
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'cancelled', {
    timeout: 120_000,
  });
  // A moment more: nothing else goes to the engine.
  await page.waitForTimeout(3_000);
  expect(queued).toHaveLength(1);
  await expect(page.getByTestId('scene-run-start')).toHaveCount(0);
});

// H1 (ROADMAP §10): the engine restarts mid-job and no longer knows it — the run stops with the
// reason, nothing else is queued, and Film Director lists the lost job.
test('engine lost the job mid-run: the run pauses with why, and the job shows as lost', async ({
  page,
}) => {
  const queued = await seedRunPage(page, {}, () => ({
    status: 'error',
    statusMessage: 'Prompt not found on the engine (it restarted)',
  }));
  await page.getByTestId('scene-run-start').click({ timeout: 60_000 });
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'paused', {
    timeout: 120_000,
  });
  await expect(page.getByTestId('scene-run-stop-reason')).toContainText('failed');
  expect(queued).toHaveLength(1);

  await gotoStable(page, '/production');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('director-jobs-lost')).toContainText('1', { timeout: 30_000 });
  await expect(page.getByTestId('director-next-run-paused')).toBeVisible();
});

// H1 (ROADMAP §10): the render lands but keeping its media fails — the take is still there.
test('a take lands while the Gallery can’t store its media: the take is kept, not lost', async ({
  page,
}) => {
  await page.route('**/api/gallery/media/persist**', route =>
    route.fulfill({ status: 500, json: { error: 'e2e: disk unavailable' } })
  );
  const queued = await seedRunPage(page, { maxTakes: 1 });
  await page.getByTestId('scene-run-start').click({ timeout: 60_000 });
  await expect(page.getByTestId('scene-run-state')).toHaveAttribute('data-state', 'done', {
    timeout: 120_000,
  });
  expect(queued).toHaveLength(1);
  await expect
    .poll(async () => {
      const tool = JSON.parse((await storedSceneTool(page)) || '{}');
      const scene = (tool.scenes ?? []).find((entry: { id: string }) => entry.id === 'run-a');
      return [scene?.takes?.length ?? 0, Boolean(scene?.takes?.[0]?.imageUrl)].join('|');
    }, { timeout: 30_000 })
    .toBe('1|true');
});

// H1 (ROADMAP §10): ComfyUI refuses the job — a model it doesn't have. The error says which,
// and offers the fix (Models) and Retry.
test('a missing model: the error names it and links to Models', async ({ page }) => {
  await stubComfyQueue(page);
  await page.route(/\/api\/comfyui\/?(?:\?|$)/, route =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 400,
          json: {
            error:
              "Prompt outputs failed validation: CheckpointLoaderSimple: Value not in list: ckpt_name: 'missing-model.safetensors' not in ['other.safetensors']",
          },
        })
      : route.fallback()
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: sceneWithTakes() },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('scene-queue-take').click({ timeout: 60_000 });
  const message = page.getByText(/missing-model\.safetensors/).first();
  await expect(message).toBeVisible({ timeout: 30_000 });
  const models = page.getByRole('link', { name: 'Models' });
  await expect(models.first()).toHaveAttribute('href', /settings\?tab=comfyui&section=model-assets/);
  await expect(page.getByRole('button', { name: 'Retry' }).first()).toBeVisible();
});

// R4: a take says how it was made — read from its Gallery entry.
test('a take says how it was made, and when its Gallery entry is gone', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: (() => {
        const seeded = sceneWithTakes();
        return {
          ...seeded,
          scenes: seeded.scenes.map(scene => ({
            ...scene,
            takes: [
              ...scene.takes,
              { id: 'take-3', promptId: 'take-3', imageUrl: '/icon.svg?take=3', at: 3 },
            ],
          })),
        };
      })(),
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          id: 'e2e-take-1-entry',
          promptId: 'take-1',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: stirring a pot of risotto at the stove',
          characterId: 'e2e-scene',
          model: 'qwen-e2e-model',
          queueParams: { seed: 777, width: 832, height: 1216, steps: 8 },
          hasStoredWorkflow: true,
          workflowJson: '{"1":{"class_type":"KSampler","inputs":{}}}',
          status: 'completed',
          queuedAt: Date.now() - 60_000,
          completedAt: Date.now() - 18_000,
          renderDurationMs: 42_000,
          images: [{ filename: 'e2e-take-1.png', subfolder: '', type: 'output' }],
        },
        {
          // Came by server sync: says it has a stored graph, but graphs never sync.
          id: 'e2e-take-3-entry',
          promptId: 'take-3',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: by the window',
          model: 'qwen-e2e-model',
          hasStoredWorkflow: true,
          status: 'completed',
          queuedAt: Date.now() - 30_000,
          completedAt: Date.now() - 10_000,
          images: [{ filename: 'e2e-take-3.png', subfolder: '', type: 'output' }],
        },
      ])
    );
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(3, { timeout: 60_000 });

  await page.getByTestId('scene-take-made-0').click();
  const dialog = page.getByTestId('scene-take-provenance');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('How take 1 was made');
  await expect(page.getByTestId('scene-take-provenance-still-made-with')).toContainText('Scene');
  await expect(page.getByTestId('scene-take-provenance-still-model')).toContainText('qwen-e2e-model');
  await expect(page.getByTestId('scene-take-provenance-still-seed')).toContainText('777');
  await expect(page.getByTestId('scene-take-provenance-still-size')).toContainText('832 × 1216');
  await expect(page.getByTestId('scene-take-provenance-still-render-time')).toContainText('42 s');
  await expect(page.getByTestId('scene-take-provenance-still-cast')).toContainText('Scene Cast');
  await expect(page.getByTestId('scene-take-provenance-still-graph')).toContainText('Stored');
  await expect(page.getByTestId('scene-take-provenance-still-prompt')).toContainText('risotto');
  await shot(page, 'scene-desk-take-provenance');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Take 2 has no Gallery entry in this browser: it says so instead of inventing details.
  await page.getByTestId('scene-take-made-1').click();
  await expect(page.getByTestId('scene-take-provenance-missing')).toBeVisible();
  await expect(page.getByTestId('scene-take-provenance-still')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Take 3's entry claims a stored graph it doesn't have here: it says so.
  await page.getByTestId('scene-take-made-2').click();
  await expect(page.getByTestId('scene-take-provenance-still-graph')).toContainText(
    'Not stored with this render'
  );
});

// R7: the kept take is what Cut uses — removing it asks first; deleting the scene says so.
test('removing the kept take asks first, and deleting a scene says what Cut loses', async ({
  page,
}) => {
  const seeded = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...seeded,
        scenes: seeded.scenes.map(scene => ({ ...scene, keptTakeId: 'take-1' })),
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const takes = page.getByTestId('scene-take');
  await expect(takes).toHaveCount(2, { timeout: 60_000 });
  await expect(takes.nth(0)).toHaveAttribute('data-kept', 'true');

  // The kept take: asked, and Cancel keeps it.
  await page.getByTestId('scene-take-remove-0').click();
  const ask = page.getByTestId('scene-remove-kept-confirm');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('leaves the cut');
  await page.getByTestId('confirm-dialog-cancel').click();
  await expect(takes).toHaveCount(2);

  // Delete says Cut loses the shot (and Keep keeps the scene).
  await page.getByTestId('scene-delete').click();
  await expect(page.getByTestId('scene-delete-cut-note')).toContainText('leaves the cut');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();

  // Confirmed, it goes; a take that isn't kept goes at once.
  await page.getByTestId('scene-take-remove-0').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(takes).toHaveCount(1);
  await page.getByTestId('scene-take-remove-0').click();
  await expect(takes).toHaveCount(0);
  await expect(page.getByTestId('scene-remove-kept-confirm')).toHaveCount(0);
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

/** Horizontal overflow (px) of the page, and what sticks out (outside any scrolling strip). */
async function horizontalOverflow(page: Page): Promise<{ over: number; wide: string[] }> {
  return page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(el => {
        const box = el.getBoundingClientRect();
        if (!box.width || box.right <= window.innerWidth + 1) return false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return false;
        }
        return true;
      })
      .slice(0, 8)
      .map(el => `${el.tagName}[${el.dataset.testid ?? ''}] →${Math.round(el.getBoundingClientRect().right)}`);
    return { over, wide };
  });
}

/** Of these bars, the ones whose own background lets what is behind them show (alpha < 1). */
async function translucentBars(page: Page, testIds: string[]): Promise<string[]> {
  return page.evaluate(
    ids =>
      ids.flatMap(id => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!el) return [`no ${id}`];
        const color = getComputedStyle(el).backgroundColor;
        const parts = (color.match(/\(([^)]*)\)/)?.[1] ?? '').split(/[\s,/]+/).filter(Boolean);
        const alpha = parts.length > 3 ? Number(parts[3]) : color.startsWith('rgb') ? 1 : 0;
        return alpha >= 1 ? [] : [`${id}: ${color}`];
      }),
    testIds
  );
}

/** Visible controls in `selector` smaller than 44 × 44 px (a phone tap target). */
async function smallTapTargets(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(root => {
    const scope = document.querySelector(root);
    if (!scope) return [`no ${root}`];
    const controls: HTMLElement[] = [
      ...scope.querySelectorAll<HTMLElement>(
        'button, a[href], select, input:not([type=hidden]):not(.sr-only), textarea, [role=radio]'
      ),
    ];
    return controls
      // A checkbox is tapped through its label.
      .map(el => (el.matches('input') && el.closest('label')) || el)
      .filter(el => {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') return false;
        return box.height < 44 || box.width < 44;
      })
      .map(el => {
        const box = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
        return `${el.tagName}[${el.dataset.testid ?? ''}] "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`;
      });
  }, selector);
}

for (const [width, height] of [
  [360, 780],
  [390, 844],
  [430, 932],
  [844, 390],
] as const) {
  test(`phone ${width}×${height}: its own layout — fits, 44 px targets, sheets, Queue in reach`, async ({
    browser,
  }) => {
    // A phone: touch, mobile viewport.
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      storageState: undefined,
    });
    const page = await context.newPage();
    await isolateServerStorage(page);
    await ensureAuthenticated(page);
    await stubComfyQueue(page);
    await seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: { scene: sceneWithTakes() },
    });
    await gotoStable(page, `/m/scene?character=${CAST}`);
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('scene-phone')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
    // Not the desk page in the phone shell.
    await expect(page.getByTestId('scene-plan-bar')).toHaveCount(0);
    await expect(page.getByTestId('scene-shot-summary')).toBeVisible();

    const { over, wide } = await horizontalOverflow(page);
    expect(over, wide.join('\n')).toBeLessThanOrEqual(1);
    // Scene's own controls (the shell and the get-started card are other pages' too).
    for (const root of [
      '[data-testid="scene-list"]',
      '[data-testid="scene-shot"]',
      '[data-testid="scene-take-list"]',
      '[data-testid="scene-shot-summary"]',
      '[data-testid="scene-move"]',
      '[data-testid="scene-action-bar"]',
    ]) {
      expect(await smallTapTargets(page, root), root).toEqual([]);
    }
    // Each summary row reads label | value | ›: the label starts inside the card, left-aligned
    // (a long value used to centre the row and push "Shot" off the left edge at 360 px).
    const clipped = await page
      .locator('[data-testid="scene-shot-summary"] button')
      .evaluateAll(rows =>
        rows.flatMap(row => {
          const box = row.getBoundingClientRect();
          const label = row.querySelector('span');
          if (!label) return [];
          const lb = label.getBoundingClientRect();
          return lb.left < box.left - 0.5 || lb.left > box.left + 24
            ? [`${label.textContent}: label at ${Math.round(lb.left)}, row at ${Math.round(box.left)}`]
            : [];
        })
      );
    expect(clipped).toEqual([]);
    // The header, the Film dock and the pinned Queue bar are opaque: scrolled text never shows
    // through them (light and dark).
    for (const theme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      expect(
        await translucentBars(page, ['mobile-studio-header', 'mobile-studio-dock', 'scene-action-bar']),
        theme
      ).toEqual([]);
    }
    // The takes: one swipeable strip.
    const strip = await page
      .getByTestId('scene-take-list')
      .evaluate(el => getComputedStyle(el).overflowX);
    expect(strip).toBe('auto');
    await shot(page, `scene-phone-${width}`);

    // Queue a take stays in reach while the page scrolls.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bar = await page.getByTestId('scene-action-bar').boundingBox();
    expect(bar).not.toBeNull();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(height + 1);
    await expect(page.getByTestId('scene-queue-take')).toHaveText('Another take');
    await page.evaluate(() => window.scrollTo(0, 0));

    // Each sheet opens as a phone sheet and fits.
    const sheets: Array<[string, string]> = [
      ['scene-edit-shot', 'scene-shot-sheet'],
      ['scene-edit-mood', 'scene-mood-sheet'],
      ['scene-edit-engine', 'scene-engine-sheet'],
      ['scene-send-day', 'scene-send-day-sheet'],
    ];
    for (const [opener, sheet] of sheets) {
      await page.getByTestId(opener).tap();
      const dialog = page.getByTestId(sheet);
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect((await horizontalOverflow(page)).over).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
    // The shot sheet holds Day's slot editor; Queue from it too.
    await page.getByTestId('scene-action-edit').tap();
    await expect(page.getByTestId('scene-shot-sheet')).toBeVisible();
    await expect(page.getByTestId('day-slot-location')).toHaveValue('small kitchen');
    await page.keyboard.press('Escape');

    // Make it move from the kept take: Animate and Copy moves open their sheets.
    await page.getByTestId('scene-take-keep-0').tap();
    await expect(page.getByTestId('scene-take').nth(0)).toHaveAttribute('data-kept', 'true');
    await page.getByTestId('scene-animate').tap();
    await expect(page.getByTestId('day-animate-sheet')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('scene-copy-moves').tap();
    await expect(page.getByTestId('slot-media-sheet')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await context.close();
  });
}

test('queue: the Scene page’s jobs are labelled Scene, not Day', async ({ page }) => {
  const scene = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...scene,
        stills: [{ slotId: 'evening', promptId: 'e2e-scene-live', status: 'running' }],
        // A take dropped from the scene: still Scene's job.
        jobLog: [{ promptId: 'e2e-scene-dropped', scene: 'Kitchen', kind: 'still' }],
      },
    },
  });
  await page.addInitScript(cast => {
    const now = Date.now();
    window.localStorage.setItem('comfy-prompt-characters-v1', JSON.stringify(cast));
    const base = {
      comfyUrl: 'http://127.0.0.1:8188',
      // Queued like a Day still: the edit pipeline, a Day still's prompt.
      tool: 'image-prompt',
      prompt: 'Edit instruction for a Day still: stirring risotto',
      characterId: 'e2e-scene',
      model: 'qwen-e2e',
      images: [],
    };
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        { ...base, id: 'e2e-scene-live', promptId: 'e2e-scene-live', status: 'running', queuedAt: now - 20_000 },
        { ...base, id: 'e2e-scene-dropped', promptId: 'e2e-scene-dropped', status: 'pending', queuePosition: 1, queuedAt: now - 10_000 },
      ])
    );
  }, cast);
  await gotoStable(page, '/queue');
  await dismissBlockingOverlays(page);
  const batch = page.getByTestId('queue-batch');
  await expect(batch).toContainText('Scene · 2 jobs', { timeout: 30_000 });
  await expect(batch.getByText('Scene · Kitchen · Scene Cast').first()).toBeVisible();
  await expect(batch.getByRole('link', { name: 'Open in Scene' }).first()).toHaveAttribute(
    'href',
    `/scene?character=${CAST}`
  );
  await expect(page.getByText(/^Day · /)).toHaveCount(0);
});

test('Make it move: the clip engine choice (Day’s), its requirements, and Animate renders on it', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { ...sceneWithTakes(), dayMood: 'intimate', intimateMix: 'duo' } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
  // Only once a take is kept (Make it move starts from it).
  await expect(page.getByTestId('scene-clip-engine')).toHaveCount(0);
  await page.getByTestId('scene-take-keep-1').click();
  const block = page.getByTestId('scene-clip-engine');
  await expect(block).toBeVisible();
  await expect(block).toContainText('Animate clips on');
  await expect(page.getByTestId('scene-clip-engine-hint')).toContainText('Wan Animate');
  // Day's own setting: what Day's Animate uses, so Scene's too.
  await page.getByTestId('clip-engine-day').selectOption('wan');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>(resolve => {
              const request = indexedDB.open('comfy-prompt-studio-v1');
              request.onsuccess = () => {
                const get = request.result
                  .transaction('kv', 'readonly')
                  .objectStore('kv')
                  .get('comfy-prompt-tool-settings-tools-v1');
                get.onsuccess = () => resolve(String(get.result?.value?.tools?.video?.dayClips ?? ''));
              };
            })
        ),
      { timeout: 15_000 }
    )
    .toBe('wan');
  await page.getByTestId('scene-animate').click();
  await expect(page.getByTestId('day-animate-sheet')).toBeVisible({ timeout: 30_000 });
  const before = queued.length;
  await page.getByTestId('day-animate-submit').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(before);
  const body = queued.at(-1)!;
  // The clip renders on WAN (the engine picked), not LTX-2.5.
  const model = (JSON.parse(body) as { model?: string }).model ?? '';
  expect(model).toMatch(/^wan-video/);
  await shot(page, 'scene-desk-clip-engine');
});

for (const phone of [false, true]) {
  test(`${phone ? 'phone' : 'desk'}: a take with a clip opens the clip in the lightbox, a still-only take the still`, async ({
    page,
  }) => {
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const clip = '/e2e-scene-clip.mp4';
    await page.route(`**${clip}`, route =>
      route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(16) })
    );
    const seeded = sceneWithTakes();
    const scene = seeded.scenes[0]!;
    await seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: {
        scene: {
          ...seeded,
          scenes: [
            {
              ...scene,
              keptTakeId: 'take-2',
              takes: [scene.takes[0], { ...scene.takes[1], clipUrl: clip, clipPromptId: 'clip-2' }],
            },
          ],
          stills: [
            {
              slotId: 'evening',
              promptId: 'take-2',
              imageUrl: '/icon.svg?take=2',
              status: 'completed',
              clipUrl: clip,
              clipPromptId: 'clip-2',
              clipStatus: 'completed',
            },
          ],
        },
      },
    });
    await gotoStable(page, `${phone ? '/m/scene' : '/scene'}?character=${CAST}`);
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
    const lightbox = page.getByTestId('image-lightbox');
    // What the lightbox shows (its Open original link is the slide's own file).
    const shown = lightbox.getByRole('link', { name: 'Open original' });

    // The card: its clip (as on Day).
    await page.getByTestId('day-slot-select-evening').click();
    await expect(lightbox).toBeVisible({ timeout: 30_000 });
    await expect(shown).toHaveAttribute('href', clip);
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);

    // The kept take in Make it move: its clip.
    await page.getByTestId('scene-kept-open').click();
    await expect(shown).toHaveAttribute('href', clip);
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);

    // A still-only take on the card opens the still.
    await page.getByTestId('scene-take-show-0').click();
    await expect(page.getByTestId('scene-take').nth(0)).toHaveAttribute('data-on-card', 'true');
    await page.getByTestId('day-slot-select-evening').click();
    await expect(lightbox).toBeVisible({ timeout: 30_000 });
    await expect(shown).toHaveAttribute('href', /take=1/);
  });
}

test('phone: every /m page has an opaque header and Film dock, dark and light', async ({ browser }) => {
  for (const colorScheme of ['dark', 'light'] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme,
    });
    const page = await context.newPage();
    await isolateServerStorage(page);
    await ensureAuthenticated(page);
    await stubComfyQueue(page);
    await seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: { scene: sceneWithTakes() },
    });
    for (const path of ['/m', '/m/film', '/m/day', '/m/scene', '/m/story', '/m/fitting', '/m/cut', '/m/gallery', '/m/queue']) {
      await gotoStable(page, `${path}?character=${CAST}`);
      await dismissBlockingOverlays(page);
      await expect(page.getByTestId('mobile-studio-dock')).toBeVisible({ timeout: 60_000 });
      expect(
        await translucentBars(page, ['mobile-studio-header', 'mobile-studio-dock']),
        `${path} ${colorScheme}`
      ).toEqual([]);
    }
    await context.close();
  }
});

/** The Scene page seeded with two scenes of the Cast, Kitchen open. */
function twoScenes(stills: Array<Record<string, unknown>>) {
  const seeded = sceneWithTakes();
  return {
    ...seeded,
    scenes: [
      ...seeded.scenes,
      {
        id: 'scene-roof',
        castId: CAST,
        name: 'Rooftop',
        slot: { id: 'night', label: 'Night', location: 'rooftop bar', sceneHints: 'laughing at the rail' },
        dayMood: 'everyday',
        takes: [],
        createdAt: 3,
        updatedAt: 3,
      },
    ],
    stills,
  };
}

test('a take at the adult check: another scene opens, and the verdict lands on its own scene', async ({
  page,
}) => {
  await stubComfyQueue(page);
  // The vision model's answer waits until the other scene is open.
  let answer: () => void = () => {};
  const answered = new Promise<void>(resolve => {
    answer = resolve;
  });
  let asked = 0;
  await page.route('**/api/adult-check', async route => {
    asked += 1;
    await answered;
    await route.fulfill({
      json: { available: true, reply: { answer: 'yes', confidence: 97, youngestAge: 32, people: 1 } },
    });
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: twoScenes([{ slotId: 'evening', promptId: 'e2e-checking', status: 'running' }]),
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          id: 'e2e-checking',
          promptId: 'e2e-checking',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: stirring risotto',
          characterId: 'e2e-scene',
          model: 'qwen-e2e',
          status: 'completed',
          queuedAt: Date.now() - 20_000,
          images: [{ filename: 'e2e-checking.png', subfolder: '', type: 'output' }],
          adultCheck: { state: 'pending', at: Date.now() - 5_000 },
        },
      ])
    );
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
  // Checking, not rendering.
  await expect(page.getByTestId('scene-queue-take')).toHaveText('Checking…', { timeout: 30_000 });
  await expect.poll(() => asked, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('scene-new')).toBeEnabled();

  // Another scene opens while the take is checked.
  await page.getByTestId('scene-list-item-scene-roof').click();
  await expect(page.getByTestId('scene-name')).toHaveValue('Rooftop');
  await expect(page.getByTestId('scene-note')).toContainText('being checked');
  await expect(page.getByTestId('scene-note')).not.toContainText('rendering');
  await expect(page.getByTestId('scene-take')).toHaveCount(0);

  // The verdict: the take joins Kitchen, not the open Rooftop.
  answer();
  await expect(page.getByTestId('scene-list-item-scene-e2e')).toContainText('3 takes', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('scene-list-item-scene-roof')).toContainText('No takes yet');
  await expect(page.getByTestId('scene-take')).toHaveCount(0);
  await shot(page, 'scene-check-switched');
  await page.getByTestId('scene-list-item-scene-e2e').click();
  await expect(page.getByTestId('scene-name')).toHaveValue('Kitchen');
  await expect(page.getByTestId('scene-take')).toHaveCount(3);
});

test('a take still rendering keeps its scene open (its job lands there)', async ({ page }) => {
  await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: twoScenes([{ slotId: 'evening', promptId: 'e2e-rendering', status: 'running' }]) },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-queue-take')).toHaveText('Rendering…', { timeout: 60_000 });
  await expect(page.getByTestId('scene-new')).toBeDisabled();
  await page.getByTestId('scene-list-item-scene-roof').click();
  await expect(page.getByTestId('scene-note')).toContainText('A take is rendering');
  await expect(page.getByTestId('scene-name')).toHaveValue('Kitchen');
});

test('mood fit never replaces the scene’s own Setting (a blank beat is filled under it)', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  const setting = 'my grandmother’s sunlit attic studio';
  const seeded = sceneWithTakes();
  const slot = { id: 'evening', label: 'Evening', location: setting };
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...seeded,
        scenes: [{ ...seeded.scenes[0]!, slot }],
        slots: [slot],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting, { timeout: 60_000 });
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('');

  // A theme's mood fit: Day rerolls a blank-beat slot's Setting with its beat; a scene's stays.
  await page.getByTestId('day-mood').selectOption('date-night');
  await expect(page.getByTestId('day-mood')).toHaveValue('date-night');
  await expect(page.getByTestId('day-slot-beat')).not.toHaveValue('', { timeout: 15_000 });
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting);
  await page.getByTestId('day-mood').selectOption('everyday');
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting);

  // Queue: its fit and beat draw keep the Setting too.
  await page.getByTestId('scene-queue-take').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(promptOf(queued[0]!)).toContain('attic studio');
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting);
});
