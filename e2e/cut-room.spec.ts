import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
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
