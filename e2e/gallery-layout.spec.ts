import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedGalleryLightboxFixtures } from './helpers/gallery';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Gallery (2026-11-05): one slim bar (search, type, stars, sort, size), the rest under Filters;
 * date headings; finished pictures without a "Done" badge; keys on the grid.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('one bar, date headings, quiet cards', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  const bar = page.getByTestId('gallery-filter-bar');
  await expect(bar).toBeVisible({ timeout: 30_000 });
  await expect(bar.getByTestId('gallery-type-stills')).toBeVisible();
  await expect(bar.getByTestId('gallery-size-large')).toBeVisible();
  await expect(bar.getByTestId('gallery-filter-rating')).toBeVisible();
  // Newest first: a heading for the fixtures' day.
  await expect(page.getByTestId('gallery-day-heading').first()).toHaveText('Today');
  // A finished picture carries no status badge.
  const card = page.getByRole('article').filter({ hasText: 'e2e gallery fixture' }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText('Done', { exact: true })).toHaveCount(0);
  // Clips only: the stills go.
  await bar.getByTestId('gallery-type-clips').click();
  await expect(page.getByRole('article')).toHaveCount(0);
});

test('keys: arrows move between pictures, F favourites the one in focus', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('article').first()).toBeVisible({ timeout: 30_000 });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  const first = page.getByRole('article').first();
  await expect(first.locator('button[aria-label^="Open"]')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('article').nth(1).locator('button[aria-label^="Open"]')).toBeFocused();
  await page.keyboard.press('f');
  await expect(page.getByRole('article').nth(1).locator('[data-gallery-fav]')).toHaveText('★');
});
