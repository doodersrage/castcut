import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { replaceGalleryIdb, seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/** Film Director (M5): the production at a glance, read from the records the tools keep. */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-director';
const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
const take = (id: string) => ({ id, promptId: id, imageUrl: thumb, at: 1 });

test('the overview counts Scenes, jobs and findings, and links to the tools', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Nora', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      scene: {
        scenes: [
          { id: 'd-empty', castId: CAST, name: 'Hallway', slot: { id: 'morning', label: 'Morning' }, takes: [], createdAt: 1, updatedAt: 1 },
          { id: 'd-review', castId: CAST, name: 'Kitchen', slot: { id: 'morning', label: 'Morning' }, takes: [take('d-r1'), take('d-r2')], createdAt: 2, updatedAt: 2 },
          { id: 'd-kept', castId: CAST, name: 'Rooftop', slot: { id: 'night', label: 'Night' }, takes: [take('d-k1')], keptTakeId: 'd-k1', createdAt: 3, updatedAt: 3 },
        ],
      },
    },
  });
  await gotoStable(page, '/production');
  const now = Date.now();
  await replaceGalleryIdb(page, [
    {
      id: 'd-k1', promptId: 'd-k1', prompt: 'Rooftop', tool: 'day', characterId: CAST, comfyUrl: 'http://127.0.0.1:8188',
      status: 'completed', queuedAt: now - 5000, completedAt: now - 4000,
      images: [{ filename: 'k1.png', subfolder: '', type: 'output' }],
      playChecks: { faceMiss: true, face: 0.41 },
    },
    {
      id: 'd-f1', promptId: 'd-f1', prompt: 'Kitchen again', tool: 'day', characterId: CAST, comfyUrl: 'http://127.0.0.1:8188',
      status: 'error', statusMessage: 'Out of memory', queuedAt: now - 3000, images: [],
    },
  ]);
  await page.reload();
  await dismissBlockingOverlays(page);

  await expect(page.getByTestId('director-scenes-total')).toContainText('3', { timeout: 30_000 });
  await expect(page.getByTestId('director-scenes-review')).toContainText('1');
  await expect(page.getByTestId('director-scenes-kept')).toContainText('1');
  await expect(page.getByTestId('director-scenes-planned')).toContainText('1');
  await expect(page.getByTestId('director-scene-d-review')).toHaveAttribute('data-state', 'to-review');
  await expect(page.getByTestId('director-jobs-failed')).toContainText('1');
  await expect(page.getByTestId('director-jobs-problems')).toContainText('Out of memory');
  await expect(page.getByTestId('director-continuity-open')).toContainText('1');

  // Each count opens the tool that owns it.
  await expect(page.getByTestId('director-scenes-review')).toHaveAttribute(
    'href',
    `/scene?character=${CAST}`
  );
  await page.getByTestId('director-jobs-failed').click();
  await expect(page).toHaveURL(/\/queue/, { timeout: 30_000 });
});

// M5 W2: what to do next, each opening the tool at the exact place.
test('next actions: ranked, and Review takes opens that very Scene', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Nora', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      scene: {
        scenes: [
          { id: 'n-kept', castId: CAST, name: 'Rooftop', slot: { id: 'night', label: 'Night' }, takes: [take('n-k1')], keptTakeId: 'n-k1', createdAt: 1, updatedAt: 1 },
          { id: 'n-review', castId: CAST, name: 'Kitchen', slot: { id: 'morning', label: 'Morning', location: 'kitchen' }, takes: [take('n-r1'), take('n-r2')], createdAt: 2, updatedAt: 2 },
        ],
        activeSceneId: 'n-kept',
      },
    },
  });
  await gotoStable(page, '/production');
  await dismissBlockingOverlays(page);
  const next = page.getByTestId('director-next');
  // No reference picture on this Cast: first; then the takes to review.
  await expect(next.locator('li').first()).toHaveAttribute('data-testid', 'director-next-cast-reference', {
    timeout: 30_000,
  });
  const review = page.getByTestId('director-next-review-takes');
  await expect(review).toContainText('Review 2 takes of Kitchen');
  await review.getByRole('link', { name: 'Review takes' }).click();
  await expect(page).toHaveURL(new RegExp(`/scene\\?character=${CAST}&scene=n-review`), {
    timeout: 30_000,
  });
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-name')).toHaveValue('Kitchen', { timeout: 60_000 });
});

test('with no Cast picked, it says how to pick one', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, { shared: {}, tools: {} });
  await gotoStable(page, '/production');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('director-no-cast')).toBeVisible({ timeout: 30_000 });
});
