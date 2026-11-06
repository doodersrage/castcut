import { expect, type Locator, type Page } from '@playwright/test';

/**
 * A Story reel card's actions (Edit scene, Pose…, Queue still, Animate, Play another still,
 * Copy prompt, Open in ComfyUI) sit in its ⋯ menu; Edit scene and Pose… open the scene's side
 * sheet (desk: right drawer; phone: bottom sheet). The sheet is modal: the reel behind it
 * cannot be clicked until it closes (Escape, Cancel, or Save scene).
 */
/**
 * The reel is a stage: one scene's full card at a time, the others in a strip. Bring scene
 * `index` onto the stage; returns the card index to use for its menu (always 0 on a stage).
 */
export async function showStoryBeat(page: Page, index = 0): Promise<number> {
  const thumbs = page.getByTestId('story-stage-thumb');
  if ((await thumbs.count()) === 0) {
    return (await page.getByTestId('story-stage').count()) > 0 ? 0 : index;
  }
  const thumb = thumbs.nth(index);
  if ((await thumb.getAttribute('aria-pressed')) !== 'true') {
    await thumb.click({ timeout: 30_000 });
  }
  await expect(thumb).toHaveAttribute('aria-pressed', 'true');
  return 0;
}

export async function openStoryBeatMenu(page: Page, index = 0): Promise<Locator> {
  const card = await showStoryBeat(page, index);
  // The menu is portalled to the body: open state is on the trigger, items are in the panel.
  const trigger = page.getByTestId('story-beat-menu-trigger').nth(card);
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') {
    await trigger.click({ timeout: 30_000 });
  }
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  return page.getByTestId('story-beat-menu-panel');
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
  // One menu panel is open at a time (portalled): its item, not the nth card's.
  const panel = await openStoryBeatMenu(page, index);
  await panel
    .getByTestId(via === 'edit' ? 'story-beat-edit' : 'story-beat-pose-open')
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
