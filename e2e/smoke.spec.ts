import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedGalleryFixture } from './helpers/gallery';
import { gotoStable, openComfyUiSettingsTab, revealFullSettings } from './helpers/navigation';
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
  await expect(page.getByRole('heading', { name: /ComfyUI job queue/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open in Gallery/i }).first()).toBeVisible({
    timeout: 15_000,
  });
});

test('settings connection first-run hub loads', async ({ page }) => {
  await gotoStable(page, '/settings?tab=comfyui&section=connection');
  await openComfyUiSettingsTab(page);
  // Settings shell remounts while ComfyUI connection hydrates — always re-query the section.
  const connection = page.locator('#settings-comfyui-connection').first();
  await expect(connection).toBeVisible({ timeout: 30_000 });
  // Skip scroll when the node remounts mid-call; heal/CTA waits below re-query live locators.
  await connection.scrollIntoViewIfNeeded().catch(() => undefined);
  // Dynamic ComfyUI tab can finish after the shell — wait for the first-run CTA.
  const heal = page
    .locator('#settings-comfyui-connection')
    .getByTestId('heal-and-ready')
    .or(
      page
        .locator('#settings-comfyui-connection')
        .getByRole('button', { name: /Heal & ready|Healing/i })
    );
  await expect(heal.first()).toBeVisible({ timeout: 45_000 });
  await expect(
    page.locator('#settings-comfyui-connection').getByRole('link', { name: 'Open Generate', exact: true })
  ).toHaveAttribute('href', '/?source=random', { timeout: 30_000 });
  const queueLink = page
    .locator('#settings-comfyui-connection')
    .getByRole('link', { name: /Generate & queue first scene/i });
  if (await queueLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await expect(queueLink).toHaveAttribute(
      'href',
      '/?source=random&autogen=1&autoqueue=1'
    );
  }
  await expect(
    page.locator('#settings-comfyui-connection').getByRole('button', { name: /Test connection/i })
  ).toBeVisible({
    timeout: 30_000,
  });
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
  await card.getByTestId('service-discovery-search').click();
  // Nothing runs locally in CI: it says so rather than offering a wrong address.
  await expect(
    card.getByTestId('service-discovery-no-comfy').or(card.getByTestId('service-discovery-use-comfy').first())
    // Probing the usual ports times out one by one; under a full parallel run it took longer
    // than 20 s once.
  ).toBeVisible({ timeout: 45_000 });
});

test('settings shows what changed from defaults and resets it', async ({ page }) => {
  await gotoStable(page, '/settings?tab=data&focus=settings-changed-defaults');
  const panel = page.locator('#settings-changed-defaults');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  // Change one preference in the prompt-quality section, then see it listed and reset it.
  await gotoStable(page, '/settings?tab=comfyui&section=prompt-quality&focus=settings-klein-enhancer');
  const toggle = page.getByTestId('settings-klein-enhancer');
  // While the lazily loaded Settings page hydrates, a second, still-loading copy of the panel
  // (its checkbox disabled) can be in the DOM for a moment — 1 run in 3 on a busy server. Wait
  // for the one copy before using it.
  await expect(toggle).toHaveCount(1, { timeout: 20_000 });
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

test('controlnet page loads', async ({ page }) => {
  await gotoStable(page, '/controlnet');
  await expect(page.getByRole('heading', { name: /^ControlNet$/i })).toBeVisible();
});

test('studio analytics tab loads', async ({ page }) => {
  await gotoStable(page, '/studio');
  const analyticsTab = page.getByRole('button', { name: 'Analytics', exact: true });
  await expect(analyticsTab).toBeVisible({ timeout: 60_000 });
  await analyticsTab.click();
  await expect(page.getByRole('heading', { name: /Gallery rating analytics/i })).toBeVisible();
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
  await expect(page.getByText(/Workflow library health/i)).toBeVisible({ timeout: 30_000 });
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

const ADDITIONAL_ROUTES: Array<{ path: string; heading: RegExp; level?: 1 | 2 | 3 | 4 | 5 | 6 }> = [
  { path: '/character', heading: /^Character$/i },
  { path: '/background', heading: /^Background$/i },
  { path: '/fantasy', heading: /^Fantasy$/i },
  { path: '/pet', heading: /^Pet$/i },
  { path: '/refine', heading: /^Refine$/i },
  { path: '/format', heading: /Format for your model/i },
  { path: '/prompt', heading: /Prompt Editor/i },
  { path: '/negative', heading: /^Negative$/i },
  { path: '/lint', heading: /^Lint$/i },
  { path: '/topics', heading: /^Topics$/i },
  { path: '/variations', heading: /^Variations$/i },
  { path: '/video', heading: /^Video$/i },
  { path: '/logo', heading: /^Logo$/i },
  { path: '/image-prompt', heading: /Image → Prompt/i },
  { path: '/inpaint', heading: /^Inpaint$/i },
  { path: '/play', heading: /^Your film$/i },
  { path: '/fitting', heading: /^Outfit$/i, level: 1 as const },
  { path: '/day', heading: /^Day$/i, level: 1 as const },
  { path: '/moodboard', heading: /^Look$/i, level: 1 as const },
  { path: '/plugins', heading: /^Plugins$/i },
  { path: '/profile', heading: /^Profile$/i, level: 1 as const },
  { path: '/studio', heading: /^Studio$/i, level: 1 as const },
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
  for (const path of ['/characters', '/play', '/moodboard', '/fitting', '/day', '/story']) {
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
    await expect(page.getByText('Status: disabled (browser database only)')).toBeVisible({
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
