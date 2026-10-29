import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';
import { ensureStudioWorkspace } from './helpers/gallery';
import { replaceGalleryIdb } from './helpers/idb';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-director';
const cast = {
  version: 1,
  characters: [
    {
      id: CAST,
      name: 'Director Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties with short dark hair',
      bio: { name: 'Director Cast', look: 'a woman', personality: 'warm' },
    },
  ],
  removedIds: [],
};

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
    })),
  };
}

function clipJob(status: 'running' | 'completed', url?: string) {
  return {
    id: 'e2e-director-job',
    tool: 'moves',
    status,
    done: status === 'completed' ? 2 : 1,
    total: 2,
    note: status === 'completed' ? 'Done' : 'Copying the moves on ComfyUI',
    startedAt: Date.now(),
    ...(url ? { url } : {}),
  };
}

async function openDirector(page: Page, seen: { seat: 'yes' | 'no'; asked: number } | null = null) {
  // No pose read of the still in tests: the Director frames the picked shot.
  await page.route('**/api/pose-detect', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ available: false, reason: 'e2e' }),
    })
  );
  // The vision model's "is a seat already behind her?" (asked once a later beat sits).
  await page.route('**/api/pose-gesture', route => {
    if (seen) seen.asked += 1;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        answers: [{ id: 'seat', answer: seen?.seat ?? 'no', confidence: 90 }],
        realism: null,
        place: null,
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
  await page.getByTestId('day-progress-director-morning').click();
  // The Director (three.js) is a lazy chunk: a cold dev server compiles it on first open.
  await expect(page.getByTestId('day-director')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('day-director-preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
}

test('Director: beats, a posed beat, preview, save, and Render sends the driving video', async ({
  page,
}) => {
  test.setTimeout(150_000);
  let body = '';
  await page.route('**/api/clip/moves', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('running') }),
    });
  });
  await page.route('**/api/clip/jobs**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('completed', '/e2e-directed.mp4') }),
    })
  );
  await openDirector(page);
  const d = (id: string) => page.getByTestId(`day-director-${id}`);

  // Two ready-made moves after the start pose.
  await d('move-wave').click();
  await d('move-turn').click();
  await expect(d('beat-2')).toContainText('Turn around');
  await expect(d('time')).toContainText('/ 6.0 s');

  // A pose beat, posed in the 3D editor: raise her right hand.
  await d('add-pose').click();
  const canvas = page.getByTestId('day-director-pose-canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  const before = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]![4]!);
  const hand = await page.evaluate(() => window.__castcutPose3d!.handlePoint('hand_R'));
  expect(hand).not.toBeNull();
  await page.mouse.move(hand!.x, hand!.y);
  await page.mouse.down();
  await page.mouse.move(hand!.x - 30, hand!.y - 90, { steps: 10 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]![4]!);
  expect(after.y).toBeLessThan(before.y - 0.03);
  await page.getByTestId('day-director-pose-editor-save').click();
  await expect(canvas).toBeHidden();
  await expect(d('beat-3')).toContainText('Pose 4');

  // Timing: a longer hold on the start.
  await d('beat-0-hold').fill('1');
  await expect(d('time')).toContainText('/ 8.4 s');

  // Preview: play moves the playhead; the scrubber jumps to a time.
  await d('play').click();
  await expect(d('play')).toHaveAttribute('data-playing', 'true');
  await expect.poll(async () => (await d('time').textContent()) ?? '').not.toMatch(/^0\.0 \//);
  await d('play').click();
  await d('scrub').fill('3');
  await expect(d('time')).toContainText('3.0 /');

  // Camera: a slow push-in.
  await d('camera-move-push-in').click();
  await expect(d('camera-move-push-in')).toHaveAttribute('aria-pressed', 'true');

  // Save it for this Cast member, then remove the posed beat (8.4 s → shorter).
  await d('save-name').fill('Wave and turn');
  await d('save').click();
  await expect(d('saved')).toContainText('Wave and turn');
  await d('beat-3-remove').click();
  await expect(d('beat-3')).toHaveCount(0);

  // A sit puts a seat into the still first (on by default): nothing to warn about.
  await expect(d('place')).toHaveValue('bright kitchen');
  await d('move-sit').click();
  await expect(d('seat')).toBeChecked();
  await expect(d('support')).toHaveCount(0);
  // Without it, a sit warns about the seat (Place starts as the slot's place).
  await d('seat').uncheck();
  await expect(d('support')).toContainText('make sure Place mentions a seat');
  await d('place').fill('');
  await expect(d('support')).toContainText('pick a still with a seat, or describe one in Place');
  await d('place').fill('bright kitchen');
  // One tap puts a seat in Place (Copy moves draws it) and the warning goes.
  await expect(d('support-fix')).toHaveText('Add a chair to Place');
  await d('support-fix').click();
  await expect(d('place')).toHaveValue('bright kitchen, with a wooden chair behind her');
  await expect(d('support')).toHaveCount(0);
  await expect(d('support-fix')).toHaveCount(0);
  await d('beat-3-remove').click();

  await d('render').click();
  await expect(page.getByTestId('day-director')).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'copied moves',
    { timeout: 30_000 }
  );
  // The driving video (a Motion-JPEG AVI), the still, the Cast look and the motion line.
  expect(body).toContain('RIFF');
  expect(body).toContain('AVI ');
  expect(body).toContain('/icon.svg');
  expect(body).toContain('short dark hair');
  expect(body).toContain('bright kitchen, with a wooden chair behind her');
  expect(body).toContain('waves with her right hand, then turns around');
});

test('Director: a move from your own video becomes a beat and renders with the rest', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const read = JSON.parse(
    readFileSync(join(process.cwd(), 'e2e/fixtures/director-video-read.json'), 'utf8')
  ) as unknown;
  let sent = 0;
  await page.route('**/api/director/video-pose**', route => {
    const job = { id: 'e2e-video-read', status: 'running', note: 'Reading the moves on ComfyUI' };
    if (route.request().method() === 'POST') {
      sent += 1;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ job }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: { ...job, status: 'completed', note: undefined, read } }),
    });
  });
  let body = '';
  await page.route('**/api/clip/moves', route => {
    body = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('running') }),
    });
  });
  await page.route('**/api/clip/jobs**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ job: clipJob('completed', '/e2e-directed.mp4') }),
    })
  );
  await openDirector(page);
  const d = (id: string) => page.getByTestId(`day-director-${id}`);
  await d('video-file').setInputFiles({
    name: 'my-wave.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('not really a video: the read is mocked'),
  });
  // Read on the server (polled), followed on the 3D body, then the next beat.
  await expect(d('beat-1')).toContainText('From my-wave', { timeout: 30_000 });
  expect(sent).toBe(1);
  await expect(d('video-note')).toHaveCount(0);
  await expect(d('time')).toContainText('/ 3.1 s');
  // Its length stretches like a ready-made move's (at most twice its own).
  await d('beat-1-seconds').fill('9');
  await expect(d('time')).toContainText('/ 5.6 s');
  await d('move-turn').click();
  await expect(d('beat-2')).toContainText('Turn around');

  await d('render').click();
  await expect(page.getByTestId('day-director')).toBeHidden({ timeout: 60_000 });
  expect(body).toContain('AVI ');
  expect(body).toContain('moves as the person in her reference video does, then turns around');
});

test('Director: stacks on a phone-width screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDirector(page);
  const panel = page.getByTestId('day-director');
  const box = await panel.boundingBox();
  expect(box!.width).toBeLessThanOrEqual(390);
  const preview = await page.getByTestId('day-director-preview').boundingBox();
  const beats = await page.getByTestId('day-director-beats').boundingBox();
  // The preview sits above the beats, not beside them.
  expect(beats!.y).toBeGreaterThan(preview!.y + preview!.height - 1);
  await expect(page.getByTestId('day-director-render')).toBeVisible();
});

test('Director: a still that already shows a seat starts with the seat edit off', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const seen = { seat: 'yes' as const, asked: 0 };
  await openDirector(page, seen);
  const d = (id: string) => page.getByTestId(`day-director-${id}`);
  // Nothing sits yet: nothing asked.
  expect(seen.asked).toBe(0);
  await d('preset-sit').click();
  await expect(d('seat-seen')).toBeVisible();
  await expect(d('seat')).not.toBeChecked();
  // The seat in the picture covers the sit: no Place warning.
  await expect(d('support')).toHaveCount(0);
  expect(seen.asked).toBe(1);
  // Still the player's choice.
  await d('seat').check();
  await expect(d('seat')).toBeChecked();
});

test('Phone Day: ⋯ → Make it move has Copy moves and Direct a move', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/pose-detect', route =>
    route.fulfill({ json: { available: false, reason: 'e2e' } })
  );
  let posted = '';
  await page.route('**/api/clip/moves', route => {
    posted = route.request().postDataBuffer()?.toString('latin1') ?? '';
    return route.fulfill({ json: { job: clipJob('running') } });
  });
  await page.route('**/api/clip/jobs**', route =>
    route.fulfill({ json: { job: clipJob('completed', '/e2e-directed.mp4') } })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/m/day');
  await dismissBlockingOverlays(page);
  const noSideScroll = async () =>
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    ).toBeLessThanOrEqual(1);

  // Copy moves: the same sheet as desk, inside the phone's width.
  const menu = page.getByTestId('day-progress-menu-morning').first();
  await expect(menu).toBeVisible({ timeout: 30_000 });
  await menu.click();
  const moves = page.getByTestId('day-progress-moves-morning');
  await expect(moves).toBeVisible();
  // Inside the screen once the menu has opened (it animates in).
  await expect
    .poll(async () => {
      const item = await moves.boundingBox();
      return item && item.x >= 0 && item.x + item.width <= 390;
    })
    .toBe(true);
  await moves.click();
  const sheet = page.getByTestId('slot-media-sheet');
  await expect(sheet).toBeVisible();
  expect((await sheet.boundingBox())!.width).toBeLessThanOrEqual(390);
  await expect(page.getByTestId('slot-media-sheet-video')).toBeAttached();
  await noSideScroll();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  // Direct a move: the Director, stacked, and Render starts Copy moves on the slot.
  await page.getByTestId('day-progress-menu-morning').first().click();
  await page.getByTestId('day-progress-director-morning').click();
  await expect(page.getByTestId('day-director')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('day-director-preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  expect((await page.getByTestId('day-director').boundingBox())!.width).toBeLessThanOrEqual(390);
  await page.getByTestId('day-director-preset-wave-turn').click();
  await expect(page.getByTestId('day-director-beat-2')).toContainText('Turn around');
  await page.getByTestId('day-director-render').click();
  await expect(page.getByTestId('day-director')).toBeHidden({ timeout: 60_000 });
  await expect(page.getByTestId('day-progress-media-note-morning')).toContainText(
    'copied moves',
    { timeout: 30_000 }
  );
  expect(posted).toContain('AVI ');
  expect(posted).toContain('waves with her right hand, then turns around');
});

test('Director: a Gallery still opens it from ⋯ → Make it move', async ({ page }) => {
  await page.route('**/api/pose-detect', route =>
    route.fulfill({ json: { available: false, reason: 'e2e' } })
  );
  const entry = {
    id: 'e2e-director-still',
    promptId: 'e2e-director-prompt',
    prompt: 'a woman in a pink dress',
    tool: 'day',
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: Date.now(),
    completedAt: Date.now(),
    images: [{ filename: 'e2e-director.png', subfolder: '', type: 'output' }],
  };
  await ensureStudioWorkspace(page);
  await replaceGalleryIdb(page, [entry]);
  await gotoStable(page, '/gallery');
  await replaceGalleryIdb(page, [entry]);
  await page.reload();
  await dismissBlockingOverlays(page);
  const menu = page.getByTestId('gallery-card-menu').first();
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.click();
  const panel = page.getByRole('menu');
  await panel.locator('summary', { hasText: 'Make it move' }).click();
  await panel.getByTestId('gallery-still-tool-director').click();
  await expect(page.getByTestId('gallery-director')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('gallery-director-preview')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  await page.getByTestId('gallery-director-cancel').click();
  await expect(page.getByTestId('gallery-director')).toBeHidden();
});
