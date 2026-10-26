import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { replaceGalleryIdb, seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-cut-room';
const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';

async function seed(page: import('@playwright/test').Page, withStory = true) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'cr-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'cr-a' },
        ],
      },
      ...(withStory
        ? {
            roleplay: {
              story: [
                {
                  id: 'beat-1',
                  at: 1,
                  title: 'The knock',
                  text: 'Someone knocks at the door.',
                  stillStatus: 'completed',
                  imageUrl: thumb,
                  clipStatus: 'completed',
                  clipUrl: thumb,
                },
              ],
            },
          }
        : {}),
    },
  });
}

test('Cut is its own step: a tab, both reels in one shot list, and a source can be left out', async ({
  page,
}) => {
  await seed(page);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-source-day')).toContainText('Day · 2 shots', { timeout: 30_000 });
  await expect(page.getByTestId('cut-source-story')).toContainText('Story · 1 shot');
  await expect(page.getByTestId('cut-shot-list')).toBeVisible();
  await expect(page.getByTestId('cut-film').first()).toContainText('3 shots');
  // Leave Story out: the cut is the Day alone (and that choice is kept).
  await page.getByTestId('cut-source-story').click();
  await expect(page.getByTestId('cut-source-story')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots');
  // The header has a Cut tab.
  await expect(page.getByRole('link', { name: 'Cut', exact: true }).first()).toBeVisible();
});

test('arriving from Story picks the Story; an empty source links to its page', async ({ page }) => {
  await seed(page);
  await gotoStable(page, '/cut?from=story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-source-story')).toHaveAttribute('aria-checked', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('cut-source-day')).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByTestId('cut-film').first()).toContainText('1 shot');
});

test('Day and Story hand off to Cut', async ({ page }) => {
  await seed(page, false);
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  const open = page.getByTestId('day-cut-coach-cut');
  await expect(open).toHaveAttribute('href', '/cut?from=day', { timeout: 30_000 });
  await open.click();
  await expect(page).toHaveURL(/\/cut\?from=day/, { timeout: 30_000 });
  await expect(page.getByTestId('cut-source-day')).toHaveAttribute('aria-checked', 'true', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('cut-source-story')).toContainText('no shots yet');
});

test('the editor: timeline blocks, click to jump, Delete leaves a shot out, undo, drag a hold', async ({
  page,
}) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const morning = page.getByTestId('cut-timeline-shot-day:morning');
  const afternoon = page.getByTestId('cut-timeline-shot-day:afternoon');
  await expect(morning).toBeVisible({ timeout: 30_000 });
  await expect(afternoon).toBeVisible();
  // Click a block: the playhead jumps there and its card is the active one.
  await afternoon.click();
  await expect(page.getByTestId('cut-shot-day:afternoon')).toHaveAttribute('data-active', 'true');
  // Delete leaves the shot under the playhead out; undo puts it back.
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('cut-film').first()).toContainText('1 shot', { timeout: 10_000 });
  await expect(page.getByTestId('cut-undo')).toBeEnabled();
  await page.getByTestId('cut-undo').click();
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots');
  await expect(page.getByTestId('cut-redo')).toBeEnabled();
  // The monitor rebuilds after the undo: measure once it shows both shots again.
  await expect(page.getByTestId('cut-preview-notes')).toContainText('2 shots', { timeout: 15_000 });
  await expect(page.getByTestId('cut-preview-building')).toHaveCount(0, { timeout: 15_000 });
  // Drag the morning still's right edge: it holds longer (2.5 s → about 4 s).
  const edge = page.getByTestId('cut-timeline-hold-day:morning');
  // The mouse only reaches what is in the window (the options panel can push the timeline down).
  await edge.scrollIntoViewIfNeeded();
  const box = (await edge.boundingBox())!;
  const blockBox = (await morning.boundingBox())!;
  const pxPerSec = blockBox.width / 2.5;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + pxPerSec * 1.5, box.y + box.height / 2, {
    steps: 6,
  });
  await page.mouse.up();
  const hold = page.getByRole('spinbutton', { name: 'Hold for Morning' });
  await expect
    .poll(async () => Number(await hold.inputValue()), { timeout: 10_000 })
    .toBeGreaterThan(3.4);
  // Alt+→ moves the shot under the playhead later.
  await morning.click();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(page.locator('[data-testid^="cut-shot-day:"][draggable]').first()).toHaveAttribute(
    'data-testid',
    'cut-shot-day:afternoon',
    { timeout: 10_000 }
  );
});

test('a transition picked on the timeline overlaps the shots (and shows on the card)', async ({
  page,
}) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  // Two 2.5 s stills, hard cut: 0:05.
  await expect(page.getByTestId('cut-preview-notes')).toContainText('2 shots · 0:05', {
    timeout: 30_000,
  });
  await page.getByTestId('cut-timeline-transition-day:afternoon').selectOption('black');
  // A 0.6 s fade through black overlaps them: 4.4 s.
  await expect(page.getByTestId('cut-preview-notes')).toContainText('2 shots · 0:04', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('cut-shot-transition-day:afternoon')).toHaveValue('black');
});

test('add shots: a text card, a duplicate, remove, and split a clip at the playhead', async ({
  page,
}) => {
  const clip = readFileSync(join(__dirname, 'fixtures', 'talk-2s.mp4'));
  await page.route('**/e2e-media/talk-2s.mp4', route =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: clip })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'waves' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'a-m' },
          {
            slotId: 'afternoon',
            status: 'completed',
            imageUrl: thumb,
            promptId: 'a-a',
            clipStatus: 'completed',
            clipUrl: '/e2e-media/talk-2s.mp4',
            clipPromptId: 'a-a-clip',
          },
        ],
      },
    },
  });
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const blocks = page.locator('[data-testid^="cut-timeline-shot-"]');
  await expect(blocks).toHaveCount(2, { timeout: 30_000 });
  // A text card after the shot under the playhead (the first): its words are editable.
  await page.getByTestId('cut-add-text').click();
  await expect(blocks).toHaveCount(3, { timeout: 15_000 });
  const words = page.locator('[data-testid^="cut-text-x:"]').first();
  await words.fill('Three weeks later');
  await expect(page.locator('[data-testid^="cut-shot-x:"]').first()).toContainText(
    'Three weeks later'
  );
  // Remove it again.
  await page.locator('[data-testid^="cut-remove-x:"]').first().click();
  await expect(blocks).toHaveCount(2, { timeout: 15_000 });
  // Split the clip 1 s in: two pieces, the first ends at 1 s, the second starts there.
  await expect(page.getByTestId('cut-preview-notes')).toContainText('2 shots', { timeout: 15_000 });
  await page.getByTestId('cut-preview-scrub').fill('3.5');
  await expect(page.getByTestId('cut-split')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('cut-split').click();
  await expect(blocks).toHaveCount(3, { timeout: 15_000 });
  await expect(page.getByTestId('cut-shot-trim-day:afternoon-end')).toHaveValue('1');
  await expect(page.getByTestId('cut-shot-trim-day:afternoon~2-start')).toHaveValue('1');
  // Duplicate the still: one more shot; undo takes it back.
  await page.getByTestId('cut-timeline-shot-day:morning').click();
  await page.getByTestId('cut-duplicate').click();
  await expect(blocks).toHaveCount(4, { timeout: 15_000 });
  await page.getByTestId('cut-undo').click();
  await expect(blocks).toHaveCount(3, { timeout: 15_000 });
});

// M4 F1: the edit and its undo outlive a reload.
test('an edit survives a reload, and Undo still takes it back', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(
    page,
    {
      shared: { activeCharacterId: CAST },
      characters: {
        version: 1,
        characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      },
      tools: {
        day: {
          stillsCharacterId: CAST,
          slots: [
            { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
            { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
          ],
          stills: [
            { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'f1-m' },
            { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'f1-a' },
          ],
        },
      },
    },
    { once: true }
  );
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const blocks = page.locator('[data-testid^="cut-timeline-shot-"]');
  await expect(blocks).toHaveCount(2, { timeout: 30_000 });
  await page.getByTestId('cut-add-text').click();
  await expect(blocks).toHaveCount(3, { timeout: 15_000 });
  // Saved, and stamped as an edit (the merge keeps another device's edit by these).
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<string>(resolve => {
            const request = indexedDB.open('comfy-prompt-studio-v1');
            request.onerror = () => resolve('');
            request.onsuccess = () => {
              const db = request.result;
              const get = db
                .transaction('kv', 'readonly')
                .objectStore('kv')
                .get('comfy-prompt-tool-settings-tools-v1');
              get.onsuccess = () => {
                db.close();
                const cut = get.result?.value?.tools?.cut;
                resolve([cut?.extras?.length ?? 0, typeof cut?.editedAt].join('|'));
              };
              get.onerror = () => {
                db.close();
                resolve('');
              };
            };
          })
      )
    )
    .toBe('1|number');
  await expect
    .poll(() => page.evaluate(() => Boolean(sessionStorage.getItem('castcut-cut-history-v1'))))
    .toBe(true);

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(blocks).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId('cut-undo')).toBeEnabled({ timeout: 15_000 });
  await page.getByTestId('cut-undo').click();
  await expect(blocks).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('cut-redo')).toBeEnabled();
});

test('versions: save the edit, change it, open the saved one back', async ({ page }) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots', { timeout: 30_000 });
  await page.getByTestId('cut-version-name').fill('Long');
  await page.getByTestId('cut-version-save').click();
  await expect(page.getByTestId('cut-version-Long')).toBeVisible();
  // A shorter edit: leave the afternoon out.
  await page.getByTestId('cut-shot-include-day:afternoon').uncheck();
  await expect(page.getByTestId('cut-film').first()).toContainText('1 shot');
  // Open "Long": both shots again; undo goes back to the short edit.
  await page.getByTestId('cut-version-open-Long').click();
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots');
  await page.getByTestId('cut-undo').click();
  await expect(page.getByTestId('cut-film').first()).toContainText('1 shot');
  // A still's move is set on its card (kept with the cut like every edit).
  await page.getByTestId('cut-shot-motion-day:morning').selectOption('none');
  await expect(page.getByTestId('cut-shot-motion-day:morning')).toHaveValue('none');
  await expect(page.getByTestId('cut-version-Long')).toBeVisible();
});

// R5: a shot keeps the media it was cut with; a new take is offered, never swapped in.
test('pins: an edited shot keeps its take, a new one is offered, a gone scene plays on', async ({
  page,
}) => {
  const older = '/wardrobe-thumbs/bottom-aqua-baggy-jeans.webp';
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'reads' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'cr-m' },
          { slotId: 'afternoon', status: 'completed', imageUrl: thumb, promptId: 'cr-a' },
        ],
      },
      cut: {
        options: {
          shotEdits: {
            shots: {
              // Cut earlier with an older picture; the slot has been redone since.
              'day:afternoon': { framing: 'medium', pin: { url: older, kind: 'still', at: 1 } },
              // A shot from a scene that has since been deleted.
              'scenes:gone-scene': {
                pin: { url: older, kind: 'still', title: 'Rooftop', at: 1 },
              },
            },
          },
        },
      },
    },
  });
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-film').first()).toContainText('3 shots', { timeout: 30_000 });

  // Untouched: it follows the slot. An edit pins it to the picture it shows.
  await expect(page.getByTestId('cut-pin-day:morning')).toHaveAttribute('data-pin', 'follows');
  await page.getByTestId('cut-shot-framing-day:morning').selectOption('medium');
  await expect(page.getByTestId('cut-pin-day:morning')).toHaveAttribute('data-pin', 'pinned');

  // The redone slot is offered, not swapped in: the shot still shows the older picture.
  const afternoon = page.getByTestId('cut-pin-day:afternoon');
  await expect(afternoon).toHaveAttribute('data-pin', 'new-take');
  await expect(page.locator('[data-testid="cut-shot-pick-day:afternoon"] img')).toHaveAttribute(
    'src',
    older
  );
  await page.getByTestId('cut-pin-day:afternoon-keep').click();
  await expect(afternoon).toHaveAttribute('data-pin', 'pinned');
  await page.getByTestId('cut-undo').click();
  await expect(afternoon).toHaveAttribute('data-pin', 'new-take');
  await page.getByTestId('cut-pin-day:afternoon-use').click();
  await expect(afternoon).toHaveAttribute('data-pin', 'pinned');
  await expect(page.locator('[data-testid="cut-shot-pick-day:afternoon"] img')).toHaveAttribute(
    'src',
    thumb
  );
  // M4 F2: the take it had is remembered — Back to the earlier take puts it (and its edits) back,
  // and the newer take isn't offered again.
  await page.getByTestId('cut-pin-day:afternoon-back').click();
  await expect(page.locator('[data-testid="cut-shot-pick-day:afternoon"] img')).toHaveAttribute(
    'src',
    older
  );
  await expect(afternoon).toHaveAttribute('data-pin', 'pinned');
  await expect(page.getByTestId('cut-pin-day:afternoon-back')).toHaveCount(0);
  await expect(page.getByTestId('cut-shot-framing-day:afternoon')).toHaveValue('medium');

  // The deleted scene's shot plays on from its pin, marked; unpinned, it leaves the cut.
  await expect(page.getByTestId('cut-pin-scenes:gone-scene')).toHaveAttribute(
    'data-pin',
    'source-gone'
  );
  await page.getByTestId('cut-pin-scenes:gone-scene-toggle').click();
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots');
});

// M4 F3: a shot whose file is gone is listed before cutting, and relinked to another take.
test('missing media: a gone file is listed, and relinking to another take fixes it', async ({
  page,
}) => {
  await page.route('**/e2e-gone/**', route => route.fulfill({ status: 404, body: 'gone' }));
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      scene: {
        scenes: [
          {
            id: 'scene-f3',
            castId: CAST,
            name: 'Kitchen',
            slot: { id: 'morning', label: 'Morning', location: 'kitchen' },
            takes: [
              { id: 'f3-a', promptId: 'f3-a', imageUrl: thumb, at: 1 },
              { id: 'f3-b', promptId: 'f3-b', imageUrl: '/e2e-gone/b.png', at: 2 },
            ],
            keptTakeId: 'f3-b',
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
    },
  });
  await gotoStable(page, '/cut?from=scenes');
  await dismissBlockingOverlays(page);
  const missing = page.getByTestId('cut-missing-scenes:scene-f3');
  await expect(missing).toBeVisible({ timeout: 30_000 });
  await expect(missing).toHaveAttribute('data-blocks', 'true');
  await expect(missing).toContainText('its file is gone');

  // Relink to the scene's other take: nothing missing, and the way back is offered.
  await page.getByTestId('cut-missing-take-scenes:scene-f3').first().click();
  await expect(page.getByTestId('cut-missing-section')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('cut-pin-scenes:scene-f3-back')).toBeVisible();
  await expect(page.locator('[data-testid="cut-shot-pick-scenes:scene-f3"] img')).toHaveAttribute(
    'src',
    thumb
  );
});

// M4 F4: mute and solo per track; a muted track is saved with the cut and said.
test('tracks: mute and solo in the monitor, and a muted track is kept with the cut', async ({
  page,
}) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const music = page.getByTestId('cut-track-music');
  await expect(music).toHaveAttribute('data-audible', 'true', { timeout: 30_000 });
  // Solo the narration: only it is heard.
  await page.getByTestId('cut-track-solo-narration').click();
  await expect(music).toHaveAttribute('data-audible', 'false');
  await expect(page.getByTestId('cut-track-narration')).toHaveAttribute('data-audible', 'true');
  await page.getByTestId('cut-track-solo-narration').click();
  await expect(music).toHaveAttribute('data-audible', 'true');
  // Mute the music: silent, said, and undoable.
  await page.getByTestId('cut-track-mute-music').click();
  await expect(music).toHaveAttribute('data-audible', 'false');
  await expect(page.getByTestId('cut-track-mute-music')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cut-tracks-note')).toContainText('left out of the cut');
  await page.getByTestId('cut-undo').click();
  await expect(music).toHaveAttribute('data-audible', 'true');
});

// M4 F4: a film's loudness, measured on asking and said against a target.
test('a film’s loudness is measured and said against the web target', async ({ page }) => {
  await seed(page, false);
  await page.route('**/api/film/loudness', route =>
    route.fulfill({
      json: { ok: true, loudness: { integratedLufs: -21.7, rangeLu: 0, truePeakDbtp: -14.5 } },
    })
  );
  await gotoStable(page, '/cut');
  const now = Date.now();
  await replaceGalleryIdb(page, [
    {
      id: 'e2e-cut-film-1',
      promptId: 'film-e2e-cut-film-1',
      prompt: 'Assembled film · Rae',
      tool: 'day',
      derivedKind: 'film',
      characterId: CAST,
      comfyUrl: 'http://127.0.0.1:8188',
      status: 'completed',
      queuedAt: now,
      completedAt: now,
      images: [{ filename: 'rae-day.mp4', subfolder: '', type: 'output', format: 'video/mp4' }],
    },
  ]);
  await page.reload();
  await dismissBlockingOverlays(page);
  await page.getByTestId('film-loudness-measure').first().click({ timeout: 30_000 });
  const result = page.getByTestId('film-loudness-result').first();
  await expect(result).toContainText('−21.7 LUFS');
  await expect(result).toContainText('7.7 LU quieter than −14 LUFS');
  await page.getByLabel('Loudness target').first().selectOption('broadcast');
  await expect(result).toContainText('right for broadcast');
});

// M4 F4: the real measurement (ffmpeg ebur128) on a fixture clip; skipped where the server has
// no ffmpeg.
test('the loudness route measures a real clip', async ({ page }) => {
  const clip = readFileSync(join(__dirname, 'fixtures', 'talk-2s.mp4'));
  const response = await page.request.post('/api/film/loudness', {
    data: { url: `data:video/mp4;base64,${clip.toString('base64')}` },
  });
  test.skip(response.status() === 503, 'ffmpeg is not available on this server');
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    loudness: { integratedLufs: number; truePeakDbtp?: number };
  };
  expect(body.loudness.integratedLufs).toBeLessThan(-10);
  expect(body.loudness.integratedLufs).toBeGreaterThan(-40);
  expect(typeof body.loudness.truePeakDbtp).toBe('number');
});

// M4 F5: subtitles typed per shot, set to none, read in from an .srt, and written out.
test('subtitles: typed, set to none, imported from an .srt and exported', async ({ page }) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const summary = page.getByTestId('cut-subtitles-summary');
  await expect(summary).toContainText('No subtitles yet', { timeout: 30_000 });

  await page.getByTestId('cut-subtitle-text-day:morning').fill('Coffee first.');
  await page.getByTestId('cut-subtitle-text-day:morning').blur();
  await expect(summary).toContainText('1 subtitle on 1 shot');
  await page.getByTestId('cut-subtitle-none-day:morning').click();
  await expect(summary).toContainText('No subtitles yet');
  await page.getByTestId('cut-undo').click();
  await expect(summary).toContainText('1 subtitle on 1 shot');

  // An .srt: its cue in the second shot's time goes on that shot, shown before it applies.
  const morningSec = Number(
    await page.getByTestId('cut-subtitle-day:morning').getByText(/s of /).textContent().then(
      text => text?.match(/of ([\d.]+)/)?.[1] ?? '0'
    )
  );
  const at = (sec: number) => `00:00:${sec.toFixed(3).padStart(6, '0').replace('.', ',')}`;
  await page.getByTestId('cut-subtitles-import').setInputFiles({
    name: 'film.srt',
    mimeType: 'application/x-subrip',
    buffer: Buffer.from(
      `1\n${at(morningSec + 0.5)} --> ${at(morningSec + 1.5)}\nA walk in the park.\n`
    ),
  });
  await expect(page.getByTestId('cut-subtitles-incoming')).toContainText('A walk in the park.');
  await page.getByTestId('cut-subtitles-apply').click();
  await expect(page.getByTestId('cut-subtitle-text-day:afternoon')).toHaveValue(
    'A walk in the park.'
  );
  await expect(summary).toContainText('2 subtitles on 2 shots');

  const download = page.waitForEvent('download');
  await page.getByTestId('cut-subtitles-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.srt$/);
  const text = readFileSync((await file.path())!, 'utf8');
  expect(text).toContain('Coffee first.');
  expect(text).toContain('A walk in the park.');
});

// M4 F6: a profile sets the film up for where it goes; the preflight says what's checked now.
test('export: a profile sets the shape, and the preflight flags too little disk space', async ({
  page,
}) => {
  await page.route('**/api/film/assemble', route =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { ok: true, available: true, encoder: 'ffmpeg', freeBytes: 10e6 } })
      : route.fulfill({ status: 503, json: { error: 'e2e: no encode' } })
  );
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-preflight-shots')).toHaveAttribute('data-status', 'ok', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('cut-preflight-space')).toHaveAttribute('data-status', 'fail');
  await expect(page.getByTestId('cut-preflight-space')).toContainText('10 MB free');
  // Two stills, no music: nothing to hear.
  await expect(page.getByTestId('cut-preflight-sound')).toHaveAttribute('data-status', 'warn');

  await page.getByTestId('cut-profile-vertical').click();
  await expect(page.getByTestId('cut-profile-vertical')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cut-preflight-size')).toContainText('1080×1920');
  // Subtitles are on now, and no shot has any.
  await expect(page.getByTestId('cut-preflight-subtitles')).toHaveAttribute('data-status', 'warn');
  await page.getByTestId('cut-undo').click();
  await expect(page.getByTestId('cut-profile-vertical')).toHaveAttribute('aria-pressed', 'false');
});

// M4 F6: a real server encode reads its own output back (skipped without ffmpeg).
test('the server encode reports what the finished film is', async ({ page }) => {
  const info = await page.request.get('/api/film/assemble');
  const server = (await info.json()) as { available?: boolean; freeBytes?: number | null };
  test.skip(!server.available, 'ffmpeg is not available on this server');
  expect(typeof server.freeBytes).toBe('number');
  const start = await page.request.post('/api/film/assemble', {
    data: {
      shots: [{ url: thumb, title: 'One', kind: 'still', holdSec: 1.5 }],
      resolution: '720p',
    },
  });
  expect(start.status()).toBe(202);
  const { job } = (await start.json()) as { job: { id: string } };
  let probe: Record<string, unknown> | undefined;
  await expect
    .poll(
      async () => {
        const status = (await (await page.request.get(`/api/film/assemble?jobId=${job.id}`)).json()) as {
          job?: { status?: string; error?: string; outputProbe?: Record<string, unknown> };
        };
        probe = status.job?.outputProbe;
        return status.job?.status === 'error' ? `error: ${status.job.error}` : status.job?.status;
      },
      { timeout: 120_000, intervals: [1000] }
    )
    .toBe('completed');
  expect(probe).toMatchObject({ width: 1280, height: 720 });
  expect(Number(probe!.durationSec)).toBeGreaterThan(1);
});

// M2 C3: each shot's card says who is in it, where and when.
test("shot state: a Day shot's card says who, where and when", async ({ page }) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const morning = page.getByTestId('cut-shot-state-day:morning');
  await expect(morning).toBeVisible({ timeout: 30_000 });
  await expect(morning).toContainText('Rae');
  await expect(morning).toContainText('kitchen');
  await expect(morning).toContainText('Morning');
  await expect(page.getByTestId('cut-shot-state-day:afternoon')).toContainText('park · Afternoon');
});

// M2 C4: two shots in a row at the same place and time, in another outfit nobody picked.
test('continuity rules: an unstated outfit change between two kitchen mornings is flagged', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST, lockedWardrobeId: 'kit-linen-sundress' },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        slots: [{ id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' }],
        stills: [{ slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'cr-m' }],
      },
      scene: {
        scenes: [
          {
            id: 'scene-kitchen',
            castId: CAST,
            name: 'Kitchen again',
            slot: { id: 'morning', label: 'Morning', location: 'kitchen', wardrobeId: 'kit-red-robe' },
            takes: [{ id: 'k1', promptId: 'k1', imageUrl: thumb, at: 1 }],
            keptTakeId: 'k1',
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      },
    },
  });
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const jump = page.getByTestId('cut-finding-scenes:scene-kitchen:outfit-jump');
  await expect(jump).toBeVisible({ timeout: 30_000 });
  await expect(jump).toContainText('Same place and time');
  await expect(page.getByTestId('cut-finding-day:morning:outfit-jump')).toHaveCount(0);
});

// M2 C2: what the checks found on the film's shots, and your decision about it, kept.
test('continuity: a flagged shot is listed, marked fine, and stays marked after a reload', async ({
  page,
}) => {
  await seed(page, false);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          id: 'e2e-cr-m-entry',
          promptId: 'cr-m',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: pours coffee',
          status: 'completed',
          queuedAt: Date.now() - 60_000,
          completedAt: Date.now() - 30_000,
          images: [{ filename: 'cr-m.png', subfolder: '', type: 'output' }],
          playChecks: { face: 0.41, faceMiss: true, at: Date.now() - 20_000 },
        },
      ])
    );
  });
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const finding = page.getByTestId('cut-finding-cr-m:face-miss');
  await expect(finding).toBeVisible({ timeout: 30_000 });
  await expect(finding).toContainText('Face match 41%');
  await expect(finding).toHaveAttribute('data-decision', 'open');

  await page.getByTestId('cut-finding-dismiss-cr-m:face-miss').click();
  await expect(page.getByTestId('cut-finding-cr-m:face-miss')).toHaveCount(0);
  await page.getByTestId('cut-continuity-dismissed-toggle').click();
  await expect(page.getByTestId('cut-finding-cr-m:face-miss')).toHaveAttribute(
    'data-decision',
    'dismissed'
  );

  // A reload keeps the decision (the seed only sets the Gallery and settings again).
  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-continuity-dismissed-toggle')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cut-finding-cr-m:face-miss')).toHaveCount(0);
  await page.getByTestId('cut-continuity-dismissed-toggle').click();
  await page.getByTestId('cut-finding-undo-cr-m:face-miss').click();
  await expect(page.getByTestId('cut-finding-cr-m:face-miss')).toHaveAttribute(
    'data-decision',
    'open'
  );
});

test('look and speed: the monitor shows the grade, a 2× clip halves its block, S splits', async ({
  page,
}) => {
  const clip = readFileSync(join(__dirname, 'fixtures', 'talk-2s.mp4'));
  await page.route('**/e2e-media/talk-2s.mp4', route =>
    route.fulfill({ status: 200, contentType: 'video/mp4', body: clip })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Rae', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      day: {
        stillsCharacterId: CAST,
        slots: [
          { id: 'morning', label: 'Morning', location: 'kitchen', sceneHints: 'pours coffee' },
          { id: 'afternoon', label: 'Afternoon', location: 'park', sceneHints: 'waves' },
        ],
        stills: [
          { slotId: 'morning', status: 'completed', imageUrl: thumb, promptId: 'l-m' },
          {
            slotId: 'afternoon',
            status: 'completed',
            imageUrl: thumb,
            promptId: 'l-a',
            clipStatus: 'completed',
            clipUrl: '/e2e-media/talk-2s.mp4',
            clipPromptId: 'l-a-clip',
          },
        ],
      },
    },
  });
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  const blocks = page.locator('[data-testid^="cut-timeline-shot-"]');
  await expect(blocks).toHaveCount(2, { timeout: 30_000 });
  await expect(page.getByTestId('cut-preview-building')).toHaveCount(0, { timeout: 15_000 });
  // The monitor's colour: how far apart the channels are in the middle of the frame.
  const spread = () =>
    page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="cut-preview-canvas"]');
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return -1;
      const { data } = context.getImageData(
        Math.floor(canvas.width * 0.3),
        Math.floor(canvas.height * 0.3),
        Math.floor(canvas.width * 0.4),
        Math.floor(canvas.height * 0.4)
      );
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += Math.abs(data[i]! - data[i + 1]!) + Math.abs(data[i + 1]! - data[i + 2]!);
      }
      return sum / (data.length / 4);
    });
  await page.getByTestId('cut-preview-scrub').fill('1');
  const before = await spread();
  expect(before).toBeGreaterThan(4);
  await page.getByTestId('cut-options-picture').evaluate(el => {
    (el as HTMLDetailsElement).open = true;
  });
  await page.getByTestId('cut-look').selectOption('mono');
  await expect.poll(spread, { timeout: 10_000 }).toBeLessThan(1.5);
  // A 2× clip: its block on the timeline is about half as wide.
  const clipBlock = page.getByTestId('cut-timeline-shot-day:afternoon');
  const wide = (await clipBlock.boundingBox())!.width;
  await page.getByTestId('cut-shot-speed-day:afternoon').selectOption('2');
  await expect
    .poll(async () => (await clipBlock.boundingBox())!.width, { timeout: 15_000 })
    .toBeLessThan(wide * 0.7);
  await page.getByTestId('cut-shot-speed-day:afternoon').selectOption('1');
  await expect(page.getByTestId('cut-preview-building')).toHaveCount(0, { timeout: 15_000 });
  // Sound: the ambience track and a clip's J / L pickers are offered.
  await expect(page.getByTestId('cut-ambience-upload')).toBeVisible();
  await page.getByTestId('cut-shot-sound-lead-day:afternoon').selectOption('1');
  await expect(page.getByTestId('cut-shot-sound-lead-day:afternoon')).toHaveValue('1');
  // Overlays: a shot's lower third, set in its overlay editor.
  await page.getByTestId('cut-shot-menu-day:morning-trigger').click();
  await page.getByTestId('cut-shot-overlay-day:morning').click();
  await page.getByTestId('cut-shot-overlay-editor-day:morning-lower').fill('Nora');
  await expect(page.getByTestId('cut-shot-overlay-day:morning')).toHaveAttribute('aria-expanded', 'true');
  // A still's hand-set move: from… to… shows its two framings.
  await page.getByTestId('cut-shot-motion-day:morning').selectOption('custom');
  await expect(page.getByTestId('cut-shot-move-to-day:morning')).toHaveValue('centre');
  await expect(page.getByTestId('cut-new-take')).toBeVisible();
  await expect(page.getByTestId('cut-export-project')).toBeVisible();
  await expect(page.getByTestId('cut-smooth-motion')).not.toBeChecked();
  // Follow faces is offered for a vertical cut only (on by default).
  await expect(page.getByTestId('cut-follow-faces')).toHaveCount(0);
  await page.getByTestId('cut-shape-vertical').click();
  await expect(page.getByTestId('cut-follow-faces')).toBeChecked();
  await page.getByTestId('cut-shape-wide').click();
  // Make longer is offered (for the clip under the playhead).
  await expect(page.getByTestId('cut-extend')).toBeVisible();
  // Generate a shot: the form opens with the shot it goes after, and closes again.
  await page.getByTestId('cut-generate').click();
  await expect(page.getByTestId('cut-generate-form')).toContainText('it goes');
  await expect(page.getByTestId('cut-generate-go')).toBeDisabled();
  await page.getByTestId('cut-generate-prompt').fill('rain on a café window');
  await expect(page.getByTestId('cut-generate-go')).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByTestId('cut-generate-form')).toHaveCount(0);
  // S splits the clip under the playhead, as the button does.
  await page.getByTestId('cut-preview-scrub').fill('3.5');
  await expect(page.getByTestId('cut-split')).toBeEnabled({ timeout: 10_000 });
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('s');
  await expect(blocks).toHaveCount(3, { timeout: 15_000 });
});

test('make a reel: a vertical short cut, the full cut kept as a version', async ({ page }) => {
  await seed(page, false);
  await gotoStable(page, '/cut');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots', { timeout: 30_000 });
  await page.getByTestId('cut-reel').selectOption('15');
  await expect(page.getByTestId('cut-shape-vertical')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('cut-follow-faces')).toBeChecked();
  await expect(page.getByTestId('cut-version-Full cut')).toBeVisible();
  await expect(page.getByTestId('cut-version-Reel · 15 s')).toBeVisible();
  // The full cut opens back as it was (wide).
  await page.getByTestId('cut-version-open-Full cut').click();
  await expect(page.getByTestId('cut-shape-wide')).toHaveAttribute('aria-checked', 'true');
});
