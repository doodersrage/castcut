import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Day's page read top to bottom (2026-11-05): the idea first, the cards (an empty one as tall as
 * the rest, quick actions on hover), one action bar kept in view, and keys on the board.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-day-layout';
const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';

async function seed(page: import('@playwright/test').Page) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Ana', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        dayMood: 'everyday',
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
          { id: 'evening', label: 'Evening', location: '', sceneHints: '' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'dl-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'dl-a' },
        ],
      },
    },
  });
}

test('Day reads top to bottom: idea, cards of one size, one action bar', async ({ page }) => {
  await seed(page);
  await gotoStable(page, `/day?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const bar = page.getByTestId('day-action-bar');
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await expect(bar.getByTestId('day-cut-coach')).toContainText(/Ready to cut · 2 of \d stills/);
  await expect(bar.getByTestId('day-cut-coach-cut')).toHaveAttribute('href', /\/cut\?from=day/);
  await expect(page.getByTestId('day-cut-coach-queue')).toHaveCount(0);
  // The idea comes before the cards.
  const ideaY = (await page.getByTestId('day-idea').first().boundingBox())!.y;
  const cardY = (await page.getByTestId('day-progress-morning').boundingBox())!.y;
  expect(ideaY).toBeLessThan(cardY);
  // An unplanned slot is as tall as a rendered one.
  const full = (await page.getByTestId('day-progress-morning').boundingBox())!.height;
  const empty = (await page.getByTestId('day-progress-evening').boundingBox())!.height;
  expect(Math.abs(full - empty)).toBeLessThan(40);
  // Quick actions on hover.
  // (No plate here, so queueing is blocked: Edit shows, Retry / Animate don't.)
  await page.getByTestId('day-progress-morning').hover();
  await expect(page.getByTestId('day-quick-edit-morning')).toBeVisible();
  await expect(page.getByTestId('day-quick-animate-morning')).toHaveCount(0);
  // The bar stays in view while the page scrolls.
  await page.mouse.wheel(0, 400);
  await expect(bar).toBeInViewport();
});

test('Day keys: arrows pick a slot, Enter edits it, arrows step the sheet, A animates', async ({
  page,
}) => {
  await seed(page);
  await gotoStable(page, `/day?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-progress-morning')).toBeVisible({ timeout: 30_000 });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  // The board starts on the next slot to render; ← steps back to the first.
  for (let step = 0; step < 4; step += 1) await page.keyboard.press('ArrowLeft');
  await expect(page.getByTestId('day-progress-morning')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('day-progress-afternoon')).toHaveAttribute('data-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  const sheet = page.getByTestId('day-slot-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-slot', 'morning');
  await sheet.getByText('Setting, beat, pose and clothing for this time of day.').click();
  await page.keyboard.press('ArrowRight');
  await expect(sheet).toHaveAttribute('data-slot', 'afternoon');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await page.keyboard.press('a');
  await expect(page.getByTestId('day-animate-sheet')).toBeVisible();
});

test('Day sheets: the storyboard opens as a printable page of the slots', async ({ page }) => {
  await seed(page);
  await gotoStable(page, `/day?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('day-sheets-menu-trigger').click();
  const [sheet] = await Promise.all([
    page.context().waitForEvent('page'),
    page.getByTestId('day-sheet-storyboard').click(),
  ]);
  await sheet.waitForLoadState();
  await expect(sheet.locator('h1')).toContainText('storyboard');
  await expect(sheet.locator('.frame').first()).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Print / save as PDF' })).toBeVisible();
  await sheet.close();
});

test('Day ?slot= opens that slot’s sheet (Cut’s “Fix the line”); its Light pick is there', async ({
  page,
}) => {
  await seed(page);
  await gotoStable(page, `/day?character=${CAST}&slot=afternoon`);
  await dismissBlockingOverlays(page);
  const sheet = page.getByTestId('day-slot-sheet');
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet.getByTestId('day-slot-lighting-select')).toBeVisible();
  await sheet.getByTestId('day-slot-lighting-select').selectOption('golden');
  await expect(sheet.getByTestId('day-slot-lighting-select')).toHaveValue('golden');
});
