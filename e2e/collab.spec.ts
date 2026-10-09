import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';

async function expectCollabPresenceBar(page: Page): Promise<void> {
  // Alone in the default room the bar is a "Collaborate…" link until opened.
  const open = page.getByTestId('collab-open');
  const room = page.getByRole('combobox', { name: 'Collab room' });
  await expect(open.or(room)).toBeVisible({ timeout: 15_000 });
  // Another test joining the room expands the bar on its own — the link can vanish mid-click.
  if (await open.isVisible()) {
    await open.click({ timeout: 3_000 }).catch(() => undefined);
  }
  await expect(page.getByRole('combobox', { name: 'Collab room' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText('Live', { exact: true })).toBeVisible();
}

test.describe('Shared-project collab', () => {
  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
  });

  test('collab presence bar renders on Compose', async ({ page }) => {
    await gotoStable(page, '/compose');
    await expectCollabPresenceBar(page);
  });

  test('collab apply draft control appears when remote draft is signaled', async ({ page }) => {
    await gotoStable(page, '/compose');
    await expectCollabPresenceBar(page);
    await page.evaluate(() => {
      const channel = new BroadcastChannel('cps-collab-default');
      channel.postMessage({
        type: 'draft',
        payload: {
          projectId: 'default',
          peerId: 'remote-peer',
          tool: 'compose',
          draft: 'remote instruction draft',
          fields: { instruction: 'remote instruction draft' },
          changedFields: ['instruction'],
          // Must beat local draft timestamp + 250ms skew guard.
          updatedAt: Date.now() + 5_000,
        },
      });
      channel.close();
    });
    await expect(page.getByRole('button', { name: 'Apply draft' })).toBeVisible({
      timeout: 10_000,
    });
  });
});
