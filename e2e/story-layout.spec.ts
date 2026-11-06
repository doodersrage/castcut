import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Story (2026-11-05): the Cast as a chip with its sheet, one composer (progress, Roll, Still or
 * Still + clip, the cut), the filmstrip's quick actions, keys.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-story-layout';
const still = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';

async function seed(page: Page, story: Array<Record<string, unknown>>) {
  await page.addInitScript(castId => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: castId, name: 'Lio', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
    window.localStorage.setItem(
      'comfy-play-metrics-v1',
      JSON.stringify({ version: 1, firstFilmCutAt: Date.now() })
    );
  }, CAST);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: {
      version: 1,
      characters: [{ id: CAST, name: 'Lio', version: 1, updatedAt: Date.now() }],
      removedIds: [],
    },
    tools: {
      roleplay: {
        activeSessionId: `cast-${CAST}`,
        characterName: 'Lio',
        bio: { name: 'Lio', look: 'yellow raincoat', personality: 'curious' },
        story,
      },
    },
  });
}

const beat = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  at: Date.now(),
  kind: 'plot',
  title,
  blurb: `${title}.`,
  stillStatus: 'completed',
  imageUrl: still,
  ...extra,
});

test('the composer: progress, one Roll, Still or Still + clip, the cut', async ({ page }) => {
  await seed(page, [beat('b1', 'The letter'), beat('b2', 'The station')]);
  await gotoStable(page, `/story?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const picker = page.getByTestId('story-beat-picker');
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await expect(picker.getByTestId('story-progress')).toContainText('Scene 3 of 10');
  await expect(page.getByTestId('story-roll-scenes')).toHaveCount(1);
  await expect(picker.getByRole('button', { name: 'Still + clip', exact: true })).toBeVisible();
  // The cut sits in the composer once there are scenes (not also under the reel).
  await expect(picker.getByTestId('story-open-cut')).toBeVisible();
  await expect(page.getByTestId('story-open-cut')).toHaveCount(1);
  // The manual-queue choice is a Story setting now.
  await picker.getByTestId('story-settings').locator('summary').click();
  await expect(picker.getByTestId('story-manual-queue')).toBeVisible();
});

test('the Cast chip opens who, the photo and the outfit in a sheet', async ({ page }) => {
  await seed(page, [beat('b1', 'The letter')]);
  await gotoStable(page, `/story?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const chip = page.getByTestId('story-cast-chip');
  await expect(chip).toContainText('Lio', { timeout: 30_000 });
  await expect(page.getByTestId('story-wardrobe')).toHaveCount(0);
  await chip.click();
  const sheet = page.getByTestId('story-cast-sheet');
  await expect(sheet.getByTestId('story-wardrobe')).toBeVisible();
});

test('filmstrip: quick actions on a scene; ← → step through the scenes', async ({ page }) => {
  await seed(page, [beat('b1', 'The letter'), beat('b2', 'The station'), beat('b3', 'The pier')]);
  await gotoStable(page, `/story?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const thumbs = page.getByTestId('story-stage-thumb');
  await expect(thumbs).toHaveCount(3, { timeout: 30_000 });
  await expect(thumbs.nth(2)).toHaveAttribute('aria-pressed', 'true');
  await thumbs.nth(0).hover();
  await expect(page.getByTestId('story-stage-thumb-redo').first()).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('ArrowLeft');
  await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true');
});

test('Outline: scenes with screen time and acts; Branch from here keeps scenes up to it', async ({
  page,
}) => {
  await seed(page, [
    beat('a', 'Harbour'),
    beat('b', 'Market'),
    beat('c', 'Lighthouse'),
    beat('d', 'Storm'),
  ]);
  await gotoStable(page, `/story?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('story-outline-open').click();
  const outline = page.getByTestId('story-outline');
  await expect(outline.getByTestId('story-outline-scenes').locator('li')).toHaveCount(4);
  await expect(outline.getByTestId('story-outline-act-1')).toBeVisible();
  await expect(outline.getByTestId('story-outline-act-3')).toBeVisible();
  await outline.getByTestId('story-outline-branch-1').click();
  await outline.getByTestId('story-outline-branch-confirm-1').click();
  // The new version carries on from scene 2: two scenes in the reel.
  await page.getByTestId('story-outline-open').click();
  await expect(page.getByTestId('story-outline-scenes').locator('li')).toHaveCount(2);
});
