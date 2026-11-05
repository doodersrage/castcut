import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Scene on the desk (2026-11-05): the shot beside its takes, one action bar, takes as cards with a
 * Kept badge and hover actions, keys, and Script / Locations under More.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-scene-layout';
const slot = { id: 'evening', label: 'Evening', location: 'kitchen', sceneHints: 'stirs a pot' };

async function seed(page: import('@playwright/test').Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Ana', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      scene: {
        isolateSubject: false,
        scenes: [
          {
            id: 'sc-1',
            castId: CAST,
            name: 'Kitchen',
            slot,
            dayMood: 'everyday',
            takes: [
              { id: 't1', promptId: 't1', imageUrl: '/icon.svg?take=1', at: 1 },
              { id: 't2', promptId: 't2', imageUrl: '/icon.svg?take=2', at: 2 },
              { id: 't3', promptId: 't3', imageUrl: '/icon.svg?take=3', at: 3 },
            ],
            createdAt: 1,
            updatedAt: 3,
          },
          {
            id: 'sc-2',
            castId: CAST,
            name: 'Garden',
            slot: { ...slot, location: 'garden' },
            dayMood: 'everyday',
            takes: [],
            createdAt: 2,
            updatedAt: 2,
          },
        ],
        activeSceneId: 'sc-1',
        slots: [slot],
        stills: [{ slotId: 'evening', promptId: 't1', imageUrl: '/icon.svg?take=1', status: 'completed' }],
        stillsCharacterId: CAST,
        dayMood: 'everyday',
      },
    },
  });
}

test('Scene: the shot beside its takes, one action bar, More folded', async ({ page }) => {
  await seed(page);
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(3, { timeout: 60_000 });
  // Side by side on the desk.
  const shot = (await page.getByTestId('scene-shot').boundingBox())!;
  const results = (await page.getByTestId('scene-results').boundingBox())!;
  expect(results.x).toBeGreaterThan(shot.x + shot.width / 2);
  // One bar: Another take, Redo, Animate (needs a kept take), Send to Day, Cut.
  const bar = page.getByTestId('scene-action-bar');
  await expect(bar.getByTestId('scene-queue-take')).toBeVisible();
  await expect(bar.getByTestId('scene-bar-animate')).toBeDisabled();
  await expect(bar.getByTestId('scene-send-day-slot')).toBeVisible();
  // Scenes show done / to do; Script and Locations are folded under More.
  await expect(page.getByTestId('scene-list-item-sc-1').locator('[data-status]')).toHaveAttribute('data-status', 'todo');
  await expect(page.getByTestId('scene-more')).not.toHaveAttribute('open', '');
  // Keep from the take card's hover actions: the badge, and Animate opens up.
  await page.getByTestId('scene-take').nth(1).hover();
  await page.getByTestId('scene-take-quick-keep-1').click();
  await expect(page.getByTestId('scene-take-kept-badge-1')).toBeVisible();
  await expect(bar.getByTestId('scene-bar-animate')).toBeEnabled();
  await expect(page.getByTestId('scene-list-item-sc-1').locator('[data-status]')).toHaveAttribute('data-status', 'done');
});

test('Scene keys: arrows pick a take, K keeps it, X rejects, ] opens the next scene', async ({
  page,
}) => {
  await seed(page);
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(3, { timeout: 60_000 });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid="scene-take"][data-take="t2"]')).toHaveAttribute('data-on-card', 'true');
  await page.keyboard.press('k');
  await expect(page.locator('[data-testid="scene-take"][data-take="t2"]')).toHaveAttribute('data-kept', 'true');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('[data-testid="scene-take"][data-take="t3"]')).toHaveAttribute('data-on-card', 'true');
  await page.keyboard.press('x');
  await expect(page.locator('[data-testid="scene-take"][data-take="t3"]')).toHaveAttribute('data-review', 'rejected');
  await page.keyboard.press(']');
  await expect(page.getByTestId('scene-name')).toHaveValue('Garden');
});

test('Scene: the shot form stays in its column (no field runs under the takes)', async ({
  page,
}) => {
  await seed(page);
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(3, { timeout: 60_000 });
  // The Beat / Narration boxes size to their text: a long placeholder widened the whole column.
  const shot = (await page.getByTestId('scene-shot').boundingBox())!;
  const overflow = await page.evaluate(`(() => {
    const shot = document.querySelector('[data-testid="scene-shot"]');
    const right = shot.getBoundingClientRect().right;
    return [...shot.querySelectorAll('input, textarea, select, [data-testid="day-slot-group"]')]
      .map(el => el.getBoundingClientRect().right - right)
      .filter(over => over > 1).length;
  })()`);
  expect(overflow).toBe(0);
  const results = (await page.getByTestId('scene-results').boundingBox())!;
  expect(shot.x + shot.width).toBeLessThanOrEqual(results.x + 1);
});

test('Scene: rate a take with 1–5 and note it', async ({ page }) => {
  await seed(page);
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(3, { timeout: 60_000 });
  // 4 rates the take on the card (the first); the same key again clears it.
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('4');
  await expect(page.getByTestId('scene-take-star-0-4')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('4');
  await expect(page.getByTestId('scene-take-star-0-4')).toHaveAttribute('aria-checked', 'false');
  // A click rates another; its note is kept.
  await page.getByTestId('scene-take-star-1-2').click();
  await expect(page.getByTestId('scene-take-star-1-2')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('scene-take-note-1').fill('hands wrong');
  await page.getByTestId('scene-take-note-1').press('Enter');
  await expect(page.getByTestId('scene-take-note-1')).toHaveValue('hands wrong');
});
