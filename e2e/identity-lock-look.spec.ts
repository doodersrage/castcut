import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { closeDaySheets } from './helpers/day';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST_ID = 'e2e-lock-cast';

/** A Cast with two looks, each with its plate and the cut-out face the Cast page makes for it. */
function lockCast() {
  const look = (id: string, name: string, base: string, createdAt: number) => ({
    id,
    name,
    createdAt,
    reference: {
      originalFilename: `${base}-u1ab2c3d4.png`,
      originalUrl: '/icon.svg',
      isolatedFilename: `${base}-cutout-u1ab2c3d5.png`,
      isolatedUrl: '/icon.svg',
      isolated: true,
    },
    ipAdapter: { imageFilename: `${base}-cutout-u1ab2c3d5.png`, imageUrl: '/icon.svg' },
  });
  return {
    version: 1,
    characters: [
      {
        id: CAST_ID,
        name: 'Nora',
        version: 1,
        updatedAt: Date.now(),
        activeLookId: 'e2e-lock-studio',
        looks: [
          look('e2e-lock-studio', 'Studio', 'nora-studio', 2),
          look('e2e-lock-lying', 'Lying', 'nora-lying', 1),
        ],
      },
    ],
    removedIds: [],
  };
}

/** Open the Engine panel's Identity lock section. */
async function identityLock(page: Page) {
  const summary = page.locator('summary').filter({ hasText: 'Identity lock' }).first();
  await expect(summary).toBeVisible({ timeout: 30_000 });
  const panel = page.getByTestId('identity-lock-session');
  const open = await summary.evaluate(el => (el.parentElement as HTMLDetailsElement | null)?.open);
  if (!open) {
    await summary.click();
  }
  await expect(panel).toBeVisible({ timeout: 15_000 });
  return panel;
}

/** Day's Look & clothing → the whole Day's look. */
async function chooseDayLook(page: Page, lookId: string) {
  await page.getByTestId('day-outfit-choose').click();
  const sheet = page.getByTestId('day-outfit-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  const tile = sheet.getByTestId(`day-outfit-look-${lookId}`);
  await tile.click();
  await expect(tile).toHaveAttribute('aria-checked', 'true');
  await closeDaySheets(page);
}

test('a face lock from the look follows the look switch', async ({ page }) => {
  // Saved before the lock's source was recorded: it is the Studio plate's cut-out.
  await seedSettingsCacheOnNextLoad(page, {
    shared: {
      activeCharacterId: CAST_ID,
      activeLookId: 'e2e-lock-studio',
      ipAdapterImageFilename: 'nora-studio-cutout-u1ab2c3d5.png',
      ipAdapterImageFilenames: ['nora-studio-cutout-u1ab2c3d5.png'],
      ipAdapterImageUrl: '/icon.svg',
    },
    characters: lockCast(),
  });
  await gotoStable(page, `/day?character=${CAST_ID}`);
  await dismissBlockingOverlays(page);
  let panel = await identityLock(page);
  await expect(panel.getByTestId('identity-lock-from')).toHaveText('Face: Studio look');
  await expect(panel).toContainText('nora-studio-cutout-u1ab2c3d5.png');

  await chooseDayLook(page, 'e2e-lock-lying');
  panel = await identityLock(page);
  await expect(panel.getByTestId('identity-lock-from')).toHaveText('Face: Lying look');
  await expect(panel).toContainText('nora-lying-cutout-u1ab2c3d5.png');
  await expect(panel).not.toContainText('nora-studio-cutout');
});

test('your own face lock stays on a look switch, with Use this look’s', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: {
      activeCharacterId: CAST_ID,
      activeLookId: 'e2e-lock-studio',
      ipAdapterImageFilename: 'my-holiday-face.png',
      ipAdapterImageFilenames: ['my-holiday-face.png'],
      ipAdapterImageUrl: '/icon.svg?own',
    },
    characters: lockCast(),
  });
  await gotoStable(page, `/day?character=${CAST_ID}`);
  await dismissBlockingOverlays(page);
  let panel = await identityLock(page);
  const from = panel.getByTestId('identity-lock-from');
  await expect(from).toContainText('Your own face');
  await expect(from.getByRole('button', { name: 'Use this look’s' })).toBeVisible();

  await chooseDayLook(page, 'e2e-lock-lying');
  panel = await identityLock(page);
  await expect(panel).toContainText('my-holiday-face.png');
  await expect(panel.getByTestId('identity-lock-from')).toContainText('Your own face');

  // One tap puts the look's face back, and it is from the look again.
  await panel.getByRole('button', { name: 'Use this look’s' }).click();
  await expect(panel.getByTestId('identity-lock-from')).toHaveText('Face: Lying look');
  await expect(panel).toContainText('nora-lying-cutout-u1ab2c3d5.png');
});
