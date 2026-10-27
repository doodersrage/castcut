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
  // Scripts sync one at a time (M6 V6): an empty server that keeps what it is sent.
  await page.route(/\/api\/scene-scripts(?:\?.*)?$/, route => {
    const method = route.request().method();
    if (method === 'GET') return route.fulfill({ json: { scripts: [], removedAt: {} } });
    if (method === 'DELETE') return route.fulfill({ json: { removed: true } });
    const body = route.request().postDataJSON() as { script?: unknown } | null;
    return route.fulfill({ json: { script: body?.script ?? null } });
  });
}
