import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { ensureAuthenticated } from './helpers/auth';
import { seedGalleryLightboxFixtures } from './helpers/gallery';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Fix an area with ComfyUI stubbed at the app's edge: the brush paints a mask, Fix queues two
 * candidates, one is used, and the original stays in the Gallery beside the fix.
 */

async function stubComfy(page: Page) {
  const still = await sharp({
    create: { width: 96, height: 128, channels: 3, background: { r: 90, g: 120, b: 160 } },
  })
    .png()
    .toBuffer();
  const fixed = await sharp({
    create: { width: 96, height: 128, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .png()
    .toBuffer();
  await page.route(url => url.pathname === '/api/comfyui/view', route => {
    const name = new URL(route.request().url()).searchParams.get('filename') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: name.startsWith('Castcut-fix') ? fixed : still,
    });
  });
  const queued: Array<Record<string, unknown>> = [];
  const polls = new Map<string, number>();
  await page.route('**/api/fix-area**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (Array.isArray(body.cancel)) {
        return route.fulfill({ json: { cancelled: true } });
      }
      queued.push(body);
      return route.fulfill({
        json: {
          available: true,
          jobs: [
            { promptId: 'fix-e2e-a', seed: 11 },
            { promptId: 'fix-e2e-b', seed: 22 },
          ],
          reference: 'grey',
          denoise: 1,
          coverage: 0.05,
        },
      });
    }
    const promptId = new URL(request.url()).searchParams.get('promptId') ?? '';
    const count = (polls.get(promptId) ?? 0) + 1;
    polls.set(promptId, count);
    if (count < 2) return route.fulfill({ json: { status: 'running' } });
    return route.fulfill({
      json: {
        status: 'done',
        image: {
          filename: promptId === 'fix-e2e-a' ? 'Castcut-fix_00001_.png' : 'Castcut-fix_00002_.png',
          subfolder: '',
          type: 'output',
        },
      },
    });
  });
  return { queued, polls };
}

// The gallery service worker answers /api/comfyui/view itself — page.route would never see it.
test.use({ serviceWorkers: 'block' });

test.beforeEach(async ({ page }) => {
  // A used fix is pushed to the shared server's Gallery; other tests must not pull it.
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('Gallery lightbox: paint, Fix queues two candidates, Use this keeps the original', async ({
  page,
}) => {
  const comfy = await stubComfy(page);
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  const openButtons = page.getByRole('button', { name: 'Open image preview' });
  await expect(openButtons.first()).toBeVisible({ timeout: 15_000 });
  const before = await openButtons.count();
  await openButtons.first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });

  await lightbox.getByTestId('lightbox-fix-area').click();
  const dialog = page.getByTestId('fix-area-dialog');
  await expect(dialog).toBeVisible();
  const submit = dialog.getByTestId('fix-area-submit');
  await expect(submit).toBeDisabled();

  // Brush size from the keyboard (slider), then paint a stroke with the mouse.
  const slider = dialog.getByTestId('fix-area-brush-size');
  await slider.focus();
  const sizeBefore = Number(await slider.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(slider).not.toHaveValue(String(sizeBefore));

  const canvas = dialog.getByTestId('fix-area-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const paint = async () => {
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 6 });
    await page.mouse.up();
  };
  await paint();
  await expect(submit).toBeEnabled();

  // Clear empties the mask; Erase over a fresh stroke can too — paint again for the fix.
  await dialog.getByTestId('fix-area-clear').click();
  await expect(submit).toBeDisabled();
  await paint();
  await dialog.getByTestId('fix-area-erase').click();
  await expect(dialog.getByTestId('fix-area-erase')).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByTestId('fix-area-paint').click();
  await expect(submit).toBeEnabled();

  await dialog.getByTestId('fix-area-text').fill('a plain wall');
  await submit.click();

  // One Fix → two jobs, each polled to the end.
  await expect(dialog.getByTestId('fix-area-candidate-0')).toBeVisible();
  await expect(dialog.getByTestId('fix-area-candidate-1')).toBeVisible();
  await expect(dialog.getByTestId('fix-area-original')).toBeVisible();
  expect(comfy.queued).toHaveLength(1);
  expect(String(comfy.queued[0]!.mask)).toMatch(/^data:image\/png;base64,/);
  expect(comfy.queued[0]!.text).toBe('a plain wall');
  expect(String(comfy.queued[0]!.imageUrl)).toContain('filename=e2e-fixture');
  await expect(dialog.getByTestId('fix-area-use-0')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId('fix-area-use-1')).toBeVisible({ timeout: 15_000 });
  expect(comfy.polls.get('fix-e2e-a')).toBeGreaterThanOrEqual(2);
  expect(comfy.polls.get('fix-e2e-b')).toBeGreaterThanOrEqual(2);

  await dialog.getByTestId('fix-area-use-1').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/Fixed area added to the Gallery/)).toBeVisible({ timeout: 10_000 });

  await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(lightbox).toHaveCount(0);
  // The fix joined the Gallery; the original (and the other fixture) are still there.
  await expect(openButtons).toHaveCount(before + 1, { timeout: 15_000 });
});

test('Keep original discards the candidates and changes nothing', async ({ page }) => {
  const comfy = await stubComfy(page);
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  const openButtons = page.getByRole('button', { name: 'Open image preview' });
  await expect(openButtons.first()).toBeVisible({ timeout: 15_000 });
  const before = await openButtons.count();
  await openButtons.first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await lightbox.getByTestId('lightbox-fix-area').click();
  const dialog = page.getByTestId('fix-area-dialog');
  const canvas = dialog.getByTestId('fix-area-canvas');
  await expect(canvas).toBeVisible();
  // Keyboard: focus the canvas, ] grows the brush; touch-style tap paints.
  await canvas.focus();
  await page.keyboard.press(']');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await dialog.getByTestId('fix-area-submit').click();
  await expect(dialog.getByTestId('fix-area-use-0')).toBeVisible({ timeout: 15_000 });
  expect(comfy.queued).toHaveLength(1);
  await dialog.getByTestId('fix-area-keep-original').click();
  await expect(dialog).toHaveCount(0);
  // Escape now belongs to the lightbox again.
  await page.keyboard.press('Escape');
  await expect(lightbox).toHaveCount(0);
  await expect(openButtons).toHaveCount(before);
});
