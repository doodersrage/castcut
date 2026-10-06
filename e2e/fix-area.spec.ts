import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { ensureAuthenticated } from './helpers/auth';
import { seedGalleryLightboxFixtures } from './helpers/gallery';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Fix an area with ComfyUI stubbed at the app's edge: the brush paints a mask, Fix queues two
 * candidates, one is used, and the original stays in the Gallery beside the fix. Also: the
 * takes outlive a closed dialog (chip, toast, Compare), zoom and the before / after wipe, and
 * Fix the face.
 *
 * Runs on the production server (CI) and, unchanged, on `next dev` (React StrictMode: every
 * effect mounts, cleans up and mounts again). The `cancelled` count below is what the dev-only
 * bug of 2026-10-05 would trip — a closed flag left set by the double mount cancelled both takes
 * the moment Fix queued them. See docs/release-2.3-test-checklist.md (2.4) for the dev run.
 */

async function stubComfy(
  page: Page,
  options?: { pollsUntilDone?: number; face?: boolean }
) {
  const pollsUntilDone = options?.pollsUntilDone ?? 2;
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
  const cancelled: string[][] = [];
  const polls = new Map<string, number>();
  let fixes = 0;
  await page.route('**/api/fix-area**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (Array.isArray(body.cancel)) {
        cancelled.push(body.cancel as string[]);
        return route.fulfill({ json: { cancelled: true } });
      }
      queued.push(body);
      fixes += 1;
      return route.fulfill({
        json: {
          available: true,
          jobs: [
            { promptId: `fix-e2e-${fixes}-a`, seed: 11 },
            { promptId: `fix-e2e-${fixes}-b`, seed: 22 },
          ],
          reference: 'grey',
          denoise: 1,
          coverage: 0.05,
          identity: body.mode === 'face',
          ...(body.mode === 'face' ? {} : {}),
        },
      });
    }
    const promptId = new URL(request.url()).searchParams.get('promptId') ?? '';
    const count = (polls.get(promptId) ?? 0) + 1;
    polls.set(promptId, count);
    if (count < pollsUntilDone) return route.fulfill({ json: { status: 'running' } });
    return route.fulfill({
      json: {
        status: 'done',
        image: {
          filename: promptId.endsWith('-a') ? 'Castcut-fix_00001_.png' : 'Castcut-fix_00002_.png',
          subfolder: '',
          type: 'output',
        },
      },
    });
  });
  if (options?.face) {
    // The face detector: a face in the upper middle of the (96×128) fixture.
    await page.route('**/api/face-locate', route =>
      route.fulfill({
        json: { available: true, face: { x: 30, y: 20, width: 36, height: 40 } },
      })
    );
  }
  return { queued, polls, cancelled };
}

async function openFixDialog(page: Page) {
  const openButtons = page.getByRole('button', { name: 'Open image preview' });
  await expect(openButtons.first()).toBeVisible({ timeout: 15_000 });
  const before = await openButtons.count();
  await openButtons.first().click();
  const lightbox = page.getByTestId('image-lightbox');
  await expect(lightbox).toBeVisible({ timeout: 15_000 });
  await lightbox.getByTestId('lightbox-fix-area').click();
  const dialog = page.getByTestId('fix-area-dialog');
  await expect(dialog).toBeVisible();
  return { openButtons, before, lightbox, dialog };
}

async function paintStroke(page: Page, dialog: ReturnType<Page['getByTestId']>) {
  const canvas = dialog.getByTestId('fix-area-canvas');
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.5, { steps: 6 });
  await page.mouse.up();
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

  const { openButtons, before, lightbox, dialog } = await openFixDialog(page);
  const submit = dialog.getByTestId('fix-area-submit');
  await expect(submit).toBeDisabled();

  // Brush size from the keyboard (slider), then paint a stroke with the mouse.
  const slider = dialog.getByTestId('fix-area-brush-size');
  await slider.focus();
  const sizeBefore = Number(await slider.inputValue());
  await page.keyboard.press('ArrowRight');
  await expect(slider).not.toHaveValue(String(sizeBefore));
  // The smallest brush: the fixture is tiny, and the zoom check below needs a small area.
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('6');

  await paintStroke(page, dialog);
  await expect(submit).toBeEnabled();

  // Clear empties the mask; Erase over a fresh stroke can too — paint again for the fix.
  await dialog.getByTestId('fix-area-clear').click();
  await expect(submit).toBeDisabled();
  await paintStroke(page, dialog);
  await dialog.getByTestId('fix-area-erase').click();
  await expect(dialog.getByTestId('fix-area-erase')).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByTestId('fix-area-paint').click();
  await expect(submit).toBeEnabled();

  await dialog.getByTestId('fix-area-text').fill('a plain wall');
  await submit.click();

  // One Fix → two jobs, each polled to the end. Nothing is cancelled on the way (the dev
  // double-mount bug cancelled both takes here).
  await expect(dialog.getByTestId('fix-area-candidate-0')).toBeVisible();
  await expect(dialog.getByTestId('fix-area-candidate-1')).toBeVisible();
  await expect(dialog.getByTestId('fix-area-original')).toBeVisible();
  expect(comfy.queued).toHaveLength(1);
  expect(String(comfy.queued[0]!.mask)).toMatch(/^data:image\/png;base64,/);
  expect(comfy.queued[0]!.text).toBe('a plain wall');
  expect(comfy.queued[0]!.mode).toBeUndefined();
  expect(String(comfy.queued[0]!.imageUrl)).toContain('filename=e2e-fixture');
  await expect(dialog.getByTestId('fix-area-use-0')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId('fix-area-use-1')).toBeVisible({ timeout: 15_000 });
  expect(comfy.polls.get('fix-e2e-1-a')).toBeGreaterThanOrEqual(2);
  expect(comfy.polls.get('fix-e2e-1-b')).toBeGreaterThanOrEqual(2);
  expect(comfy.cancelled).toHaveLength(0);

  // The painted area is shown over the original, both takes and the wipe's two layers; the
  // switch hides it.
  await expect(dialog.getByTestId('fix-area-area-overlay')).toHaveCount(5);
  await dialog.getByTestId('fix-area-show-area').uncheck();
  await expect(dialog.getByTestId('fix-area-area-overlay')).toHaveCount(0);
  await dialog.getByTestId('fix-area-show-area').check();

  // Zoom to the area crops every picture to the painted box (the same window on each).
  const pictures = dialog.getByTestId('fix-area-picture');
  await expect(pictures.first()).toHaveCSS('left', '0px');
  await dialog.getByTestId('fix-area-zoom').check();
  const widths = await pictures.evaluateAll(nodes =>
    nodes.map(node => (node as HTMLElement).style.width)
  );
  expect(widths.length).toBeGreaterThanOrEqual(4);
  // Every picture is scaled up by the same window (a stroke never fills the whole still).
  expect(parseFloat(widths[0]!)).toBeGreaterThan(100);
  expect(new Set(widths).size).toBe(1);
  await dialog.getByTestId('fix-area-zoom').uncheck();
  await expect(pictures.first()).toHaveCSS('left', '0px');

  // The before / after wipe: take 1 by default, the slider moves the reveal, take 2 on click.
  const wipe = dialog.getByTestId('fix-area-wipe');
  await expect(wipe).toContainText('Take 1');
  const wipeSlider = dialog.getByTestId('fix-area-wipe-slider');
  await wipeSlider.focus();
  await page.keyboard.press('End');
  await expect(wipeSlider).toHaveValue('100');
  await expect(dialog.getByTestId('fix-area-wipe-after')).toHaveCSS('clip-path', 'inset(0px 0% 0px 0px)');
  await dialog.getByTestId('fix-area-compare-1').click();
  await expect(wipe).toContainText('Take 2');

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

  const { openButtons, before, lightbox, dialog } = await openFixDialog(page);
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
  // Nothing tracked: no chip, no toast.
  await expect(page.getByTestId('fix-area-chip')).toHaveCount(0);
});

test('closing the dialog while the takes render keeps them: chip, toast, Compare, Use this', async ({
  page,
}) => {
  // Many polls before "done", so the dialog is closed with both takes still rendering.
  const comfy = await stubComfy(page, { pollsUntilDone: 5 });
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  const { openButtons, before, lightbox, dialog } = await openFixDialog(page);
  await paintStroke(page, dialog);
  await dialog.getByTestId('fix-area-submit').click();
  await expect(dialog.getByTestId('fix-area-candidate-0')).toHaveAttribute('data-status', /queued|running/);
  await expect(dialog).toContainText('Close this and keep working');
  await dialog.getByTestId('fix-area-close').click();
  await expect(dialog).toHaveCount(0);
  expect(comfy.cancelled).toHaveLength(0);

  // The lightbox shows the chip while they render, then the landed state.
  const chip = lightbox.getByTestId('lightbox-fix-area-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText(/Fixing… \d of 2/);
  await expect(chip).toContainText('Fix ready — compare', { timeout: 20_000 });
  await expect(page.getByText(/Fix ready — compare/).first()).toBeVisible();
  expect(comfy.polls.get('fix-e2e-1-a')).toBeGreaterThanOrEqual(5);

  // Compare reopens the results with both takes; Use this swaps it in.
  await chip.click();
  const resumed = page.getByTestId('fix-area-dialog');
  await expect(resumed).toBeVisible();
  await expect(resumed).toHaveAttribute('data-phase', 'results');
  await expect(resumed.getByTestId('fix-area-use-0')).toBeVisible();
  await expect(resumed.getByTestId('fix-area-use-1')).toBeVisible();
  await expect(resumed.getByTestId('fix-area-area-overlay')).toHaveCount(5);
  await resumed.getByTestId('fix-area-use-0').click();
  await expect(resumed).toHaveCount(0);
  await expect(lightbox.getByTestId('lightbox-fix-area-chip')).toHaveCount(0);
  await expect(page.getByText(/Fixed area added to the Gallery/)).toBeVisible({ timeout: 10_000 });
  await lightbox.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(openButtons).toHaveCount(before + 1, { timeout: 15_000 });
  expect(comfy.cancelled).toHaveLength(0);
});

test('Fix the face paints the detected face and runs the fix with the Cast face as reference', async ({
  page,
}) => {
  const comfy = await stubComfy(page, { face: true });
  await seedGalleryLightboxFixtures(page);
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);

  const { dialog } = await openFixDialog(page);
  await expect(dialog.getByTestId('fix-area-submit')).toBeDisabled();
  await dialog.getByTestId('fix-area-fix-face').click();
  await expect(dialog.getByTestId('fix-area-candidate-0')).toBeVisible({ timeout: 15_000 });
  expect(comfy.queued).toHaveLength(1);
  expect(comfy.queued[0]!.mode).toBe('face');
  expect(String(comfy.queued[0]!.mask)).toMatch(/^data:image\/png;base64,/);
  await expect(dialog).toContainText('Fix the face');
  await expect(dialog.getByTestId('fix-area-use-0')).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByTestId('fix-area-identity-note')).toContainText(
    "Drawn with the Cast's face as the reference"
  );
  // The painted box is the face, not a stroke: the zoom window is available.
  await expect(dialog.getByTestId('fix-area-zoom')).toBeEnabled();
  await dialog.getByTestId('fix-area-keep-original').click();
  await expect(dialog).toHaveCount(0);
});
