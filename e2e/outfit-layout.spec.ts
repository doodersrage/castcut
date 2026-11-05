import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Outfit (2026-11-05): the plate first when there is none, one action bar, quality beside the
 * stage, type chips and a starred / recently tried shelf, keys.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-outfit-layout';
const cast = {
  version: 1,
  characters: [{ id: CAST, name: 'Ana', version: 1, updatedAt: Date.now() }],
  removedIds: [],
};

test('no plate: the plate is the first step, in the stage; one action bar', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, { shared: { activeCharacterId: CAST }, characters: cast });
  await gotoStable(page, `/fitting?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const first = page.getByTestId('fitting-plate-first');
  await expect(first).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('fitting-stage').getByTestId('fitting-plate')).toBeVisible();
  await expect(page.getByTestId('fitting-who').getByTestId('fitting-plate')).toHaveCount(0);
  await expect(page.getByTestId('fitting-clothes-wait')).toBeVisible();
  // One bar, the missing plate not repeated in it.
  const bar = page.getByTestId('fitting-try-panel');
  await expect(bar.getByTestId('fitting-queue-try-on')).toBeVisible();
  await expect(bar.getByTestId('fitting-queue-block-reason')).toHaveCount(0);
  // Quality sits beside the stage.
  await expect(page.getByTestId('fitting-quality-card')).toBeVisible();
});

test('kits: type chips, a star puts a kit on the shelf, ← → step through kits', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST, lockedWardrobeId: 'outfit-cropped-sage-slip-dress' },
    characters: cast,
    tools: {
      fitting: {
        referenceImageUrl: '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp',
        referenceImageFilename: 'e2e-plate.webp',
        referenceCharacterId: CAST,
      },
    },
  });
  await gotoStable(page, `/fitting?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const shelf = page.getByTestId('outfit-kit-shelf');
  await expect(shelf).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('outfit-kit-type-top').click();
  await expect(page.getByTestId('outfit-kit-type-top')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('outfit-kit-type-all').click();
  await page.getByTestId('outfit-kit-star').click();
  await expect(page.getByTestId('outfit-kit-star')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('outfit-kit-shelf-outfit-cropped-sage-slip-dress')).toBeVisible();
  // ← → step through the kits (not while typing).
  const summary = page.getByTestId('fitting-clothing-summary');
  const before = await summary.textContent();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  await expect(summary).not.toHaveText(before!);
});
