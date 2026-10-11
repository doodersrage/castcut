import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { putAppKv, replaceGalleryIdb, seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';
import { closeDaySheets, openDaySlotSheet } from './helpers/day';

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

test('the Day plan undoes and redoes an edit', async ({ page }) => {
  const castId = 'e2e-undo';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: castId },
    characters: {
      version: 1,
      characters: [{ id: castId, name: 'Una', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: castId,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads on a bench' },
          { id: 'evening', label: 'Evening', location: 'bar', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads in bed' },
        ],
      },
    },
  });
  await gotoStable(page, `/day?character=${castId}`);
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'afternoon');
  await page.getByTestId('day-slot-beat').fill('feeds the ducks');
  await closeDaySheets(page);
  const scene = page.getByTestId('day-progress-scene-afternoon');
  await expect(scene).toContainText('feeds the ducks');
  const undo = page.getByTestId('day-plan-undo-button');
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(scene).toContainText('reads on a bench');
  await expect(page.getByTestId('day-plan-redo-button')).toBeVisible();
  await page.getByTestId('day-plan-redo-button').click();
  await expect(scene).toContainText('feeds the ducks');
  await expect(undo).toContainText("Afternoon's beat");
});

test('a film shows what is in it and re-cuts in another shape', async ({ page }) => {
  const now = Date.now();
  const castId = 'e2e-recut';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: castId },
    characters: {
      version: 1,
      characters: [{ id: castId, name: 'Remy', version: 1, updatedAt: now }],
      removedIds: [],
    },
  });
  await gotoStable(page, `/characters/${castId}?media=films`);
  await replaceGalleryIdb(page, [
    {
      id: 'e2e-film-1',
      promptId: 'film-e2e-film-1',
      prompt: 'Assembled film · Remy',
      tool: 'day',
      derivedKind: 'film',
      characterId: castId,
      comfyUrl: 'http://127.0.0.1:8188',
      status: 'completed',
      queuedAt: now,
      completedAt: now,
      images: [{ filename: 'remy-day.mp4', subfolder: '', type: 'output', format: 'video/mp4' }],
      userTags: ['film'],
      cutRecipe: {
        version: 1,
        source: 'day',
        resolution: '720p',
        shots: [
          { key: 'morning', title: 'Morning', url: '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp', kind: 'still', framing: 'close' },
          { key: 'night', title: 'Night', url: '/e2e/night.mp4', kind: 'clip', trimStartSec: 1 },
        ],
      },
    },
  ]);
  // The film's own render request — answered with an error so nothing encodes.
  let body: { resolution?: string; shots?: unknown[] } | null = null;
  await page.route('**/api/film/assemble', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ok: true, available: true, encoder: 'ffmpeg' } });
      return;
    }
    body = route.request().postDataJSON() as typeof body;
    await route.fulfill({ status: 503, json: { error: 'e2e: no encode' } });
  });
  await gotoStable(page, `/characters/${castId}?media=films`);
  await dismissBlockingOverlays(page);
  const recut = page.getByTestId('film-recut');
  await expect(recut).toBeVisible({ timeout: 30_000 });
  await recut.locator('summary').click();
  await expect(recut.getByTestId('film-recut-summary')).toContainText('2 shots · 1 clip · 720p');
  await expect(recut.getByTestId('film-recut-shots')).toContainText('chest up');
  // Widescreen films start on vertical — the common re-cut.
  await expect(recut.getByTestId('film-recut-shape')).toHaveValue('vertical');
  await recut.getByTestId('film-recut-quality').selectOption('1080p');
  await recut.getByTestId('film-recut-run').click();
  await expect.poll(() => body?.resolution ?? null, { timeout: 30_000 }).toBe('1080p-vertical');
  expect(body!.shots).toHaveLength(2);
});

test('Preview the mix plays the talking clip with the music settings', async ({ page }) => {
  const castId = 'e2e-mix';
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: castId },
    characters: {
      version: 1,
      characters: [{ id: castId, name: 'Mika', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: castId,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'waves', line: 'Hi!' },
          { id: 'evening', label: 'Evening', location: 'bar', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'mix-m' },
          {
            slotId: 'afternoon',
            status: 'completed',
            imageUrl: thumb,
            promptId: 'mix-a',
            clipStatus: 'completed',
            clipUrl: '/e2e-media/talk-2s.mp4',
            clipPromptId: 'mix-a-clip',
          },
        ],
      },
    },
  });
  const clip = readFileSync(join(__dirname, 'fixtures', 'talk-2s.mp4'));
  await page.route('**/e2e-media/talk-2s.mp4', route =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: clip })
  );
  await gotoStable(page, `/day?character=${castId}`);
  await dismissBlockingOverlays(page);
  const coach = page.getByTestId('day-cut-coach');
  await expect(coach).toBeVisible({ timeout: 30_000 });
  await coach.getByTestId('day-cut-options-disclosure').locator('summary').click();
  const preview = coach.getByTestId('day-cut-mix-preview');
  await expect(preview).toBeVisible();
  await preview.click();
  await expect(coach.getByTestId('day-cut-mix-preview-note')).toContainText('1 line', {
    timeout: 20_000,
  });
  await expect(preview).toContainText('Stop');
  await preview.click();
  await expect(preview).toContainText('Preview the mix');
});

test('Preview the cut plays the edit in its shape before encoding', async ({ page }) => {
  const castId = 'e2e-preview';
  const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: castId },
    characters: {
      version: 1,
      characters: [{ id: castId, name: 'Pia', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: castId,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'waves', line: 'Hi!' },
          { id: 'evening', label: 'Evening', location: 'bar', sceneHints: 'laughs' },
          { id: 'night', label: 'Night', location: 'bedroom', sceneHints: 'reads' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'pv-m' },
          {
            slotId: 'afternoon',
            status: 'completed',
            imageUrl: thumb,
            promptId: 'pv-a',
            clipStatus: 'completed',
            clipUrl: '/e2e-media/talk-2s.mp4',
            clipPromptId: 'pv-a-clip',
          },
          { slotId: 'night', status: 'completed', imageUrl: thumb, promptId: 'pv-n' },
        ],
      },
    },
  });
  const clip = readFileSync(join(__dirname, 'fixtures', 'talk-2s.mp4'));
  await page.route('**/e2e-media/talk-2s.mp4', route =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: clip })
  );
  await gotoStable(page, `/day?character=${castId}`);
  await dismissBlockingOverlays(page);
  const coach = page.getByTestId('day-cut-coach');
  await expect(coach).toBeVisible({ timeout: 30_000 });
  await coach.getByTestId('day-cut-options-disclosure').locator('summary').click();
  await coach.getByTestId('day-cut-shape').selectOption('square');
  await coach.getByTestId('day-cut-titles').check();
  await coach.getByTestId('day-cut-preview-open').click();
  const preview = coach.getByTestId('day-cut-preview');
  // Title card + 2.5 s + 2 s clip + 2.5 s: 3 shots, 0:09.
  await expect(preview.getByTestId('day-cut-preview-notes')).toContainText('3 shots · 0:09', {
    timeout: 20_000,
  });
  const canvas = preview.getByTestId('day-cut-preview-canvas');
  await expect(canvas).toHaveAttribute('data-shape', 'square');
  await expect(canvas).toHaveAttribute('width', '480');
  // Seek past the title card onto the first still: the canvas shows the picture.
  await preview.getByTestId('day-cut-preview-scrub').fill('3');
  await expect
    .poll(
      () =>
        canvas.evaluate(element => {
          const context = (element as HTMLCanvasElement).getContext('2d')!;
          const data = context.getImageData(200, 200, 80, 80).data;
          let sum = 0;
          for (let i = 0; i < data.length; i += 4) sum += data[i]! + data[i + 1]! + data[i + 2]!;
          return sum / (data.length / 4) / 3;
        }),
      { timeout: 10_000 }
    )
    .toBeGreaterThan(20);
  await preview.getByTestId('day-cut-preview-play').click();
  await expect(preview.getByTestId('day-cut-preview-time')).toContainText('0:04', { timeout: 10_000 });
  await preview.getByTestId('day-cut-preview-play').click();
  await preview.getByTestId('day-cut-preview-close').click();
  await expect(preview).toHaveCount(0);
});
