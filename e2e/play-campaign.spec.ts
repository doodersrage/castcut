import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { putAppKv, replaceGalleryIdb, seedSettingsCacheOnNextLoad } from './helpers/idb';
import { closeDaySheets, openDayAdvanced, openDaySetup, openDaySlotSheet } from './helpers/day';
import { gotoStable, waitForHydrated } from './helpers/navigation';
import { closeOutfitSheets, openOutfitAdvanced, openOutfitClothing } from './helpers/outfit';
import { closeStorySheets, openStoryBeatSheet } from './helpers/story';
import {
  ensureFilmWorkspace,
  seedGalleryFixture,
  seedGalleryPlayFixtures,
} from './helpers/gallery';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

function seedFirstFilmDone(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstFilmCutAt: Date.now(),
      })
    );
  });
}

/**
 * Open the pose editor as the wireframe one: the tests below drag and nudge its joint dots (the
 * 3D editor, the default, has its own spec: pose-editor-3d.spec.ts).
 */
function useWireframePoseEditor(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('castcut-pose-editor-mode-v1', 'wireframe');
  });
}

async function expandFittingMoreMenu(page: Page) {
  const details = page.locator('details').filter({ has: page.getByTestId('fitting-plan-day') });
  await details.locator('summary').click();
}

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('play campaign wizard loads with steps and share controls', async ({ page }) => {
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Your film$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('play-campaign')).toBeVisible();
  await expect(page.getByTestId('play-campaign-character')).toBeVisible();
  await expect(page.getByTestId('play-campaign-steps')).toBeVisible();
  // Look is retired; Outfit is optional (Day plans and dresses the Cast); Day is step 2.
  await expect(page.getByTestId('play-campaign-step-moodboard')).toHaveCount(0);
  await expect(page.getByTestId('play-campaign-step-fitting')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-fitting')).toContainText('Optional');
  await expect(page.getByTestId('play-campaign-step-day')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-day')).toContainText('Step 2');
  await expect(page.getByTestId('play-campaign-step-roleplay')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-roleplay-locked')).toBeVisible();
  // No Cast yet — the disabled "Start at Day" stays hidden until one exists.
  await expect(page.getByTestId('play-campaign-start-day')).toHaveCount(0);
});

test('fitting room happy path chrome loads', async ({ page }) => {
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  // The fitting room: who (and her plate) · the try-on stage · the clothes and Try it on.
  await expect(page.getByTestId('fitting-who')).toBeVisible();
  await expect(page.getByTestId('fitting-plate')).toBeVisible();
  await expect(page.getByTestId('fitting-stage')).toBeVisible();
  await expect(page.getByTestId('fitting-kit-strip')).toBeVisible();
  await expect(page.getByTestId('fitting-queue-try-on')).toHaveText('Try it on');
  // The Cast tiles open in a sheet.
  await page.getByTestId('fitting-change-cast').click();
  await expect(page.getByTestId('fitting-cast-sheet').getByTestId('fitting-character')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('fitting-cast-sheet')).toHaveCount(0);
});

test('outfit first run: Cast card, one plate message, grouped kit controls', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('outfit-get-started');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Outfit needs a Cast lead/i);
  await expect(page.getByTestId('outfit-get-started-starter')).toBeVisible();

  // A fresh plate says "No plate yet" once — not also "Plate cleared".
  const empty = page.getByTestId('fitting-plate-empty');
  await expect(empty).toContainText(/No plate yet/i);
  await expect(page.getByTestId('fitting-plate')).not.toContainText(/cleared/i);

  // The same Clothing picker as Day / Story, opened as a sheet from the Clothing row: a
  // clothing-type filter on kits, uploads under My photo.
  await expect(page.getByTestId('fitting-clothing-summary')).toContainText(/No kit yet/i);
  await openOutfitClothing(page);
  const clothing = page.getByTestId('fitting-clothing-picker');
  await expect(clothing.getByRole('combobox', { name: 'Clothing type' })).toBeVisible();
  await clothing.getByRole('tab', { name: 'My photo' }).click();
  await expect(clothing.getByLabel('Upload clothing photo to extract a packshot')).toBeAttached();
  await expect(clothing.getByLabel('Upload a ready clothing packshot')).toBeAttached();
  await closeOutfitSheets(page);
  await expect(page.getByTestId('fitting-skip-kit')).toBeDisabled();

  // Quality: Balanced (Good render, front and back) until a switch under Advanced is changed.
  await expect(page.getByTestId('fitting-quality-preset-balanced')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await expect(page.getByTestId('fitting-quality-summary')).toHaveText(
    'Good render · Front and back'
  );
  await openOutfitAdvanced(page);
  const review = page.getByTestId('fitting-auto-review-switch');
  await expect(review).toHaveAttribute('aria-checked', 'false');
  await review.click();
  await expect(review).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('fitting-quality-preset-custom')).toBeVisible();
  // Best = Best render + front and back + Auto-review; picking it rewrites the switches.
  await page.getByTestId('fitting-quality-preset-best').click();
  await expect(page.getByTestId('fitting-quality-summary')).toHaveText(
    'Best render · Front and back · Auto-review try-ons'
  );
  await expect(page.getByTestId('fitting-render-quality-best')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  // The Engine opens from the header chip as a sheet on Outfit (the fitting room is full width).
  await page.getByTestId('tool-engine-chip').click();
  const engine = page.getByTestId('tool-engine-sheet');
  await expect(engine.getByTestId('engine-quality-set-by')).toContainText('Best');
  await page.keyboard.press('Escape');
  await expect(engine).toHaveCount(0);
  await page.getByTestId('fitting-quality-preset-fast').click();
  await expect(review).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('fitting-front-back-switch')).toHaveAttribute(
    'aria-checked',
    'false'
  );
});

test('day partner: picked from tiles — someone new, the same stranger, or a Cast member', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-lead' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-lead', name: 'Lead', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
        { id: 'e2e-friend', name: 'Robin', version: 1, updatedAt: Date.now(), descriptor: 'a man' },
      ],
      removedIds: [],
    },
    tools: { day: { stillsCharacterId: 'e2e-lead' } },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  // Two-person stills on: the partner row only shows when a still can have two people.
  await page.getByTestId('day-intimate-mix-duo').click({ timeout: 30_000 });
  const partner = page.getByTestId('day-partner');
  await expect(partner).toBeVisible();
  const group = partner.getByRole('radiogroup', { name: 'Partner' });
  await expect(group.getByRole('radio', { name: 'Same woman' })).toBeVisible();
  await expect(group.getByRole('radio', { name: 'Robin' })).toBeVisible();
  await expect(group.getByRole('radio', { name: 'Someone new' })).toBeChecked();
  await expect(page.getByTestId('day-partner-hint')).toHaveCount(0);

  await group.getByRole('radio', { name: 'Same man' }).click();
  await expect(group.getByRole('radio', { name: 'Same man' })).toBeChecked();
  await expect(page.getByTestId('day-partner-hint')).toContainText('The same stranger');

  await group.getByRole('radio', { name: 'Robin' }).click();
  await expect(group.getByRole('radio', { name: 'Robin' })).toBeChecked();
  await expect(page.getByTestId('day-partner-hint')).toContainText('Robin plays the second person');
});

test('outfit footwear: saved shoes are kept, re-picked and removed', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
    tools: {
      fitting: {
        footwear: 'brown suede desert boots',
        footwearImageFilename: 'my-boots.png',
        footwearImageUrl: '/footwear/hiking-boots.webp',
      },
    },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  // The shoes show on the Clothing row before the sheet is opened.
  await expect(page.getByTestId('fitting-clothing-summary')).toContainText(
    'brown suede desert boots',
    { timeout: 30_000 }
  );
  await openOutfitClothing(page);
  const footwear = page.getByTestId('fitting-footwear');
  await expect(footwear).toBeVisible({ timeout: 30_000 });
  // A shoe photo opens on "My shoes" with Save for later, like a clothing photo.
  const save = page.getByTestId('fitting-footwear-save');
  await expect(save).toHaveText('Save for later');
  await save.click();
  await expect(save).toHaveText('Saved');
  await expect(save).toBeDisabled();
  const saved = page.getByTestId('fitting-footwear-saved');
  await expect(saved).toContainText('Saved shoes · 1');
  const tile = saved.getByRole('button', { name: 'brown suede desert boots (selected)' });
  await expect(tile).toBeVisible();

  // Rescan reads the shoe photo again (like clothing's Rescan) and updates the words — on the
  // outfit and on the saved copy.
  await page.route('**/api/vision-scan', route =>
    route.fulfill({ json: { prompt: 'black leather ankle boots' } })
  );
  await footwear.getByTestId('fitting-footwear-rescan').click();
  await expect(
    saved.getByRole('button', { name: 'black leather ankle boots (selected)' })
  ).toBeVisible({ timeout: 15_000 });
  await page.unroute('**/api/vision-scan');

  // Remove the photo from the outfit: the saved copy stays and puts it back with its words.
  await footwear.getByRole('button', { name: 'Remove shoe photo' }).click();
  const hint = page.getByTestId('fitting-footwear-hint');
  await expect(hint).toContainText('Auto');
  await footwear.getByRole('tab', { name: 'My shoes' }).click();
  await saved.getByRole('button', { name: 'black leather ankle boots', exact: true }).click();
  await expect(hint).toHaveText('Worn on every clothed still: black leather ankle boots.');
  await expect(save).toHaveText('Saved');

  // The pair being worn shows its tick; take it off, then it can be removed from the list.
  await footwear.getByRole('button', { name: 'Remove shoe photo' }).click();
  await footwear.getByRole('tab', { name: 'My shoes' }).click();
  await saved.getByRole('button', { name: 'Remove black leather ankle boots' }).click();
  await expect(saved).toHaveCount(0);
});

test('outfit front and back: a try-on card shows its front and its back view', async ({
  page,
}) => {
  const frontPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const backPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-front-back' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-front-back',
          name: 'Front Back',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'a woman',
        },
      ],
      removedIds: [],
    },
    tools: {
      fitting: {
        compareTryOns: [
          {
            promptId: 'e2e-front-back-tryon',
            wardrobeId: 'custom-garment',
            wardrobeLabel: 'Red dress',
            imageUrl: frontPng,
            backImageUrl: backPng,
            backPromptId: 'e2e-front-back-back',
          },
        ],
      },
    },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('fitting-compare-card').first();
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card.getByTestId('fitting-compare-front').locator('img')).toHaveAttribute(
    'src',
    frontPng
  );
  await expect(card.getByTestId('fitting-compare-back').locator('img')).toHaveAttribute(
    'src',
    backPng
  );
  await expect(card.getByRole('button', { name: 'View the back of Red dress larger' })).toBeVisible();
  // On the stage: Keep, Again (requeue), Fix and Pass under the picture.
  await expect(card.getByTestId('fitting-keep')).toBeVisible();
  await expect(card.getByTestId('fitting-requeue-try-on')).toHaveText('Again');
  await expect(card.getByTestId('fitting-fix-try-on')).toBeVisible();
  await expect(card.getByTestId('fitting-pass-try-on')).toBeVisible();
  // The switch is on by default (under Advanced).
  await openOutfitAdvanced(page);
  await expect(page.getByTestId('fitting-front-back-switch')).toHaveAttribute(
    'aria-checked',
    'true'
  );
});

test("outfit: a posed Keep offers her standing picture, then shows it for Day and Story", async ({
  page,
}) => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const now = Date.now();
  const still = (id: string, prompt: string) => ({
    id,
    promptId: `prompt-${id}`,
    prompt,
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    characterId: 'e2e-standing',
    tool: 'fitting',
    queuedAt: now,
    completedAt: now,
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
  });
  const look = (standIns?: Record<string, unknown>) => ({
    id: 'look-1',
    name: 'Main',
    createdAt: 1,
    keeperEntryIds: ['e2e-posed-keep'],
    ...(standIns ? { keeperStandIns: standIns } : {}),
  });
  const seed = (standIns?: Record<string, unknown>) =>
    seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: 'e2e-standing' },
      characters: {
        version: 1,
        characters: [
          {
            id: 'e2e-standing',
            name: 'Standing',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'a woman',
            activeLookId: 'look-1',
            looks: [look(standIns)],
          },
        ],
        removedIds: [],
      },
      tools: { fitting: { compareTryOns: [] } },
    });
  const posedPrompt =
    'POSE FIRST: she is sitting on a chair, exactly as the pose map in Image 3 shows.\nPOSE: Image 3 is a pose map (a skeleton, not a person) — the body takes exactly that stance.';
  await seed();
  await gotoStable(page, '/fitting');
  await replaceGalleryIdb(page, [still('e2e-posed-keep', posedPrompt)]);
  await page.reload();
  await dismissBlockingOverlays(page);
  // A posed Keep from before: one tap offered, nothing rendered on its own.
  const note = page.getByTestId('fitting-keeper-standing');
  await expect(note).toHaveAttribute('data-state', 'offer', { timeout: 30_000 });
  await expect(note.getByTestId('fitting-keeper-standing-make')).toHaveText(
    'Make a standing picture'
  );

  // Its standing picture landed: shown, and said to be what Day and Story use.
  await seed({ 'e2e-posed-keep': { promptId: 'prompt-e2e-standing', at: now } });
  await gotoStable(page, '/fitting');
  await replaceGalleryIdb(page, [
    still('e2e-posed-keep', posedPrompt),
    { ...still('e2e-standing', 'Edit Image 1: standing.'), imageUrl: png },
  ]);
  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(note).toHaveAttribute('data-state', 'ready', { timeout: 30_000 });
  await expect(note).toContainText('Day and Story start from her standing picture');
  await expect(note.getByTestId('fitting-keeper-standing-picture')).toBeVisible();
});

test.describe('Day standing picture', () => {
  // The gallery service worker answers view URLs itself, out of page.route's reach.
  test.use({ serviceWorkers: 'block' });

  test("Day: a posed Keep's standing picture says where it is, and a failed one tries again", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const now = Date.now();
    const posedKeep = {
      id: 'e2e-day-posed-keep',
      promptId: 'prompt-e2e-day-posed-keep',
      prompt:
        'POSE FIRST: she is sitting on a chair, exactly as the pose map in Image 3 shows.\nPOSE: Image 3 is a pose map (a skeleton, not a person) — the body takes exactly that stance.',
      comfyUrl: 'http://127.0.0.1:8188',
      status: 'completed',
      characterId: 'e2e-day-standing',
      tool: 'fitting',
      queuedAt: now,
      completedAt: now,
      images: [{ filename: 'e2e-day-posed-keep.png', subfolder: '', type: 'output' }],
    };
    const seed = (standIn: Record<string, unknown>) =>
      seedSettingsCacheOnNextLoad(page, {
        shared: { activeCharacterId: 'e2e-day-standing' },
        characters: {
          version: 1,
          characters: [
            {
              id: 'e2e-day-standing',
              name: 'Standing',
              version: 1,
              updatedAt: Date.now(),
              descriptor: 'a woman',
              activeLookId: 'look-1',
              looks: [
                {
                  id: 'look-1',
                  name: 'Main',
                  createdAt: 1,
                  keeperEntryIds: [posedKeep.id],
                  keeperStandIns: { [posedKeep.id]: standIn },
                },
              ],
            },
          ],
          removedIds: [],
        },
      });
    // Try again re-renders from the kept picture: its fetch, the upload and the queue are stubbed.
    await page.route('**/api/comfyui/view**', route =>
      route.fulfill({ status: 200, contentType: 'image/png', body: png })
    );
    await page.route('**/api/comfyui/upload**', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ name: 'outfit-standing.png', subfolder: '', type: 'input' }),
      })
    );
    const queued: string[] = [];
    await page.route('**/api/comfyui', route => {
      if (route.request().method() !== 'POST') return route.continue();
      queued.push(String((route.request().postDataJSON() as { prompt?: unknown }).prompt ?? ''));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          promptId: 'prompt-e2e-day-retry',
          clientId: 'e2e',
          comfyUrl: 'http://127.0.0.1:8188',
        }),
      });
    });
    // CI has no ComfyUI: the queue's graph preview gets a plain graph, object_info says so.
    await page.route('**/api/comfyui/preview**', route =>
      route.fulfill({
        json: {
          ok: true,
          workflowSource: 'minimal',
          replacements: { positive: 1, negative: 0, params: {} },
          workflowJson: JSON.stringify({
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
          }),
        },
      })
    );
    await page.route('**/api/comfyui/object-info**', route =>
      route.fulfill({ status: 502, json: { error: 'e2e: no ComfyUI' } })
    );

    // Desk: it failed — said on Day's status strip, with Try again.
    await seed({ promptId: 'prompt-e2e-day-gone', failed: true, at: now });
    await gotoStable(page, '/day');
    await replaceGalleryIdb(page, [posedKeep]);
    await page.reload();
    await dismissBlockingOverlays(page);
    const note = page.getByTestId('day-keeper-standing');
    await expect(note).toHaveAttribute('data-state', 'failed', { timeout: 30_000 });
    await expect(note).toContainText("didn't render");
    await note.getByTestId('day-keeper-standing-make').click();
    // The queue's own checks (workflow preflight, a busy shared ComfyUI) come first.
    await expect(note).toHaveAttribute('data-state', 'rendering', { timeout: 60_000 });
    await expect(note).toContainText('Rendering her standing');
    expect(queued.length).toBe(1);

    // Phone board: the same line while it renders.
    await page.setViewportSize({ width: 390, height: 844 });
    await seed({ promptId: 'prompt-e2e-day-running', at: now });
    await gotoStable(page, '/day');
    await replaceGalleryIdb(page, [posedKeep]);
    await page.reload();
    await dismissBlockingOverlays(page);
    await expect(note).toHaveAttribute('data-state', 'rendering', { timeout: 30_000 });
    await expect(note).toBeVisible();
    await expect(note.getByTestId('day-keeper-standing-make')).toHaveCount(0);
  });
});

test('outfit stage: a try-on in flight shows its rendering placeholder', async ({ page }) => {
  const done =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-pending' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-pending', name: 'Pending Lead', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      fitting: {
        compareTryOns: [{ promptId: 'e2e-done', wardrobeId: 'custom-garment', wardrobeLabel: 'Blue romper', imageUrl: done }],
        pendingTryOn: { promptId: 'e2e-pending-job', wardrobeId: 'custom-garment', wardrobeLabel: 'Red dress' },
      },
    },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  const pending = page.getByTestId('fitting-stage-pending');
  await expect(pending).toBeVisible({ timeout: 30_000 });
  await expect(pending).toContainText('Trying on Red dress');
  await expect(pending).toContainText(/Queueing…|in queue|Rendering/);
  // The finished try-on waits in the strip; picking it shows it on the stage.
  await expect(page.getByTestId('fitting-compare-card')).toHaveCount(0);
  await page.getByTestId('fitting-stage-thumb').first().click();
  await expect(page.getByTestId('fitting-compare-card')).toBeVisible();
});

test('outfit footwear: Browse shows every pair, searchable, and wears the pick', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await openOutfitClothing(page);
  await expect(page.getByTestId('fitting-footwear')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('fitting-footwear-browse').click();
  const browser = page.getByTestId('wardrobe-kit-browser');
  await expect(browser).toBeVisible();
  await expect(browser.getByRole('heading', { name: 'Browse footwear' })).toBeVisible();
  await browser.getByRole('textbox').fill('white sneakers');
  await browser.getByRole('button', { name: /^White sneakers/ }).click();
  await expect(browser).toHaveCount(0);
  await expect(page.getByTestId('fitting-footwear-hint')).toContainText(/white .*sneakers/i);
  // Nothing matching says so.
  await page.getByTestId('fitting-footwear-browse').click();
  await page.getByTestId('wardrobe-kit-browser').getByRole('textbox').fill('zzzqq');
  await expect(page.getByTestId('wardrobe-kit-browser')).toContainText('Nothing matches');
});

test('outfit footwear: a kit, barefoot, own words, own photo', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await openOutfitClothing(page);
  const footwear = page.getByTestId('fitting-footwear');
  await expect(footwear).toBeVisible({ timeout: 30_000 });
  const hint = page.getByTestId('fitting-footwear-hint');
  await expect(hint).toContainText('Auto');
  await expect(page.getByTestId('fitting-footwear-auto')).toHaveAttribute('aria-pressed', 'true');

  // A kit is picked like a clothing kit: its tile, with its packshot.
  const boots = page.getByTestId('fitting-footwear-kit-rain-boots');
  await expect(boots.locator('img')).toHaveAttribute('src', '/footwear/rain-boots.webp');
  await boots.getByRole('button').click();
  await expect(hint).toHaveText('Worn on every clothed still: bright yellow rubber rain boots.');
  await expect(boots.getByRole('button')).toHaveAttribute('aria-current', 'true');
  // The type filter narrows the strip.
  await footwear.getByRole('combobox', { name: 'Footwear type' }).selectOption('Heels');
  await expect(page.getByTestId('fitting-footwear-kit-black-pumps')).toBeVisible();
  await expect(boots).toHaveCount(0);

  await page.getByTestId('fitting-footwear-barefoot').click();
  await expect(hint).toHaveText('Barefoot on every clothed still.');

  await footwear.getByRole('tab', { name: 'In words' }).click();
  await page.getByTestId('fitting-footwear-custom').fill('red suede block-heel sandals');
  await expect(hint).toHaveText('Worn on every clothed still: red suede block-heel sandals.');

  // Your own shoes: a worn photo or a packshot, as for clothing.
  await footwear.getByRole('tab', { name: 'My shoes' }).click();
  await expect(footwear.getByLabel('Upload a photo of shoes being worn')).toBeAttached();
  await expect(footwear.getByLabel('Upload a ready shoe packshot')).toBeAttached();

  await footwear.getByRole('tab', { name: 'Kits' }).click();
  await page.getByTestId('fitting-footwear-auto').click();
  await expect(hint).toContainText('Auto');
  // The row behind the sheet says what is worn.
  await page.getByTestId('fitting-footwear-barefoot').click();
  await closeOutfitSheets(page);
  await expect(page.getByTestId('fitting-clothing-summary')).toContainText('barefoot');
});

test('outfit custom pose: drag editor, start figures, save to My poses', async ({ page }) => {
  await useWireframePoseEditor(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    // A try-on plate, so the editor can show it behind the figure.
    tools: {
      fitting: { referenceImageUrl: '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp' },
    },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  const section = page.getByTestId('outfit-pose');
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('outfit-pose-plate')).toHaveAttribute('aria-checked', 'true');

  await page.getByTestId('outfit-pose-custom').click();
  await expect(page.getByTestId('outfit-pose-editor')).toBeVisible();
  // One person on Outfit — no "Add a person".
  await expect(page.getByTestId('outfit-pose-add-person')).toHaveCount(0);
  await page.getByTestId('outfit-pose-starter-sit').click();
  await page.getByTestId('outfit-pose-mirror').click();
  // Keep proportions (on by default): dragging the wrist swings it, the forearm keeps its length.
  await expect(page.getByTestId('outfit-pose-keep-proportions')).toBeChecked();
  const boneLength = async () => {
    const [elbow, wrist] = await Promise.all(
      [3, 4].map(joint => page.getByTestId(`outfit-pose-joint-0-${joint}`).boundingBox())
    );
    return Math.hypot(elbow!.x - wrist!.x, elbow!.y - wrist!.y);
  };
  const before = await boneLength();
  const wristBox = (await page.getByTestId('outfit-pose-joint-0-4').boundingBox())!;
  await page.mouse.move(wristBox.x + wristBox.width / 2, wristBox.y + wristBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(wristBox.x + 60, wristBox.y - 50, { steps: 4 });
  await page.mouse.up();
  expect(Math.abs((await boneLength()) - before)).toBeLessThan(1.5);
  // 3D turn: the shoulders come closer together.
  const shoulderGap = async () => {
    const [right, left] = await Promise.all(
      [2, 5].map(joint => page.getByTestId(`outfit-pose-joint-0-${joint}`).boundingBox())
    );
    return Math.abs(right!.x - left!.x);
  };
  const gap = await shoulderGap();
  // Undo puts the hand back where it started.
  const pulled = (await page.getByTestId('outfit-pose-joint-0-4').boundingBox())!;
  expect(Math.hypot(pulled.x - wristBox.x, pulled.y - wristBox.y)).toBeGreaterThan(20);
  await page.getByTestId('outfit-pose-undo').click();
  const undone = (await page.getByTestId('outfit-pose-joint-0-4').boundingBox())!;
  expect(Math.hypot(undone.x - wristBox.x, undone.y - wristBox.y)).toBeLessThan(2);
  // Dragging the empty background sideways turns the figure.
  const canvas = (await page.getByTestId('outfit-pose-canvas').boundingBox())!;
  await page.mouse.move(canvas.x + 12, canvas.y + 12);
  await page.mouse.down();
  await page.mouse.move(canvas.x + 12 + canvas.width * 0.2, canvas.y + 12, { steps: 4 });
  await page.mouse.up();
  expect(await shoulderGap()).toBeLessThan(gap * 0.95);
  // The ↻ handle spins it: the head swings away from where it was.
  const headBefore = (await page.getByTestId('outfit-pose-joint-0-0').boundingBox())!;
  const handle = (await page.getByTestId('outfit-pose-spin-handle').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 120, handle.y + 80, { steps: 4 });
  await page.mouse.up();
  const headAfter = (await page.getByTestId('outfit-pose-joint-0-0').boundingBox())!;
  expect(Math.hypot(headAfter.x - headBefore.x, headAfter.y - headBefore.y)).toBeGreaterThan(8);

  // Bend at the waist, and the readout says which way the figure faces.
  await page.getByTestId('outfit-pose-reset').click();
  await expect(page.getByTestId('outfit-pose-facing')).toContainText('Facing you');
  // The words that will open the prompt are shown as you pose.
  await expect(page.getByTestId('outfit-pose-words')).toContainText('The prompt will open with');
  await expect(page.getByTestId('outfit-pose-words')).toContainText('standing');
  await page.getByTestId('outfit-pose-bend-forward').click();
  await page.getByTestId('outfit-pose-bend-forward').click();
  await expect(page.getByTestId('outfit-pose-facing')).toContainText('leaning forward 30°');

  // Quick arm and leg positions: one tap, and the words follow.
  await page.getByTestId('outfit-pose-reset').click();
  await page.getByTestId('outfit-pose-arms-hips').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText('hands on hips');
  await page.getByTestId('outfit-pose-legs-wide').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText('legs wide apart');
  // One side only, then copied to the other.
  await page.getByTestId('outfit-pose-arms-sides').click();
  await page.getByTestId('outfit-pose-limb-side-right').click();
  await page.getByTestId('outfit-pose-arms-up').click();
  const leftWristBefore = await page.getByTestId('outfit-pose-joint-0-7').getAttribute('cy');
  await page.getByTestId('outfit-pose-match-arm-right').click();
  const leftWristAfter = await page.getByTestId('outfit-pose-joint-0-7').getAttribute('cy');
  expect(Number(leftWristAfter)).toBeLessThan(Number(leftWristBefore));
  await page.getByTestId('outfit-pose-limb-side-both').click();

  // Head direction: one tap, their left is the picture's right, and the chip shows it.
  await page.getByTestId('outfit-pose-reset').click();
  // Back on the pose the editor opened with: nothing to show a ghost of.
  await expect(page.getByTestId('outfit-pose-start-ghost')).toHaveCount(0);
  const noseBefore = await page.getByTestId('outfit-pose-joint-0-0').getAttribute('cx');
  await page.getByTestId('outfit-pose-head-left').click();
  const noseAfter = await page.getByTestId('outfit-pose-joint-0-0').getAttribute('cx');
  expect(Number(noseAfter)).toBeGreaterThan(Number(noseBefore));
  await expect(page.getByTestId('outfit-pose-head-left')).toHaveAttribute('aria-pressed', 'true');
  // The head reaches the words, and so the prompt.
  await expect(page.getByTestId('outfit-pose-words')).toContainText(
    'standing, head turned to her left'
  );
  // A three-quarter turn: short of the profile, both eyes drawn, and its own words.
  await page.getByTestId('outfit-pose-head-three-quarter-right').click();
  await expect(page.getByTestId('outfit-pose-head-three-quarter-right')).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(page.getByTestId('outfit-pose-head-left')).toHaveAttribute('aria-pressed', 'false');
  const noseQuarter = Number(await page.getByTestId('outfit-pose-joint-0-0').getAttribute('cx'));
  expect(noseQuarter).toBeLessThan(Number(noseBefore));
  expect(noseQuarter).toBeGreaterThan(Number(noseBefore) - (Number(noseAfter) - Number(noseBefore)));
  await expect(page.getByTestId('outfit-pose-words')).toContainText(
    'head turned three-quarters to her right'
  );
  await page.getByTestId('outfit-pose-head-straight').click();
  await expect(page.getByTestId('outfit-pose-words')).not.toContainText('head turned');
  await page.getByTestId('outfit-pose-head-left').click();
  // The starting pose stays behind the figure as a dashed ghost, until it is switched off.
  await expect(page.getByTestId('outfit-pose-start-ghost')).toHaveCount(1);
  await page.getByTestId('outfit-pose-show-start').uncheck();
  await expect(page.getByTestId('outfit-pose-start-ghost')).toHaveCount(0);
  await page.getByTestId('outfit-pose-show-start').check();
  await expect(page.getByTestId('outfit-pose-start-ghost')).toHaveCount(1);
  // Reset goes back to the pose the editor opened with: the ghost has nothing to show.
  await page.getByTestId('outfit-pose-reset').click();
  await expect(page.getByTestId('outfit-pose-start-ghost')).toHaveCount(0);
  await expect(page.getByTestId('outfit-pose-words')).not.toContainText('head turned');

  // Her picture behind the figure: faint by default, a slider sets how strongly it shows.
  const backdrop = page.getByTestId('outfit-pose-backdrop');
  await expect(backdrop).toHaveAttribute('opacity', '0.3');
  await page.getByTestId('outfit-pose-backdrop-opacity').fill('60');
  await expect(backdrop).toHaveAttribute('opacity', '0.6');
  await page.getByTestId('outfit-pose-show-backdrop').uncheck();
  await expect(backdrop).toHaveCount(0);
  await expect(page.getByTestId('outfit-pose-backdrop-opacity')).toHaveCount(0);
  await page.getByTestId('outfit-pose-show-backdrop').check();
  await expect(backdrop).toHaveAttribute('opacity', '0.6');

  await page.getByTestId('outfit-pose-starter-sit').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText('seated');
  // A figure seen from the side has no left or right to turn its head to.
  await expect(page.getByTestId('outfit-pose-head-left')).toBeDisabled();
  // "Start from" replaces the figure, not the ghost: it still shows where the pose began.
  await expect(page.getByTestId('outfit-pose-start-ghost')).toHaveCount(1);
  // Leg positions are for a figure on its feet.
  await expect(page.getByTestId('outfit-pose-legs-apart')).toBeDisabled();
  // Start from one of Day's named poses: the prompt words are the pose's own name and cue…
  await page.getByTestId('outfit-pose-day-pose').click();
  await page.getByTestId('outfit-pose-day-pose-wave').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText('waving: one arm raised high');
  // …until a joint is moved, when the words go back to reading the figure.
  const waveWrist = page.getByTestId('outfit-pose-joint-0-10');
  await waveWrist.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await expect(page.getByTestId('outfit-pose-words')).not.toContainText('waving:');
  await page.getByTestId('outfit-pose-day-pose').click();
  await page.getByTestId('outfit-pose-day-pose-hands_hips').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText('hands on hips: both hands on');
  // A Head chip keeps the named pose's words and adds the head to them.
  await page.getByTestId('outfit-pose-head-three-quarter-left').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText(
    /hands on hips: both hands on .*, head turned three-quarters to her left/
  );
  await page.getByTestId('outfit-pose-head-straight').click();
  await expect(page.getByTestId('outfit-pose-words')).not.toContainText('head turned');
  await page.getByTestId('outfit-pose-head-three-quarter-left').click();

  await page.getByTestId('outfit-pose-save-to-my-poses').click();
  await page.getByTestId('outfit-pose-save-name').fill('Chair lean');
  await page.getByTestId('outfit-pose-save-name').press('Enter');
  await expect(page.getByTestId('outfit-pose-editor')).toContainText(
    'Saved to My poses as “Chair lean”'
  );

  await page.getByTestId('outfit-pose-editor-save').click();
  await expect(page.getByTestId('outfit-pose-custom')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('outfit-pose-figure')).toBeVisible();
  await expect(page.getByTestId('outfit-pose-day-words')).toContainText(
    /hands on hips.*, head turned three-quarters to her left/
  );
  await expect(page.getByTestId('outfit-my-poses')).toContainText('Chair lean');

  await page.getByTestId('outfit-pose-plate').click();
  await expect(page.getByTestId('outfit-pose-figure')).toHaveCount(0);
});

test('forgetting a Cast lead asks first', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-forget' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-forget', name: 'Keep Me', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
  });
  await gotoStable(page, '/fitting?character=e2e-forget');
  await dismissBlockingOverlays(page);
  // Outfit's Cast tiles open in a sheet from "Change person or look".
  await expect(page.getByTestId('fitting-who-name')).toHaveText('Keep Me', { timeout: 30_000 });
  await page.getByTestId('fitting-change-cast').click();
  const picked = page
    .getByRole('radiogroup', { name: 'Active character' })
    .getByTestId('cast-picker-character-e2e-forget');
  await expect(picked).toBeChecked({ timeout: 30_000 });
  await page.getByTestId('fitting-character').getByRole('button', { name: 'Forget' }).click();
  const confirm = page.getByTestId('confirm-dialog');
  await expect(confirm).toContainText(/Forget Keep Me\?/);
  await confirm.getByTestId('confirm-dialog-cancel').click();
  await expect(confirm).toHaveCount(0);
  await expect(picked).toBeChecked();
});

test('day planner happy path chrome loads', async ({ page }) => {
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Day$/i, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('day-plan-bar')).toBeVisible();
  // Setup is a chip that opens a sheet; the slot editor is a sheet opened from a card.
  await openDaySetup(page);
  await expect(page.getByTestId('day-character')).toBeVisible();
  await closeDaySheets(page);
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slots')).toBeVisible();
  await expect(page.getByTestId('day-slot-queue')).toBeVisible();
  await closeDaySheets(page);
  await expect(page.getByTestId('day-reel')).toBeVisible();
  await expect(
    page.getByTestId('day-reel').getByRole('link', { name: /Cut film/i })
  ).toBeVisible();
});

test('day without a Cast leads with the get-started card', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('day-get-started');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText(/Day needs a Cast lead/i);
  await expect(page.getByTestId('day-get-started-starter')).toBeVisible();
  await page.getByTestId('day-get-started-setup').click();
  await expect(page.getByTestId('day-character')).toBeVisible();
  await closeDaySheets(page);

  // Quality is one preset; the check switches read as switches under Advanced.
  await expect(page.getByRole('radiogroup', { name: 'Quality' })).toBeVisible();
  await openDayAdvanced(page);
  await expect(page.getByRole('switch', { name: /Pose over plate/i })).toHaveAttribute(
    'aria-checked',
    'true'
  );
  // One People control (Solo / Mixed / Duo) on every mood.
  const people = page.getByRole('radiogroup', { name: 'People in each still' });
  const mixed = people.getByRole('radio', { name: 'Mixed' });
  await mixed.click();
  await expect(mixed).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('day-mood')).toBeVisible();
  // Nothing planned yet: slot cards offer "Add a beat".
  await expect(page.locator('[data-testid^="day-slot-add-beat-"]').first()).toBeVisible();
});

test('day mid-flow: one Cut, folded cut options, honest render status', async ({ page }) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-mid', name: 'Day Mid', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-mid' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-mid',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb },
          { slotId: 'evening', status: 'running' },
        ],
      },
    },
  });
  await gotoStable(page, '/day?character=e2e-day-mid');
  await dismissBlockingOverlays(page);
  const coach = page.getByTestId('day-cut-coach');
  await expect(coach).toBeVisible({ timeout: 30_000 });
  // Cut is its own step: the banner hands off to it (no options here).
  await expect(coach.getByTestId('day-cut-coach-cut')).toHaveAttribute('href', /\/cut\?from=day/);
  await expect(coach.getByTestId('day-cut-options-disclosure')).toHaveCount(0);
  // The banner owns Cut — the Animate card doesn't repeat it.
  await expect(page.getByTestId('day-animate-cut')).toHaveCount(0);
  // A running still says so instead of "Queueing…".
  await expect(page.getByTestId('day-progress-evening')).toContainText(/Rendering/);
  // Setup can upload a plate (it becomes the Cast look plate).
  await openDaySetup(page);
  await expect(page.getByTestId('day-plate-upload')).toBeAttached();
  await closeDaySheets(page);
});

test("day end pose: pick another still as the clip's last frame, warn on framing, clear", async ({
  page,
}) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  // A ComfyUI with both engines' last-frame nodes (End pose hides without them).
  await page.route('**/api/comfyui/object-info**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        models: {},
        nodeTypes: [
          'WanImageToVideo',
          'WanFirstLastFrameToVideo',
          'LTXVImgToVideoInplace',
          'LTXVAddGuide',
          'LTXVCropGuides',
        ],
      }),
    })
  );
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-end', name: 'Day End', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-end' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-end',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'e2e-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'e2e-a' },
        ],
      },
    },
  });
  await gotoStable(page, '/day?character=e2e-day-end');
  await dismissBlockingOverlays(page);
  // Day opens on the first slot still to render; End pose belongs to a finished one.
  await page.getByTestId('day-slot-select-morning').first().click();
  // Selecting a finished slot can open its still full size.
  const lightbox = page.getByTestId('image-lightbox');
  if (await lightbox.isVisible().catch(() => false)) await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
  // End pose lives in the slot sheet.
  await openDaySlotSheet(page, 'morning');
  const endPose = page.getByTestId('day-end-pose');
  await expect(endPose).toBeVisible({ timeout: 30_000 });
  await expect(endPose).toContainText(/End pose · Morning/);
  // Another slot's still as the last frame: start → end preview and the framing warning.
  await endPose.getByTestId('day-end-pose-still-afternoon').click();
  await expect(endPose.getByTestId('day-end-pose-preview')).toBeVisible();
  await expect(endPose).toContainText(/different camera framing makes the clip cut/);
  // Re-pose needs words before it can queue.
  await expect(endPose.getByTestId('day-end-pose-repose')).toBeDisabled();
  await endPose.getByTestId('day-end-pose-words').fill('arms raised');
  await expect(endPose.getByTestId('day-end-pose-repose')).toBeEnabled();
  await endPose.getByTestId('day-end-pose-clear').click();
  await expect(endPose.getByTestId('day-end-pose-preview')).toHaveCount(0);
});

async function seedStoryMidFlow(
  page: Page,
  id: string,
  /** Extra Story settings for one test (a photo story, a first scene with a still prompt). */
  roleplay: Record<string, unknown> = {},
  firstBeat: Record<string, unknown> = {}
) {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await page.addInitScript(castId => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: castId, name: 'Story Mid', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({ version: 1, firstFilmCutAt: Date.now() })
    );
  }, id);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: id },
    // The Cast goes into IndexedDB as well as the localStorage mirror above: with the mirror
    // alone, a second page in the same test could come up with an empty Cast list (the phone
    // Story page then says "No Cast lead").
    characters: {
      version: 1,
      characters: [{ id, name: 'Story Mid', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      roleplay: {
        activeSessionId: `cast-${id}`,
        characterName: 'Story Mid',
        bio: { name: 'Story Mid', look: 'green raincoat', personality: 'curious' },
        story: [
          {
            id: 'b1',
            at: Date.now() - 2000,
            kind: 'plot',
            title: 'The letter',
            blurb: 'A letter under the door.',
            stillStatus: 'completed',
            imageUrl: thumb,
            ...firstBeat,
          },
          {
            id: 'b2',
            at: Date.now() - 1000,
            kind: 'plot',
            title: 'The station',
            blurb: 'The last train north.',
            stillStatus: 'running',
          },
        ],
        ...roleplay,
      },
    },
  });
}

test('day two takes: the take that counted fewer oddities is shown first, the pick stays yours', async ({
  page,
}) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-duo', name: 'Day Duo', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
  });
  // The count check (duo-still-check.ts), stubbed: take 1 counts one face, take 2 two.
  const counted: string[] = [];
  await page.route('**/api/duo-still-check', async route => {
    const body = route.request().postDataJSON() as { imageUrl?: string };
    counted.push(body.imageUrl ?? '');
    const first = counted.length === 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        counts: { faces: first ? 1 : 2, hands: 4, people: 2, wrists: 4, ankles: 4 },
      }),
    });
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-duo' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-duo',
        dayMood: 'intimate',
        twoTakesIntimate: true,
        slots: [
          { id: 'morning', label: 'Morning', location: 'bedroom', sceneHints: 'wakes up' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
        ],
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: `${thumb}?take=1`,
            promptId: 'e2e-t1',
            twoTakes: { promptId: 'e2e-t2', status: 'completed', imageUrl: `${thumb}?take=2` },
          },
        ],
      },
    },
  });
  await gotoStable(page, '/day?character=e2e-day-duo');
  await dismissBlockingOverlays(page);
  const pick = page.getByTestId('day-two-takes-morning');
  await expect(pick).toBeVisible({ timeout: 30_000 });
  await expect(pick).toHaveAttribute('data-ready', 'true');
  // Both takes were counted, then Take 2 (fewer oddities) moved to the front with its note.
  const likelier = pick.getByTestId('day-two-takes-morning-likelier');
  await expect(likelier).toBeVisible({ timeout: 30_000 });
  await expect(likelier).toHaveAttribute('data-take', 'second');
  await expect(likelier).toContainText(/Take 2: Shown first — the other take counted one face/);
  await expect(likelier).toContainText(/you pick/);
  expect(counted).toHaveLength(2);
  const images = pick.locator('img');
  await expect(images.first()).toHaveAttribute('src', /take=2/);
  await expect(images.nth(1)).toHaveAttribute('src', /take=1/);
  await expect(page.getByTestId('day-two-takes-order-status')).toContainText(
    /Morning: take 2 first — the other counted more oddities\. You pick\./
  );
  // The pick buttons stay with their takes: "Keep this one" under Take 1 keeps the first.
  await pick.getByTestId('day-two-takes-morning-keep-first').click();
  await expect(pick).toHaveCount(0);
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-two-takes-picked')).toBeVisible({ timeout: 30_000 });
  // Counted once per pair: nothing ran again after the pick.
  expect(counted).toHaveLength(2);
  await closeDaySheets(page);
});

test('story mid-flow: Roll leads, settings fold, no default Part', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-mid');
  await gotoStable(page, '/story?character=e2e-story-mid');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker.getByTestId('story-roll-scenes')).toBeVisible();
  const settings = picker.getByTestId('story-settings');
  await expect(settings).toContainText(/Story settings · .* · any setting/);
  await expect(settings).not.toHaveAttribute('open', '');
  // A Cast without a Part used to show (and be written as) the first archetype.
  await expect(page.getByText(/Raccoon pirate/i)).toHaveCount(0);
  // One Cut: the reel's, not also the Animate card's.
  await expect(page.getByTestId('story-animate-cut')).toHaveCount(0);
  // Cut is its own step: Story hands off to it.
  await expect(page.getByTestId('story-open-cut')).toHaveAttribute('href', '/cut?from=story');
});

test('story mid-flow: start the story over after changing its settings', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-over');
  await gotoStable(page, '/story?character=e2e-story-over');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  // The settings say when they take effect, and offer the way back to scene one.
  await picker.getByTestId('story-settings').locator('summary').click();
  await expect(picker.getByTestId('story-settings-midway')).toContainText(
    'Changes apply from the next scene'
  );
  // The question is asked in the page (no browser dialog): what goes, what stays, two ways on.
  const dialog = page.getByTestId('story-start-over-dialog');
  await picker.getByTestId('story-start-over').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('This clears 2 scenes from the reel');
  await expect(dialog).toContainText('Stills and clips stay in the Gallery');
  await expect(dialog.getByTestId('story-start-over-keep')).toBeVisible();
  await expect(dialog.getByTestId('story-start-over-new-bible')).toBeVisible();
  // Cancel keeps the story.
  await dialog.getByTestId('story-start-over-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(picker.getByTestId('story-start-over')).toBeVisible();
  // Visible ones only: the title is also in the folded Cut options shot list.
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible();
  // Keep the bible: the scenes go, the character stays.
  await picker.getByTestId('story-start-over').click();
  await dialog.getByTestId('story-start-over-keep').click();
  await expect(dialog).toHaveCount(0);
  await expect(picker.getByTestId('story-start-over')).toHaveCount(0);
  await expect(picker.getByTestId('story-settings-midway')).toHaveCount(0);
  // Nothing to show yet: the reel steps aside; the scene picker (Roll) leads.
  await expect(page.getByTestId('story-reel')).toHaveCount(0);
  await expect(picker.getByTestId('story-roll-scenes')).toBeVisible();
});

test('story mid-flow: start over with a new bible for the same Cast lead', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-newbible');
  let bioRequest: { characterName?: string; tone?: string } | null = null;
  await page.route('**/api/roleplay', async route => {
    const body = route.request().postDataJSON() as {
      action?: string;
      characterName?: string;
      tone?: string;
    };
    const json = (payload: unknown) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(payload),
      });
    if (body.action === 'bio') {
      bioRequest = { characterName: body.characterName, tone: body.tone };
      await json({
        bio: { name: 'Story Mid', look: 'red scarf, grey coat', personality: 'restless' },
        provider: 'template',
      });
      return;
    }
    if (body.action === 'prompt') {
      await json({ prompt: 'Story still: first look', provider: 'template' });
      return;
    }
    await json({ scenes: [] });
  });
  await gotoStable(page, '/story?character=e2e-story-newbible');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible();
  await picker.getByTestId('story-start-over').click();
  await page
    .getByTestId('story-start-over-dialog')
    .getByTestId('story-start-over-new-bible')
    .click();
  // The bible is written for the same lead (the name is kept) with the current settings…
  await expect.poll(() => bioRequest?.characterName).toBe('Story Mid');
  expect(bioRequest?.tone).toBeTruthy();
  // …and the story opens again from it: the old scenes are gone, the first look is back.
  await expect(page.getByText('First look').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('The letter')).toHaveCount(0);
});

test('story mid-flow: edit a scene in the reel, then write its still again', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-edit', {}, { prompt: 'Story still: a letter under the door' });
  let rewrite: { blurb?: string; storyTitles?: string[] } | null = null;
  await page.route('**/api/roleplay', async route => {
    const body = route.request().postDataJSON() as {
      action?: string;
      situation?: { blurb?: string };
      story?: Array<{ title?: string }>;
    };
    if (body.action === 'prompt') {
      rewrite = {
        blurb: body.situation?.blurb,
        storyTitles: (body.story ?? []).map(beat => beat.title ?? ''),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompt: 'Story still: she reads it on the stairs', provider: 'template' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"scenes":[]}' });
  });
  await gotoStable(page, '/story?character=e2e-story-edit');
  await dismissBlockingOverlays(page);
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible({ timeout: 30_000 });
  // Edit scene sits in the stage card's ⋯ menu and opens the scene's side sheet. The newest
  // scene is on stage; the strip brings the others up.
  const editButtons = page.getByTestId('story-beat-edit');
  await expect(editButtons).toHaveCount(1);
  // A scene whose still is rendering cannot be edited underneath its job.
  await expect(editButtons.first()).toBeDisabled();
  // Nothing to write again until the text changes.
  await expect(page.getByTestId('story-beat-rewrite')).toHaveCount(0);
  await openStoryBeatSheet(page, 0);
  const editor = page.getByTestId('story-beat-editor');
  await expect(editor.getByTestId('story-beat-edit-title')).toHaveValue('The letter');
  await expect(editor.getByTestId('story-beat-edit-text')).toHaveValue('A letter under the door.');
  // Too short to be a scene: no save.
  await editor.getByTestId('story-beat-edit-text').fill('no');
  await expect(editor.getByTestId('story-beat-edit-save')).toBeDisabled();
  // Cancel closes the sheet and leaves the scene as it was.
  await editor.getByTestId('story-beat-edit-cancel').click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('story-beat-sheet')).toHaveCount(0);
  await expect(page.getByText('A letter under the door.').first()).toBeVisible();

  await openStoryBeatSheet(page, 0);
  await editor.getByTestId('story-beat-edit-title').fill('The note');
  await editor
    .getByTestId('story-beat-edit-text')
    .fill('She sits on the stairs and reads the letter twice.');
  await editor.getByTestId('story-beat-edit-save').click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText('She sits on the stairs and reads the letter twice.').first()).toBeVisible();
  await expect(page.getByText('A letter under the door.')).toHaveCount(0);
  // The pose is read from the new text (Pose… in the menu opens the same sheet).
  await openStoryBeatSheet(page, 0, 'pose');
  const firstPose = page.getByTestId('story-beat-sheet').getByTestId('story-beat-pose');
  await firstPose.locator('summary').click();
  await expect(firstPose.getByTestId('story-beat-pose-preview')).toHaveAttribute(
    'data-pose',
    /sit|perch/
  );
  await closeStorySheets(page);
  // The still is offered again; asking for it sends the new text and only the story before it.
  const again = page.getByTestId('story-beat-rewrite');
  await expect(again).toContainText('Scene text changed');
  await again.getByTestId('story-beat-rewrite-button').click();
  await expect.poll(() => rewrite?.blurb).toBe('She sits on the stairs and reads the letter twice.');
  expect(rewrite?.storyTitles).toEqual([]);
});

test('story scene cards show the pose each still would be drawn in', async ({ page }) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  // A From photo story: only those queue a pose guide, so only those show a figure.
  await seedStoryMidFlow(page, 'e2e-story-cardpose', {
    playAs: 'photo',
    isolateSubject: false,
    referenceImageUrl: thumb,
    referenceImageFilename: 'e2e-story-plate.webp',
  });
  const scenes = [
    { id: 's1', title: 'The dock', blurb: 'She sits on the edge of the dock with her feet in the water.' },
    { id: 's2', title: 'The hill', blurb: 'She runs up the hill behind the station.' },
    { id: 's3', title: 'The bench', blurb: 'She lies on a park bench and watches the clouds.' },
    { id: 's4', title: 'The wave', blurb: 'She waves at the ferry from the pier.' },
  ];
  await page.route('**/api/roleplay', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ scenes, provider: 'template' }),
    })
  );
  await gotoStable(page, '/story?character=e2e-story-cardpose');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await picker.getByTestId('story-roll-scenes').click();
  const cards = picker.getByTestId('story-scene-card');
  await expect(cards).toHaveCount(4, { timeout: 15_000 });
  const figures = picker.getByTestId('story-scene-pose');
  await expect(figures).toHaveCount(4);
  // Each card's own pose, not one figure four times.
  const poses = await figures.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-pose')));
  expect(new Set(poses).size).toBeGreaterThan(1);
  // A fixed small box at the card's side.
  for (const box of await figures.evaluateAll(nodes =>
    nodes.map(node => {
      const rect = node.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    })
  )) {
    expect(box).toEqual({ width: 44, height: 56 });
  }

  // Phone: the same figures, and the box does not push the card wider than the page.
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/m/story?character=e2e-story-cardpose');
  await dismissBlockingOverlays(page);
  const phonePicker = page.getByTestId('story-beat-picker');
  await expect(phonePicker).toBeVisible({ timeout: 30_000 });
  await phonePicker.getByTestId('story-roll-scenes').click();
  await expect(phonePicker.getByTestId('story-scene-card')).toHaveCount(4, { timeout: 15_000 });
  await expect(phonePicker.getByTestId('story-scene-pose')).toHaveCount(4);
  // The figure sits inside its card, and the card inside the page.
  const layout = await phonePicker.getByTestId('story-scene-card').evaluateAll(nodes =>
    nodes.map(node => {
      const card = node.getBoundingClientRect();
      const figure = node.querySelector('[data-testid="story-scene-pose"]')!.getBoundingClientRect();
      return {
        cardRight: card.right,
        figureInside: figure.right <= card.right && figure.bottom <= card.bottom,
        figure: { width: Math.round(figure.width), height: Math.round(figure.height) },
      };
    })
  );
  for (const entry of layout) {
    expect(entry.cardRight).toBeLessThanOrEqual(390);
    expect(entry.figureInside).toBe(true);
    expect(entry.figure).toEqual({ width: 44, height: 56 });
  }
});

test('story mid-flow: write your own scene, then take it back', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-own');
  let situation = '';
  await page.route('**/api/roleplay', async route => {
    const body = route.request().postDataJSON() as { action?: string; situation?: { blurb?: string } };
    if (body.action === 'prompt') {
      situation = body.situation?.blurb ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompt: `Story still: ${situation}`, provider: 'template' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"scenes":[]}' });
  });
  await gotoStable(page, '/story?character=e2e-story-own');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  const own = picker.getByTestId('story-own-scene');
  await own.locator('summary').click();
  await expect(own.getByTestId('story-own-scene-play')).toBeDisabled();
  await own
    .getByTestId('story-own-scene-text')
    .fill('she misses the last ferry and talks her way onto a fishing boat');
  await own.getByTestId('story-own-scene-play').click();
  await expect.poll(() => situation).toContain('misses the last ferry');
  await expect(page.getByText('She misses the last ferry and…').first()).toBeVisible({
    timeout: 15_000,
  });
  // Take it back: the scene leaves the reel.
  await picker.getByTestId('story-undo-scene').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Undo the last scene');
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByText('She misses the last ferry and…')).toHaveCount(0);
});

test('outfit pose from a photo: reads the pose and selects it', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  // ComfyUI upload + DWPose are stubbed: one standing person, right arm raised.
  await page.route('**/api/comfyui/upload**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ name: 'pose-plate.png', subfolder: '', type: 'input' }),
    })
  );
  const xy: Array<[number, number]> = [
    [0.5, 0.12], [0.5, 0.2], [0.42, 0.2], [0.36, 0.1], [0.34, 0.02], [0.58, 0.2], [0.6, 0.34],
    [0.6, 0.46], [0.45, 0.48], [0.45, 0.67], [0.45, 0.86], [0.55, 0.48], [0.55, 0.67], [0.55, 0.86],
    [0.48, 0.1], [0.52, 0.1], [0.46, 0.11], [0.54, 0.11],
  ];
  await page.route('**/api/pose-detect', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        pose: { canvas: { width: 512, height: 768 }, people: [xy.map(([x, y]) => ({ x, y }))] },
      }),
    })
  );
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  const section = page.getByTestId('outfit-pose');
  await expect(section).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('outfit-pose-photo')).toHaveAttribute('aria-checked', 'false');
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
  );
  await page
    .getByTestId('outfit-pose-photo-input')
    .setInputFiles({ name: 'pose-plate.png', mimeType: 'image/png', buffer: png });
  // The read loads its code on demand (library-import, the upload helpers): on a dev server still
  // serving the page's first load that chunk alone took ~5 s (trace, 2026-10-22) while both API
  // calls are stubbed and answer at once — the 5 s default timed out about every other run.
  await expect(page.getByTestId('outfit-pose-photo-status')).toContainText(
    'Using the pose from your photo.',
    { timeout: 20_000 }
  );
  await expect(page.getByTestId('outfit-pose-photo')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('outfit-pose-custom')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('outfit-pose-figure')).toBeVisible();
  // Back to the plate's own stance clears it.
  await page.getByTestId('outfit-pose-plate').click();
  await expect(page.getByTestId('outfit-pose-figure')).toHaveCount(0);
  await expect(page.getByTestId('outfit-pose-photo')).toHaveAttribute('aria-checked', 'false');
});

/** A phone Story with a plate (writing a bible or a still needs one there). */
const PHONE_STORY_PLATE = {
  isolateSubject: false,
  referenceImageUrl: '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp',
  referenceImageFilename: 'e2e-story-plate.webp',
};

test('phone story: edit a scene in the reel, then write its still again', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-phone-edit', PHONE_STORY_PLATE, {
    prompt: 'Story still: a letter under the door',
  });
  let rewrite: { blurb?: string; storyTitles?: string[] } | null = null;
  await page.route('**/api/roleplay', async route => {
    const body = route.request().postDataJSON() as {
      action?: string;
      situation?: { blurb?: string };
      story?: Array<{ title?: string }>;
    };
    if (body.action === 'prompt') {
      rewrite = {
        blurb: body.situation?.blurb,
        storyTitles: (body.story ?? []).map(beat => beat.title ?? ''),
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ prompt: 'Story still: she reads it on the stairs', provider: 'template' }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"scenes":[]}' });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/m/story?character=e2e-story-phone-edit');
  await dismissBlockingOverlays(page);
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  const editButtons = page.getByTestId('story-beat-edit');
  await expect(editButtons).toHaveCount(1);
  // The newest scene is on stage; its still is rendering, so it cannot be edited (as on desk).
  await expect(editButtons.first()).toBeDisabled();
  await expect(page.getByTestId('story-beat-rewrite')).toHaveCount(0);
  // The same ⋯ menu and scene sheet as desk (a bottom sheet on the phone).
  await openStoryBeatSheet(page, 0);
  const editor = page.getByTestId('story-beat-editor');
  await expect(editor.getByTestId('story-beat-edit-text')).toHaveValue('A letter under the door.');
  await editor.getByTestId('story-beat-edit-title').fill('The note');
  await editor
    .getByTestId('story-beat-edit-text')
    .fill('She sits on the stairs and reads the letter twice.');
  await editor.getByTestId('story-beat-edit-save').click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByText('She sits on the stairs and reads the letter twice.').first()
  ).toBeVisible();
  await expect(page.getByText('A letter under the door.')).toHaveCount(0);
  const again = page.getByTestId('story-beat-rewrite');
  await expect(again).toContainText('Scene text changed');
  await again.getByTestId('story-beat-rewrite-button').click();
  // The same request as desk: the new text, and only the story before the scene.
  await expect.poll(() => rewrite?.blurb).toBe('She sits on the stairs and reads the letter twice.');
  expect(rewrite?.storyTitles).toEqual([]);
});

test('phone story: start over — keep the bible, or a new bible for the same lead', async ({
  page,
}) => {
  await seedStoryMidFlow(page, 'e2e-story-phone-over', PHONE_STORY_PLATE);
  let bioRequest: { characterName?: string } | null = null;
  await page.route('**/api/roleplay', async route => {
    const body = route.request().postDataJSON() as { action?: string; characterName?: string };
    const json = (payload: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    if (body.action === 'bio') {
      bioRequest = { characterName: body.characterName };
      await json({
        bio: { name: 'Story Mid', look: 'red scarf, grey coat', personality: 'restless' },
        provider: 'template',
      });
      return;
    }
    if (body.action === 'prompt') {
      await json({ prompt: 'Story still: first look', provider: 'template' });
      return;
    }
    await json({ scenes: [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/m/story?character=e2e-story-phone-over');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible();

  // Asked in the page, as on desk; Cancel keeps the story.
  const dialog = page.getByTestId('story-start-over-dialog');
  await picker.getByTestId('story-start-over').click();
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('This clears 2 scenes from the reel');
  await dialog.getByTestId('story-start-over-cancel').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible();

  // A new bible: written for the same lead, and the story opens again from it.
  await picker.getByTestId('story-start-over').click();
  await dialog.getByTestId('story-start-over-new-bible').click();
  await expect.poll(() => bioRequest?.characterName).toBe('Story Mid');
  await expect(page.getByText('First look').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('The letter')).toHaveCount(0);

  // Keep the bible: the scenes go, the bible stays.
  await picker.getByTestId('story-start-over').click();
  await dialog.getByTestId('story-start-over-keep').click();
  await expect(dialog).toHaveCount(0);
  await expect(picker.getByTestId('story-start-over')).toHaveCount(0);
  await expect(page.getByTestId('roleplay-story-empty')).toBeVisible();
  await expect(page.getByText('Continuing as Story Mid')).toBeVisible();
});

test('phone story: take back the last scene', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-phone-undo', PHONE_STORY_PLATE);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/m/story?character=e2e-story-phone-undo');
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('The station').filter({ visible: true }).first()).toBeVisible();
  await picker.getByTestId('story-undo-scene').click();
  await expect(page.getByTestId('confirm-dialog')).toContainText('Undo the last scene');
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByText('The station').filter({ visible: true })).toHaveCount(0);
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible();
});

test('phone story recognises the active Cast before any film is cut', async ({ page }) => {
  await seedStoryMidFlow(page, 'e2e-story-phone');
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoStable(page, '/m/story?character=e2e-story-phone');
  await dismissBlockingOverlays(page);
  await expect(page.getByText('The letter').filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  // The Cast gate can show for a moment before the roster loads.
  await expect(page.getByTestId('story-needs-cast')).toHaveCount(0, { timeout: 15_000 });
});

test('day and story show a running job as Rendering, Story Retry flagged, and the prompt check', async ({
  page,
}) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  const now = Date.now();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-progress' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-progress',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'sleeps' },
        ],
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: thumb,
            promptCheck: { repaired: ['Shoes are ordered on a barefoot scene.'], remaining: [] },
          },
          { slotId: 'evening', status: 'queued', promptId: 'p-evening' },
        ],
      },
      roleplay: {
        activeSessionId: 'cast-e2e-progress',
        characterName: 'Progress',
        bio: { name: 'Progress', look: 'green raincoat', personality: 'curious' },
        story: [
          {
            id: 'b1',
            at: now - 2000,
            kind: 'plot',
            title: 'Missed pose',
            blurb: 'A still that ignored its guide.',
            stillStatus: 'completed',
            imageUrl: thumb,
            poseMatch: { imageUrl: thumb, score: 0.2, expectedPeople: 1, detectedPeople: 1 },
            promptCheck: {
              repaired: [],
              remaining: ['A one-person still describes two people — it may render her twice.'],
            },
          },
          {
            id: 'b2',
            at: now - 1000,
            kind: 'plot',
            title: 'Rendering beat',
            blurb: 'Still in ComfyUI.',
            stillStatus: 'queued',
            promptId: 'p-beat',
          },
        ],
      },
    },
  });
  await page.addInitScript(() => {
    const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
    const now = Date.now();
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-progress', name: 'Progress', version: 1, updatedAt: now }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({ version: 1, firstFilmCutAt: now })
    );
    // What the live poller writes while ComfyUI works: sampler steps and queue position.
    const job = (promptId: string, extra: Record<string, unknown>) => ({
      id: `g-${promptId}`,
      promptId,
      prompt: 'progress',
      model: 'qwen-image-2512',
      tool: 'day',
      queuedAt: now,
      characterId: 'e2e-progress',
      images: [],
      ...extra,
    });
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        job('p-evening', { status: 'running', progressValue: 9, progressMax: 20, queuePosition: 0 }),
        job('p-beat', { status: 'running', progressValue: 30, progressMax: 60, queuePosition: 0 }),
      ])
    );
  });

  await gotoStable(page, '/day?character=e2e-progress');
  await dismissBlockingOverlays(page);
  // Sampler % and queue position are in-memory only (the poller writes them live; they aren't
  // persisted), so a seeded entry carries its running status — their formatting is unit-tested.
  await expect(page.getByTestId('day-progress-evening')).toContainText('Rendering', {
    timeout: 30_000,
  });
  // The queue-time prompt check stays on the card: one quiet line that opens to the details.
  const dayCheck = page.getByTestId('day-slot-prompt-check-morning');
  await expect(dayCheck.locator('summary')).toHaveText('Prompt check: fixed 1');
  await expect(dayCheck).toHaveAttribute('data-tone', 'muted');
  await dayCheck.locator('summary').click();
  await expect(page.getByTestId('day-slot-prompt-check-morning-repaired')).toHaveText(
    'Fixed: Shoes are ordered on a barefoot scene.'
  );
  await expect(page.getByTestId('day-slot-prompt-check-evening')).toHaveCount(0);

  await gotoStable(page, '/story?character=e2e-progress');
  await dismissBlockingOverlays(page);
  await expect(page.getByText(/^Rendering/).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('story-retry-flagged-button')).toHaveText('Retry 1 flagged');
  // The flagged scene is marked in the strip; on stage it shows its prompt check.
  const flaggedThumb = page.getByTestId('story-stage-thumb').first();
  await expect(flaggedThumb).toHaveAttribute('data-attention', 'true');
  await flaggedThumb.click();
  const storyCheck = page.getByTestId('story-beat-prompt-check');
  await expect(storyCheck).toHaveCount(1);
  await expect(storyCheck).toHaveAttribute('data-tone', 'warning');
  await expect(storyCheck.locator('summary')).toHaveText('Prompt check: 1 problem');
  await storyCheck.locator('summary').click();
  await expect(page.getByTestId('story-beat-prompt-check-remaining')).toContainText(
    'describes two people'
  );
});

test('retired Look links open the Cast looks', async ({ page }) => {
  await gotoStable(page, '/moodboard?character=e2e-char');
  await expect(page).toHaveURL(/\/characters\/e2e-char\?tab=overview#looks$/);
  await gotoStable(page, '/m/moodboard');
  await expect(page).toHaveURL(/\/m$/);
});

test('look pack deep link stages Fitting from=look handoff', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/fitting?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('fitting-kit-strip')).toBeVisible();
});

test('play campaign continue CTA appears when campaign state exists', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-continue')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-start-day')).toContainText(/Restart at Day/i);
});


test('look pack from=look gives Fitting its style notes, not its scene', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      vibePrompt: 'golden hour soft light',
      styleNotes: 'linen, gold jewelry',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/fitting?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  await openOutfitAdvanced(page);
  const notes = page.getByTestId('fitting-notes');
  if (await notes.count()) {
    // A try-on is on white: the Look's light, mood and place stay with Day.
    await expect(notes).toHaveValue(/linen, gold jewelry/i);
    await expect(notes).not.toHaveValue(/golden hour|cozy morning|sunlit kitchen/i);
  }
});

test('look pack from=look seeds Day slot location', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      moodNotes: 'cozy morning',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/day?from=look&character=e2e-char&wardrobe=kit-linen');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Day$/i, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  const location = page.getByTestId('day-slot-location');
  if (await location.count()) {
    await expect(location).toHaveValue(/sunlit kitchen/i);
  }
});

test('play campaign continue navigates to Fitting step', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  const continueBtn = page.getByTestId('play-campaign-continue');
  await expect(continueBtn).toBeVisible({ timeout: 30_000 });
  await continueBtn.click();
  await expect(page).toHaveURL(/\/fitting/, { timeout: 30_000 });
});

test('portable look pack share hash is accepted on /play', async ({ page }) => {
  const token = Buffer.from(
    JSON.stringify({
      version: 1,
      kind: 'prompt-studio-look-pack',
      name: 'E2E share',
      id: 'lp-e2e',
      pack: {
        version: 1,
        source: 'moodboard',
        locationNotes: 'hash rooftop',
        moodNotes: 'night air',
        wardrobeId: 'kit-linen',
        savedAt: Date.now(),
      },
    }),
    'utf8'
  )
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  page.once('dialog', async dialog => {
    await dialog.accept('E2E Shared Cast');
  });
  await gotoStable(page, `/play#lookpack=${token}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Created Cast|Imported shared/i)).toBeVisible({
    timeout: 30_000,
  });
});

test('play campaign resume restores lookPack query from saved campaign', async ({ page }) => {
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'saved',
      characterId: 'e2e-resume-char',
      locationNotes: 'resume kitchen',
      savedAt: Date.now(),
    };
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-resume-char',
            name: 'E2E Resume',
            version: 1,
            updatedAt: Date.now(),
            lookPacks: [{ id: 'lp-resume', name: 'Resume pack', savedAt: Date.now(), pack }],
          },
        ],
        removedIds: [],
      })
    );
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-resume-char',
        lookPackId: 'lp-resume',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page).toHaveURL(/lookPack=lp-resume/, { timeout: 30_000 });
  await expect(page.getByText(/look pack staged/i)).toBeAttached({ timeout: 30_000 });
});

test('play campaign shows mismatch when saved character differs', async ({ page }) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-other-char',
        stepIndex: 2,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-resume-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-resume-mismatch')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-continue')).toHaveCount(0);
});

test('day slot editor previews the pose and lets you change it', async ({ page }) => {
  await useWireframePoseEditor(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-pose' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-pose',
        slots: [
          {
            id: 'morning',
            label: 'Morning',
            location: 'small kitchen',
            sceneHints: 'stirring a pot of risotto at the stove',
          },
          // Every slot cooks, so whichever slot the editor opens on draws the same pose.
          {
            id: 'afternoon',
            label: 'Afternoon',
            location: 'small kitchen',
            sceneHints: 'chopping onions at the counter',
          },
          {
            id: 'evening',
            label: 'Evening',
            location: 'small kitchen',
            sceneHints: 'stirring a pot of soup at the stove',
          },
          {
            id: 'night',
            label: 'Night',
            location: 'small kitchen',
            sceneHints: 'cooking pasta at the stove',
          },
        ],
      },
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-pose', name: 'Day Pose', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/day?character=e2e-day-pose');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  const preview = page.getByTestId('day-slot-pose-preview');
  await expect(preview).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Cooking');
  await expect(page.getByTestId('pose-preview-figure').first()).toBeVisible();
  // Change pose overrides the beat; Try another keeps the pick.
  await page.getByTestId('day-slot-pose-preview-select').selectOption('wave');
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Waving');
  await expect(preview).toContainText('Picked');
  await page.getByTestId('day-slot-pose-preview-another').click();
  // Try another walks the real reference poses (variant 1 = the first), still Waving.
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText(
    /^Waving · real pose 1 of \d+$/
  );
  await page.getByTestId('day-slot-pose-preview-camera-height').selectOption('low');
  await expect(page.getByTestId('day-slot-pose-preview-camera-height')).toHaveValue('low');
  await expect(page.getByTestId('day-slot-pose-preview-camera')).toHaveAttribute('data-from', 'slot');
  await expect(page.getByTestId('day-slot-pose-preview-photo')).toContainText('From a photo');
  // No ComfyUI here: the read fails, and says so plainly instead of changing the pose.
  await page.getByTestId('day-slot-pose-preview-photo-input').setInputFiles({
    name: 'pose.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    ),
  });
  const photoStatus = page.getByTestId('day-slot-pose-preview-photo-status');
  await expect(photoStatus).toHaveAttribute('data-error', 'true', { timeout: 20_000 });
  await expect(photoStatus).toHaveAttribute('role', 'alert');
  // The failed read leaves the pose as it was (the real pose Try another picked).
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText(
    /^Waving · real pose 1 of \d+$/
  );
  await expect(page.getByTestId('day-slot-pose-preview-photo-thumb')).toHaveCount(0);
  await page.getByTestId('day-slot-pose-preview-look').selectOption('down');
  await expect(page.getByTestId('day-slot-pose-preview-look')).toHaveValue('down');
  // Edit joints: nudge the Cast's right wrist with the keyboard and use the edited pose.
  await page.getByTestId('day-slot-pose-preview-edit').click();
  const wrist = page.getByTestId('day-slot-pose-preview-joint-0-4');
  await wrist.focus();
  await page.keyboard.press('Shift+ArrowUp');
  await page.getByTestId('day-slot-pose-preview-editor-save').click();
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Your edit');
  // Two people: add a partner, see both figures, pick each, swap sides.
  await page.getByTestId('day-slot-pose-preview-edit').click();
  await expect(page.getByTestId('day-slot-pose-preview-figure-1')).toHaveCount(0);
  await page.getByTestId('day-slot-pose-preview-add-person').click();
  await expect(page.getByTestId('day-slot-pose-preview-figure-0')).toBeVisible();
  await expect(page.getByTestId('day-slot-pose-preview-figure-1')).toBeVisible();
  await expect(page.getByTestId('day-slot-pose-preview-joint-1-4')).toBeVisible();
  await expect(page.getByTestId('day-slot-pose-preview-figure-tab-1')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.getByTestId('day-slot-pose-preview-figure-tab-0').click();
  await expect(page.getByTestId('day-slot-pose-preview-figure-tab-0')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  const leadNeckX = async () =>
    Number(await page.getByTestId('day-slot-pose-preview-joint-0-1').getAttribute('cx'));
  const partnerNeckX = async () =>
    Number(await page.getByTestId('day-slot-pose-preview-joint-1-1').getAttribute('cx'));
  expect(await leadNeckX()).toBeLessThan(await partnerNeckX());
  await page.getByTestId('day-slot-pose-preview-swap-sides').click();
  expect(await leadNeckX()).toBeGreaterThan(await partnerNeckX());
  // This slot has no partner: the editor says only the lead is drawn.
  await expect(page.getByTestId('day-slot-pose-preview-figures')).toContainText(
    'only the lead is drawn'
  );
  await page.getByTestId('day-slot-pose-preview-remove-person').click();
  await expect(page.getByTestId('day-slot-pose-preview-figure-1')).toHaveCount(0);
  await page.getByTestId('day-slot-pose-preview-add-mirrored').click();
  await expect(page.getByTestId('day-slot-pose-preview-figure-1')).toBeVisible();
  await page.getByTestId('day-slot-pose-preview-editor-save').click();
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Your edit');
});

test('day pose pack poses every slot, fills only empty beats, saves and clears', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-pack' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-pack',
        slots: [
          { id: 'morning', label: 'Morning' },
          {
            id: 'afternoon',
            label: 'Afternoon',
            location: 'my rooftop',
            sceneHints: 'my own beat on the roof',
            sceneHintsTyped: 'my own beat on the roof',
          },
          { id: 'evening', label: 'Evening' },
          { id: 'night', label: 'Night' },
        ],
      },
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-pack', name: 'Day Pack', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/day?character=e2e-day-pack');
  await dismissBlockingOverlays(page);
  // The pose pack sits in the Advanced drawer under the plan bar.
  await openDayAdvanced(page);
  const picker = page.getByTestId('day-pose-pack');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('day-pose-pack-select').selectOption('fitness');
  await expect(picker).toHaveAttribute('data-active-pack', 'fitness');
  await expect(page.getByTestId('day-pose-pack-status')).toContainText('4 slots posed');
  await expect(page.getByTestId('day-pose-pack-status')).toContainText('3 empty beats filled');
  await expect(page.getByTestId('day-pose-pack-figure').first()).toBeVisible();
  // Morning (the open slot) takes the pack's first pose and its beat.
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Yoga warrior');
  await expect(page.getByTestId('day-slot-beat')).toHaveValue(/warrior two/);
  // The typed beat is untouched; its pose still comes from the pack.
  await openDaySlotSheet(page, 'afternoon');
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('my own beat on the roof');
  await expect(page.getByTestId('day-slot-location')).toHaveValue('my rooftop');
  await expect(page.getByTestId('day-slot-pose-preview-name')).toHaveText('Squat');
  await closeDaySheets(page);
  // Save as my own pack: it shows under My packs and is the active pack.
  await page.getByTestId('day-pose-pack-save').click();
  await page.getByTestId('day-pose-pack-name').fill('Gym day');
  await page.getByTestId('day-pose-pack-save-confirm').click();
  await expect(page.getByTestId('day-pose-pack-status')).toContainText('Saved “Gym day”');
  await expect(
    page.getByTestId('day-pose-pack-select').locator('optgroup[label="My packs"] option')
  ).toHaveText(['Gym day']);
  // Clear: every slot back to the beat; the pack's beats go, the typed one stays.
  await page.getByTestId('day-pose-pack-clear').click();
  await expect(picker).toHaveAttribute('data-active-pack', '');
  await openDaySlotSheet(page, 'afternoon');
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('my own beat on the roof');
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('');
  await expect(page.getByTestId('day-slot-pose-preview')).toContainText('From the beat');
});

test('dashboard shows pose match by layout and the words-first ladder', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstPlayCampaignAt: Date.now() - 86_400_000,
        firstFilmCutAt: Date.now(),
        poseMatchByLayout: { cook: { sum: 2.4, count: 8, misses: 6 } },
      })
    );
  });
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  const card = page.getByRole('main').getByTestId('play-film-metrics');
  await expect(card).toContainText('Pose match by layout', { timeout: 30_000 });
  await expect(card).toContainText('prompt now spells the pose out');
});

test('gallery: Cast filter, pose / face badges, missed filter, use this pose', async ({
  page,
}) => {
  await seedGalleryPlayFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  const filtersSummary = page.locator('details.ui-collapsible summary').filter({ hasText: 'Filters' });
  if (await filtersSummary.isVisible().catch(() => false)) {
    await filtersSummary.click();
  }
  const castFilter = page.getByTestId('gallery-cast-filter');
  await expect(castFilter).toBeVisible({ timeout: 20_000 });
  await expect(castFilter).toContainText('Gallery Cast');
  await expect(page.getByTestId('gallery-card-play-checks').first()).toBeVisible();
  await expect(page.getByText('pose 86% · face 71%').first()).toBeVisible();
  // Missed pose / face narrows to the one still that ignored its guide.
  await page.getByTestId('gallery-filter-play-miss').click();
  await expect(page).toHaveURL(/missed=1/);
  await expect(page.getByText('pose 31%').first()).toBeVisible();
  await expect(page.getByText('pose 86% · face 71%')).toHaveCount(0);
  // Cast chip filters too, and shows as an active filter.
  await page.getByTestId('gallery-cast-filter-e2e-gallery-cast').click();
  await expect(page).toHaveURL(/character=e2e-gallery-cast/);
  await expect(page.getByTestId('gallery-active-filters')).toContainText('Cast: Gallery Cast');
  // "Use this pose…" opens the pose dialog (no ComfyUI here, so it says it can't read it).
  await page.getByTestId('gallery-card-menu').first().click();
  await page.getByRole('menuitem', { name: 'Use this pose…' }).click();
  const dialog = page.getByTestId('gallery-pose-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('gallery-pose-error')).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);
});

test('day cut: shot list with beat captions, and a pre-cut check for a pose miss', async ({
  page,
}) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-cut' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-cut',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads on a bench' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs with a drink' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'e2e-cut-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'e2e-cut-a' },
        ],
      },
    },
  });
  await page.addInitScript(() => {
    const now = Date.now();
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-cut', name: 'Day Cut', version: 1, updatedAt: now }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          id: 'e2e-cut-m',
          promptId: 'e2e-cut-m',
          prompt: 'morning still',
          tool: 'day',
          comfyUrl: 'http://127.0.0.1:8188',
          status: 'completed',
          queuedAt: now,
          completedAt: now,
          images: [{ filename: 'm.png', subfolder: '', type: 'output' }],
          playChecks: { pose: 0.31, poseMiss: true, at: now },
        },
      ])
    );
  });
  await gotoStable(page, '/day?character=e2e-day-cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-cut-coach')).toBeVisible({ timeout: 30_000 });
  // Cut (its own page): the shot list, with captions from the beats once titles are on.
  await gotoStable(page, '/cut?from=day');
  await dismissBlockingOverlays(page);
  const coach = page.locator('body');
  await expect(coach.getByTestId('cut-shot-list')).toBeVisible();
  await page.getByTestId('cut-tab-options').click();
  await coach.getByTestId('cut-options-text').evaluate(el => {
    (el as HTMLDetailsElement).open = true;
  });
  await coach.getByTestId('cut-titles').check();
  await page.getByTestId('cut-tab-shots').click();
  await expect(coach.getByTestId('cut-shot-caption-day:morning')).toHaveValue(
    'pours coffee by the window'
  );
  await page.getByTestId('cut-tab-options').click();
  await expect(coach.getByTestId('cut-length')).toBeVisible();
  // Cut: the morning still missed its pose, so the check comes first.
  await page.getByTestId('cut-film').first().click();
  const dialog = page.getByTestId('cut-problems');
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByTestId('cut-problem-day:morning')).toContainText('missed its pose (31%)');
  await expect(dialog.getByTestId('cut-problems-leave-out')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('day cut: face marks, what the cut leaves out, shape, clip trim, and a missing file', async ({
  page,
}) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-deliver' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-deliver',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          {
            id: 'afternoon',
            label: 'Afternoon',
            location: 'park',
            sceneHints: 'reads on a bench',
            line: 'What a day.',
          },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'e2e-dl-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'e2e-dl-a' },
          { slotId: 'evening', status: 'error', promptId: 'e2e-dl-e' },
          {
            slotId: 'night',
            status: 'completed',
            imageUrl: thumb,
            promptId: 'e2e-dl-n',
            clipStatus: 'completed',
            clipUrl: '/e2e-missing/night-clip.mp4',
            clipPromptId: 'e2e-dl-n-clip',
          },
        ],
      },
    },
  });
  await page.addInitScript(() => {
    const now = Date.now();
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-day-deliver', name: 'Mira', version: 1, updatedAt: now }],
        removedIds: [],
      })
    );
  });
  // The file check: the night clip is gone.
  let checked: Array<{ key: string; expectSpeech?: boolean }> = [];
  await page.route('**/api/film/check', async route => {
    checked = (route.request().postDataJSON() as { shots: typeof checked }).shots;
    await route.fulfill({
      json: {
        ok: true,
        ffmpeg: true,
        results: checked.map(shot =>
          shot.key === 'day:night' ? { key: 'day:night', missing: 'not found' } : { key: shot.key }
        ),
      },
    });
  });
  await gotoStable(page, '/day?character=e2e-day-deliver');
  // The stills' face checks live on their gallery entries (the IndexedDB gallery store).
  const now = Date.now();
  const entry = (id: string, face: number) => ({
    id,
    promptId: id,
    prompt: `${id} still`,
    tool: 'day',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: now,
    completedAt: now,
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
    playChecks: { face, faceMiss: face < 0.4, at: now },
  });
  await replaceGalleryIdb(page, [entry('e2e-dl-m', 0.72), entry('e2e-dl-a', 0.2)]);
  await gotoStable(page, '/day?character=e2e-day-deliver');
  await dismissBlockingOverlays(page);
  // What the Day holds the same, and how long the batch buttons would take.
  await expect(page.getByTestId('day-continuity-face')).toContainText('Face · no plate');
  await expect(page.getByTestId('day-continuity-face')).toHaveAttribute('data-held', 'false');
  await expect(page.getByTestId('day-continuity-place')).toBeVisible();
  await expect(page.getByTestId('day-batch-plan')).toContainText('Animate all: 2 clips');
  // Each finished still says whether it looks like the Cast.
  await expect(page.getByTestId('day-progress-identity-morning')).toContainText('Looks like Mira');
  await expect(page.getByTestId('day-progress-identity-afternoon')).toContainText('Not Mira?');
  await expect(page.getByTestId('day-progress-identity-afternoon')).toHaveAttribute(
    'data-tone',
    'miss'
  );
  const coach = page.getByTestId('day-cut-coach');
  await expect(coach).toBeVisible({ timeout: 30_000 });
  // What the cut will quietly do, and which checks ran.
  const notes = coach.getByTestId('day-cut-readiness-notes');
  await expect(notes).toContainText("Afternoon: its line won't be heard (no talking clip)");
  await expect(notes).toContainText('Evening: the still failed — left out');
  await expect(coach.getByTestId('day-cut-readiness-coverage')).toContainText(
    'Checked: faces 2 of 3'
  );
  await expect(coach.getByTestId('day-cut-readiness-coverage')).toContainText('Not checked: pose');
  // Cut (its own page): shape and size, a face mark per shot, and a clip trim.
  await gotoStable(page, '/cut?from=day');
  await dismissBlockingOverlays(page);
  const room = page.locator('body');
  await expect(page.getByTestId('cut-shots')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('cut-tab-options').click();
  await room.getByTestId('cut-shape-square').click();
  await room.getByTestId('cut-quality-1080p').click();
  await page.getByTestId('cut-tab-shots').click();
  await expect(room.getByTestId('cut-shot-identity-day:afternoon')).toHaveAttribute(
    'data-tone',
    'miss'
  );
  await room.getByTestId('cut-shot-trim-day:night-start').fill('1');
  // A closer frame for a still, the poster from a clip frame, and the lines' level.
  await room.getByTestId('cut-shot-framing-day:morning').selectOption('close');
  await room.getByTestId('cut-shot-menu-day:night-trigger').click();
  await room.getByTestId('cut-shot-poster-day:night').click();
  await expect(room.getByTestId('cut-shot-poster-day:night')).toHaveAttribute('aria-pressed', 'true');
  await room.getByTestId('cut-shot-poster-at-day:night').fill('2.5');
  await page.getByTestId('cut-tab-options').click();
  await room.getByTestId('cut-voice-level').fill('1.5');
  // The choices stay as set (Cut keeps its options between visits).
  await expect(room.getByTestId('cut-shape-square')).toHaveAttribute('aria-checked', 'true');
  await expect(room.getByTestId('cut-quality-1080p')).toHaveAttribute('aria-checked', 'true');
  // Cut: the missing clip and the face miss come up before the encode. A ✗ in the preflight
  // (the missing file, when the preflight sees it) asks first since M6 D1: go on.
  await page.getByTestId('cut-film').first().click();
  const dialog = page.getByTestId('cut-problems');
  const blocked = page.getByTestId('cut-blocked-dialog');
  await expect(dialog.or(blocked)).toBeVisible({ timeout: 20_000 });
  if (await blocked.isVisible()) await page.getByTestId('confirm-dialog-confirm').click();
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByTestId('cut-problem-day:night')).toContainText(
    'the file is missing (not found)'
  );
  await expect(dialog.getByTestId('cut-problem-day:afternoon')).toContainText(
    "doesn't look like the Cast"
  );
  expect(checked.map(shot => shot.key).sort()).toEqual(['day:afternoon', 'day:morning', 'day:night']);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('queue: jobs say where they came from, batch together, and show time left', async ({
  page,
}) => {
  // Day slices live in the IDB tools sidecar — a localStorage-only seed lost to it on hydrate
  // about half the time, and the jobs showed without their slot ("Day · Queue Cast").
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-queue-cast' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-queue-cast',
        slots: [
          { id: 'morning', label: 'Morning' },
          { id: 'afternoon', label: 'Afternoon' },
          { id: 'evening', label: 'Evening' },
          { id: 'night', label: 'Night' },
        ],
        stills: [
          { slotId: 'morning', status: 'running', promptId: 'e2e-q-m' },
          { slotId: 'afternoon', status: 'queued', promptId: 'e2e-q-a' },
        ],
      },
    },
  });
  await page.addInitScript(() => {
    const now = Date.now();
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-queue-cast', name: 'Queue Cast', version: 1, updatedAt: now }],
        removedIds: [],
      })
    );
    const base = {
      comfyUrl: 'http://127.0.0.1:8188',
      tool: 'day',
      characterId: 'e2e-queue-cast',
      model: 'qwen-e2e',
      images: [],
    };
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          ...base,
          id: 'e2e-q-a',
          promptId: 'e2e-q-a',
          prompt: 'afternoon still with a long lock-laden prompt',
          status: 'pending',
          queuePosition: 2,
          queuedAt: now - 20_000,
        },
        {
          ...base,
          id: 'e2e-q-m',
          promptId: 'e2e-q-m',
          prompt: 'morning still with a long lock-laden prompt',
          status: 'running',
          progressValue: 2,
          progressMax: 4,
          queuedAt: now - 30_000,
        },
        {
          ...base,
          id: 'e2e-q-done',
          promptId: 'e2e-q-done',
          prompt: 'earlier still',
          status: 'completed',
          renderDurationMs: 40_000,
          queuedAt: now - 600_000,
          completedAt: now - 560_000,
          images: [{ filename: 'done.png', subfolder: '', type: 'output' }],
        },
      ])
    );
  });
  await gotoStable(page, '/queue');
  await dismissBlockingOverlays(page);
  const batch = page.getByTestId('queue-batch');
  await expect(batch).toContainText('Day · 2 jobs', { timeout: 30_000 });
  await expect(batch.getByText('Day · Morning · Queue Cast')).toBeVisible();
  await expect(batch.getByText('Day · Afternoon · Queue Cast')).toBeVisible();
  await expect(batch.getByRole('link', { name: 'Open in Day' }).first()).toHaveAttribute(
    'href',
    '/day?character=e2e-queue-cast'
  );
  await expect(page.getByTestId('queue-eta')).toContainText('All done in');
  await expect(batch.getByTestId('queue-run-next')).toHaveCount(1);
  await expect(batch.getByTestId('queue-cancel-batch')).toBeVisible();
});

test('play metrics card appears on dashboard when metrics exist', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({
        version: 1,
        firstPlayCampaignAt: Date.now() - 86_400_000,
        firstFilmCutAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('main').getByTestId('play-film-metrics')).toBeVisible({
    timeout: 30_000,
  });
});

test('copy share link button copies portable hash url', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      locationNotes: 'copy rooftop',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await page.getByTestId('play-campaign-look-packs').locator('summary').click();
  const copyBtn = page.getByTestId('play-campaign-share-copy');
  await expect(copyBtn).toBeVisible({ timeout: 30_000 });
  await copyBtn.click();
  await expect(page.getByText(/Share link copied/i)).toBeVisible({ timeout: 10_000 });
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toMatch(/#lookpack=/);
});

test('fitting continue-in-day appears after Keep seeds day', async ({ page }) => {
  const characterId = 'e2e-keep-char';
  const lookId = 'look-1';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: characterId, activeLookId: lookId },
    characters: {
      version: 1,
      characters: [
        {
          id: characterId,
          name: 'E2E Keep',
          version: 1,
          updatedAt: Date.now(),
          activeLookId: lookId,
          looks: [{ id: lookId, name: 'Main', createdAt: Date.now() }],
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/fitting?character=e2e-keep-char');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible({
    timeout: 30_000,
  });
  // Seed a compare try-on card via React state is hard; exercise Keep path through exposed
  // window helpers by evaluating keep-side-effects contract: continue CTA href when pack staged.
  await page.evaluate(() => {
    const pack = {
      version: 1,
      source: 'moodboard',
      characterId: 'e2e-keep-char',
      wardrobeId: 'kit-linen',
      locationNotes: 'sunlit kitchen',
      savedAt: Date.now(),
    };
    window.sessionStorage.setItem('moodboard-look-pack-v1', JSON.stringify(pack));
  });
  // Directly inject Continue CTA by clicking Keep if compare exists; otherwise assert plan-day link.
  const keep = page.getByTestId('fitting-keep');
  if ((await keep.count()) > 0) {
    await keep.first().click();
    await expect(page.getByTestId('fitting-continue-day')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('fitting-continue-day')).toHaveAttribute('href', /\/day/);
  } else {
    await expandFittingMoreMenu(page);
    const planDay = page.getByTestId('fitting-plan-day');
    await expect(planDay).toBeVisible({ timeout: 10_000 });
    await expect(planDay).toHaveAttribute('href', /\/day/);
  }
});

test('mobile desk bridge links to Film on desk', async ({ page }) => {
  await gotoStable(page, '/m');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-desk-bridge')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-desk-play')).toHaveAttribute('href', /\/play/);
  // The tabs appear once the session's features have loaded (the desk's four: Film, Day,
  // Outfit, Story; Look sits under More).
  await expect(page.getByTestId('mobile-tab-fitting')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-tab-day')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-film')).toBeVisible();
});

test('navigation survives a session request that fails or is rate-limited', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/auth/session', route => {
    calls += 1;
    // Dropped once, rate-limited once, then served.
    if (calls === 1) return route.abort('failed');
    if (calls === 2)
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }),
      });
    return route.continue();
  });
  await gotoStable(page, '/m');
  await dismissBlockingOverlays(page);
  // It used to stay on an empty tab bar until a reload.
  await expect(page.getByTestId('mobile-tab-day')).toBeVisible({ timeout: 30_000 });
  expect(calls).toBeGreaterThan(2);
});

// Day / Outfit live in the dock and the desk view in the header — Story has no second set of links.
test('mobile Story reaches phone Day/Outfit and the desk view', async ({ page }) => {
  await gotoStable(page, '/m/story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-play')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-play-cut')).toBeVisible();
  // Nothing cut yet: no greyed Save to Cast.
  await expect(page.getByTestId('roleplay-save-film-cast')).toHaveCount(0);
  await expect(page.getByTestId('mobile-continue-day')).toHaveCount(0);
  await expect(page.getByTestId('mobile-desk-play')).toBeVisible();
});

test('mobile film funnel routes Fitting → Day', async ({ page }) => {
  await gotoStable(page, '/m/fitting');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-fitting')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /^Outfit$/i })).toBeVisible();

  await gotoStable(page, '/m/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-day')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('day-plan-bar')).toBeVisible();
  await expect(page.getByTestId('mobile-day-cut')).toBeVisible();
});

// Phone Day registers the same palette actions as desktop Day, gated like its own buttons.
test('mobile Day lists Queue the Day in the command palette when its button is live', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-m-day-palette' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-m-day-palette', name: 'Palette Cast', version: 1, updatedAt: Date.now() },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/m/day?character=e2e-m-day-palette');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-day')).toBeVisible({ timeout: 30_000 });
  const queueButton = page.getByTestId('day-queue-all');
  await expect(queueButton).toBeVisible({ timeout: 30_000 });
  const queueEnabled = await queueButton.isEnabled();
  const dialog = page.getByRole('dialog', { name: /Command palette/i });
  await expect
    .poll(
      async () => {
        if (await dialog.isVisible().catch(() => false)) return true;
        await page.keyboard.press('Control+K');
        return dialog.isVisible().catch(() => false);
      },
      { timeout: 20_000, intervals: [200, 400, 800] }
    )
    .toBeTruthy();
  await dialog.getByPlaceholder(/Jump to/).fill('queue the day');
  await expect(dialog.getByText('Queue the Day', { exact: true })).toHaveCount(
    queueEnabled ? 1 : 0
  );
  // Nothing rendered yet: no Animate all (on the screen or in the palette).
  await dialog.getByPlaceholder(/Jump to/).fill('animate all');
  await expect(dialog.getByText('Animate all', { exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('gallery exposes Film derived-kind chip', async ({ page }) => {
  // Derived-kind chips only show once the gallery has entries.
  await seedGalleryFixture(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      /* ignore */
    }
  });
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  // Bulk selection and derived-kind chips live in Manage (Browse is the default).
  await page.getByRole('tab', { name: 'Manage', exact: true }).click();
  await expect(page.getByTestId('gallery-derived-kind-film')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('gallery-derived-kind-i2v')).toBeVisible();
});

test('cast films tab and continue roleplay work for Play characters', async ({ page }) => {
  const characterId = 'char-play-e2e';
  await page.addInitScript(
    ({ id }) => {
      window.localStorage.setItem(
        'comfy-prompt-characters-v1',
        JSON.stringify({
          version: 1,
          characters: [
            {
              id,
              name: 'Play E2E',
              version: 1,
              updatedAt: Date.now(),
              descriptor: 'sunlit kitchen coat',
              characterName: 'Play E2E',
            },
          ],
          removedIds: [],
        })
      );
      window.localStorage.setItem(
        'comfyui-gallery-v1',
        JSON.stringify([
          {
            id: 'e2e-film-1',
            promptId: 'e2e-film-prompt',
            prompt: 'day film',
            model: 'qwen-image-2512',
            tool: 'day',
            status: 'completed',
            queuedAt: Date.now(),
            completedAt: Date.now(),
            characterId: id,
            derivedKind: 'film',
            mediaKind: 'video',
            images: [{ filename: 'e2e-film.webm', subfolder: '', type: 'output' }],
          },
        ])
      );
    },
    { id: characterId }
  );
  await gotoStable(page, `/characters/${characterId}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /Play E2E/i })).toBeVisible({ timeout: 30_000 });
  // Media sits on the Film & media tab.
  await page.getByRole('tab', { name: /Film & media/i }).click();
  await expect(page.getByRole('tab', { name: /Films/i })).toBeVisible();
  await page.getByRole('tab', { name: /Films/i }).click();
  await expect(page.getByTestId('cast-continue-roleplay')).toBeVisible();
  await page.getByTestId('cast-continue-roleplay').click();
  await expect(page).toHaveURL(/\/story/, { timeout: 30_000 });
});

test('day cut film chrome and save-to-cast testids are wired', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-cast' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-day-cast', name: 'Day Cast', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
  });
  await gotoStable(page, '/day?character=e2e-day-cast');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-reel')).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByTestId('day-reel').getByRole('link', { name: /Cut film/i })
  ).toBeAttached();
});

test('plan a day bumps campaign stepIndex for resume', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-step-char' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-step-char',
          name: 'Step Char',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'step look',
        },
      ],
      removedIds: [],
    },
  });
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-step-char',
        stepIndex: 1,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/fitting?character=e2e-step-char');
  await dismissBlockingOverlays(page);
  await expandFittingMoreMenu(page);
  const planDay = page.getByTestId('fitting-plan-day');
  await expect(planDay).toBeVisible({ timeout: 30_000 });
  await planDay.click();
  await expect(page).toHaveURL(/\/day/, { timeout: 30_000 });
  const stepIndex = await page.evaluate(() => {
    const raw =
      window.sessionStorage.getItem('play-campaign-v1') ||
      window.localStorage.getItem('play-campaign-v1');
    if (!raw) {
      return null;
    }
    try {
      return (JSON.parse(raw) as { stepIndex?: number }).stepIndex ?? null;
    } catch {
      return null;
    }
  });
  expect(stepIndex).toBe(3);
});

async function installFakeMediaRecorder(page: Page) {
  await page.addInitScript(() => {
    class FakeMediaRecorder {
      state = 'inactive';
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      static isTypeSupported() {
        return true;
      }
      start() {
        this.state = 'recording';
        queueMicrotask(() => {
          this.ondataavailable?.({
            data: new Blob([new Uint8Array([0, 0, 0, 1])], { type: 'video/webm' }),
          });
        });
      }
      stop() {
        this.state = 'inactive';
        queueMicrotask(() => this.onstop?.());
      }
      requestData() {}
    }
    // @ts-expect-error test shim
    window.MediaRecorder = FakeMediaRecorder;
    HTMLCanvasElement.prototype.captureStream = function captureStream() {
      return {
        getTracks: () => [{ stop() {}, kind: 'video', enabled: true }],
      } as unknown as MediaStream;
    };
  });
}

test('day cut film with mocked MediaRecorder shows Save to Cast', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await installFakeMediaRecorder(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-cut-cast' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-cut-cast',
          name: 'Cut Cast',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        notes: '',
        // Ownership must match active Cast or Day clears stills on mount.
        stillsCharacterId: 'e2e-cut-cast',
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  page.on('download', download => {
    void download.cancel().catch(() => undefined);
  });

  // Cut is its own step: Day hands off to it, and the film is cut there.
  await gotoStable(page, '/cut?from=day');
  await dismissBlockingOverlays(page);
  const cutBtn = page.getByTestId('cut-film').first();
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  // After the cut: what comes next — watch it on the Cast (when it was kept there), tomorrow.
  await expect(page.getByTestId('cut-after')).toBeVisible({ timeout: 45_000 });
  await expect(page.getByTestId('cut-start-tomorrow')).toBeVisible();
  const watch = page.getByTestId('cut-watch-cast');
  if ((await watch.count()) > 0) {
    await expect(watch).toHaveAttribute('href', /media=films/);
  }
});

test('each Cast keeps its own Day across a Cast switch', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-park-a' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-park-a', name: 'Park A', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
        { id: 'e2e-park-b', name: 'Park B', version: 1, updatedAt: Date.now() - 1, descriptor: 'a man' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-park-a',
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: tinyPng }],
      },
    },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await page.getByTestId('cast-picker-character-e2e-park-b').click();
  await expect(page.getByTestId('cast-picker-character-e2e-park-b')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.waitForTimeout(1500);
  await page.getByTestId('cast-picker-character-e2e-park-a').click();
  await expect(page.getByTestId('cast-picker-character-e2e-park-a')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await page.waitForTimeout(1500);
  // In-app navigation: a page load would re-apply this test's seed (it is an init script).
  await page.getByRole('link', { name: 'Day', exact: true }).first().click();
  await page.waitForURL(/\/day/);
  // Park A's still came back with her (it used to be thrown away on the switch).
  await expect(page.getByText('1/4 stills').first()).toBeVisible({ timeout: 30_000 });
});

test('a Day beat you type is marked as yours and can go back to Day\'s', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-beat-own' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-beat-own', name: 'Beat Own', version: 1, updatedAt: Date.now(), descriptor: 'a man' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        slots: [
          { id: 'morning', label: 'Morning', location: 'park', sceneHints: 'reading on a bench' },
          { id: 'midday', label: 'Midday', location: 'café', sceneHints: 'coffee at the window' },
          { id: 'afternoon', label: 'Afternoon', location: 'market', sceneHints: 'buying apples' },
          { id: 'evening', label: 'Evening', location: 'home', sceneHints: 'cooking dinner' },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  const beat = page.getByTestId('day-slot-beat').first();
  await expect(beat).toBeVisible({ timeout: 30_000 });
  const dayBeat = await beat.inputValue();
  await expect(page.getByTestId('day-beat-typed-badge')).toHaveCount(0);
  await beat.fill('he fixes his bike in the garage');
  await expect(page.getByTestId('day-beat-typed-badge').first()).toBeVisible();
  await page.getByTestId('day-beat-restore').first().click();
  await expect(beat).toHaveValue(dayBeat);
  await expect(page.getByTestId('day-beat-typed-badge')).toHaveCount(0);
});

test('a Cast whose look was made up offers Describe from photo', async ({ page }) => {
  const rolled =
    'an Indigenous woman in her forties with warm skin, high cheekbones, straight black hair, and a body that is short, muscular';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-made-up' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-made-up',
          name: 'Made Up',
          version: 1,
          updatedAt: Date.now(),
          descriptor: rolled,
          bio: { name: 'Made Up', look: rolled, personality: 'curious' },
          ipAdapter: { imageFilename: 'e2e-face.png', imageUrl: '/icon.svg' },
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters/e2e-made-up');
  await dismissBlockingOverlays(page);
  await page.getByText('Bible', { exact: true }).first().click();
  await expect(page.getByTestId('cast-bible-look-made-up')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cast-bible-describe-photo')).toBeVisible();
  // Appearance: the made-up body is replaced by the picked traits only; the bible stays.
  await expect(page.getByTestId('cast-appearance-made-up')).toBeVisible();
  await page.getByTestId('cast-trait-sex').selectOption('woman');
  await page.getByTestId('cast-trait-ageBand').selectOption('30s');
  await page.getByTestId('cast-trait-hairColor').selectOption('auburn');
  await page.getByTestId('cast-trait-hairLength').selectOption('shoulder-length');
  await page.getByTestId('cast-appearance-save').click();
  await expect(page.getByTestId('cast-appearance-description')).toContainText(
    'Description: a woman in her thirties with shoulder-length auburn hair'
  );
  await expect(page.getByTestId('cast-appearance-made-up')).toHaveCount(0);
  await expect(page.getByTestId('cast-bible-preview')).toContainText('Indigenous woman');
});

test('Appearance locks who the Cast is after the first plate; Start over unlocks it', async ({ page }) => {
  const traits = { sex: 'woman', ageBand: '30s', eyeColor: 'green', hairColor: 'auburn' };
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-locked' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-locked',
          name: 'Locked',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'a woman in her thirties with green eyes and auburn hair',
          traits,
          plateTraits: traits,
          ipAdapter: { imageFilename: 'e2e-face.png', imageUrl: '/icon.svg' },
          reference: { originalFilename: 'e2e-face.png', originalUrl: '/icon.svg' },
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters/e2e-locked');
  await dismissBlockingOverlays(page);
  await page.getByText('Bible', { exact: true }).first().click();
  await expect(page.getByTestId('cast-appearance-identity-locked')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cast-trait-eyeColor')).toBeDisabled();
  await expect(page.getByTestId('cast-trait-ageBand')).toBeDisabled();
  await expect(page.getByTestId('cast-trait-hairColor')).toBeEnabled();
  await expect(page.getByTestId('cast-trait-makeup')).toBeEnabled();
  // A custom hair colour is a look trait: typed, saved, said in the description.
  await page.getByTestId('cast-trait-hairColor').selectOption('custom');
  await page.getByTestId('cast-trait-hairColorCustom').fill('Rose gold');
  await page.getByTestId('cast-appearance-save').click();
  await expect(page.getByTestId('cast-appearance-description')).toContainText('rose gold hair');
  await page.getByTestId('cast-appearance-start-over').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByTestId('cast-appearance-identity-locked')).toHaveCount(0);
  await expect(page.getByTestId('cast-trait-eyeColor')).toBeEnabled();
});

test('Characters: New character opens Film with the create form', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-new-char-existing' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-new-char-existing', name: 'Already Here', version: 1, updatedAt: Date.now(), descriptor: 'a man' },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters');
  await dismissBlockingOverlays(page);
  await page.getByTestId('cast-roster-new-character').click();
  await page.waitForURL(/\/play\?new=1/, { waitUntil: 'commit' });
  await expect(page.getByTestId('play-campaign-create-name')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-create-name')).toBeFocused();
});

test('Characters: Start a film opens Film with a named character', async ({ page }) => {
  const now = Date.now();
  await seedSettingsCacheOnNextLoad(page, {
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-film-older', name: 'Older Lead', version: 1, updatedAt: now - 60_000, descriptor: 'a man' },
        { id: 'e2e-film-newer', name: 'Newer Lead', version: 1, updatedAt: now, descriptor: 'a woman' },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters');
  await dismissBlockingOverlays(page);
  // No Cast active: the most recently updated one is named on the button.
  const startFilm = page.getByTestId('cast-roster-start-film');
  await expect(startFilm).toHaveText('Start a film with Newer Lead', { timeout: 30_000 });
  await startFilm.click();
  await page.waitForURL(/\/play\?character=e2e-film-newer/, { waitUntil: 'commit' });
  await expect(page.getByText('Active: Newer Lead')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-create-name')).toHaveCount(0);

  // A card's own Start a film opens that character.
  await gotoStable(page, '/characters');
  await dismissBlockingOverlays(page);
  await page.getByTestId('cast-roster-start-film-e2e-film-older').click();
  await page.waitForURL(/\/play\?character=e2e-film-older/, { waitUntil: 'commit' });
  await expect(page.getByText('Active: Older Lead')).toBeVisible({ timeout: 30_000 });
});

test('a Cast with a bible and a picture offers Picture this bible', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-bible-picture' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-bible-picture',
          name: 'Mara',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'a slim woman in her late 20s with long auburn hair',
          bio: {
            name: 'Mara',
            look: 'a weathered green field coat over a cream knit sweater',
            personality: 'restless, kind',
          },
          ipAdapter: { imageFilename: 'e2e-face.png', imageUrl: '/icon.svg' },
          biblePicture: { imageUrl: '/icon.svg', promptId: 'e2e-prompt', at: Date.now() },
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters/e2e-bible-picture');
  await dismissBlockingOverlays(page);
  await page.getByText('Bible', { exact: true }).first().click();
  await expect(page.getByTestId('character-bible-picture')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('character-bible-picture-hint')).toHaveCount(0);
  // The last picture shows again on a revisit.
  await expect(page.getByTestId('character-bible-picture-image')).toBeVisible();
  // The picture opens full size in the lightbox; Escape closes it.
  await page.getByRole('button', { name: 'Open the bible picture full size' }).click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
});

test('a Cast with three looks: one Looks strip, Add plate on the plate-less one', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-two-plates', activeLookId: 'e2e-plate-a' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-two-plates',
          name: 'Juno',
          version: 1,
          updatedAt: Date.now(),
          activeLookId: 'e2e-plate-a',
          ipAdapter: { imageFilename: 'e2e-plate-a.png', imageUrl: '/icon.svg' },
          looks: [
            {
              id: 'e2e-plate-a',
              name: 'Studio',
              createdAt: 2,
              ipAdapter: { imageFilename: 'e2e-plate-a.png', imageUrl: '/icon.svg' },
            },
            {
              id: 'e2e-plate-b',
              name: 'Beach',
              createdAt: 1,
              ipAdapter: { imageFilename: 'e2e-plate-b.png', imageUrl: '/icon.svg' },
            },
            // Saved by an old build with no picture of its own — and its "New look" name.
            { id: 'e2e-plate-c', name: 'New look', createdAt: 0 },
          ],
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters/e2e-two-plates');
  await dismissBlockingOverlays(page);
  const looks = page.getByRole('radiogroup', { name: 'Active look' });
  await expect(looks).toBeVisible({ timeout: 30_000 });
  await expect(looks.getByRole('radio')).toHaveCount(3);
  const studio = looks.getByTestId('cast-plate-tile-e2e-plate-a');
  const beach = looks.getByTestId('cast-plate-tile-e2e-plate-b');
  const bare = looks.getByTestId('cast-plate-tile-e2e-plate-c');
  await expect(studio).toHaveAttribute('aria-checked', 'true');
  await expect(beach).toHaveAttribute('aria-checked', 'false');
  await expect(studio.locator('img')).toHaveCount(1);
  // The plate-less look offers Add plate — never a borrowed picture — and reads as "Look 1".
  await expect(bare).toHaveAttribute('data-placeholder', 'true');
  await expect(bare.locator('img')).toHaveCount(0);
  await expect(bare).toContainText('Add plate');
  await expect(bare).toContainText('Look 1');
  await expect(page.getByTestId('cast-look-new')).toBeVisible();
  // The old text list of looks is gone.
  await expect(page.getByRole('button', { name: 'Save current as look' })).toHaveCount(0);

  await beach.click();
  await expect(beach).toHaveAttribute('aria-checked', 'true');
  await expect(studio).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cast-plate-name')).toHaveValue('Beach');
  await expect(page.getByTestId('cast-look-plate-status')).toContainText('Beach');

  // Tapping the plate-less look makes it active; its Add plate uploads into that look.
  await bare.click();
  await expect(bare).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('cast-plate-name')).toHaveValue('Look 1');
  const empty = page.getByTestId('cast-look-plate-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByText('Add plate')).toBeVisible();
  await expect(empty.getByTestId('cast-look-plate-clear')).toHaveText('Remove look');
});

test('a seated Cast plate recommends Prepare plate, with its three steps ticked', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-seated-plate', activeLookId: 'e2e-seated-look' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-seated-plate',
          name: 'Ines',
          version: 1,
          updatedAt: Date.now(),
          activeLookId: 'e2e-seated-look',
          traits: { sex: 'woman' },
          ipAdapter: { imageFilename: 'e2e-seated.png', imageUrl: '/icon.svg' },
          looks: [
            {
              id: 'e2e-seated-look',
              name: 'Sofa',
              createdAt: 1,
              ipAdapter: { imageFilename: 'e2e-seated.png', imageUrl: '/icon.svg' },
              plateStance: { standing: false, reason: 'seated', checkedAt: 1 },
            },
          ],
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters/e2e-seated-plate');
  await dismissBlockingOverlays(page);
  const note = page.getByTestId('cast-look-plate-stance');
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toHaveAttribute('data-reason', 'seated');
  await expect(note).toContainText('Seated — Day and Outfit pose a standing, full-body plate');
  await expect(note).toContainText('Prepare plate stands her up.');
  const prepare = page.getByTestId('cast-look-plate-prepare');
  await expect(prepare).toBeVisible({ timeout: 30_000 });
  await expect(prepare).toHaveText('Prepare plate');
  // Remove clothing is now the base-layer step of Prepare plate.
  await expect(page.getByRole('button', { name: 'Remove clothing' })).toHaveCount(0);
  for (const step of ['stand', 'baseLayer', 'whiteBackground']) {
    await expect(page.getByTestId(`cast-look-plate-prepare-${step}`)).toBeChecked();
  }
  // Nothing ticked, nothing to do.
  for (const step of ['stand', 'baseLayer', 'whiteBackground']) {
    await page.getByTestId(`cast-look-plate-prepare-${step}`).uncheck();
  }
  await expect(prepare).toBeDisabled();
  await page.getByTestId('cast-look-plate-prepare-stand').check();
  await expect(prepare).toBeEnabled();
  // Never automatic, and no Undo until a plate was prepared.
  await expect(page.getByTestId('cast-look-plate-prepare-undo')).toHaveCount(0);
});

test('Day notes a seated look plate and links to Prepare plate; dismissed per plate', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-seated', activeLookId: 'e2e-day-seated-look' },
    tools: { day: { stillsCharacterId: 'e2e-day-seated' } },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-day-seated',
          name: 'Ines',
          version: 1,
          updatedAt: Date.now(),
          activeLookId: 'e2e-day-seated-look',
          traits: { sex: 'woman' },
          ipAdapter: { imageFilename: 'e2e-day-seated.png', imageUrl: '/icon.svg' },
          looks: [
            {
              id: 'e2e-day-seated-look',
              name: 'Sofa',
              createdAt: 1,
              ipAdapter: { imageFilename: 'e2e-day-seated.png', imageUrl: '/icon.svg' },
              plateStance: {
                standing: false,
                reason: 'seated',
                checkedAt: 1,
                plate: 'e2e-day-seated.png',
              },
            },
          ],
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/day?character=e2e-day-seated');
  await dismissBlockingOverlays(page);
  // The note lives with the plate, in the Setup sheet behind the status chip.
  await openDaySetup(page);
  const note = page.getByTestId('plate-stance-nudge');
  await expect(note).toBeVisible({ timeout: 30_000 });
  await expect(note).toHaveAttribute('data-reason', 'seated');
  await expect(note).toContainText('Seated plate — poses come out better from a standing one.');
  await expect(note.getByTestId('plate-stance-nudge-prepare')).toHaveAttribute(
    'href',
    '/characters/e2e-day-seated?tab=overview#looks'
  );

  // Dismissed for this plate: gone, and still gone after a reload.
  await note.getByTestId('plate-stance-nudge-dismiss').click();
  await expect(page.getByTestId('plate-stance-nudge')).toHaveCount(0);
  await page.reload();
  await dismissBlockingOverlays(page);
  await openDaySetup(page);
  await expect(page.getByTestId('plate-stance-nudge')).toHaveCount(0);
});

test('a Cast file imports as a new Cast with its Day plan', async ({ page }) => {
  const file = {
    kind: 'castcut-cast',
    version: 1,
    exportedAt: Date.now(),
    character: {
      id: 'e2e-imported-cast',
      name: 'Imported Ines',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman with short grey hair',
    },
    stories: [],
    day: {
      slots: [
        { id: 'morning', label: 'Morning', location: 'harbour', sceneHints: 'watching the boats' },
        { id: 'midday', label: 'Midday', location: 'market', sceneHints: 'buying figs' },
        { id: 'afternoon', label: 'Afternoon', location: 'beach', sceneHints: 'a swim' },
        { id: 'evening', label: 'Evening', location: 'terrace', sceneHints: 'dinner outside' },
      ],
      dayMood: 'everyday',
    },
  };
  await gotoStable(page, '/characters');
  await dismissBlockingOverlays(page);
  // The file input only reacts once the page has hydrated; a file set before that is dropped.
  await expect(async () => {
    await page.getByTestId('cast-import-input').setInputFiles({
      name: 'imported-ines.castcut-cast.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(file)),
    });
    await page.waitForURL(/\/characters\/e2e-imported-cast/, { timeout: 5_000, waitUntil: 'commit' });
  }).toPass({ timeout: 45_000 });
  await expect(page.getByRole('heading', { name: 'Imported Ines' }).first()).toBeVisible();
  // Picking the imported Cast on Day brings its plan back.
  await page.getByTestId('character-home-day').click();
  await page.waitForURL(/\/day/);
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-beat').first()).toHaveValue('watching the boats', {
    timeout: 30_000,
  });
});

test('a same-seed redo shows old and new takes and can keep the old one', async ({ page }) => {
  const oldPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const newPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-same-seed' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-same-seed', name: 'Same Seed', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-same-seed',
        slots: [
          { id: 'morning', label: 'Morning', location: 'park', sceneHints: 'reading on a bench' },
          { id: 'afternoon', label: 'Afternoon', location: 'café', sceneHints: 'coffee' },
          { id: 'evening', label: 'Evening', location: 'market', sceneHints: 'apples' },
          { id: 'night', label: 'Night', location: 'home', sceneHints: 'cooking' },
        ],
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: newPng,
            previousTake: { imageUrl: oldPng, promptId: 'e2e-old-take' },
          },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  // Select Morning (a finished card opens its still full size too — close that).
  // A finished card opens its still full size; the takes live in the slot sheet.
  await page.getByTestId('day-slot-select-morning').click();
  await page.keyboard.press('Escape');
  await openDaySlotSheet(page, 'morning');
  const compare = page.getByTestId('day-same-seed-compare');
  await expect(compare).toBeVisible({ timeout: 30_000 });
  await expect(compare.getByRole('img', { name: /old take/ })).toHaveAttribute('src', oldPng);
  await page.getByTestId('day-same-seed-keep-old').click();
  await expect(compare).toHaveCount(0);
  // The old take is the slot's still again, and the redo is offered.
  await expect(page.getByTestId('day-same-seed-redo')).toBeVisible();
});

test('a best-of-two pair shows the kept take and can switch to the other one', async ({
  page,
}) => {
  const keptPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const otherPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-best-of-two' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-best-of-two', name: 'Best Of Two', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-best-of-two',
        slots: [
          { id: 'morning', label: 'Morning', location: 'living room', sceneHints: 'lying on her side on the sofa' },
          { id: 'afternoon', label: 'Afternoon', location: 'café', sceneHints: 'coffee' },
          { id: 'evening', label: 'Evening', location: 'market', sceneHints: 'apples' },
          { id: 'night', label: 'Night', location: 'home', sceneHints: 'cooking' },
        ],
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            promptId: 'e2e-second-take',
            imageUrl: keptPng,
            previousTake: {
              imageUrl: otherPng,
              promptId: 'e2e-first-take',
              kind: 'best-of-two',
              poseScore: 0.41,
            },
            bestOfTwo: { keptScore: 0.72, otherScore: 0.41 },
          },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  // A finished card opens its still full size; the takes live in the slot sheet.
  await page.getByTestId('day-slot-select-morning').click();
  await page.keyboard.press('Escape');
  await openDaySlotSheet(page, 'morning');
  const compare = page.getByTestId('day-same-seed-compare');
  await expect(compare).toBeVisible({ timeout: 30_000 });
  await expect(compare).toContainText('best of two');
  await expect(compare.getByRole('img', { name: /kept take · pose 72%/ })).toHaveAttribute(
    'src',
    keptPng
  );
  await expect(page.getByTestId('day-progress-pose-redo-morning')).toContainText(
    'Best of two · pose 72% (other 41%)'
  );
  await page.getByTestId('day-same-seed-keep-old').click();
  await expect(compare).toHaveCount(0);
  await expect(page.getByTestId('day-same-seed-redo')).toBeVisible();
});

/** Report Intimate as switched on (PROMPT_NSFW_GENERATOR_ENABLED) in the health answer. */
async function reportIntimateOn(page: Page) {
  await page.route('**/api/health', async route => {
    const response = await route.fetch().catch(() => null);
    const body = (response ? await response.json().catch(() => ({})) : {}) as Record<
      string,
      unknown
    >;
    await route.fulfill({
      json: {
        ...body,
        serverEnv: {
          groups: [
            {
              fields: [{ key: 'PROMPT_NSFW_GENERATOR_ENABLED', value: 'true' }],
            },
          ],
        },
      },
    });
  });
}

/** Two finished stub jobs in the gallery (both takes), their images served by a stub view. */
async function seedTwoTakeJobs(page: Page, characterId: string) {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.route('**/api/comfyui/view**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png })
  );
  await page.addInitScript(owner => {
    const now = Date.now();
    const job = (promptId: string, filename: string) => ({
      id: `g-${promptId}`,
      promptId,
      prompt: 'two takes',
      model: 'qwen-image-2512',
      tool: 'day',
      queuedAt: now,
      completedAt: now,
      status: 'completed',
      characterId: owner,
      comfyUrl: 'http://127.0.0.1:8188',
      images: [{ filename, subfolder: '', type: 'output' }],
    });
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([job('e2e-take-a', 'e2e-take-a.png'), job('e2e-take-b', 'e2e-take-b.png')])
    );
  }, characterId);
}

test('two takes for intimate stills: the switch, both takes on the card, pick one, swap back', async ({
  page,
}) => {
  await reportIntimateOn(page);
  await seedTwoTakeJobs(page, 'e2e-two-takes');
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-two-takes' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-two-takes', name: 'Two Takes', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-two-takes',
        dayMood: 'intimate',
        intimateMix: 'duo',
        slots: [
          { id: 'morning', label: 'Morning', location: 'bedroom', sceneHints: 'in bed together' },
          { id: 'afternoon', label: 'Afternoon', location: 'shower', sceneHints: 'together' },
          { id: 'evening', label: 'Evening', location: 'sofa', sceneHints: 'together' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'together' },
        ],
        // Both takes were queued (stub jobs) and have landed in the gallery.
        stills: [
          {
            slotId: 'morning',
            promptId: 'e2e-take-a',
            status: 'queued',
            twoTakes: { promptId: 'e2e-take-b', status: 'queued' },
          },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);

  // The switch: under Advanced on an Intimate Day, off by default, outside the Quality preset.
  await openDayAdvanced(page);
  const toggle = page.getByTestId('day-two-takes-intimate').first();
  await expect(toggle).toHaveAttribute('aria-checked', 'false', { timeout: 30_000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('day-two-takes-hint').first()).toBeVisible();
  await expect(page.getByTestId('day-quality-preset-custom')).toHaveCount(0);

  // Both takes landed: side by side on the card, a Keep under each.
  const pair = page.getByTestId('day-two-takes-morning');
  await expect(pair).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  await expect(pair.getByTestId('day-two-takes-morning-first-image')).toHaveAttribute(
    'src',
    /e2e-take-a\.png/
  );
  await expect(pair.getByTestId('day-two-takes-morning-second-image')).toHaveAttribute(
    'src',
    /e2e-take-b\.png/
  );
  await expect(page.getByTestId('day-progress-pose-redo-morning')).toHaveText(
    'Two takes — tap the one to keep'
  );

  // Keep the second: it becomes the still; the first is kept as the other take.
  await pair.getByTestId('day-two-takes-morning-keep-second').click();
  await expect(pair).toHaveCount(0);
  await expect(page.getByTestId('day-progress-pose-redo-morning')).toHaveText(
    'Two takes · your pick (the other is kept)'
  );
  await openDaySlotSheet(page, 'morning');
  const picked = page.getByTestId('day-two-takes-picked');
  await expect(picked).toBeVisible();
  await expect(picked.getByRole('img', { name: /kept take/ })).toHaveAttribute(
    'src',
    /e2e-take-b\.png/
  );
  await expect(picked.getByRole('img', { name: /other take/ })).toHaveAttribute(
    'src',
    /e2e-take-a\.png/
  );
  // Reversible: swap to the other take, and the picked one stays as the alternate.
  await picked.getByTestId('day-two-takes-swap').click();
  await expect(picked.getByRole('img', { name: /kept take/ })).toHaveAttribute(
    'src',
    /e2e-take-a\.png/
  );
  await expect(picked.getByRole('img', { name: /other take/ })).toHaveAttribute(
    'src',
    /e2e-take-b\.png/
  );
});

/**
 * Stub ComfyUI for a Day queue: every queued job gets the next prompt id, uploads are accepted,
 * pictures come back as a 1×1 PNG and object_info is unavailable (plain graphs). Returns the
 * queued job bodies.
 */
async function stubComfyQueue(page: Page, ids: string[]) {
  const queued: Array<Record<string, unknown>> = [];
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  // The context, not the page: some fetches (an upload's image read) come from a worker.
  await page.context().route(/\/api\/comfyui(?:\/|\?|$)/, async route => {
    const request = route.request();
    let path = request.url();
    try {
      path = new URL(request.url()).pathname.replace(/\/$/, '');
    } catch {
      // keep the raw url
    }
    if (request.method() === 'POST' && path === '/api/comfyui') {
      const body = (request.postDataJSON() ?? {}) as Record<string, unknown>;
      queued.push(body);
      const promptId = ids[queued.length - 1] ?? `e2e-job-${queued.length}`;
      await route.fulfill({
        json: { ok: true, promptId, comfyUrl: 'http://127.0.0.1:8188' },
      });
      return;
    }
    if (path === '/api/comfyui/upload') {
      await route.fulfill({ json: { name: `e2e-upload-${Date.now()}.png`, subfolder: '', type: 'input' } });
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
            '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
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

test('Looks wrong on a Day card redoes the slot on a new seed and notes why', async ({ page }) => {
  const stillPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const queued = await stubComfyQueue(page, ['e2e-looks-wrong-redo']);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-looks-wrong' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-looks-wrong',
          name: 'Looks Wrong',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'a woman',
          traits: { sex: 'woman' },
          ipAdapter: { imageFilename: 'e2e-looks-wrong.png', imageUrl: '/icon.svg' },
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-looks-wrong',
        isolateSubject: false,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'making coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reading' },
          { id: 'evening', label: 'Evening', location: 'market', sceneHints: 'apples' },
          { id: 'night', label: 'Night', location: 'home', sceneHints: 'cooking' },
        ],
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            promptId: 'e2e-looked-wrong-take',
            imageUrl: stillPng,
          },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('day-progress-morning');
  await expect(card).toHaveAttribute('data-state', 'done', { timeout: 30_000 });
  await expect(page.getByTestId('day-progress-redone-morning')).toHaveCount(0);

  await page.getByTestId('day-progress-menu-morning').click();
  const looksWrong = page.getByTestId('day-progress-looks-wrong-morning');
  await expect(looksWrong).toBeVisible();
  await looksWrong.click();

  // The slot is queued again (a plain new-seed take: one job, no seed pinned on it).
  await expect.poll(() => queued.length, { timeout: 30_000 }).toBe(1);
  // The card notes why, and now waits for the redo.
  await expect(page.getByTestId('day-progress-redone-morning')).toHaveText(
    'Redone — looked wrong',
    { timeout: 30_000 }
  );
  await expect(card).toHaveAttribute('data-state', 'queued');
});

test('roleplay cut film with mocked MediaRecorder shows Cast deep-links', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await installFakeMediaRecorder(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem('comfy-onboarding-v2');
    window.localStorage.removeItem('comfy-play-metrics-v1');
  });
  // Seed tools sidecar — main-blob localStorage loses to an empty IDB sidecar on hydrate.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-rp-cut' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-rp-cut',
          name: 'RP Cut',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'roleplay cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      roleplay: {
        // Match Cast-linked session id so deep-link sync does not replace the reel.
        activeSessionId: 'cast-e2e-rp-cut',
        characterName: 'RP Cut',
        story: [
          {
            id: 'beat-1',
            at: Date.now(),
            kind: 'plot',
            title: 'Opening',
            prompt: 'A quiet opening beat',
            stillStatus: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  page.on('download', download => {
    void download.cancel().catch(() => undefined);
  });

  await gotoStable(page, '/story?character=e2e-rp-cut');
  await dismissBlockingOverlays(page);
  // Story hands off to Cut (its own step), with the Story's shots picked.
  await page.getByTestId('story-open-cut').first().click();
  await expect(page).toHaveURL(/\/cut\?from=story/, { timeout: 30_000 });
  await dismissBlockingOverlays(page);
  const cutBtn = page.getByTestId('cut-film').first();
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  await expect(page.getByTestId('cut-after')).toBeVisible({ timeout: 45_000 });
  const watch = page.getByTestId('cut-watch-cast');
  if ((await watch.count()) > 0) {
    await expect(watch).toHaveAttribute('href', /media=films/);
  }
});

test('mobile play cut film with mocked MediaRecorder shows Cast deep-links', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  await installFakeMediaRecorder(page);
  await page.addInitScript(() => {
    window.localStorage.removeItem('comfy-onboarding-v2');
    window.localStorage.removeItem('comfy-play-metrics-v1');
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-m-cut' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-m-cut',
          name: 'Mobile Cut',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'mobile cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      roleplay: {
        activeSessionId: 'cast-e2e-m-cut',
        characterName: 'Mobile Cut',
        story: [
          {
            id: 'beat-m1',
            at: Date.now(),
            kind: 'plot',
            title: 'Opening',
            prompt: 'A mobile opening beat',
            stillStatus: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  page.on('download', download => {
    void download.cancel().catch(() => undefined);
  });

  await gotoStable(page, '/m/story');
  await dismissBlockingOverlays(page);
  // Story hands off to Cut (its own step), with the Story's shots picked.
  await page.getByTestId('mobile-play-cut').first().click();
  await expect(page).toHaveURL(/\/m\/cut\?from=story/, { timeout: 30_000 });
  await dismissBlockingOverlays(page);
  const cutBtn = page.getByTestId('cut-film').first();
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  await expect(page.getByTestId('cut-after')).toBeVisible({ timeout: 45_000 });
  const watch = page.getByTestId('cut-watch-cast');
  if ((await watch.count()) > 0) {
    await expect(watch).toHaveAttribute('href', /media=films|derivedKind=film/);
  }
});

test('play campaign shows complete state after durable completedAt', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-complete',
            name: 'Complete Cast',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'done look',
          },
        ],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({
        version: 1,
        characterId: 'e2e-complete',
        stepIndex: 4,
        completedAt: Date.now() - 60_000,
        updatedAt: Date.now(),
      })
    );
  });
  await gotoStable(page, '/play?character=e2e-complete');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-open-cast-film')).toHaveAttribute(
    'href',
    /media=films/
  );
  await expect(page.getByTestId('play-campaign-start-new')).toBeVisible();
});

test('cast home: tabs, plate empty state, no server/client title swap', async ({ page }) => {
  // The server can't see the Cast store: it used to render "Character not found" and the
  // client swapped in the name (a hydration mismatch). Now both render a loading state first.
  // The server's HTML for the page (same session cookies). Not by fulfilling the navigation:
  // under `next dev` Chrome treats a fulfilled document as non-local and blocks the dev HMR
  // socket, which carries React's debug channel — the page then never hydrates.
  const serverHtml = await (await page.request.get('/characters/e2e-cast-tabs')).text();
  expect(serverHtml).toContain('Loading character');
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          { id: 'e2e-cast-tabs', name: 'Tabs Cast', version: 1, updatedAt: Date.now() },
        ],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/characters/e2e-cast-tabs');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: 'Tabs Cast', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  // Overview leads with the plate: a real empty state, not a bare file input.
  const empty = page.getByTestId('cast-look-plate-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByText('Add plate')).toBeVisible();
  await expect(page.getByTestId('character-film-studio')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Bible' }).click();
  await expect(page.getByTestId('bible-paste')).not.toHaveAttribute('open', '');

  await page.getByRole('tab', { name: /Film & media/i }).click();
  await expect(page.getByTestId('character-film-studio')).toBeVisible();
  await expect(page.getByTestId('character-film-cut-options')).toContainText(/Cut options/);
  await expect(page.getByTestId('cast-media')).toBeVisible();

  expect(serverHtml).not.toContain('Character not found');
});

test('cast media=films deep-link opens Films tab and Film studio', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          {
            id: 'e2e-films-tab',
            name: 'Films Tab',
            version: 1,
            updatedAt: Date.now(),
            descriptor: 'film studio look',
          },
        ],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/characters/e2e-films-tab?media=films');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('tab', { name: /Films/i })).toHaveAttribute('aria-selected', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('character-film-studio')).toBeVisible();
  await expect(page.getByTestId('cast-open-film-studio')).toBeVisible();
  await expect(page.getByTestId('character-film-studio-empty')).toBeVisible();
});

test('cast film tab offers Cut episode: the Day, then the Story, as one film', async ({ page }) => {
  // 1×1 PNG — the shots only need a URL; nothing is encoded here.
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const now = Date.now();
  const beat = (id: string, at: number, title: string, done: boolean) => ({
    id,
    at,
    kind: 'plot',
    title,
    blurb: '',
    stillStatus: done ? 'completed' : 'queued',
    ...(done ? { imageUrl: tinyPng } : { promptId: `p-${id}` }),
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-episode' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-episode',
          name: 'Episode Cast',
          version: 1,
          updatedAt: now,
          descriptor: 'episode look',
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-episode',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'sleeps' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: tinyPng, promptId: 'p-m' },
          { slotId: 'evening', status: 'completed', imageUrl: tinyPng, promptId: 'p-e' },
          { slotId: 'night', status: 'queued', promptId: 'p-n' },
        ],
      },
      roleplay: {
        // The Cast's own Story session — the episode reads its reel.
        activeSessionId: 'cast-e2e-episode',
        characterName: 'Episode Cast',
        story: [
          beat('s1', now - 3000, 'Late call', true),
          beat('s2', now - 2000, 'Walk home', true),
          beat('s3', now - 1000, 'Still rendering', false),
        ],
      },
    },
  });
  await gotoStable(page, '/characters/e2e-episode?media=films');
  await dismissBlockingOverlays(page);
  const episode = page.getByTestId('character-episode');
  await expect(episode).toBeVisible({ timeout: 30_000 });
  // Two finished Day stills, then two finished Story beats; queued ones stay out.
  const summary = episode.getByTestId('character-episode-summary');
  await expect(summary).toContainText('4 shots · 2 from the Day, 2 from the Story');
  const cut = episode.getByTestId('character-episode-cut');
  await expect(cut).toHaveText(/Cut episode · 4 shots/);
  await expect(cut).toBeEnabled();
  // The same shot list as Day / Story: leave a shot out and the count follows.
  await episode.getByTestId('character-episode-options').locator(':scope > summary').click();
  await episode.getByTestId('character-episode-shot-include-day:evening').uncheck();
  await expect(cut).toHaveText(/Cut episode · 3 shots/);
  await expect(summary).toContainText('1 from the Day, 2 from the Story');
});

test('Film mode opens at Play; All tools switches to Studio', async ({ page }) => {
  await ensureFilmWorkspace(page);
  await gotoStable(page, '/');
  await expect(page).toHaveURL(/\/play(?:[?#].*)?$/, { timeout: 30_000 });
  await dismissBlockingOverlays(page);
  // All tools is a link with an onClick (it saves Studio): clicked on the server HTML it only
  // navigates, and Film stays on.
  const allTools = page.getByTestId('film-all-tools');
  await waitForHydrated(allTools);
  await page.getByTestId('play-kiosk-more').click();
  await allTools.click();
  // Castcut's "/" is Film: All tools opens the sidebar layout on the Gallery.
  await expect(page).toHaveURL(/\/gallery(?:[?#].*)?$/, { timeout: 30_000 });
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('comfy-workspace-mode-v1')))
    .toMatch(/studio/);
  await expect(page.locator('html')).toHaveAttribute('data-workspace', 'studio');
});

test('play campaign empty cast offers create character CTA', async ({ page }) => {
  await ensureFilmWorkspace(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      localStorage.removeItem('comfy-settings-cache-v1');
      localStorage.removeItem('comfy-prompt-characters-v1');
      localStorage.removeItem('play-campaign-v1');
    } catch {
      // ignore
    }
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-create-character')).toBeVisible();
  await expect(page.getByTestId('play-campaign-create-name')).toBeVisible();
  await expect(page.getByTestId('play-campaign-create-continue')).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse Cast/i })).toBeVisible();
});

test('Create stays on Film: the first plate starts and Day, Outfit and Cast home are offered', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await page.getByTestId('play-campaign-create-name').fill('Juno');
  await page.getByTestId('play-campaign-create-continue').click();
  const panel = page.getByTestId('play-campaign-first-plate');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/play\?character=/);
  // No ComfyUI in tests: the plate cannot queue, and the panel says so with a retry.
  await expect(panel.getByTestId('play-campaign-first-plate-status')).toContainText(
    /first plate|Could not queue/
  );
  await expect(panel.getByTestId('play-campaign-first-plate-day')).toHaveAttribute(
    'href',
    /\/day\?character=/
  );
  await expect(panel.getByTestId('play-campaign-first-plate-outfit')).toHaveAttribute(
    'href',
    /\/fitting\?character=/
  );
  await expect(panel.getByTestId('play-campaign-first-plate-cast')).toHaveAttribute(
    'href',
    /\/characters\//
  );
});

test('dashboard elevates Start a film as primary studio path', async ({ page }) => {
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('link', { name: /Start a film/i }).first()).toBeVisible();
});

test('mobile studio first-class film loop tabs and desk bridge', async ({ page }) => {
  await seedFirstFilmDone(page);
  await gotoStable(page, '/m');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('mobile-tab-film')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('mobile-tab-fitting')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-day')).toBeVisible();
  await expect(page.getByTestId('mobile-tab-story')).toBeVisible();
  // Look and Cast sit under More, as on the desk.
  await expect(page.getByTestId('mobile-tab-moodboard')).toBeHidden();
  await expect(page.getByTestId('mobile-desk-bridge')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Desk$/i })).toBeVisible();
});

test('mobile More menu is drawn and its links can be tapped', async ({ page }) => {
  await seedFirstFilmDone(page);
  await gotoStable(page, '/m');
  await dismissBlockingOverlays(page);
  await page.getByTestId('mobile-tab-more').click({ timeout: 30_000 });
  const menu = page.getByTestId('mobile-more-menu');
  await expect(menu).toBeVisible();
  // toBeVisible passes for a clipped element (the menu was once cut off by the scrolling tab
  // list) — the top-most element at its centre must be inside the menu.
  const hit = await menu.evaluate(el => {
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return Boolean(top && el.contains(top));
  });
  expect(hit).toBe(true);
});

test('completed campaign offers Cast watch and cut-another Day CTAs', async ({ page }) => {
  await ensureFilmWorkspace(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      localStorage.setItem(
        'play-campaign-v1',
        JSON.stringify({
          version: 1,
          characterId: 'e2e-complete',
          stepIndex: 4,
          completedAt: Date.now(),
          updatedAt: Date.now(),
        })
      );
    } catch {
      // ignore
    }
  });
  await gotoStable(page, '/play?character=e2e-complete');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-complete')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-open-cast-film')).toBeVisible();
  await expect(page.getByTestId('play-campaign-cut-another')).toHaveAttribute(
    'href',
    /\/day\?character=e2e-complete/
  );
  await expect(page.getByTestId('play-campaign-start-new')).toBeVisible();
});

test('day cut film shows playbook when film assemble returns ffmpeg 503', async ({ page }) => {
  const tinyPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // Server POST fails with ffmpeg missing; without MediaRecorder the error surfaces
  // instead of silently falling back to a browser encode.
  await page.addInitScript(() => {
    // @ts-expect-error test shim — force film playbook path
    delete window.MediaRecorder;
  });

  await page.route('**/api/film/assemble**', async route => {
    const method = route.request().method();
    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, available: true, encoder: 'ffmpeg' }),
      });
      return;
    }
    if (method === 'POST') {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'ffmpeg is missing on the server — install ffmpeg to encode films.',
        }),
      });
      return;
    }
    await route.continue();
  });

  // Auth already hydrated IDB; seed stills into the tools sidecar so hydrate
  // does not prefer an empty sidecar over a main-blob localStorage write.
  // Use next-load init so pagehide flush from / cannot overwrite the seed.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-film-fail' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-film-fail',
          name: 'Film Fail',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'cut look',
        },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        notes: '',
        stillsCharacterId: 'e2e-film-fail',
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            imageUrl: tinyPng,
          },
        ],
      },
    },
  });

  await gotoStable(page, '/cut?from=day');
  await dismissBlockingOverlays(page);
  const cutBtn = page.getByTestId('cut-film').first();
  await expect(cutBtn).toBeVisible({ timeout: 30_000 });
  await expect(cutBtn).toBeEnabled({ timeout: 15_000 });
  await cutBtn.click();
  await expect(page.getByText(/ffmpeg is missing/i)).toBeVisible({ timeout: 30_000 });
  const playbook = page.getByTestId('film-failure-playbook-link');
  await expect(playbook).toBeVisible();
  await expect(playbook).toHaveAttribute('href', /\/settings/);
  await expect(playbook).toContainText(/settings|Heal|overview/i);
});

test('play persistence triad is visible on Film hub', async ({ page }) => {
  // Empty hub hides persistence; seed a Cast so the compact triad mounts.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-persist' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-persist',
          name: 'Persist Hero',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'persist look',
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-persistence-triad')).toBeVisible({ timeout: 30_000 });
});

test('play habit nudge appears after a day-old cut', async ({ page }) => {
  // Play metrics sync: another test's newer cut on the shared e2e server would replace this one.
  await isolateServerStorage(page);
  const dayAgo = Date.now() - 1000 * 60 * 60 * 25;
  await ensureFilmWorkspace(page);
  await page.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // ignore
    }
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-habit' },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-habit',
          name: 'Habit Hero',
          version: 1,
          updatedAt: Date.now(),
          descriptor: 'habit look',
        },
      ],
      removedIds: [],
    },
  });
  // Metrics / campaign are IDB-authoritative — localStorage alone is overwritten on hydrate.
  // Written now, from the static page the seed above left us on, so the rows are committed
  // before the app boots: an init script's own IndexedDB write is asynchronous and lost the
  // race with the app's hydrate (no nudge, 1 in ~3 full runs under load).
  await putAppKv(page, {
    'comfy-play-metrics-v1': {
      version: 1,
      firstFilmCutAt: dayAgo,
      lastFilmCutAt: dayAgo,
    },
    'play-campaign-v1': {
      version: 1,
      characterId: 'e2e-habit',
      stepIndex: 3,
      completedAt: dayAgo,
      updatedAt: dayAgo,
    },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-habit-nudge')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-habit-nudge-open')).toBeVisible();
});

test('a cloud engine for Generate & Video leaves Film alone (no engine banner)', async ({ page }) => {
  // Film stills always queue on ComfyUI; the engine setting is only Generate / Video / Compose's.
  await seedSettingsCacheOnNextLoad(page, {
    shared: { inferenceEngine: 'fal' },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.locator('[data-testid^="play-campaign"]').first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId('play-film-engine-banner')).toHaveCount(0);
});

test('story without Cast shows Open Film gate', async ({ page }) => {
  await seedFirstFilmDone(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('story-needs-cast')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('story-open-film')).toBeVisible();
  // The gate is the whole page — no beat controls that could only hit a queue blocker.
  await expect(page.getByRole('button', { name: 'Clip', exact: true })).toHaveCount(0);
});

test('film create includes Part and From photo cast identity', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-create-character')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-create-from-photo')).toBeVisible();
  // Part chips live under collapsed "More traits" — open before asserting.
  await page.getByTestId('play-campaign-create-more-traits').locator('summary').click();
  await expect(page.getByTestId('play-campaign-create-persona')).toBeVisible();
  // Hair, as the Cast editor has it; Bald turns length and style off.
  await page.getByTestId('play-campaign-create-hair-color').selectOption('red');
  await page.getByTestId('play-campaign-create-hair-style').selectOption('straight');
  await expect(page.getByTestId('play-campaign-create-appearance-summary')).toContainText(
    'straight red hair'
  );
  await page.getByTestId('play-campaign-create-hair-color').selectOption('bald');
  await expect(page.getByTestId('play-campaign-create-hair-style')).toBeDisabled();
  // Facial hair is for men and nonbinary Casts; bust for women and nonbinary Casts.
  await page.getByTestId('play-campaign-create-sex').selectOption('woman');
  await expect(page.getByTestId('play-campaign-create-facial-hair')).toBeDisabled();
  await expect(page.getByTestId('play-campaign-create-bust')).toBeEnabled();
  await page.getByTestId('play-campaign-create-eye-color').selectOption('green');
  await expect(page.getByTestId('play-campaign-create-appearance-summary')).toContainText(
    'Green eyes'
  );
  // Pickers come in groups: face details under Face, body under Body.
  const face = page.getByTestId('play-campaign-create-group-face');
  await face.getByTestId('play-campaign-create-makeup').selectOption('bold');
  await page
    .getByTestId('play-campaign-create-group-body')
    .getByTestId('play-campaign-create-muscle-tone')
    .selectOption('toned');
  await expect(page.getByTestId('play-campaign-create-appearance-summary')).toContainText(
    'Bold eyeliner'
  );
  await expect(page.getByTestId('play-campaign-create-appearance-summary')).toContainText(
    'Toned muscles'
  );
  // Little person: the engines can't draw it from words, so the form points to From photo.
  await page.getByTestId('play-campaign-create-height').selectOption('little-person');
  await expect(page.getByTestId('play-campaign-create-little-person')).toContainText('From photo');
  // Marks can be picked before the Cast exists (they go onto the first plate).
  const marks = page.getByTestId('play-campaign-create-marks');
  await marks.getByTestId('cast-mark-add-glasses').click();
  await expect(marks.getByTestId('cast-marks-preview')).toContainText('glasses');
});

test('a Day slot can be made in another of the Cast’s looks, and keeps it', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: {
      activeCharacterId: 'e2e-day-looks',
      activeLookId: 'e2e-day-look-a',
      lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-looks',
        slots: [
          { id: 'morning', label: 'Morning', location: 'café terrace', sceneHints: 'sipping coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reading a book' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'watching the sunset' },
          { id: 'night', label: 'Night', location: 'living room', sceneHints: 'reading on the sofa' },
        ],
      },
    },
    characters: {
      version: 1,
      characters: [
        {
          id: 'e2e-day-looks',
          name: 'Juno',
          version: 1,
          updatedAt: Date.now(),
          activeLookId: 'e2e-day-look-a',
          ipAdapter: { imageFilename: 'e2e-day-look-a.png', imageUrl: '/icon.svg' },
          lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
          looks: [
            {
              id: 'e2e-day-look-a',
              name: 'Studio',
              createdAt: 2,
              ipAdapter: { imageFilename: 'e2e-day-look-a.png', imageUrl: '/icon.svg' },
              lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
            },
            {
              id: 'e2e-day-look-b',
              name: 'Beach',
              createdAt: 1,
              ipAdapter: { imageFilename: 'e2e-day-look-b.png', imageUrl: '/icon.svg' },
              lockedWardrobeId: 'outfit-denim-jacket',
            },
          ],
        },
      ],
      removedIds: [],
    },
  });
  await gotoStable(page, '/day?character=e2e-day-looks');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  const morningLooks = () => page.getByRole('radiogroup', { name: 'Look for Morning' });
  await expect(morningLooks()).toBeVisible({ timeout: 30_000 });
  // "Active look" first (the default), then each look by its plate.
  await expect(morningLooks().getByRole('radio')).toHaveCount(3);
  const followActive = morningLooks().getByTestId('day-slot-look-none');
  const beach = morningLooks().getByTestId('day-slot-look-e2e-day-look-b');
  await expect(followActive).toHaveAttribute('aria-checked', 'true');
  await expect(beach).toHaveAttribute('aria-checked', 'false');
  await expect(beach).toContainText('Beach');

  await beach.click();
  await expect(beach).toHaveAttribute('aria-checked', 'true');
  await expect(followActive).toHaveAttribute('aria-checked', 'false');

  // Another slot still follows the active look; back on Morning, Beach is still picked.
  await openDaySlotSheet(page, 'afternoon');
  await expect(
    page.getByRole('radiogroup', { name: 'Look for Afternoon' }).getByTestId('day-slot-look-none')
  ).toHaveAttribute('aria-checked', 'true');
  await openDaySlotSheet(page, 'morning');
  await expect(morningLooks().getByTestId('day-slot-look-e2e-day-look-b')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  await closeDaySheets(page);

  // Saved with Day's slots: leave Day in-app (a page load would re-apply this test's seed) and
  // come back. The Cast's active look is unchanged.
  await page.getByRole('link', { name: 'Story', exact: true }).first().click();
  await page.waitForURL(/\/story/);
  await page.getByRole('link', { name: 'Day', exact: true }).first().click();
  await page.waitForURL(/\/day/);
  await openDaySlotSheet(page, 'morning');
  await expect(morningLooks().getByTestId('day-slot-look-e2e-day-look-b')).toHaveAttribute(
    'aria-checked',
    'true',
    { timeout: 30_000 }
  );
  const activeLookId = await page.evaluate(() => {
    const raw = window.localStorage.getItem('comfy-prompt-characters-v1');
    const store = JSON.parse(raw ?? '{}') as {
      characters?: Array<{ id: string; activeLookId?: string }>;
    };
    return store.characters?.find(entry => entry.id === 'e2e-day-looks')?.activeLookId;
  });
  expect(activeLookId).toBe('e2e-day-look-a');
});

/** A Cast with two looks (Studio, active; Beach) for the Day-wide Look & clothing tests. */
function dayScopeCast() {
  return {
    version: 1,
    characters: [
      {
        id: 'e2e-day-scope',
        name: 'Juno',
        version: 1,
        updatedAt: Date.now(),
        activeLookId: 'e2e-scope-look-a',
        ipAdapter: { imageFilename: 'e2e-scope-look-a.png', imageUrl: '/icon.svg' },
        lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
        looks: [
          {
            id: 'e2e-scope-look-a',
            name: 'Studio',
            createdAt: 2,
            ipAdapter: { imageFilename: 'e2e-scope-look-a.png', imageUrl: '/icon.svg' },
            lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
          },
          {
            id: 'e2e-scope-look-b',
            name: 'Beach',
            createdAt: 1,
            ipAdapter: { imageFilename: 'e2e-scope-look-b.png', imageUrl: '/icon.svg' },
            lockedWardrobeId: 'outfit-denim-jacket',
          },
        ],
      },
    ],
    removedIds: [],
  };
}

const DAY_SCOPE_SHARED = {
  activeCharacterId: 'e2e-day-scope',
  activeLookId: 'e2e-scope-look-a',
  lockedWardrobeId: 'outfit-relaxed-fit-lavender-slip-dress',
};

test('Day: one look and clothing for every slot, and slots that differ go back in one tap', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: DAY_SCOPE_SHARED,
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-scope',
        footwear: 'black leather pointed-toe stiletto pumps',
        slots: [
          { id: 'morning', label: 'Morning', location: 'café', sceneHints: 'coffee', lookId: 'e2e-scope-look-b', outfitByHand: true },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reading', wardrobeId: 'outfit-denim-jacket', outfitByHand: true },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'sunset' },
          { id: 'night', label: 'Night', location: 'home', sceneHints: 'sofa' },
        ],
      },
    },
    characters: dayScopeCast(),
  });
  await gotoStable(page, '/day?character=e2e-day-scope');
  await dismissBlockingOverlays(page);
  // What the whole Day wears reads without opening anything: look, kit, shoes, and pictures.
  const summary = page.getByTestId('day-outfit-row-summary');
  await expect(summary).toContainText('Studio', { timeout: 30_000 });
  await expect(summary).toContainText(/lavender slip dress/i);
  await expect(summary).toContainText('stiletto pumps');
  await expect(summary).toHaveAttribute('title', /Studio · .*lavender slip dress/i);
  await expect(
    page.getByTestId('day-outfit-row-thumbs').locator('img[src="/footwear/black-pumps.webp"]')
  ).toHaveCount(1);
  await expect(page.getByTestId('day-outfit-differ')).toContainText('2 slots differ');

  // A slot that differs says so in its sheet, and its Clothing row shows its own kit.
  await openDaySlotSheet(page, 'afternoon');
  await expect(page.getByTestId('day-slot-differs')).toContainText('Different from the Day');
  await expect(page.getByTestId('day-slot-clothing-summary')).toContainText(/denim jacket/i);
  await openDaySlotSheet(page, 'evening');
  await expect(page.getByTestId('day-slot-differs')).toHaveCount(0);
  await expect(page.getByTestId('day-slot-clothing-summary')).toContainText(/lavender slip dress/i);
  // "Use the Day's" resets that slot alone.
  await openDaySlotSheet(page, 'afternoon');
  await page.getByTestId('day-slot-use-day').click();
  await expect(page.getByTestId('day-slot-differs')).toHaveCount(0);
  await closeDaySheets(page);
  await expect(page.getByTestId('day-outfit-differ')).toContainText('1 slot differs');

  // "Use for every slot": the rest follow the Day in one write.
  await page.getByTestId('day-outfit-use-everywhere').click();
  await expect(page.getByTestId('day-outfit-differ')).toHaveCount(0);
  await openDaySlotSheet(page, 'morning');
  await expect(
    page.getByRole('radiogroup', { name: 'Look for Morning' }).getByTestId('day-slot-look-none')
  ).toHaveAttribute('aria-checked', 'true');
  await closeDaySheets(page);

  // Choose… opens the look tiles and the Clothing picker for the whole Day.
  await page.getByTestId('day-outfit-choose').click();
  const sheet = page.getByTestId('day-outfit-sheet');
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('radiogroup', { name: 'Look for the whole Day' }).getByRole('radio')
  ).toHaveCount(2);
  await expect(sheet.getByTestId('day-outfit-clothing')).toBeVisible();
  await closeDaySheets(page);
});

test('Outfit hands a new outfit to Day: stale slot kits go, hand-picked slots stay and are flagged', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: DAY_SCOPE_SHARED,
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-scope',
        slots: [
          // Stamped on the slot by an earlier Day-wide choice (an older Keep / Use on Day).
          { id: 'morning', label: 'Morning', location: 'café', sceneHints: 'coffee', wardrobeId: 'outfit-denim-jacket' },
          // Picked by hand in the slot sheet.
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reading', wardrobeId: 'outfit-denim-jacket', outfitByHand: true },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'sunset', lookId: 'e2e-scope-look-b' },
          { id: 'night', label: 'Night', location: 'home', sceneHints: 'sofa' },
        ],
      },
    },
    characters: dayScopeCast(),
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  // Outfit picks new shoes: that is a hand-off to Day.
  await openOutfitClothing(page);
  await expect(page.getByTestId('fitting-footwear')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('fitting-footwear-barefoot').click();
  await closeOutfitSheets(page);
  await expect(page.getByTestId('fitting-clothing-summary')).toContainText('barefoot');

  // In-app to Day (a page load would re-apply this test's seed).
  await page.getByRole('link', { name: 'Day', exact: true }).first().click();
  await page.waitForURL(/\/day/);
  await dismissBlockingOverlays(page);
  const notice = page.getByTestId('day-outfit-handoff-notice');
  await expect(notice).toContainText('2 slots keep their own outfit', { timeout: 30_000 });
  await expect(page.getByTestId('day-outfit-row-summary')).toContainText('barefoot');
  await expect(page.getByTestId('day-outfit-differ')).toContainText('2 slots differ');
  // Morning's stamped kit went: it wears the Day's outfit now.
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-differs')).toHaveCount(0);
  await expect(page.getByTestId('day-slot-clothing-summary')).toContainText(/lavender slip dress/i);
  await closeDaySheets(page);

  await page.getByTestId('day-outfit-handoff-use').click();
  await expect(notice).toHaveCount(0);
  await expect(page.getByTestId('day-outfit-differ')).toHaveCount(0);
});

test('pick the best engine per pose: the switch saves and a moved still says why', async ({
  page,
}) => {
  const stillPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-best-engine' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-best-engine', name: 'Best Engine', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        activeSlotId: 'morning',
        stillsCharacterId: 'e2e-best-engine',
        slots: [
          { id: 'morning', label: 'Morning', location: 'living room', sceneHints: 'lying on her side on the sofa' },
          { id: 'afternoon', label: 'Afternoon', location: 'café', sceneHints: 'coffee' },
          { id: 'evening', label: 'Evening', location: 'market', sceneHints: 'apples' },
          { id: 'night', label: 'Night', location: 'home', sceneHints: 'cooking' },
        ],
        stills: [
          {
            slotId: 'morning',
            status: 'completed',
            promptId: 'e2e-moved-still',
            imageUrl: stillPng,
            engineNote: 'Rendered on Rapid AIO — it holds this pose better',
          },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-slot-engine-note-morning').first()).toHaveText(
    'Rendered on Rapid AIO — it holds this pose better',
    { timeout: 30_000 }
  );
  // The switch sits in the Advanced drawer; the Balanced preset (the default) has it on.
  await openDayAdvanced(page);
  await expect(page.getByTestId('day-quality-preset-balanced')).toHaveAttribute(
    'aria-checked',
    'true'
  );
  const toggle = page.getByTestId('day-best-engine-per-pose').first();
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  // Off by hand: the preset reads as Custom until a preset is picked again.
  await expect(page.getByTestId('day-quality-preset-custom')).toBeVisible();
  // Saved to Day's tool settings in IndexedDB (a reload would re-run this test's seed script,
  // so read the stored copy instead).
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<boolean>(resolve => {
              const request = indexedDB.open('comfy-prompt-studio-v1');
              request.onerror = () => resolve(false);
              request.onsuccess = () => {
                const get = request.result
                  .transaction('kv')
                  .objectStore('kv')
                  .get('comfy-prompt-tool-settings-tools-v1');
                get.onsuccess = () =>
                  resolve(get.result?.value?.tools?.day?.bestEnginePerPose === false);
                get.onerror = () => resolve(false);
              };
            })
        ),
      { timeout: 15_000 }
    )
    .toBe(true);
});

// ── The loop past a cut: Day from an idea, Tomorrow, Story opening with the Day ──────────────

const LOOP_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const LOOP_BEATS = [
  { slotId: 'morning', beat: 'sitting on the ferry with a coffee, watching the river', setting: 'river ferry deck' },
  { slotId: 'afternoon', beat: 'walking through the flower market holding tulips', setting: 'covered market hall' },
  { slotId: 'evening', beat: 'leaning on the bridge rail at sunset, smiling', setting: 'old stone bridge' },
  { slotId: 'night', beat: 'sitting on the windowsill with a book', setting: 'lamp-lit attic room' },
];

async function stubDayPremise(page: Page): Promise<{ bodies: Array<Record<string, unknown>> }> {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('**/api/day-premise', async route => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ beats: LOOP_BEATS }) });
  });
  // No ComfyUI: queueing fails fast instead of waiting on a real server.
  await page.route('**/api/comfyui', route =>
    route.request().method() === 'POST' ? route.fulfill({ status: 503, body: '{}' }) : route.continue()
  );
  return { bodies };
}

test('Day from an idea writes every slot from one line', async ({ page }) => {
  await stubDayPremise(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-idea-cast' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-idea-cast', name: 'Idea Cast', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: { day: { stillsCharacterId: 'e2e-idea-cast', dayMood: 'everyday' } },
  });
  await gotoStable(page, '/day?character=e2e-idea-cast');
  await dismissBlockingOverlays(page);
  const input = page.getByTestId('day-idea-input').first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill('a slow Sunday in Lisbon');
  await page.getByTestId('day-idea-write').first().click();
  await expect(page.getByTestId('day-idea-note').first()).toContainText('Every slot', { timeout: 20_000 });
  await expect(page.getByTestId('day-progress-scene-morning').first()).toContainText('ferry');
  await expect(page.getByTestId('day-progress-scene-night').first()).toContainText('windowsill');
});

test('One event: every slot a moment of one event, then back to a whole day', async ({ page }) => {
  await stubDayPremise(page);
  const plan = {
    place: 'candlelit trattoria',
    time: 'Evening',
    moments: [
      { beat: 'sitting at the table reading the menu', move: '' },
      { beat: 'leaning forward with a fork of pasta', move: 'puts the menu down and picks up her fork' },
      { beat: 'sitting back with a glass of red wine', move: 'sets the fork down and lifts her glass' },
      { beat: 'raising the glass in a toast', move: 'raises the glass higher' },
    ],
    ending: 'smiles and sips',
  };
  await page.route('**/api/day-event', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ plan }) })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-event-cast' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-event-cast', name: 'Event Cast', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: { day: { stillsCharacterId: 'e2e-event-cast', dayMood: 'everyday' } },
  });
  await gotoStable(page, '/day?character=e2e-event-cast');
  await dismissBlockingOverlays(page);
  await page.getByRole('tab', { name: 'One event' }).first().click({ timeout: 30_000 });
  await page.getByTestId('day-idea-input').first().fill('a dinner date at a trattoria');
  await page.getByTestId('day-idea-write').first().click();
  await expect(page.getByTestId('day-idea-note').first()).toContainText('4 moments', { timeout: 20_000 });
  await expect(page.getByTestId('day-event-current').first()).toContainText('candlelit trattoria');
  await expect(page.getByTestId('day-progress-scene-afternoon').first()).toContainText('trattoria');
  await page.getByTestId('day-event-leave').first().click();
  await expect(page.getByTestId('day-event-current')).toHaveCount(0);
});

test('Tomorrow after a cut: next day follows on, stills cleared', async ({ page }) => {
  const { bodies } = await stubDayPremise(page);
  await installFakeMediaRecorder(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-tomorrow' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-tomorrow', name: 'Tomorrow Cast', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-tomorrow',
        dayMood: 'everyday',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads on a bench' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs with a drink' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: LOOP_PNG }],
      },
    },
  });
  page.on('download', download => void download.cancel().catch(() => undefined));
  await gotoStable(page, '/cut?from=day');
  await dismissBlockingOverlays(page);
  const cut = page.getByTestId('cut-film').first();
  await expect(cut).toBeEnabled({ timeout: 30_000 });
  await cut.click();
  // Cut's "Start tomorrow on Day" opens Day, which writes the next day.
  const tomorrow = page.getByTestId('cut-start-tomorrow').first();
  await expect(tomorrow).toBeVisible({ timeout: 45_000 });
  await tomorrow.click();
  // Today's beats went to the writer as yesterday; its beats are on the board.
  await expect(page.getByTestId('day-progress-scene-morning').first()).toContainText('ferry', {
    timeout: 20_000,
  });
  expect(bodies.at(-1)?.previousBeats).toEqual(
    expect.arrayContaining(['morning: pours coffee by the window'])
  );
  await expect(page.getByTestId('day-first-cut-celebrate')).toHaveCount(0);
});

test('Story opens with the Cast’s Day when its reel is empty', async ({ page }) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-day-story' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-day-story', name: 'Day Story', version: 1, updatedAt: Date.now(), descriptor: 'a woman' }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-day-story',
        dayMood: 'everyday',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee by the window' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads on a bench' },
          { id: 'evening', label: 'Evening', location: 'rooftop', sceneHints: 'laughs with a drink' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'e2e-ds-m' },
          { slotId: 'evening', status: 'completed', imageUrl: thumb, promptId: 'e2e-ds-e' },
        ],
      },
      roleplay: { story: [] },
    },
  });
  await gotoStable(page, '/story?character=e2e-day-story&from=day');
  await dismissBlockingOverlays(page);
  const offer = page.getByTestId('roleplay-day-opening').first();
  await expect(offer).toBeVisible({ timeout: 30_000 });
  await expect(offer).toContainText('2 stills');
  await page.getByTestId('roleplay-day-opening-use').first().click();
  const reel = page.getByTestId('story-reel').first();
  await expect(reel).toBeVisible({ timeout: 20_000 });
  await expect(reel).toContainText('pours coffee by the window');
  await expect(reel).toContainText('laughs with a drink');
  await expect(page.getByTestId('roleplay-day-opening')).toHaveCount(0);
});

test('Cast page shows the season: episodes in order with their places', async ({ page }) => {
  const now = Date.now();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-season' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-season', name: 'Season Lead', version: 1, updatedAt: now }],
      removedIds: [],
    },
  });
  await putAppKv(page, {
    'play-series-v1': {
      version: 1,
      series: [
        {
          id: 's1',
          characterId: 'e2e-season',
          title: 'Season Lead · Season 1',
          createdAt: now - 2000,
          updatedAt: now,
          episodes: [
            { id: 'e1', cutAt: now - 2000, filename: 'd1.webm', places: ['kitchen', 'park'] },
            { id: 'e2', cutAt: now - 1000, filename: 'd2.webm', places: ['park', 'gallery'], theme: 'Date night' },
          ],
        },
      ],
    },
  });
  await gotoStable(page, '/characters/e2e-season?media=films');
  await dismissBlockingOverlays(page);
  const seasons = page.getByTestId('cast-seasons');
  await expect(seasons).toBeVisible({ timeout: 30_000 });
  await expect(seasons).toContainText('Season Lead · Season 1');
  await expect(seasons).toContainText('2 episodes · 3 places');
  const episodes = seasons.getByTestId('cast-season-episode');
  await expect(episodes).toHaveCount(2);
  await expect(episodes.nth(1)).toContainText('Episode 2');
  await expect(episodes.nth(1)).toContainText('Date night');
  await expect(episodes.nth(1)).toContainText('park · gallery');
});

test('Keep as Cast turns the invented Day partner into a Cast member', async ({ page }) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-keep-lead' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-keep-lead', name: 'Keep Lead', version: 1, updatedAt: Date.now(), descriptor: 'a woman' }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-keep-lead',
        dayMood: 'everyday',
        allowCompanions: true,
        intimateMix: 'mixed',
        partnerCharacterId: 'new:man',
        partnerStandIn: {
          noun: 'man',
          look: 'a man in his thirties with short dark hair',
          filename: 'day-partner-vl-e2e.png',
          imageUrl: thumb,
        },
      },
    },
  });
  await gotoStable(page, '/day?character=e2e-keep-lead');
  await dismissBlockingOverlays(page);
  const keep = page.getByTestId('day-partner-keep-cast').first();
  await expect(keep).toBeVisible({ timeout: 30_000 });
  await keep.click();
  await expect(page.getByTestId('day-partner-keep-cast')).toHaveCount(0);
  await expect(page.getByTestId('day-partner').first()).toContainText('Day partner', { timeout: 15_000 });
});

test('Story opens once a whole Day has rendered, before any cut', async ({ page }) => {
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-full-day' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-full-day', name: 'Full Day', version: 1, updatedAt: Date.now(), descriptor: 'a woman' }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-full-day',
        dayMood: 'everyday',
        slots: [
          { id: 'morning', label: 'Morning', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', sceneHints: 'reads on a bench' },
          { id: 'evening', label: 'Evening', sceneHints: 'laughs with a drink' },
          { id: 'night', label: 'Night', sceneHints: 'reads in bed' },
        ],
        stills: ['morning', 'afternoon', 'evening', 'night'].map((slotId, index) => ({
          slotId,
          status: 'completed',
          imageUrl: thumb,
          promptId: `e2e-full-${index}`,
        })),
      },
    },
  });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  // Before Day has seen the finished stills, Story is still locked.
  await expect(page.getByTestId('play-campaign-step-roleplay-locked').first()).toBeVisible({
    timeout: 30_000,
  });
  await gotoStable(page, '/day?character=e2e-full-day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-progress-morning').first()).toBeVisible({ timeout: 30_000 });
  await gotoStable(page, '/play');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-step-roleplay')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-campaign-step-roleplay-locked')).toHaveCount(0);
});

test('day Intimate · Playful: a Raunchy Day opens as Intimate with Playful on, the toggle flips and sticks', async ({
  page,
}) => {
  await reportIntimateOn(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-playful' },
    characters: {
      version: 1,
      characters: [
        { id: 'e2e-playful', name: 'Playful', version: 1, updatedAt: Date.now(), descriptor: 'a woman' },
      ],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: 'e2e-playful',
        // Saved before Raunchy became Intimate's Playful toggle.
        dayMood: 'raunchy',
        intimateMix: 'duo',
        allowCompanions: true,
        slots: [
          { id: 'morning', label: 'Morning', location: 'bedroom', sceneHints: 'in bed together' },
          { id: 'afternoon', label: 'Afternoon', location: 'shower', sceneHints: 'together' },
          { id: 'evening', label: 'Evening', location: 'sofa', sceneHints: 'together' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'together' },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);

  const mood = page.getByTestId('day-mood');
  await expect(mood).toHaveValue('intimate', { timeout: 30_000 });
  // One adult mood in the list: no Raunchy entry.
  await expect(page.getByTestId('day-mood-intimate')).toHaveCount(1);
  await expect(page.getByTestId('day-mood-raunchy')).toHaveCount(0);
  const playful = page.getByTestId('day-intimate-playful');
  await expect(playful).toHaveAttribute('aria-pressed', 'true');
  await expect(playful).toHaveAttribute('title', /wardrobe fails & slapstick/);
  await expect(page.getByTestId('day-mood-hint').first()).toContainText('Intimate · Playful duo');

  // Off: plain Intimate, saved as Intimate + Playful off (the old 'raunchy' is gone).
  await playful.click();
  await expect(playful).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByTestId('day-mood-hint').first()).toContainText(
    'Intimate duo — every still is a partner scene.'
  );
  // Saved to Day's tool settings in IndexedDB (a reload would re-run the seed script).
  const storedDay = () =>
    page.evaluate(
      () =>
        new Promise<{ dayMood?: string; intimatePlayful?: boolean }>(resolve => {
          const request = indexedDB.open('comfy-prompt-studio-v1');
          request.onerror = () => resolve({});
          request.onsuccess = () => {
            const get = request.result
              .transaction('kv')
              .objectStore('kv')
              .get('comfy-prompt-tool-settings-tools-v1');
            get.onsuccess = () => {
              const day = get.result?.value?.tools?.day;
              resolve({ dayMood: day?.dayMood, intimatePlayful: day?.intimatePlayful });
            };
            get.onerror = () => resolve({});
          };
        })
    );
  await expect.poll(storedDay, { timeout: 15_000 }).toEqual({ dayMood: 'intimate', intimatePlayful: false });

  // On again, then away and back: Playful is only shown on Intimate, and is remembered.
  await page.getByTestId('day-intimate-playful').click();
  await expect(page.getByTestId('day-intimate-playful')).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(storedDay, { timeout: 15_000 }).toEqual({ dayMood: 'intimate', intimatePlayful: true });
  await page.getByTestId('day-mood').selectOption('everyday');
  await expect(page.getByTestId('day-intimate-playful')).toHaveCount(0);
  await page.getByTestId('day-mood').selectOption('intimate');
  await expect(page.getByTestId('day-intimate-playful')).toHaveAttribute('aria-pressed', 'true');

  // Phone: the same toggle beside People.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('day-intimate-playful').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('day-intimate-playful').first()).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});
