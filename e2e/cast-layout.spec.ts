import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Cast (2026-11-05): the roster as a portrait grid (actions in the header, search past four), and
 * a Cast's page led by a profile header (plate, looks, voice, what's next, where to go).
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const now = Date.now();
const people = ['Ada', 'Bo', 'Cy', 'Di', 'Ed'].map((name, index) => ({
  id: `e2e-grid-${name.toLowerCase()}`,
  name,
  version: 1,
  updatedAt: now - index * 1000,
}));

test('roster: portrait cards, a New character card, search past four', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: people[0]!.id },
    characters: { version: 1, characters: people, removedIds: [] },
  });
  await gotoStable(page, '/characters');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cast-roster-card-e2e-grid-ada')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('cast-roster-new-card')).toBeVisible();
  await expect(page.getByTestId('cast-roster-start-film')).toContainText('Ada');
  await page.getByTestId('cast-roster-search').fill('cy');
  await expect(page.locator('[data-testid^="cast-roster-card-"]')).toHaveCount(1);
  await expect(page.getByTestId('cast-roster-card-e2e-grid-cy')).toBeVisible();
});

// The card clips (its plate fills it): the ⋯ menu's panel opened under the card and was cut off
// whole, so the button seemed to do nothing (user, 2026-11-10). Its items are seen and work.
test('roster: a card’s ⋯ opens its menu over the page, and its items work', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: people[0]!.id },
    characters: { version: 1, characters: people, removedIds: [] },
  });
  await gotoStable(page, '/characters');
  await dismissBlockingOverlays(page);
  const card = page.getByTestId('cast-roster-card-e2e-grid-bo');
  await expect(card).toBeVisible({ timeout: 30_000 });
  const details = page.getByTestId('cast-roster-details-toggle-e2e-grid-bo');
  // Buttons exist before hydration: open until the menu shows.
  await expect(async () => {
    await page.getByTestId('cast-roster-more-e2e-grid-bo-trigger').click();
    await expect(details).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  // Seen, not only present: the top of the page at its point is the menu item.
  const box = (await details.boundingBox())!;
  const top = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('[data-testid]')?.getAttribute('data-testid'),
    [box.x + box.width / 2, box.y + box.height / 2]
  );
  expect(top).toBe('cast-roster-details-toggle-e2e-grid-bo');
  await details.click();
  await expect(details).toBeHidden();
  await page.getByTestId('cast-roster-more-e2e-grid-bo-trigger').click();
  await expect(page.getByTestId('cast-roster-details-toggle-e2e-grid-bo')).toContainText('Hide details');
});

test('a Cast page leads with its profile: add a plate, looks, voice, what next', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-profile' },
    characters: {
      version: 1,
      characters: [{ id: 'e2e-profile', name: 'Profile Cast', version: 1, updatedAt: now }],
      removedIds: [],
    },
  });
  await gotoStable(page, '/characters/e2e-profile');
  await dismissBlockingOverlays(page);
  const profile = page.getByTestId('cast-profile');
  await expect(profile).toBeVisible({ timeout: 30_000 });
  await expect(profile.getByTestId('cast-profile-add-plate')).toBeVisible();
  await expect(profile.getByTestId('cast-status-line')).toContainText('no plate');
  await expect(profile.getByTestId('cast-profile-voice')).toContainText('None yet');
  await expect(profile.getByTestId('cast-checklist-next-action')).toBeVisible();
  await expect(profile.getByTestId('character-home-start-film')).toBeVisible();
  // The voice link opens the Bible tab; its sections have a jump row.
  await profile.getByTestId('cast-profile-voice').getByRole('button').click();
  await expect(page.getByRole('tab', { name: 'Bible' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('cast-bible-jump')).toBeVisible();
  await expect(page.getByTestId('cast-voice-section')).toBeInViewport({ timeout: 10_000 });
});
