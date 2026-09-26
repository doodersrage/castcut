import type { Page } from '@playwright/test';

/**
 * Cut this test off from the server's synced storage (`/api/storage`: PUT pulls, POST pushes).
 * Every test shares one server, and a fresh browser pulls the server's Cast list and settings
 * over what the test seeded — so a spec's result depended on which test ran before it.
 */
export async function isolateServerStorage(page: Page): Promise<void> {
  await page.route(/\/api\/storage(?:\?.*)?$/, route =>
    route.request().method() === 'POST'
      ? route.fulfill({ json: { ok: true } })
      : route.fulfill({ json: { data: null } })
  );
}
