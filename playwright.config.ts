import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { e2eApiHeaders } from './e2e/helpers/auth';
import { e2eDataDir } from './e2e/helpers/data-dir';

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

const baseURL = process.env.PROMPT_API_URL ?? 'http://127.0.0.1:47832';
// E2E_PROD=1: a local run against a production build, as CI runs. `next dev` compiles each route
// on its first visit and Fast Refresh reloads pages under a test: "Loading scene" and lost
// navigations that a build never shows. Its port is the run's own (PROMPT_API_URL), never the
// `start` script's 47832. Webpack, as `npm run dev` is: Turbopack won't build a worktree whose
// node_modules is a link to the main checkout's.
const productionServer = Boolean(process.env.CI || process.env.E2E_PROD);
const localStart = `npx next build --webpack && npx next start -p ${new URL(baseURL).port || '47832'}`;
const authStorage = resolve(__dirname, 'e2e/.auth/user.json');

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // Parallel workers + next dev race on navigation (ERR_ABORTED).
  workers: process.env.CI ? 1 : undefined,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL,
    extraHTTPHeaders: e2eApiHeaders(),
    trace: 'off',
    storageState: existsSync(authStorage) ? authStorage : undefined,
  },
  webServer: {
    // Production server avoids Fast Refresh aborting in-flight navigations under CI.
    command: process.env.CI
      ? 'npm run build && npm run start'
      : productionServer
        ? localStart
        : 'npm run dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 300_000 : productionServer ? 600_000 : 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_PLAYWRIGHT: '1',
      // Every worker is the same client to the server: a full parallel run makes more than
      // the default 120 requests a minute to one route and gets 429s (an empty navigation,
      // "No Cast lead"…) that look like flaky tests.
      API_RATE_LIMIT_MAX: process.env.API_RATE_LIMIT_MAX ?? '100000',
      // A local run: its own empty data dir, not .env.local's real one (e2e/helpers/data-dir.ts).
      ...(process.env.CI ? {} : { PROMPT_DATA_DIR: e2eDataDir() }),
    },
  },
});
