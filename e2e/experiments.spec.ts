import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';

test.describe('Studio experiments', { tag: '@classic' }, () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('experiments tab renders dashboard', async ({ page }) => {
    await gotoStable(page, '/studio?tab=experiments');
    await expect(page.getByRole('heading', { name: 'Experiment dashboard' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh experiments' })).toBeVisible();
  });

  test('vision rank control is available on experiment groups', async ({ page }) => {
    await gotoStable(page, '/studio?tab=experiments');
    await expect(page.getByRole('heading', { name: 'Experiment dashboard' })).toBeVisible();
    const rankButton = page.getByRole('button', { name: 'Rank with vision' });
    if ((await rankButton.count()) > 0) {
      await expect(rankButton.first()).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'No experiment groups yet' })).toBeVisible();
    }
  });
});
