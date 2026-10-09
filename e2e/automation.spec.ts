import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable, revealFullSettings } from './helpers/navigation';

test.describe('Settings automation', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  // Scheduled batches run Generate: Prompt Studio's (the classic app).
  test('automation hub and scheduled batch controls render', { tag: '@classic' }, async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await expect(page.getByRole('heading', { name: 'Automation hub' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Scheduled batch' })).toBeVisible();
    // getByLabel also matches hidden elements: while the page streams, React can hold a hidden
    // copy of the tab (the <div hidden id="S:0"> segment) next to the one on screen, and a
    // strict locator then sees two checkboxes. Only the visible ones count.
    await expect(
      page.getByLabel('Enable browser scheduled batch').filter({ visible: true })
    ).toBeVisible();
    await expect(page.getByLabel(/Best-of-N ranking/i).filter({ visible: true })).toBeVisible();
    await expect(page.getByText(/Vision-rank queued outputs/i).filter({ visible: true })).toBeVisible();
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

  test('vision-rank checkbox toggles when best-of-N is set', { tag: '@classic' }, async ({ page }) => {
    await gotoStable(page, '/settings?tab=automation');
    await revealFullSettings(page);
    const scheduled = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Scheduled batch', exact: true }) });
    await expect(scheduled.getByRole('heading', { name: 'Scheduled batch' })).toBeVisible();
    const bestOfN = scheduled.getByLabel(/Best-of-N ranking/i);
    const autoQueue = scheduled.getByLabel(/Auto-queue to ComfyUI/i);
    const vision = scheduled.getByLabel(/Vision-rank queued outputs/i);
    // Vision-rank stays disabled until auto-queue is on. Settings that finish loading after
    // the first clicks put both controls back (seen only under a full parallel run), so set
    // them until they hold.
    await expect(async () => {
      await bestOfN.selectOption('3');
      await autoQueue.check();
      await expect(vision).toBeEnabled({ timeout: 2_000 });
    }).toPass({ timeout: 30_000 });
    await vision.check();
    await expect(vision).toBeChecked();
  });
});
