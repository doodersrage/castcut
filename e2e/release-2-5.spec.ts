import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';
import { closeDaySheets, openDaySlotSheet } from './helpers/day';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-25';
const cast = {
  version: 1,
  characters: [
    {
      id: CAST,
      name: 'Release Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties',
      bio: { name: 'Release Cast', look: 'a woman', personality: 'warm' },
    },
  ],
  removedIds: [],
};

/** A Day whose two slots both have a finished still and clip. */
function finishedDay(extra: Record<string, unknown> = {}) {
  const slots = [
    {
      id: 'morning',
      label: 'Morning',
      location: 'bright kitchen',
      sceneHints: 'making coffee with her partner',
      ...extra,
    },
    { id: 'evening', label: 'Evening', location: 'home', sceneHints: 'cooking dinner' },
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

test('Day slot: a reply under the line, and Suggest a reply fills it', async ({ page }) => {
  await page.route('**/api/spoken-line', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ line: 'Only because you were snoring.' }),
    })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay({ line: 'You made coffee?' }) },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  const reply = page.getByTestId('day-slot-line-reply-input').first();
  await expect(reply).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('day-slot-line-suggest-reply').first().click();
  await expect(reply).toHaveValue('Only because you were snoring.');
  await closeDaySheets(page);
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-line-reply-input').first()).toHaveValue(
    'Only because you were snoring.'
  );
});

test('Make it 30 s: direction, written beats, an edit, and the long clip in place', async ({
  page,
}) => {
  const posts: Array<Record<string, unknown>> = [];
  let polls = 0;
  await page.route('**/api/clip/extend**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      posts.push(body);
      if (body.plan === true) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            plan: {
              total: 3,
              partSec: 4.3,
              beats: ['She sets the mug down.', 'She picks up her bag.', 'She heads for the door.'],
            },
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job: { id: 'job-1', status: 'running', done: 0, total: 3 } }),
      });
    }
    polls += 1;
    const done = polls >= 2;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job: {
          id: 'job-1',
          status: done ? 'completed' : 'running',
          done: done ? 3 : 1,
          total: 3,
          ...(done ? { url: '/e2e-extended.mp4', seconds: 30 } : {}),
        },
      }),
    });
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await page.getByTestId('day-progress-menu-morning').first().click();
  await page.getByTestId('day-progress-extend-morning').click();
  const sheet = page.getByTestId('day-extend-sheet');
  await expect(sheet).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('day-extend-sheet-direction').fill('She leaves for work.');
  await page.getByTestId('day-extend-sheet-write').click();
  await expect(page.getByTestId('day-extend-sheet-beat-2')).toHaveValue('She heads for the door.');
  await page.getByTestId('day-extend-sheet-beat-1').fill('She grabs her keys.');
  await expect(page.getByTestId('day-extend-sheet-start')).toContainText('3 parts');
  await page.getByTestId('day-extend-sheet-start').click();
  await expect(page.getByTestId('day-progress-extend-note-morning')).toContainText(
    'Done — the clip is now about 30 seconds',
    { timeout: 30_000 }
  );
  const start = posts.find(body => body.plan !== true)!;
  expect(start.direction).toBe('She leaves for work.');
  expect(start.beats).toEqual([
    'She sets the mug down.',
    'She grabs her keys.',
    'She heads for the door.',
  ]);
  expect(start.clipUrl).toBe('/e2e-clip-morning.mp4');
});

test('Cut options: Score this film sets an original track as the music', async ({ page }) => {
  await page.route('**/api/film/score', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        url: '/api/comfyui/view?filename=e2e-score.mp3&type=output',
        label: 'Score: acoustic indie pop',
        seconds: 30,
      }),
    })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const disclosure = page.locator('[data-testid$="-options-disclosure"] summary').first();
  await expect(disclosure).toBeVisible({ timeout: 30_000 });
  await disclosure.click();
  await page.locator('[data-testid$="-score"]').first().click();
  await expect(page.locator('[data-testid$="-audio-bed-status"]').first()).toContainText(
    'Score: acoustic indie pop'
  );
});

test('Make it 30 s: a job still running when the page was left is picked up again', async ({
  page,
}) => {
  await page.route('**/api/clip/extend**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        job: { id: 'job-left', status: 'completed', done: 6, total: 6, url: '/e2e-long.mp4' },
      }),
    })
  );
  const day = finishedDay();
  (day.stills[0] as Record<string, unknown>).extendJobId = 'job-left';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-progress-extend-note-morning')).toContainText(
    'Done — the clip is now about 30 seconds',
    { timeout: 30_000 }
  );
});
