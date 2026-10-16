import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable, revealFullSettings } from './helpers/navigation';

test.describe('Settings automation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('Castcut has no scheduled batch (Prompt Studio runs Generate on a schedule)', async ({
    page,
  }) => {
    await gotoStable(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: 'Automation hub' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scheduled batch' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'User scheduled campaign' })).toHaveCount(0);
  });

  test('webhook settings section is reachable', async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: 'Webhooks' })).toBeVisible();
    await expect(page.getByLabel('Enable webhooks').filter({ visible: true })).toBeVisible();
  });
});
