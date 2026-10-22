import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedGalleryFixture } from './helpers/gallery';
import {
  gotoStable,
  openComfyUiSettingsTab,
  pageMain,
  revealFullSettings,
} from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('home opens Film (Generate is Prompt Studio\'s)', async ({ page }) => {
  await gotoStable(page, '/');
  await expect(page).toHaveURL(/\/play(?:[?#].*)?$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /^Your film$/i })).toBeVisible({ timeout: 60_000 });
});

test('dashboard page loads', async ({ page }) => {
  await gotoStable(page, '/dashboard');
  await expect(page.getByRole('heading', { name: /^Dashboard$/i })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'Gallery', exact: true })).toBeVisible();
});

test('gallery page loads', async ({ page }) => {
  await gotoStable(page, '/gallery');
  await expect(page.getByRole('heading', { name: /^Gallery$/i, level: 1 })).toBeVisible();
});

test('queue page loads', async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, '/queue');
  await expect(page.getByRole('heading', { name: /^Queue$/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open in Gallery/i }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('settings: ComfyUI connection loads; Heal & ready is on Overview', async ({ page }) => {
  await gotoStable(page, '/settings?tab=comfyui&section=connection');
  await openComfyUiSettingsTab(page);
  // Settings shell remounts while ComfyUI connection hydrates — always re-query the section.
  const connection = page.locator('#settings-comfyui-connection').first();
  await expect(connection).toBeVisible({ timeout: 30_000 });
  await expect(
    page.locator('#settings-comfyui-connection').getByRole('button', { name: /Test connection/i })
  ).toBeVisible({ timeout: 30_000 });
  // One setup button, on Overview (the ComfyUI tab's "First run" panel repeated it until
  // 2026-10-13).
  await expect(connection.getByTestId('heal-and-ready')).toHaveCount(0);
  await gotoStable(page, '/settings?tab=overview');
  await expect(
    pageMain(page).getByTestId('settings-get-set-up').getByTestId('heal-and-ready')
  ).toBeVisible({ timeout: 30_000 });
});

test('command palette lists heal and gallery continue items', async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  const dialog = page.getByRole('dialog', { name: /Command palette/i });
  // Dynamic CommandPalette may mount after first paint — retry until the listener is live.
  await expect
    .poll(
      async () => {
        if (await dialog.isVisible().catch(() => false)) {
          return true;
        }
        await page.keyboard.press('Control+K');
        return dialog.isVisible().catch(() => false);
      },
      { timeout: 20_000, intervals: [200, 400, 800] }
    )
    .toBeTruthy();
  await expect(dialog.getByText(/Heal & ready/i)).toBeVisible();
  await page.keyboard.press('Escape');
});

test('command palette finds a setting and deep-links to it', async ({ page }) => {
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  const dialog = page.getByRole('dialog', { name: /Command palette/i });
  await expect
    .poll(
      async () => {
        if (await dialog.isVisible().catch(() => false)) {
          return true;
        }
        await page.keyboard.press('Control+K');
        return dialog.isVisible().catch(() => false);
      },
      { timeout: 20_000, intervals: [200, 400, 800] }
    )
    .toBeTruthy();
  // Deep settings only show once you type.
  await expect(dialog.getByText('Settings · Pose guide style')).toHaveCount(0);
  // Into the search box itself: typing blind right after the dialog opened could land before its
  // autofocus and lose the first letters (1 failure in 11 full runs).
  const search = dialog.getByPlaceholder(/Jump to/);
  await search.fill('pose guide');
  await expect(search).toHaveValue('pose guide');
  const hit = dialog.getByText('Settings · Pose guide style');
  await expect(hit).toBeVisible({ timeout: 10_000 });
  await hit.click();
  await expect(page).toHaveURL(/focus=settings-pose-guide/, { timeout: 20_000 });
  await expect(page.locator('#settings-pose-guide')).toBeVisible({ timeout: 20_000 });
});

async function openPalette(page: import('@playwright/test').Page) {
  const dialog = page.getByRole('dialog', { name: /Command palette/i });
  await expect
    .poll(
      async () => {
        if (await dialog.isVisible().catch(() => false)) {
          return true;
        }
        await page.keyboard.press('Control+K');
        return dialog.isVisible().catch(() => false);
      },
      { timeout: 20_000, intervals: [200, 400, 800] }
    )
    .toBeTruthy();
  return dialog;
}

test('command palette finds Models, tabs and the inference engine in Settings', async ({ page }) => {
  await gotoStable(page, '/dashboard');
  await dismissBlockingOverlays(page);
  const dialog = await openPalette(page);
  const search = dialog.getByPlaceholder(/Jump to/);
  await search.fill('download models');
  await expect(dialog.getByText('Settings · Download models')).toBeVisible({ timeout: 10_000 });
  await search.fill('inference engine');
  await expect(dialog.getByText('Settings · Inference engine (ComfyUI or cloud)')).toBeVisible();
  await search.fill('webhooks');
  await expect(dialog.getByText('Settings · Webhooks').first()).toBeVisible();
  await search.fill('render realism');
  await expect(dialog.getByText('Settings · Prompt style')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('command palette runs Play actions: Open Story, New Cast member', async ({ page }) => {
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const dialog = await openPalette(page);
  const search = dialog.getByPlaceholder(/Jump to/);
  await search.fill('new cast member');
  await expect(dialog.getByText('New Cast member', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await search.fill('open story');
  const story = dialog.getByText('Open Story', { exact: true });
  await expect(story).toBeVisible();
  await story.click();
  await expect(page).toHaveURL(/\/story(?:[?#].*)?$/, { timeout: 20_000 });
});

test('settings looks for ComfyUI at the usual addresses when it is not answering', async ({
  page,
}) => {
  // The card hides once health says ComfyUI is up — report it down so this runs the same
  // on a dev box with ComfyUI running as in CI with nothing listening.
  await page.route('**/api/health', route =>
    route.fulfill({
      json: { comfyui: { ok: false, error: 'fetch failed' }, llm: { enabled: false } },
    })
  );
  await gotoStable(page, '/settings?tab=comfyui&section=connection');
  const card = page.getByTestId('service-discovery');
  await expect(card).toBeVisible({ timeout: 20_000 });
  // The Settings shell can remount the card while it hydrates and drop a click that landed
  // first (no /api/discover-services request at all): click until the search starts.
  const searchStarted = page.waitForRequest(request => request.url().includes('/api/discover-services'), {
    timeout: 30_000,
  });
  let started = false;
  void searchStarted.then(() => {
    started = true;
  }, () => {});
  await expect
    .poll(
      async () => {
        if (!started) {
          await card.getByTestId('service-discovery-search').click().catch(() => {});
        }
        return started;
      },
      { timeout: 30_000, intervals: [1_000, 2_000, 3_000] }
    )
    .toBeTruthy();
  // Nothing runs locally in CI: it says so rather than offering a wrong address.
  await expect(
    card.getByTestId('service-discovery-no-comfy').or(card.getByTestId('service-discovery-use-comfy').first())
    // Probing the usual ports times out one by one; under a full parallel run it took longer
    // than 20 s once.
  ).toBeVisible({ timeout: 45_000 });
});

test('settings shows what changed from defaults and resets it', async ({ page }) => {
  test.setTimeout(180_000);
  await gotoStable(page, '/settings?tab=data&focus=settings-changed-defaults');
  const panel = pageMain(page).locator('#settings-changed-defaults');
  await expect(panel).toBeVisible({ timeout: 60_000 });
  // Change one preference in the prompt-quality section, then see it listed and reset it.
  await gotoStable(page, '/settings?tab=comfyui&section=prompt-quality&focus=settings-klein-enhancer');
  // The server's streamed copy of the tab (checkbox disabled) can sit hidden outside <main>.
  const toggle = pageMain(page).getByTestId('settings-klein-enhancer');
  await expect(toggle).toBeEnabled({ timeout: 20_000 });
  if (await toggle.isChecked()) {
    await toggle.uncheck();
  }
  // Switch tabs in the page (settings save on a short debounce — a reload could race it).
  await page
    .getByRole('navigation', { name: /Settings sections/i })
    .getByRole('button', { name: /^Data/ })
    .first()
    .click();
  // The Data tab is a lazy chunk. Under `next dev` its load waits behind on-demand compiles of
  // the routes this page calls (24 s+ on a cold or busy dev server); CI's build has it at once.
  await expect(pageMain(page).locator('#settings-changed-defaults')).toBeAttached({
    timeout: 90_000,
  });
  const row = page.getByTestId('changed-setting-kleinEnhancerEnabled');
  await expect(row).toContainText('Klein Enhancer', { timeout: 20_000 });
  await page.getByTestId('changed-setting-reset-kleinEnhancerEnabled').click();
  await expect(row).toHaveCount(0);
});

test('settings page loads', async ({ page }) => {
  await gotoStable(page, '/settings?tab=automation');
  await revealFullSettings(page);
  await expect(page.getByRole('navigation', { name: /Settings sections/i })).toBeVisible();
  // Exact heading — empty state also has "No avoided tokens yet".
  await expect(page.getByRole('heading', { name: 'Avoided tokens', exact: true })).toBeVisible({
    timeout: 15_000,
  });
});

test('settings comfyui loader maps section loads', async ({ page }) => {
  // Loader maps live under workflow-patching (not the top of the ComfyUI tab).
  // Deep link expands essentials; requireAdvanced waits for the patching panel itself.
  await gotoStable(page, '/settings?tab=comfyui&section=workflow-patching');
  await revealFullSettings(page, { requireAdvanced: true });
  // Reveal can remount the ComfyUI panel — re-resolve before scroll/assert.
  const patching = page.locator('#settings-comfyui-workflow-patching').first();
  await expect(patching).toBeVisible({ timeout: 45_000 });
  await expect(patching.getByRole('button', { name: /Merge suggested loader maps/i })).toBeVisible({
    timeout: 30_000,
  });
  // Checkpoint map copy lives inside the collapsed "Expert loader maps" details.
  const expertMaps = patching.locator('details').filter({ hasText: /Expert loader maps/i }).first();
  await expect(expertMaps).toBeVisible({ timeout: 15_000 });
  if (!(await expertMaps.getAttribute('open'))) {
    await expertMaps.locator('summary').click();
  }
  await expect(patching.getByText(/Checkpoint map/i)).toBeVisible({ timeout: 30_000 });
});

test('settings workflow health panel loads', async ({ page }) => {
  await gotoStable(page, '/settings?tab=comfyui&section=workflow-library');
  await openComfyUiSettingsTab(page);
  await expect(page.locator('#settings-comfyui-workflow-library').first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(pageMain(page).getByText(/Workflow library health/i)).toBeVisible({
    timeout: 30_000,
  });
});

test('gallery selection bar documents bulk upscale actions', async ({ page }) => {
  await seedGalleryFixture(page);
  await gotoStable(page, '/gallery');
  await expect(page.getByRole('heading', { name: /^Gallery$/i, level: 1 })).toBeVisible();
  // Count may be 1 (CI fixture) or higher when a local gallery store already exists.
  // Bulk selection and derived-kind chips live in Manage (Browse is the default).
  await page.getByRole('tab', { name: 'Manage', exact: true }).click();
  const selectVisible = page.getByRole('button', { name: /Select visible \(\d+\)/i });
  await expect(selectVisible).toBeVisible({ timeout: 15_000 });
  // Storage sync can reappear after gallery hydrate; clear again before clicking.
  await dismissBlockingOverlays(page);
  await selectVisible.click();
  await page.getByRole('button', { name: 'Queue', exact: true }).click();
  await expect(page.getByRole('button', { name: /Bulk upscale → Final/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bulk refine →/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Bulk new variation/i })).toBeVisible();
});

const ADDITIONAL_ROUTES: Array<{
  path: string;
  heading: RegExp;
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}> = [
  { path: '/character', heading: /^Character$/i },
  { path: '/refine', heading: /^Refine$/i },
  { path: '/video', heading: /^Video$/i },
  { path: '/inpaint', heading: /^Inpaint$/i },
  { path: '/play', heading: /^Your film$/i },
  { path: '/fitting', heading: /^Outfit$/i, level: 1 as const },
  { path: '/day', heading: /^Day$/i, level: 1 as const },
  { path: '/profile', heading: /^Profile$/i, level: 1 as const },
];

for (const route of ADDITIONAL_ROUTES) {
  test(`${route.path} loads`, async ({ page }) => {
    await gotoStable(page, route.path);
    await expect(
      page.getByRole('heading', { name: route.heading, level: route.level })
    ).toBeVisible({
      timeout: 60_000,
    });
  });
}

// A server/client render mismatch makes React throw away the server HTML (minified error #418).
// Build and server must share NEXT_PUBLIC_* — a build without NEXT_PUBLIC_PLAYWRIGHT served with
// it set looked like a site-wide hydration bug.
test('play pages hydrate without mismatches', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('pageerror', error => {
    if (/#418|#423|#425|hydrat/i.test(error.message)) {
      hydrationErrors.push(error.message.slice(0, 160));
    }
  });
  for (const path of ['/characters', '/play', '/fitting', '/day', '/story']) {
    await gotoStable(page, path);
    await page.waitForTimeout(1500);
  }
  expect(hydrationErrors).toEqual([]);
});

test('settings server storage says when this browser last synced', async ({ page }) => {
  const health = (await (await page.request.get('/api/health')).json()) as {
    storage?: { enabled?: boolean };
  };
  await gotoStable(page, '/settings?tab=advanced');
  const line = page.getByTestId('sync-status-line');
  if (!health.storage?.enabled) {
    // No server storage (CI runs without PROMPT_DATA_DIR): nothing to sync, no line.
      // Scoped to the page: the server's streamed copy of the tab can sit hidden outside <main>.
    await expect(
      pageMain(page).getByText('Status: disabled (browser database only)')
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(line).toHaveCount(0);
    return;
  }
  await expect(line).toBeVisible({ timeout: 30_000 });
  // The startup pull reaches the server, so a fresh page reads as synced, not as an error.
  await expect(line).toHaveAttribute('data-tone', /ok|waiting/, { timeout: 30_000 });
  await expect(line).toContainText(/Synced|waiting/);
});
