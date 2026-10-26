import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * M2 C6: an earlier plate you know is wrong stops being offered; a keeper can be picked for Day
 * and Story instead of the newest.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-ref-status';
const plate = (name: string) => ({
  originalUrl: `/icon.svg?plate=${name}`,
  originalFilename: `${name}.png`,
});

function seed() {
  const now = Date.now();
  return {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [
        {
          id: CAST,
          name: 'Ref Nora',
          version: 1,
          updatedAt: now,
          activeLookId: 'look-1',
          reference: plate('current'),
          looks: [
            {
              id: 'look-1',
              name: 'Main',
              createdAt: 1,
              reference: plate('current'),
              keeperEntryIds: ['keep-old', 'keep-new'],
              plateHistory: [
                { reference: plate('bad'), replacedAt: now - 60_000 },
                { reference: plate('good'), replacedAt: now - 120_000 },
              ],
            },
          ],
        },
      ],
      removedIds: [],
    },
  };
}

test("an earlier plate marked don't offer again loses its Restore, and comes back", async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, seed());
  await gotoStable(page, `/characters/${CAST}?tab=overview#looks`);
  await dismissBlockingOverlays(page);
  const history = page.getByTestId('cast-look-plate-history');
  await expect(history).toBeVisible({ timeout: 60_000 });
  await history.locator('summary').click();
  const plates = page.getByTestId('cast-look-plate-earlier');
  await expect(plates).toHaveCount(2);
  await expect(page.getByTestId('cast-look-plate-restore')).toHaveCount(2);

  await plates.nth(0).getByTestId('cast-look-plate-deprecate').click();
  await expect(plates.nth(0)).toHaveAttribute('data-deprecated', 'true');
  await expect(plates.nth(0)).toContainText('Not offered');
  await expect(page.getByTestId('cast-look-plate-restore')).toHaveCount(1);

  await plates.nth(0).getByTestId('cast-look-plate-deprecate').click();
  await expect(plates.nth(0)).toHaveAttribute('data-deprecated', 'false');
  await expect(page.getByTestId('cast-look-plate-restore')).toHaveCount(2);
});

test('a keeper can be picked for Day and Story', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, seed());
  await page.addInitScript(() => {
    const now = Date.now();
    const still = (id: string, at: number) => ({
      id,
      promptId: `prompt-${id}`,
      prompt: 'try-on',
      comfyUrl: 'http://127.0.0.1:8188',
      status: 'completed',
      characterId: 'e2e-ref-status',
      queuedAt: at,
      completedAt: at,
      images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
    });
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([still('keep-new', now - 10_000), still('keep-old', now - 90_000)])
    );
  });
  await gotoStable(page, `/characters/${CAST}?tab=film`);
  await dismissBlockingOverlays(page);
  const prefer = page.getByTestId('cast-media-prefer-keeper');
  await expect(prefer).toHaveCount(2, { timeout: 60_000 });
  await expect(prefer.filter({ hasText: 'Day uses this' })).toHaveCount(0);
  await prefer.nth(1).click();
  await expect(prefer.filter({ hasText: 'Day uses this' })).toHaveCount(1);
  await expect(prefer.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await prefer.nth(1).click();
  await expect(prefer.filter({ hasText: 'Day uses this' })).toHaveCount(0);
});
