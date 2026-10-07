import { chromium, type FullConfig, type Page } from '@playwright/test';
import { e2eApiHeaders, e2eCredentials } from './helpers/auth';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const storagePath = resolve(__dirname, '.auth/user.json');

export default async function globalSetup(config: FullConfig): Promise<void> {
  mkdirSync(dirname(storagePath), { recursive: true });

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://127.0.0.1:47832';
  const browser = await chromium.launch();
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  await page.goto('/');
  const needsLogin = await page
    .getByRole('heading', { name: 'Sign in', exact: true })
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (needsLogin) {
    const { username, password } = e2eCredentials();
    const response = await page.request.post('/api/auth/login', {
      headers: e2eApiHeaders(),
      data: { username, password },
    });
    if (!response.ok()) {
      throw new Error(`E2E global login failed (${response.status()}): ${await response.text()}`);
    }
    await page.goto('/');
  }

  // Prevent the deferred first-run welcome dialog from blocking gallery/clicks.
  await page.evaluate(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      // The server reads the mode from this cookie ("/" sends Film to Play).
      document.cookie = 'comfy-workspace-mode-v1=studio; Path=/; Max-Age=31536000; SameSite=Lax';
    } catch {
      // ignore quota / private mode
    }
  });

  await context.storageState({ path: storagePath });
  await checkServerRateLimit(page, config.workers);
  await browser.close();
}

/**
 * Every worker is the same client to the server, so a parallel run makes far more than the
 * default 120 requests a minute to one route and gets 429s — an empty phone tab bar, "No Cast
 * lead", a settings control that will not stay set. Those read as flaky tests. The config
 * starts its own server with API_RATE_LIMIT_MAX=100000; a server started by hand must be too.
 */
async function checkServerRateLimit(page: Page, workers: number): Promise<void> {
  if (workers <= 1 || process.env.PROMPT_E2E_ALLOW_RATE_LIMIT === '1') {
    return;
  }
  const health = await page.request
    .get('/api/health', { headers: e2eApiHeaders(), timeout: 10_000 })
    .then(response => (response.ok() ? (response.json() as Promise<unknown>) : null))
    .catch(() => null);
  const max = readEnvField(health, 'API_RATE_LIMIT_MAX');
  if (max == null) {
    return;
  }
  const limit = Number.parseInt(max, 10);
  if (Number.isFinite(limit) && limit >= workers * 120) {
    return;
  }
  throw new Error(
    `The server under test rate-limits API routes at ${max} requests a window; a ${workers}-worker ` +
      `run shares one client and trips it (429s look like flaky tests). Start it with ` +
      `API_RATE_LIMIT_MAX=100000, run with --workers=1, or set PROMPT_E2E_ALLOW_RATE_LIMIT=1.`
  );
}

/** A field's value from the health route's server environment summary, when it is listed. */
function readEnvField(health: unknown, key: string): string | null {
  const groups = (health as { serverEnv?: { groups?: unknown[] } } | null)?.serverEnv?.groups;
  if (!Array.isArray(groups)) {
    return null;
  }
  for (const group of groups) {
    const fields = (group as { fields?: unknown[] })?.fields;
    if (!Array.isArray(fields)) continue;
    for (const field of fields) {
      const entry = field as { key?: unknown; value?: unknown };
      if (entry.key === key && typeof entry.value === 'string') {
        return entry.value;
      }
    }
  }
  return null;
}
