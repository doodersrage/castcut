import type { Page } from '@playwright/test';

/** Close overlays that block clicks (storage sync conflict, workspace welcome, etc.). */
export async function dismissBlockingOverlays(page: Page): Promise<void> {
  // Storage sync conflict (z-120) — can appear after AutoStorageSyncInit runs.
  const decideLater = page.getByRole('button', { name: 'Decide later', exact: true });
  if (await decideLater.isVisible({ timeout: 800 }).catch(() => false)) {
    await decideLater.click();
  }

  // Multi-step welcome: Skip → setup → ready. Keep timeouts short — CI builds with
  // NEXT_PUBLIC_PLAYWRIGHT skip the welcome entirely; this path covers local/dev.
  const skipWelcome = page.getByRole('button', { name: /Skip — use Play/i });
  if (await skipWelcome.isVisible({ timeout: 800 }).catch(() => false)) {
    await skipWelcome.click();
  }

  const skipSetup = page.getByRole('button', { name: /Skip for now/i });
  if (await skipSetup.isVisible({ timeout: 800 }).catch(() => false)) {
    await skipSetup.click();
  }

  const readyDialog = page.getByRole('dialog', { name: /set to generate/i });
  if (await readyDialog.isVisible({ timeout: 800 }).catch(() => false)) {
    await readyDialog.getByRole('button', { name: 'Close', exact: true }).click();
  }
}
