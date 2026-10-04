import { expect, type Page } from '@playwright/test';

/**
 * Day's slot editor is a side sheet (desk: right drawer; phone: bottom sheet), opened from a
 * card's Edit / ⋯ → Edit slot. Tapping a finished card opens the lightbox instead, so tests
 * open the sheet through the card's Edit button. The sheet is modal: only one is open at a
 * time, and the board behind it cannot be clicked until it closes.
 */
export async function openDaySlotSheet(page: Page, slotId: string): Promise<void> {
  const sheet = page.getByTestId('day-slot-sheet');
  if (await sheet.isVisible().catch(() => false)) {
    if ((await sheet.getAttribute('data-slot')) === slotId) {
      return;
    }
    await closeDaySheets(page);
  }
  await page.getByTestId(`day-progress-edit-${slotId}`).first().click({ timeout: 30_000 });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toHaveAttribute('data-slot', slotId);
}

/** Close any open Day sheet (slot, Setup, Clothing) with Escape. */
export async function closeDaySheets(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const open = page.locator(
      '[data-testid="clothing-sheet"], [data-testid="day-slot-sheet"], [data-testid="day-setup-sheet"]'
    );
    if ((await open.count()) === 0) {
      return;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('day-slot-sheet')).toHaveCount(0);
}

/** Setup (Cast lead, look, plate) lives behind the status chip beside the Day title. */
export async function openDaySetup(page: Page): Promise<void> {
  const sheet = page.getByTestId('day-setup-sheet');
  if (await sheet.isVisible().catch(() => false)) {
    return;
  }
  await page.getByTestId('day-setup-chip').first().click({ timeout: 30_000 });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
}

/** The check switches, pose pack and notes sit in the Advanced drawer under the plan bar. */
export async function openDayAdvanced(page: Page): Promise<void> {
  const toggle = page.getByTestId('day-quality-advanced').first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(page.getByTestId('day-advanced-drawer')).toBeVisible();
}
