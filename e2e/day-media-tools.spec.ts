import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';
import { openStoryBeatMenu } from './helpers/story';
import { openDaySlotSheet } from './helpers/day';

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

/** Sharpen & smooth runs as a background job: started at once, then polled until done. */
function clipJob(status: 'running' | 'completed', url?: string) {
  return {
    id: 'e2e-clip-job',
    tool: 'finish',
    status,
    done: status === 'completed' ? 2 : 1,
    total: 2,
    note: status === 'completed' ? 'Done' : 'Sharpening on ComfyUI',
    startedAt: Date.now(),
    ...(url ? { url } : {}),
  };
}

async function mockClipJobDone(page: Page, url: string) {
  await page.route('**/api/clip/jobs**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('completed', url) }),
    })
  );
}

test('Sharpen & smooth: the finished clip replaces the slot clip', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = [];
  await page.route('**/api/clip/finish', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('running') }),
    });
  });
  await mockClipJobDone(page, '/e2e-finished.mp4');
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

async function openStory(page: import('@playwright/test').Page) {
  const now = Date.now();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      roleplay: {
        activeSessionId: `cast-${CAST}`,
        characterName: 'Media Cast',
        bio: { name: 'Media Cast', look: 'a woman', personality: 'warm' },
        story: [
          {
            id: 'b1',
            at: now - 2000,
            kind: 'plot',
            title: 'Morning',
            blurb: 'Coffee by the window.',
            castId: CAST,
            stillStatus: 'completed',
            promptId: 'p-story',
            imageUrl: '/icon.svg',
            clipStatus: 'completed',
            clipPromptId: 'c-story',
            clipUrl: '/e2e-story-clip.mp4',
          },
        ],
      },
    },
  });
  await gotoStable(page, `/story?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await openStoryBeatMenu(page, 0);
}

test('Story: Sharpen & smooth and Relight a scene', async ({ page }) => {
  const finish: Array<Record<string, unknown>> = [];
  const relight: Array<Record<string, unknown>> = [];
  await page.route('**/api/clip/finish', route => {
    finish.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('running') }),
    });
  });
  await mockClipJobDone(page, '/e2e-story-finished.mp4');
  await page.route('**/api/still/relight', route => {
    relight.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/icon.svg' }),
    });
  });
  await openStory(page);
  await page.getByTestId('story-beat-finish').first().click();
  await expect(page.getByTestId('story-beat-media-note').first()).toContainText(
    'sharper and smoother',
    { timeout: 30_000 }
  );
  expect(finish[0]?.clipUrl).toBe('/e2e-story-clip.mp4');
  await openStoryBeatMenu(page, 0);
  await page.getByTestId('story-beat-relight').first().click();
  await page.getByTestId('slot-media-sheet-look-window').click();
  await expect(page.getByTestId('story-beat-media-note').first()).toContainText('relit still', {
    timeout: 30_000,
  });
  expect(relight[0]?.look).toBe('window');
});

test('Dance to music: a song, a style, and the clip in place', async ({ page }) => {
  let body = '';
  await page.route('**/api/clip/dance', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/e2e-dance.mp4' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-dance-morning').click();
  await page.getByTestId('slot-media-sheet-music').setInputFiles({
    name: 'song.mp3',
    mimeType: 'audio/mpeg',
    buffer: Buffer.from('fake song'),
  });
  await page.getByTestId('slot-media-sheet-style-kpop').click();
  await page.getByTestId('slot-media-sheet-start-at').fill('20');
  await page.getByTestId('slot-media-sheet-start').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'dances to your song',
    { timeout: 30_000 }
  );
  expect(body).toContain('fake song');
  expect(body).toContain('kpop');
  expect(body).toMatch(/name="start"\r\n\r\n20/);
});

test('Lip-sync with two people sends both recordings', async ({ page }) => {
  let body = '';
  await page.route('**/api/clip/lip-sync', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/e2e-lipsync-2.mp4' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-lip-sync-morning').click();
  await page.getByTestId('slot-media-sheet-audio').setInputFiles({
    name: 'her.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('her line'),
  });
  await page.getByTestId('slot-media-sheet-audio-2').setInputFiles({
    name: 'his.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from('his answer'),
  });
  await page.getByTestId('slot-media-sheet-start').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'says your recording',
    { timeout: 30_000 }
  );
  expect(body).toContain('her line');
  expect(body).toMatch(/name="audio2"[^]*his answer/);
});

test('Sketch: draw, render, and use it as the still', async ({ page }) => {
  let body = '';
  await page.route('**/api/still/sketch', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/icon.svg' }),
    });
  });
  await openDay(page);
  await page.getByTestId('day-progress-sketch-morning').click();
  const canvas = page.getByTestId('day-sketch-sheet-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 15_000 });
  await page.getByTestId('day-sketch-sheet-words').fill('a red umbrella');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 8 });
  await page.mouse.up();
  // It renders by itself once drawing pauses.
  await expect(page.getByTestId('day-sketch-sheet-result')).toBeVisible({ timeout: 15_000 });
  expect(body).toContain('a red umbrella');
  expect(body).toMatch(/name="overStill"\r\n\r\ntrue/);
  await page.getByTestId('day-sketch-sheet-use').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'sketched still is shown',
    { timeout: 30_000 }
  );
});

test('Upscale to 4K replaces the shown still', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = [];
  await page.route('**/api/still/upscale', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: '/icon.svg' }) });
  });
  await openDay(page);
  await page.getByTestId('day-progress-upscale-morning').click();
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText('4K now', { timeout: 30_000 });
  expect(posts[0]).toMatchObject({ stillUrl: '/icon.svg', target: '4k' });
});

test('Cut: Subtitles is on by default and goes to the server encode', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/cut?from=day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-subtitles').first()).toBeChecked({ timeout: 15_000 });
});

test('Story: a scene’s narration can be suggested', async ({ page }) => {
  let sent: Record<string, unknown> = {};
  await page.route('**/api/spoken-line', route => {
    sent = route.request().postDataJSON() as Record<string, unknown>;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ line: 'I should never have opened that door.' }) });
  });
  await openStory(page);
  await page.getByTestId('story-beat-edit').first().click();
  await page.getByTestId('story-beat-narration-suggest').first().click();
  await expect(page.getByTestId('story-beat-narration').first()).toHaveValue('I should never have opened that door.', { timeout: 15_000 });
  expect(sent.kind).toBe('narration');
});

test('Dub: lines are translated, kept with the original, and can go back', async ({ page }) => {
  const posts: Array<Record<string, unknown>> = [];
  await page.route('**/api/dub-lines', route => {
    posts.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ lines: ['¡Buenos días, cocina!'] }),
    });
  });
  const day = finishedDay();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      day: {
        ...day,
        slots: day.slots.map(slot => ({ ...slot, line: 'Good morning, kitchen!' })),
        // No finished still: the dub stops after the lines (no clip is queued).
        stills: [],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await page.getByTestId('day-dub-language').first().selectOption('Spanish');
  await page.getByTestId('day-dub-run').first().click();
  await expect(page.getByTestId('day-dub-note').first()).toContainText('1 line in Spanish', {
    timeout: 15_000,
  });
  expect(posts[0]).toMatchObject({ lines: ['Good morning, kitchen!'], language: 'Spanish' });
  await page.getByTestId('day-dub-language').first().selectOption('');
  await page.getByTestId('day-dub-run').first().click();
  await expect(page.getByTestId('day-dub-note').first()).toContainText('back as written', {
    timeout: 15_000,
  });
  expect(posts).toHaveLength(1);
});

test('Group still: a third Cast member is picked by face on the slot', async ({ page }) => {
  const day = finishedDay();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      ...cast,
      characters: [
        ...cast.characters,
        { id: 'e2e-friend', name: 'Friend Fay', version: 1, updatedAt: Date.now(), descriptor: 'a woman with long black hair' },
      ],
    },
    tools: { day: { ...day, allowCompanions: true } },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-group').first()).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('day-slot-third-e2e-friend').first().click();
  await expect(page.getByTestId('day-slot-third-e2e-friend').first()).toHaveAttribute('aria-checked', 'true');
});
