import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

test('restore shows what a backup holds beside what is here, before it overwrites', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, { shared: {} });
  await page.addInitScript(() => {
    const now = Date.now();
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [
          { id: 'e2e-here-a', name: 'Here Ada', version: 1, updatedAt: now },
          { id: 'e2e-here-b', name: 'Here Bo', version: 1, updatedAt: now },
        ],
        removedIds: [],
      })
    );
  });
  await gotoStable(page, '/settings?tab=data');
  await dismissBlockingOverlays(page);
  const restore = page.getByTestId('settings-backup-restore');
  await expect(restore).toBeVisible({ timeout: 30_000 });
  const backup = {
    version: 5,
    exportedAt: '2026-10-01T09:00:00.000Z',
    history: [],
    locationBlocklist: [],
    settings: { version: 1, shared: {}, tools: {} },
    comfyGallery: [
      {
        id: 'e2e-bk-1',
        promptId: 'e2e-bk-1',
        prompt: 'a still',
        comfyUrl: 'http://127.0.0.1:8188',
        status: 'completed',
        queuedAt: 1,
        images: [{ filename: 'a.png', subfolder: '', type: 'output' }],
      },
    ],
    extras: { characters: [{ id: 'e2e-old', name: 'Old Nell', version: 1, updatedAt: 1 }] },
  };
  const preview = page.getByTestId('settings-backup-restore-preview');
  // Settings is still hydrating right after load; a pick made then is dropped — pick again.
  await expect(async () => {
    await page.getByTestId('settings-backup-restore-file').setInputFiles({
      name: 'castcut-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(backup)),
    });
    await expect(preview).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(preview).toContainText('castcut-backup.json');
  await expect(preview).toContainText('Saved');
  const castRow = preview.getByTestId('settings-backup-restore-row-cast');
  await expect(castRow).toContainText('1 · Old Nell');
  await expect(castRow).toContainText('Here Ada');
  await expect(castRow).toHaveAttribute('data-fewer', 'true');
  await expect(preview.getByTestId('settings-backup-restore-losing')).toContainText('cast');
  await expect(preview.getByTestId('settings-backup-restore-not-kept')).toContainText(
    '1 render in this file live only'
  );
  // Cancel leaves everything as it was.
  await preview.getByTestId('settings-backup-restore-cancel').click();
  await expect(preview).toHaveCount(0);
  const names = await page.evaluate(() => {
    const raw = window.localStorage.getItem('comfy-prompt-characters-v1');
    return raw
      ? (JSON.parse(raw) as { characters: Array<{ name: string }> }).characters.map(c => c.name)
      : [];
  });
  expect(names).toContain('Here Ada');
});
