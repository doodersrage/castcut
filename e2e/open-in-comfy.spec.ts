import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { ensureStudioWorkspace } from './helpers/gallery';
import { replaceGalleryIdb } from './helpers/idb';
import { gotoStable, openComfyUiSettingsTab } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

const GRAPH = {
  '1': { class_type: 'UNETLoader', inputs: { unet_name: 'model.safetensors', weight_dtype: 'default' } },
  '2': { class_type: 'LoadImage', inputs: { image: 'castcut-plate.png' } },
  '3': {
    class_type: 'KSampler',
    inputs: { model: ['1', 0], seed: 7, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 },
  },
};

const ENTRY = {
  id: 'e2e-open-in-comfy',
  promptId: 'e2e-open-prompt',
  prompt: 'open in comfy fixture',
  model: 'qwen-image-edit-2511-lightning-8',
  tool: 'day',
  comfyUrl: 'http://127.0.0.1:8188',
  status: 'completed',
  queuedAt: Date.now(),
  completedAt: Date.now(),
  hasStoredWorkflow: true,
  workflowJson: JSON.stringify(GRAPH),
  images: [{ filename: 'e2e-open.png', subfolder: '', type: 'output' }],
};

test.beforeEach(async ({ page }) => {
  // The server's gallery would replace the seeded entry (and its stored graph).
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('gallery Open in ComfyUI saves the stored graph and opens a tab', async ({ page, context }) => {
  let saved: { prompt?: unknown; tool?: string; promptId?: string } | null = null;
  await page.route(/\/api\/comfyui\/editor-workflows/, async route => {
    if (route.request().method() !== 'POST') return route.continue();
    saved = route.request().postDataJSON() as typeof saved;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        comfyUrl: 'about:blank#comfyui',
        file: 'day-2026-10-03-e2eopenp.json',
        path: 'workflows/Castcut/day-2026-10-03-e2eopenp.json',
        missingNodeTypes: [],
      }),
    });
  });

  await ensureStudioWorkspace(page);
  await replaceGalleryIdb(page, [ENTRY]);
  await gotoStable(page, '/gallery');
  await replaceGalleryIdb(page, [ENTRY]);
  await page.reload();
  await dismissBlockingOverlays(page);

  const menu = page.getByTestId('gallery-card-menu').first();
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.click();
  const menuPanel = page.getByRole('menu');
  await menuPanel.locator('summary', { hasText: 'Export' }).click();
  const open = menuPanel.getByTestId('gallery-open-in-comfy');
  await expect(open).toBeVisible({ timeout: 10_000 });

  const popup = context.waitForEvent('page');
  await open.click();
  await popup;

  await expect.poll(() => saved?.promptId ?? '', { timeout: 15_000 }).toBe(ENTRY.promptId);
  expect(saved?.tool).toBe('day');
  expect(saved?.prompt).toEqual(GRAPH);
});

test('Settings lists Castcut workflows and diffs the sampler change', async ({ page }) => {
  await page.route(/\/api\/comfyui\/editor-workflows/, async route => {
    const url = new URL(route.request().url());
    const file = url.searchParams.get('file');
    if (!file) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          files: [{ name: 'day-2026-10-03-e2eopenp.json', modified: Date.now() }],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        file,
        edited: {
          ...GRAPH,
          '3': { class_type: 'KSampler', inputs: { ...GRAPH['3'].inputs, steps: 12, cfg: 2 } },
        },
        castcut: { version: 1, tool: 'day', createdAt: Date.now(), apiPrompt: GRAPH },
      }),
    });
  });

  await gotoStable(page, '/settings?tab=comfyui&section=connection');
  await openComfyUiSettingsTab(page);
  await page.locator('summary', { hasText: 'Import a workflow from ComfyUI' }).click();
  await page.getByTestId('comfy-editor-import-list').click();
  await page.getByRole('button', { name: /day-2026-10-03-e2eopenp\.json/ }).click();
  const diff = page.getByTestId('comfy-editor-import-diff');
  await expect(diff).toContainText('Steps');
  await expect(diff).toContainText('CFG');
  await expect(page.getByTestId('comfy-editor-import-apply')).toHaveText(/steps 12 · CFG 2/);
});
