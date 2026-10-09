import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { ensureStudioWorkspace } from './gallery';
import { gotoStable } from './navigation';
import { dismissBlockingOverlays } from './overlays';

function envCredential(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  return value || fallback;
}

export function e2eCredentials(): { username: string; password: string } {
  return {
    username: envCredential('PROMPT_E2E_USERNAME', envCredential('PROMPT_ADMIN_USERNAME', 'admin')),
    password: envCredential('PROMPT_E2E_PASSWORD', envCredential('PROMPT_ADMIN_PASSWORD', 'admin')),
  };
}

/** Playwright APIRequestContext is not same-origin; send the studio token when set. */
export function e2eApiHeaders(): Record<string, string> {
  const token = process.env.PROMPT_API_TOKEN?.trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function ensureAuthenticated(page: Page): Promise<void> {
  await ensureStudioWorkspace(page);
  // A quiet app page: Castcut's "/" is Film, which navigates again as it loads.
  await gotoStable(page, '/queue');
  if (page.url().includes('/login')) {
    await loginThroughApi(page);
    await ensureStudioWorkspace(page);
    await dismissBlockingOverlays(page);
    return;
  }

  const signInVisible = await page
    .getByRole('heading', { name: 'Sign in', exact: true })
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (signInVisible) {
    await loginThroughApi(page);
  }
  await ensureStudioWorkspace(page);
  await dismissBlockingOverlays(page);
}

async function loginThroughApi(page: Page): Promise<void> {
  const { username, password } = e2eCredentials();
  const response = await page.request.post('/api/auth/login', {
    headers: e2eApiHeaders(),
    data: { username, password },
  });
  if (!response.ok()) {
    throw new Error(`E2E login failed (${response.status()}): ${await response.text()}`);
  }
  await gotoStable(page, '/queue');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).not.toBeVisible({
    timeout: 15_000,
  });
}
