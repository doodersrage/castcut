import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/** M2 C5: Settings → Data says what each continuity check found and what it missed. */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('how good the checks are: findings per check, and renders no check caught', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const now = Date.now();
    const base = {
      comfyUrl: 'http://127.0.0.1:8188',
      tool: 'image-prompt',
      prompt: 'Edit instruction for a Day still: e2e',
      status: 'completed',
      queuedAt: now - 60_000,
      completedAt: now - 30_000,
      images: [],
    };
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        { ...base, id: 'q1', promptId: 'q1', playChecks: { faceMiss: true, face: 0.3, at: now } },
        { ...base, id: 'q2', promptId: 'q2', playChecks: { faceMiss: true, at: now } },
        { ...base, id: 'q3', promptId: 'q3', playerVerdict: { verdict: 'looks-wrong', at: now } },
      ])
    );
  });
  await gotoStable(page, '/settings?tab=data');
  await dismissBlockingOverlays(page);
  const face = page.getByTestId('check-quality-face-miss');
  await expect(face).toBeVisible({ timeout: 30_000 });
  await expect(face.locator('td').nth(1)).toHaveText('2');
  await expect(face.locator('td').nth(4)).toHaveText('2');
  await expect(page.getByTestId('check-quality-missed')).toContainText('1 render you marked');
});
