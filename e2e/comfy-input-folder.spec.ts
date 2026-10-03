import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable, revealFullSettings } from './helpers/navigation';

test.beforeEach(async ({ page }) => {
  await ensureAuthenticated(page);
});

test('settings input folder reports unused uploads and only offers a command', async ({ page }) => {
  let posted: { references?: unknown } | null = null;
  await page.route('**/api/comfyui/input-folder', async route => {
    posted = route.request().postDataJSON() as { references?: unknown };
    await route.fulfill({
      json: {
        inputDir: '/var/lib/comfyui/input',
        local: true,
        writable: false,
        totalFiles: 12,
        appMadeCount: 9,
        appMadeBytes: 9_000_000,
        referencedCount: 6,
        removable: [
          { name: 'day-nude-face-1.png', size: 1_000_000, mtimeMs: 1 },
          { name: 'day-pose-guide-solo-1.png', size: 20_000, mtimeMs: 1 },
        ],
        removableBytes: 1_020_000,
        tooNewCount: 1,
        minAgeDays: 7,
        byCategory: [
          { category: 'day-nude-face', count: 1, bytes: 1_000_000 },
          { category: 'day-pose-guide', count: 1, bytes: 20_000 },
        ],
        command:
          "rm -- '/var/lib/comfyui/input/day-nude-face-1.png' '/var/lib/comfyui/input/day-pose-guide-solo-1.png'",
        sources: { browser: 0, serverStorage: true, comfyQueue: true },
      },
    });
  });

  await gotoStable(page, '/settings?tab=comfyui&section=workflow-patching');
  await revealFullSettings(page, { requireAdvanced: true });
  const section = page.locator('details').filter({ hasText: /Input folder/ }).first();
  await expect(section).toBeVisible({ timeout: 45_000 });
  // The section can open itself late (deep link) — open it until the button shows.
  const scan = section.getByRole('button', { name: /Scan input folder/i });
  await expect(async () => {
    if (!(await scan.isVisible())) {
      if ((await section.getAttribute('open')) === null) {
        await section.locator('summary').first().click();
      }
    }
    await expect(scan).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await scan.click();

  // The remembered open/closed state can load late and fold the section — reopen to read it.
  await expect(async () => {
    if ((await section.getAttribute('open')) === null) {
      await section.locator('summary').first().click();
    }
    await expect(section.getByText(/2 unused files/)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(section.getByText(/1 newer than 7 days stay/)).toBeVisible();
  const command = section.getByRole('textbox', { name: /Command that removes/i });
  await expect(command).toHaveValue(/^rm -- '\/var\/lib\/comfyui\/input\/day-nude-face-1\.png'/);
  await expect(section.getByRole('button', { name: /Copy command/i })).toBeVisible();
  // The page sends what this browser still uses, and has no button that deletes.
  expect(Array.isArray(posted?.references)).toBe(true);
  await expect(section.getByRole('button', { name: /delete|remove/i })).toHaveCount(0);
});
