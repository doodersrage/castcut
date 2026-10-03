import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedGalleryLookFixtures } from './helpers/gallery';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('gallery: with a Cast picked, look chips narrow to one look', async ({ page }) => {
  await seedGalleryLookFixtures(page);
  await gotoStable(page, '/gallery?character=e2e-look-cast');
  await dismissBlockingOverlays(page);
  const filtersSummary = page
    .locator('details.ui-collapsible summary')
    .filter({ hasText: 'Filters' });
  if (await filtersSummary.isVisible().catch(() => false)) {
    await filtersSummary.click();
  }
  const phoneToggle = page.getByTestId('gallery-filters-phone-toggle');
  if (await phoneToggle.isVisible().catch(() => false)) {
    await phoneToggle.click();
  }
  const looks = page.getByTestId('gallery-look-filter');
  await expect(looks).toBeVisible({ timeout: 20_000 });
  await expect(looks.getByTestId('gallery-look-filter-e2e-look-studio')).toContainText('Studio');
  await expect(looks.getByTestId('gallery-look-filter-e2e-look-beach')).toContainText('Beach');
  await expect(looks.getByTestId('gallery-look-filter-__none__')).toContainText('No look');
  const cards = page.getByTestId('gallery-card-menu');
  await expect(cards).toHaveCount(4, { timeout: 20_000 });

  await looks.getByTestId('gallery-look-filter-e2e-look-beach').click();
  await expect(page).toHaveURL(/look=e2e-look-beach/);
  await expect(page.getByTestId('gallery-active-filters')).toContainText('Look: Beach');
  await expect(cards).toHaveCount(1);

  await looks.getByTestId('gallery-look-filter-e2e-look-studio').click();
  await expect(cards).toHaveCount(2);

  await looks.getByTestId('gallery-look-filter-all').click();
  await expect(page).not.toHaveURL(/look=/);
  await expect(cards).toHaveCount(4);
});

test('Cast page: What next checklist, and Film & media by look', async ({ page }) => {
  const png =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  // The Day board owns the Day stills (gallery entries carry no Day marker).
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-look-cast' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-look-cast',
        stills: ['morning', 'afternoon', 'evening', 'night'].map(slotId => ({
          slotId,
          status: 'completed',
          imageUrl: png,
        })),
      },
    },
  });
  await seedGalleryLookFixtures(page);
  await gotoStable(page, '/characters/e2e-look-cast');
  await dismissBlockingOverlays(page);
  const checklist = page.getByTestId('cast-checklist');
  await expect(checklist).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cast-checklist-count')).toContainText('of 7 done');
  // One Next, on a step not done; Day stills count the four stamped Day stills.
  await expect(checklist.getByTestId('cast-checklist-next')).toHaveCount(1);
  await expect(checklist.locator('[data-next="true"]')).toHaveAttribute('data-done', 'false');
  await expect(page.getByTestId('cast-checklist-day')).toHaveAttribute('data-done', 'true');
  await expect(page.getByTestId('cast-checklist-day')).toContainText('4 stills');
  await expect(page.getByTestId('cast-checklist-story')).toHaveAttribute('data-done', 'false');
  // A tab step opens that tab on this page.
  await page.getByTestId('cast-checklist-bible').click();
  await expect(page.getByRole('tab', { name: 'Bible' })).toHaveAttribute('aria-selected', 'true');

  await page.getByRole('tab', { name: /Film & media/i }).click();
  const media = page.getByTestId('cast-media');
  const looks = media.getByTestId('cast-media-look-filter');
  await expect(looks).toBeVisible({ timeout: 20_000 });
  const tiles = media.locator('ul > li');
  await expect(tiles).toHaveCount(4);
  await looks.getByTestId('cast-media-look-e2e-look-beach').click();
  await expect(tiles).toHaveCount(1);
  await expect(media.getByTestId('cast-see-in-gallery')).toHaveAttribute(
    'href',
    /look=e2e-look-beach/
  );
  await looks.getByTestId('cast-media-look-__none__').click();
  await expect(tiles).toHaveCount(1);
  await looks.getByTestId('cast-media-look-all').click();
  await expect(tiles).toHaveCount(4);
});
