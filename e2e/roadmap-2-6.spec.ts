import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { putAppKv, seedSettingsCacheOnNextLoad } from './helpers/idb';
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

test('an episode shows what went into it, and its Day opens again without losing the one there', async ({
  page,
}) => {
  const now = Date.now();
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  const castId = 'e2e-reopen';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: castId },
    characters: {
      version: 1,
      characters: [{ id: castId, name: 'Reo', version: 1, updatedAt: now }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: castId,
        slots: [
          { id: 'morning', label: 'Morning', location: 'gym', sceneHints: 'lifts weights' },
          { id: 'afternoon', label: 'Afternoon', location: 'office', sceneHints: 'types' },
          { id: 'evening', label: 'Evening', location: 'bar', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads' },
        ],
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'now-m' }],
      },
    },
  });
  await putAppKv(page, {
    'play-series-v1': {
      version: 1,
      series: [
        {
          id: 's1',
          characterId: castId,
          title: 'Reo · Season 1',
          createdAt: now - 5000,
          updatedAt: now,
          episodes: [
            {
              id: 'e1',
              cutAt: now - 5000,
              filename: 'd1.mp4',
              places: ['harbor terrace'],
              day: {
                slots: [
                  {
                    id: 'morning',
                    label: 'Morning',
                    location: 'harbor terrace',
                    sceneHints: 'brunch with a mimosa',
                  },
                  { id: 'afternoon', label: 'Afternoon', location: 'bay', sceneHints: 'swims' },
                  { id: 'evening', label: 'Evening', location: 'old town', sceneHints: 'waves' },
                  {
                    id: 'night',
                    label: 'Night',
                    location: 'beach bonfire',
                    sceneHints: 'sits by the fire',
                    line: 'Best day.',
                  },
                ],
                stills: [
                  { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'ep-m' },
                  { slotId: 'night', status: 'completed', imageUrl: thumb, promptId: 'ep-n' },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  await gotoStable(page, `/characters/${castId}?media=films`);
  await dismissBlockingOverlays(page);
  const episode = page.getByTestId('cast-season-episode').first();
  await expect(episode).toBeVisible({ timeout: 30_000 });
  await episode.getByTestId('cast-season-episode-day').locator('summary').click();
  await expect(episode.getByTestId('cast-episode-slot-morning')).toContainText(
    'harbor terrace · brunch with a mimosa'
  );
  await expect(episode.getByTestId('cast-episode-slot-night')).toContainText('“Best day.”');
  await expect(episode.getByTestId('cast-episode-slot-afternoon')).toContainText('not rendered');
  await episode.getByTestId('cast-episode-reopen').click();
  await expect(page).toHaveURL(/\/day\?character=e2e-reopen/, { timeout: 30_000 });
  await dismissBlockingOverlays(page);
  // The episode's Day is on the board; the Day that was there is kept aside.
  await expect(page.getByTestId('day-progress-scene-morning')).toContainText('harbor terrace', {
    timeout: 30_000,
  });
  const aside = page.getByTestId('day-set-aside');
  await expect(aside).toContainText('Reo · Season 1, episode 1');
  await expect(aside).toContainText('1 still');
  await aside.getByTestId('day-set-aside-back').click();
  await expect(page.getByTestId('day-progress-scene-morning')).toContainText('gym');
  // And the episode's Day can come back again.
  await expect(page.getByTestId('day-set-aside')).toContainText('the episode you opened');
});
