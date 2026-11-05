import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';
import { ensureStudioWorkspace } from './helpers/gallery';
import { replaceGalleryIdb } from './helpers/idb';

/**
 * Parity tools (2026-11-04): Gallery ⋯ → Clip → Remove or replace…, and a still's Make it move →
 * Motion brush…. ComfyUI is faked: the dialogs' requests are checked, the jobs answered.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const STILL = readFileSync(join(__dirname, '..', 'public', 'samples', 'day-morning.webp'));
// VP9 (Playwright's Chromium has no H.264): the dialog reads its first frame to paint on.
const CLIP = readFileSync(join(__dirname, 'fixtures', 'clip-1s.webm'));

function job(tool: string, status: 'running' | 'completed', url?: string) {
  return {
    id: `e2e-${tool}`,
    tool,
    status,
    done: status === 'completed' ? 1 : 0,
    total: 1,
    note: status === 'completed' ? 'Done' : 'Working',
    startedAt: Date.now(),
    ...(url ? { url } : {}),
  };
}

async function openGallery(page: Page, entry: Record<string, unknown>) {
  await ensureStudioWorkspace(page);
  await replaceGalleryIdb(page, [entry]);
  await gotoStable(page, '/gallery');
  await replaceGalleryIdb(page, [entry]);
  await page.reload();
  await dismissBlockingOverlays(page);
  const menu = page.getByTestId('gallery-card-menu').first();
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.click();
  return page.getByRole('menu');
}

/** Drags across a box from (x1, y1) to (x2, y2), as fractions of it. */
async function drag(page: Page, box: { x: number; y: number; width: number; height: number }, from: [number, number], to: [number, number]) {
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  for (let step = 1; step <= 8; step += 1) {
    const t = step / 8;
    await page.mouse.move(
      box.x + box.width * (from[0] + (to[0] - from[0]) * t),
      box.y + box.height * (from[1] + (to[1] - from[1]) * t)
    );
  }
  await page.mouse.up();
}

test('Motion brush: a drawn path and a pin go up with the still', async ({ page }) => {
  await page.route('**/api/comfyui/view**', route =>
    route.fulfill({ contentType: 'image/webp', body: STILL })
  );
  const posts: Array<Record<string, unknown>> = [];
  await page.route('**/api/clip/motion', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ json: { job: job('motion', 'running') } });
  });
  await page.route('**/api/clip/jobs**', route =>
    route.fulfill({ json: { job: job('motion', 'completed', '/e2e-moved.mp4') } })
  );
  const panel = await openGallery(page, {
    id: 'e2e-motion-still',
    promptId: 'e2e-motion-prompt',
    prompt: 'a woman by a window',
    tool: 'day',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: Date.now(),
    completedAt: Date.now(),
    // .png: a .webp in the Gallery reads as a clip (WAN saves animated WebP), with no still menu.
    images: [{ filename: 'e2e-motion.png', subfolder: '', type: 'output' }],
  });
  await panel.locator('summary', { hasText: 'Make it move' }).click();
  await panel.getByTestId('gallery-still-tool-motion-brush').click();
  const dialog = page.getByTestId('motion-brush-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('motion-brush-go')).toBeDisabled();
  const canvas = dialog.getByTestId('motion-brush-canvas');
  await expect(canvas.locator('img')).toHaveJSProperty('complete', true);
  const box = (await canvas.boundingBox())!;
  await drag(page, box, [0.3, 0.6], [0.6, 0.3]);
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8);
  await expect(dialog).toContainText('1 path(s), 1 pin(s)');
  await dialog.getByTestId('motion-brush-prompt').fill('she raises her hand');
  await dialog.getByTestId('motion-brush-go').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => posts.length, { timeout: 30_000 }).toBe(1);
  const strokes = posts[0]!.strokes as Array<Array<{ x: number; y: number }>>;
  expect(strokes).toHaveLength(2);
  expect(strokes[0]!.length).toBeGreaterThan(2);
  expect(strokes[0]![0]!.x).toBeLessThan(strokes[0]!.at(-1)!.x);
  expect(strokes[1]).toHaveLength(1);
  expect(posts[0]!.prompt).toBe('she raises her hand');
});

test('Remove or replace: painted on the first frame, with words and tracking off', async ({ page }) => {
  await page.route('**/api/comfyui/view**', route =>
    route.fulfill({ contentType: 'video/webm', body: CLIP })
  );
  let posted = '';
  await page.route('**/api/clip/remove', route => {
    posted = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({ json: { job: job('remove', 'running') } });
  });
  await page.route('**/api/clip/jobs**', route =>
    route.fulfill({ json: { job: job('remove', 'completed', '/e2e-removed.mp4') } })
  );
  const panel = await openGallery(page, {
    id: 'e2e-remove-clip',
    promptId: 'e2e-remove-prompt',
    prompt: 'a woman talking',
    tool: 'day',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: Date.now(),
    completedAt: Date.now(),
    images: [{ filename: 'e2e-remove.mp4', subfolder: '', type: 'output', format: 'video/mp4' }],
  });
  await panel.locator('summary', { hasText: 'Clip' }).click();
  await panel.getByTestId('gallery-clip-tool-remove').click();
  const dialog = page.getByTestId('clip-remove-dialog');
  await expect(dialog).toBeVisible();
  const canvas = dialog.locator('canvas').first();
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByTestId('clip-remove-go')).toBeDisabled();
  const box = (await canvas.boundingBox())!;
  await drag(page, box, [0.4, 0.4], [0.6, 0.5]);
  await dialog.getByTestId('clip-remove-words').fill('a vase of flowers');
  await expect(dialog.getByTestId('clip-remove-go')).toHaveText('Replace it');
  await dialog.getByTestId('clip-remove-track').uncheck();
  await dialog.getByTestId('clip-remove-go').click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => posted.length, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(posted).toContain('name="mask"');
  expect(posted).toContain('a vase of flowers');
  expect(posted).toMatch(/name="track"\r\n\r\nfalse/);
});
