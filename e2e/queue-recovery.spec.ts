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

// H1 (ROADMAP §10): a batch cancelled while one of its jobs is rendering — every job is asked
// to stop, each shows as cancelled, and nothing is left waiting.
test('cancelling a batch while a job renders cancels every job in it', async ({ page }) => {
  const cancelled: string[] = [];
  await page.context().route(/\/api\/comfyui\/jobs\?/, route => {
    const promptId = new URL(route.request().url()).searchParams.get('promptId') ?? '';
    return route.fulfill({
      json: {
        status: cancelled.includes(promptId)
          ? { status: 'error', statusMessage: 'Cancelled' }
          : { status: promptId === 'e2e-batch-1' ? 'running' : 'pending', queuePosition: 1 },
      },
    });
  });
  await page.context().route(/\/api\/comfyui\/(cancel|interrupt|queue\/delete|history)/, route => {
    const body = route.request().postDataJSON() as { promptId?: string; promptIds?: string[] };
    for (const id of [body?.promptId, ...(body?.promptIds ?? [])]) if (id) cancelled.push(id);
    return route.fulfill({ json: { ok: true } });
  });

  await ensureStudioWorkspace(page);
  await page.goto('/queue');
  const now = Date.now();
  const job = (n: number, status: string) => ({
    id: `e2e-batch-entry-${n}`,
    promptId: `e2e-batch-${n}`,
    prompt: `e2e batch ${n}`,
    tool: 'generate',
    comfyUrl: 'http://127.0.0.1:8188',
    status,
    images: [],
    queuedAt: now - 60_000 + n * 1000,
  });
  await replaceGalleryIdb(page, [job(1, 'running'), job(2, 'pending'), job(3, 'pending')]);
  await gotoStable(page, '/queue');
  await dismissBlockingOverlays(page);

  const batch = page.getByTestId('queue-batch');
  await expect(batch).toContainText('3 jobs', { timeout: 60_000 });
  await batch.getByTestId('queue-cancel-batch').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByText('Cancelled 3 of 3 jobs.')).toBeVisible({ timeout: 30_000 });
  expect(new Set(cancelled)).toEqual(new Set(['e2e-batch-1', 'e2e-batch-2', 'e2e-batch-3']));
  await expect(batch).toHaveCount(0, { timeout: 30_000 });
});
