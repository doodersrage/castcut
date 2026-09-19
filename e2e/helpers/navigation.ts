import { expect, type Page } from '@playwright/test';
import { dismissBlockingOverlays } from './overlays';

/** Navigate with retries for transient next-dev / Fast Refresh aborts. */
export async function gotoStable(
  page: Page,
  path: string,
  options?: { waitUntil?: 'load' | 'domcontentloaded' | 'commit' | 'networkidle' }
): Promise<void> {
  const waitUntil = options?.waitUntil ?? 'domcontentloaded';
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(path, { waitUntil });
      // Sync/welcome modals often mount after first paint and block clicks.
      await dismissBlockingOverlays(page);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (!/ERR_ABORTED|interrupted/i.test(message) || attempt === 2) {
        throw error;
      }
      await page.waitForTimeout(250 * (attempt + 1));
    }
  }
  throw lastError;
}

const COMFY_SECTION_LANDMARK: Record<string, string> = {
  connection: '#settings-comfyui-connection',
  'inference-engine': '#settings-comfyui-inference-engine',
  'workflow-library': '#settings-comfyui-workflow-library',
  'workflow-patching': '#settings-comfyui-workflow-patching',
  'model-assets': '#settings-comfyui-model-assets',
  'lora-library': '#settings-comfyui-lora-library',
  'queue-params': '#settings-comfyui-queue-params',
};

const ANY_COMFY_LANDMARK = [
  '#settings-comfyui-connection',
  '#settings-comfyui-inference-engine',
  '#settings-comfyui-workflow-library',
  '#settings-comfyui-workflow-patching',
].join(', ');

async function sectionFromPage(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    try {
      return new URL(window.location.href).searchParams.get('section');
    } catch {
      return null;
    }
  });
}

/** Expand Settings essentials so advanced ComfyUI sections are in the DOM. */
export async function revealFullSettings(
  page: Page,
  options?: { requireAdvanced?: boolean }
): Promise<void> {
  // Prefer the settings shell nav — the page title can remount during tab switches.
  const nav = page.getByRole('navigation', { name: /Settings sections/i });
  const heading = page.getByRole('heading', { name: /Settings & Health/i });
  if (await nav.isVisible({ timeout: 5_000 }).catch(() => false)) {
    // already on settings
  } else {
    await expect(heading).toBeVisible({ timeout: 30_000 });
  }

  const requireAdvanced = Boolean(options?.requireAdvanced);
  const advancedLandmark = page.locator('#settings-comfyui-workflow-patching').first();
  if (requireAdvanced) {
    if (await advancedLandmark.isVisible({ timeout: 1_500 }).catch(() => false)) {
      return;
    }
  } else {
    // Deep-linked essentials may already be mounted — don't fight the chrome.
    const alreadyOpen = page.locator(ANY_COMFY_LANDMARK).first();
    if (await alreadyOpen.isVisible({ timeout: 1_500 }).catch(() => false)) {
      return;
    }
  }

  // Sidebar control is in the parent Settings shell (available before the ComfyUI tab hydrates).
  const sidebar = page.getByRole('button', { name: /All settings/i });
  if (await sidebar.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await sidebar.click({ force: true, timeout: 5_000 }).catch(async () => {
      await sidebar.click({ timeout: 5_000 }).catch(() => undefined);
    });
  } else {
    const comfy = page.getByRole('button', { name: /Show all ComfyUI settings/i });
    if (await comfy.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await comfy.click({ force: true, timeout: 5_000 }).catch(async () => {
        await comfy.click({ timeout: 5_000 }).catch(() => undefined);
      });
    }
  }

  if (requireAdvanced) {
    await expect(advancedLandmark).toBeVisible({ timeout: 30_000 });
  }
}

/** Open the ComfyUI settings tab after essentials may have hidden it. */
export async function openComfyUiSettingsTab(page: Page): Promise<void> {
  const section = await sectionFromPage(page);
  const requiredSelector =
    (section && COMFY_SECTION_LANDMARK[section]) || '#settings-comfyui-connection';
  const requireAdvanced = Boolean(
    section && !['connection', 'inference-engine', 'model-assets', 'queue-params'].includes(section)
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await revealFullSettings(page, { requireAdvanced });
    const tab = page
      .getByRole('navigation', { name: /Settings sections/i })
      .locator('button.ui-settings-tab')
      .filter({ hasText: /^ComfyUI/ });
    if (await tab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Clicking an already-active tab rewrites the URL without `section` and can
      // collapse essentials, hiding Checkpoint map again.
      if ((await tab.getAttribute('aria-current')) !== 'page') {
        await tab.click({ force: true }).catch(async () => {
          await tab.click();
        });
        // Tab remount can detach the button mid-click — wait for shell to settle.
        await expect(page.getByRole('navigation', { name: /Settings sections/i })).toBeVisible({
          timeout: 15_000,
        });
      }
    }

    const required = page.locator(requiredSelector).first();
    if (await required.isVisible({ timeout: attempt === 0 ? 20_000 : 15_000 }).catch(() => false)) {
      return;
    }

    // Settings chrome occasionally drops the ComfyUI panel mid-hydrate — reload the deep link.
    const reloadPath = section
      ? `/settings?tab=comfyui&section=${section}`
      : '/settings?tab=comfyui&section=connection';
    await gotoStable(page, reloadPath);
  }

  await expect(page.locator(requiredSelector).first()).toBeVisible({ timeout: 45_000 });
}
