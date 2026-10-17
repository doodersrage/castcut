import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-cut-room';
const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';

async function seed(page: import('@playwright/test').Page, withStory = true) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'cr-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'cr-a' },
        ],
      },
      ...(withStory
        ? {
            roleplay: {
              story: [
                {
                  id: 'beat-1',
                  at: 1,
                  title: 'The knock',
                  text: 'Someone knocks at the door.',
                  stillStatus: 'completed',
                  imageUrl: thumb,
                  clipStatus: 'completed',
                  clipUrl: thumb,
                },
              ],
            },
          }
        : {}),
    },
  });
}

test('Cut is its own step: a tab, both reels in one shot list, and a source can be left out', async ({
  page,
}) => {
  await seed(page);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-source-day')).toContainText('Day · 2 shots', { timeout: 30_000 });
  await expect(page.getByTestId('cut-source-story')).toContainText('Story · 1 shot');
  await expect(page.getByTestId('cut-shot-list')).toBeVisible();
  await expect(page.getByTestId('cut-film').first()).toContainText('3 shots');
  // Leave Story out: the cut is the Day alone (and that choice is kept).
  await page.getByTestId('cut-source-story').click();
  await expect(page.getByTestId('cut-source-story')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots');
  // The header has a Cut tab.
  await expect(page.getByRole('link', { name: 'Cut', exact: true }).first()).toBeVisible();
});

test('arriving from Story picks the Story; an empty source links to its page', async ({ page }) => {
  await seed(page);
  await gotoStable(page, '/cut?from=story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-source-story')).toHaveAttribute('aria-checked', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('cut-source-day')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cut-film').first()).toContainText('1 shot');
});

test('Day and Story hand off to Cut', async ({ page }) => {
  await seed(page, false);
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const open = page.getByTestId('day-cut-coach-cut');
  await expect(open).toHaveAttribute('href', '/cut?from=day', { timeout: 30_000 });
  await open.click();
  await expect(page).toHaveURL(/\/cut\?from=day/, { timeout: 30_000 });
  await expect(page.getByTestId('cut-source-day')).toHaveAttribute('aria-checked', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('cut-source-story')).toContainText('no shots yet');
});
