import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('roleplay still/clip toggle is visible', async ({ page }) => {
  // Story only shows beat controls once a Cast lead exists.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-rp-toggle', name: 'RP Toggle', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-prompt-tool-settings-v1',
      JSON.stringify({ shared: { activeCharacterId: 'e2e-rp-toggle' }, tools: {} })
    );
  });
  await gotoStable(page, '/story?character=e2e-rp-toggle');
  await expect(page.getByRole('heading', { name: /^Story$/i, level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Still', exact: true })).toBeVisible();
  const clip = page.getByRole('button', { name: 'Clip', exact: true });
  await expect(clip).toBeVisible();
  await clip.click();
  await expect(clip).toHaveAttribute('data-active', 'true');
});

test('video tool exposes the extend clip chip', async ({ page }) => {
  await gotoStable(page, '/video');
  await expect(page.getByRole('heading', { name: /^Video$/i })).toBeVisible({
    timeout: 30_000,
  });
  const extend = page.getByRole('button', { name: 'Extend clip', exact: true });
  await expect(extend).toBeVisible();
  await extend.click();
  await expect(extend).toHaveAttribute('data-active', 'true');
  await expect(page.getByText(/Parent clip/i).first()).toBeVisible();
});
