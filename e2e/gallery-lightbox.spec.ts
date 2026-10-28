import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureStudioWorkspace, seedGalleryLightboxFixtures } from './helpers/gallery';
import { replaceGalleryIdb } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('lightbox opens, rates, expands actions, and navigates', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  await expect(page.getByTestId('gallery-card-review-note').first()).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: 'Open image preview' }).first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });

  await lightbox.getByRole('button', { name: '3★' }).click();
  await expect(lightbox.getByRole('button', { name: '3★' })).toBeVisible();

  const actionsToggle = lightbox.getByTestId('lightbox-actions-toggle');
  await actionsToggle.click();
  await expect(lightbox.getByTestId('lightbox-actions-rail')).toBeVisible();

  const next = lightbox.getByRole('button', { name: 'Next image' });
  if (await next.isEnabled()) {
    await next.click();
    await expect(lightbox.getByText(/Image 2 of/i)).toBeVisible();
    await lightbox.getByRole('button', { name: 'Previous image' }).click();
    await expect(lightbox.getByText(/Image 1 of/i)).toBeVisible();
  }

  await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(lightbox).toHaveCount(0);
});

test('lightbox favorite toggle and review note controls work', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  await page.getByRole('button', { name: 'Open image preview' }).first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });

  const favorite = lightbox.getByRole('button', { name: /Fav/i }).first();
  await expect(favorite).toBeVisible({ timeout: 10_000 });
  await favorite.click();
  await expect(lightbox.getByRole('button', { name: /★ Fav/i })).toBeVisible({ timeout: 10_000 });

  await lightbox.getByRole('button', { name: /Details/i }).click();
  const note = lightbox.getByPlaceholder(/Quick note for this output/i);
  await expect(note).toBeVisible({ timeout: 10_000 });
  await note.fill('e2e keeper note');
  await expect(note).toHaveValue('e2e keeper note');

  await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(lightbox).toHaveCount(0);
});

test('gallery deep-links into lightbox via ?lightbox=', async ({ page }) => {
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery?lightbox=e2e-gallery-fixture');
  await dismissBlockingOverlays(page);

  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/lightbox=e2e-gallery-fixture/);
});

// M6 D21: a change to a field the IndexedDB writer didn't fingerprint (the review note, the
// checks, the adult check, stored media) never reached IndexedDB, and was gone after a reload.
test('a review note survives a reload', async ({ page }) => {
  await isolateServerStorage(page);
  await ensureStudioWorkspace(page);
  await gotoStable(page, '/gallery');
  await replaceGalleryIdb(page, [
    {
      id: 'e2e-note-reload',
      promptId: 'e2e-note-reload',
      prompt: 'review note reload fixture',
      model: 'qwen-image-2512',
      tool: 'generate',
      comfyUrl: 'http://127.0.0.1:8188',
      status: 'completed',
      queuedAt: Date.now(),
      completedAt: Date.now(),
      images: [{ filename: 'e2e-note-reload.png', subfolder: '', type: 'output' }],
    },
  ]);
  await page.reload();
  await dismissBlockingOverlays(page);

  await page.getByRole('button', { name: 'Open image preview' }).first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });
  await lightbox.getByRole('button', { name: 'Details' }).click();
  const note = lightbox.getByPlaceholder('Quick note for this output…');
  await note.fill('keep for the bar scene');
  await note.blur();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('gallery-card-review-note')).toHaveCount(1);

  // In IndexedDB, not only in memory.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>(resolve => {
            const request = indexedDB.open('comfy-prompt-studio-v1');
            request.onsuccess = () => {
              const read = request.result
                .transaction('galleryEntries', 'readonly')
                .objectStore('galleryEntries')
                .get('e2e-note-reload');
              read.onsuccess = () =>
                resolve(String((read.result as { reviewNote?: string } | undefined)?.reviewNote ?? ''));
            };
            request.onerror = () => resolve('');
          })
      )
    )
    .toBe('keep for the bar scene');

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('gallery-card-review-note')).toHaveCount(1, { timeout: 30_000 });
});
