import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Film (2026-11-05): with a Cast picked, the film up top (the Day's stills before a cut), the Cast
 * as a chip whose sheet holds the picker, and the steps as one row of cards.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-film-home';
const still = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';

test('the film up top, the Cast as a chip, the steps as cards', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Mara', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: still }],
      },
    },
  });
  await gotoStable(page, `/play?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const hero = page.getByTestId('play-film-hero');
  await expect(hero).toBeVisible({ timeout: 30_000 });
  // Before a cut, the Day's stills play there.
  await expect(hero.getByTestId('play-film-hero-player').locator('img').first()).toBeVisible();
  await expect(page.getByTestId('play-film-progress')).toContainText('1 still');
  // The Cast picker lives in the chip's sheet now.
  await expect(page.getByTestId('play-campaign-character')).toHaveCount(0);
  const chip = page.getByTestId('play-cast-chip');
  await expect(chip).toContainText('Mara');
  await chip.click();
  await expect(page.getByTestId('play-cast-sheet').getByTestId('play-campaign-character')).toBeVisible();
  await page.keyboard.press('Escape');
  // One row of step cards, the Day card with its still.
  await expect(page.getByTestId('play-campaign-steps')).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-day').locator('img')).toHaveCount(1);
});

test('creating a Cast keeps the form on the page', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Mara', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
  });
  await gotoStable(page, '/play?new=1');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('play-campaign-create-name')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('play-cast-chip')).toHaveCount(0);
});
