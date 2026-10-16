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

const CAST = 'e2e-media';
const cast = {
  version: 1,
  characters: [
    {
      id: CAST,
      name: 'Media Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties with short dark hair',
      bio: { name: 'Media Cast', look: 'a woman', personality: 'warm' },
    },
  ],
  removedIds: [],
};

/** A Day whose slot has a finished still and clip. */
function finishedDay() {
  const slots = [
    { id: 'morning', label: 'Morning', location: 'bright kitchen', sceneHints: 'making coffee' },
  ];
  return {
    stillsCharacterId: CAST,
    dayMood: 'everyday',
    activeSlotId: 'morning',
    slots,
    stills: slots.map(slot => ({
      slotId: slot.id,
      promptId: `p-${slot.id}`,
      imageUrl: '/icon.svg',
      status: 'completed',
      clipPromptId: `c-${slot.id}`,
      clipUrl: `/e2e-clip-${slot.id}.mp4`,
      clipStatus: 'completed',
    })),
  };
}

async function openDay(page: import('@playwright/test').Page) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await page.getByTestId('day-progress-menu-morning').first().click();
}

test('Relight: a look from the sheet re-lights the slot still', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = [];
  await page.route('**/api/still/relight', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/icon.svg' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-relight-morning').click();
  await page.getByTestId('slot-media-sheet-look-golden').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'the still has its new light',
    { timeout: 30_000 }
  );
  expect(posts[0]?.look).toBe('golden');
  expect(posts[0]?.stillUrl).toBe('/icon.svg');
});

test('Sharpen & smooth: the finished clip replaces the slot clip', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = [];
  await page.route('**/api/clip/finish', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/e2e-finished.mp4' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-finish-morning').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'sharper and smoother',
    { timeout: 30_000 }
  );
  expect(posts[0]?.clipUrl).toBe('/e2e-clip-morning.mp4');
});

test('Copy moves: a picked video goes up with the still and the Cast look', async ({ page }) => {
  let body = '';
  await page.route('**/api/clip/moves', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/e2e-moves.mp4' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-moves-morning').click();
  await expect(page.getByTestId('slot-media-sheet-start')).toBeDisabled();
  await page.getByTestId('slot-media-sheet-video').setInputFiles({
    name: 'dance.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('fake video'),
  });
  await page.getByTestId('slot-media-sheet-motion').fill('A woman dancing');
  await page.getByTestId('slot-media-sheet-start').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'copied moves',
    { timeout: 30_000 }
  );
  expect(body).toContain('fake video');
  expect(body).toContain('/icon.svg');
  expect(body).toContain('short dark hair');
  expect(body).toContain('A woman dancing');
});

test('Lip-sync: a picked recording makes the slot clip', async ({ page }) => {
  let body = '';
  await page.route('**/api/clip/lip-sync', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/e2e-lipsync.mp4' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-lip-sync-morning').click();
  await page.getByTestId('slot-media-sheet-audio').setInputFiles({
    name: 'line.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('fake audio'),
  });
  await page.getByTestId('slot-media-sheet-start').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'says your recording',
    { timeout: 30_000 }
  );
  expect(body).toContain('fake audio');
  expect(body).toContain('making coffee');
});
