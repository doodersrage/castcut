import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A Story reel card's actions (Edit scene, Pose…, Queue still, Animate, Play another still,
 * Copy prompt, Open in ComfyUI) sit in its ⋯ menu; Edit scene and Pose… open the scene's side
 * sheet (desk: right drawer; phone: bottom sheet). The sheet is modal: the reel behind it
 * cannot be clicked until it closes (Escape, Cancel, or Save scene).
 */
export async function openStoryBeatMenu(page: Page, index = 0): Promise<Locator> {
  const menu = page.getByTestId('story-beat-menu').nth(index);
  if ((await menu.getAttribute('open')) == null) {
    await page.getByTestId('story-beat-menu-trigger').nth(index).click({ timeout: 30_000 });
  }
  await expect(menu).toHaveAttribute('open', '');
  return menu;
}

export async function openStoryBeatSheet(
  page: Page,
  index = 0,
  via: 'edit' | 'pose' = 'edit'
): Promise<Locator> {
  const sheet = page.getByTestId('story-beat-sheet');
  if (await sheet.isVisible().catch(() => false)) {
    if ((await sheet.getAttribute('data-beat-index')) === String(index)) {
      return sheet;
    }
    await closeStorySheets(page);
  }
  await openStoryBeatMenu(page, index);
  await page
    .getByTestId(via === 'edit' ? 'story-beat-edit' : 'story-beat-pose-open')
    .nth(index)
    .click({ timeout: 30_000 });
  await expect(sheet).toBeVisible({ timeout: 30_000 });
  await expect(sheet).toHaveAttribute('data-beat-index', String(index));
  return sheet;
}

/** Close any open Story sheet (scene, Outfit for stills) with Escape. */
export async function closeStorySheets(page: Page): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    const open = page.locator('[data-testid="clothing-sheet"], [data-testid="story-beat-sheet"]');
    if ((await open.count()) === 0) {
      return;
    }
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('story-beat-sheet')).toHaveCount(0);
}
