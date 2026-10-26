import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureStudioWorkspace } from './helpers/gallery';
import { replaceGalleryIdb } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * R8: a job Castcut gave up on ("Timed out waiting for ComfyUI") that ComfyUI finished anyway is
 * found again when the app opens, and lands; a real failure stays, tagged as one.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const TIMED_OUT =
  'Timed out waiting for ComfyUI — open Queue to claim orphans or import history, or run Heal & ready if the host restarted.';

test('a timed-out job ComfyUI finished is found again; a real failure stays', async ({ page }) => {
  let asked = 0;
  await page.context().route(/\/api\/comfyui\/jobs\?/, async route => {
    const promptId = new URL(route.request().url()).searchParams.get('promptId');
    if (promptId === 'e2e-late-finish') {
      asked += 1;
      await route.fulfill({
        json: {
          status: {
            status: 'completed',
            statusMessage: 'Completed',
            comfyUrl: 'http://127.0.0.1:8188',
            images: [{ filename: 'e2e-late.png', subfolder: '', type: 'output' }],
          },
        },
      });
      return;
    }
    await route.fulfill({ json: { status: { status: 'error', statusMessage: 'not found' } } });
  });
  await page.context().route(/\/api\/comfyui\/view/, route =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
    })
  );

  await ensureStudioWorkspace(page);
  await page.goto('/queue');
  const now = Date.now();
  const base = {
    prompt: 'e2e queue recovery',
    tool: 'generate',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'error',
    images: [],
  };
  await replaceGalleryIdb(page, [
    {
      ...base,
      id: 'e2e-late-entry',
      promptId: 'e2e-late-finish',
      statusMessage: TIMED_OUT,
      queuedAt: now - 120_000,
      completedAt: now - 60_000,
    },
    {
      ...base,
      id: 'e2e-broken-entry',
      promptId: 'e2e-broken',
      statusMessage: 'KSampler: CUDA out of memory',
      queuedAt: now - 90_000,
      completedAt: now - 80_000,
    },
  ]);

  // The app opens with them: the one ComfyUI finished is asked about and leaves the failed list.
  await gotoStable(page, '/queue');
  await dismissBlockingOverlays(page);
  await expect.poll(() => asked, { timeout: 60_000 }).toBeGreaterThan(0);
  const outcomes = page.getByTestId('queue-failed-outcome');
  await expect(outcomes).toHaveCount(1, { timeout: 60_000 });
  await expect(outcomes.first()).toHaveAttribute('data-outcome', 'failed');
  await expect(outcomes.first()).toHaveText('Failed');
});
