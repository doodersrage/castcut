import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { openOutfitClothing } from './helpers/outfit';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/** The footwear editor (2026-11-06): the pair being worn, its picture and words, saved and worn. */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('footwear editor: change your shoes’ words, save, and the outfit wears them', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    characters: { version: 1, characters: [], removedIds: [] },
    tools: {
      fitting: {
        footwear: 'brown suede desert boots',
        footwearImageFilename: 'my-boots.png',
        footwearImageUrl: '/footwear/hiking-boots.webp',
      },
    },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await openOutfitClothing(page);
  const footwear = page.getByTestId('fitting-footwear');
  await expect(footwear).toBeVisible({ timeout: 30_000 });
  await footwear.getByTestId('fitting-footwear-edit').click();
  const editor = page.getByTestId('footwear-editor');
  await expect(editor).toBeVisible();
  await expect(editor.getByTestId('footwear-editor-picture')).toHaveAttribute(
    'src',
    '/footwear/hiking-boots.webp'
  );
  await expect(editor.getByTestId('footwear-editor-words')).toHaveValue('brown suede desert boots');
  // Change needs words to say what to change.
  await expect(editor.getByTestId('footwear-editor-apply')).toBeDisabled();
  await editor.getByTestId('footwear-editor-words').fill('red suede ankle boots');
  await editor.getByTestId('footwear-editor-save').click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByTestId('fitting-footwear-hint')).toHaveText(
    'Worn on every clothed still: red suede ankle boots.'
  );
  // Kept in My shoes too.
  await expect(page.getByTestId('fitting-footwear-saved')).toContainText('Saved shoes · 1');
});
