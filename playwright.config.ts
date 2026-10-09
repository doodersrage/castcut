import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { e2eApiHeaders } from './e2e/helpers/auth';

function loadEnvLocal(): void {
  const path = resolve(__dirname, '.env.local');
  if (!existsSync(path)) {
    return;
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

/**
 * Two apps share these tests: Castcut (default) and the classic Prompt Studio (E2E_APP=classic,
 * apps/prompt-studio). Tests of Prompt Studio's own pages (src/studio-app) carry the @classic tag
 * and run only against it; everything else runs against Castcut.
 */
const classic = process.env.E2E_APP === 'classic';
const baseURL =
  process.env.PROMPT_API_URL ?? (classic ? 'http://127.0.0.1:47833' : 'http://127.0.0.1:47832');
const authStorage = resolve(__dirname, 'e2e/.auth/user.json');

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Parallel workers + next dev race on navigation (ERR_ABORTED).
  workers: process.env.CI ? 1 : undefined,
  globalSetup: './e2e/global-setup.ts',
  ...(classic ? { grep: /@classic/ } : { grepInvert: /@classic/ }),
  use: {
    baseURL,
    extraHTTPHeaders: e2eApiHeaders(),
    trace: 'off',
    storageState: existsSync(authStorage) ? authStorage : undefined,
  },
  webServer: {
    // Production server avoids Fast Refresh aborting in-flight navigations under CI.
    command: classic
      ? process.env.CI
        ? 'npm run build:classic && npm run start:classic'
        : 'npm run dev:classic'
      : process.env.CI
        ? 'npm run build && npm run start'
        : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_PLAYWRIGHT: '1',
      // Every worker is the same client to the server: a full parallel run makes more than
      // the default 120 requests a minute to one route and gets 429s (an empty navigation,
      // "No Cast lead"…) that look like flaky tests.
      API_RATE_LIMIT_MAX: process.env.API_RATE_LIMIT_MAX ?? '100000',
    },
  },
});
