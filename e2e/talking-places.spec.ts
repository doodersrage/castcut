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

const cast = (id: string) => ({
  version: 1,
  characters: [
    {
      id,
      name: 'Talk Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties',
      bio: { name: 'Talk Cast', look: 'a woman', personality: 'dry humour' },
    },
  ],
  removedIds: [],
});

test('Cast → Places: pick a home design, own words, or off', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-places' },
    characters: cast('e2e-places'),
  });
  await gotoStable(page, '/characters/e2e-places');
  await dismissBlockingOverlays(page);
  await page.getByText('Bible', { exact: true }).first().click();
  const section = page.getByTestId('cast-places-section');
  await expect(section).toBeVisible({ timeout: 30_000 });
  // Every Cast has a home without picking one.
  await expect(page.getByTestId('cast-place-home-note')).toContainText('Used for: bedroom');
  await page.getByTestId('cast-place-home-scandi').click();
  await expect(page.getByTestId('cast-place-home-scandi')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('cast-place-home-note')).toContainText('pale ash floors');
  await page.getByTestId('cast-place-home-own').click();
  await page.getByTestId('cast-place-home-own-input').fill('a tiny attic flat with slanted ceilings');
  await page.getByTestId('cast-place-home-own-input').blur();
  await expect(page.getByTestId('cast-place-home-note')).toContainText('A tiny attic flat');
  await page.getByTestId('cast-place-work-off').click();
  await expect(page.getByTestId('cast-place-work-note')).toContainText('Off');
  // The Voice section is there too.
  await expect(page.getByTestId('cast-voice-section')).toContainText('No voice kept yet');
});

test('Day slot: a line in the clip is kept, a suggestion fills it, No line clears it', async ({ page }) => {
  await page.route('**/api/spoken-line', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ line: 'Coffee first. Then people.' }) })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-line' },
    characters: cast('e2e-line'),
    tools: {
      day: {
        stillsCharacterId: 'e2e-line',
        dayMood: 'everyday',
        activeSlotId: 'morning',
        slots: [
          { id: 'morning', label: 'Morning', location: 'bright kitchen', sceneHints: 'making coffee' },
          { id: 'evening', label: 'Evening', location: 'home', sceneHints: 'cooking dinner' },
        ],
      },
    },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  const input = page.getByTestId('day-slot-line-input').first();
  await expect(input).toBeVisible({ timeout: 30_000 });
  await input.fill('"Ugh, Monday."');
  await input.press('Enter');
  await expect(input).toHaveValue('Ugh, Monday.');
  await expect(page.getByTestId('day-slot-line').first()).toContainText('Animate makes a talking clip');
  await page.getByTestId('day-slot-line-suggest').first().click();
  await expect(input).toHaveValue('Coffee first. Then people.');
  await closeDaySheets(page);
  // Kept on the slot across the sheet closing.
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-line-input').first()).toHaveValue('Coffee first. Then people.');
  // Keep the full frame: offered once there is a line, kept on the slot.
  await page.getByTestId('day-slot-line-full-frame').first().check();
  await closeDaySheets(page);
  await openDaySlotSheet(page, 'morning');
  await expect(page.getByTestId('day-slot-line-full-frame').first()).toBeChecked();
  await page.getByTestId('day-slot-line-clear').first().click();
  await expect(page.getByTestId('day-slot-line-full-frame')).toHaveCount(0);
  await expect(page.getByTestId('day-slot-line-input').first()).toHaveValue('');
});
