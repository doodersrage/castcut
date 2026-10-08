import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Outfit's clothing picker (kit deck, your own photo, footwear): in place in the desk fitting
 * room's Clothes column; on the phone the shared Clothing sheet, opened from the Clothing row's
 * Choose… button (modal: the page behind it cannot be clicked until it closes — Escape).
 */
export async function openOutfitClothing(page: Page): Promise<Locator> {
  // Desk Outfit (the fitting room) shows the picker in place — nothing to open.
  const inline = page.getByTestId('fitting-kit-strip').getByTestId('fitting-clothing-picker');
  const opener = page.getByTestId('fitting-clothing-open').first();
  const sheet = page.getByTestId('clothing-sheet');
  // isVisible() does not wait: wait for whichever the page has.
  await expect(inline.or(opener).or(sheet).first()).toBeVisible({ timeout: 30_000 });
  if (await inline.isVisible()) {
    return page.getByTestId('fitting-kit-strip');
  }
  if (await sheet.isVisible().catch(() => false)) {
    return sheet;
  }
  await page.getByTestId('fitting-clothing-open').first().click({ timeout: 30_000 });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  return sheet;
}

/** Close the Clothing sheet (and anything it opened) with Escape. */
export async function closeOutfitSheets(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const open = page.locator(
      '[data-testid="clothing-sheet"], [data-testid="wardrobe-kit-browser"]'
    );
    if ((await open.count()) === 0) {
      return;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('clothing-sheet')).toHaveCount(0);
}

/** The two try-on switches and Good / Best by hand sit in the Advanced drawer under Quality. */
export async function openOutfitAdvanced(page: Page): Promise<void> {
  const toggle = page.getByTestId('fitting-quality-advanced').first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(page.getByTestId('fitting-advanced-drawer')).toBeVisible();
}
