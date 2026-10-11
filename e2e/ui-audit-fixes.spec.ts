import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';
import { openDaySlotSheet } from './helpers/day';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-audit';
const cast = {
  version: 1,
  characters: [
    {
      id: CAST,
      name: 'Audit Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties',
      bio: { name: 'Audit Cast', look: 'a woman', personality: 'calm' },
    },
  ],
  removedIds: [],
};

/** A Day with four finished stills (no clips). */
function finishedDay() {
  const slots = ['morning', 'afternoon', 'evening', 'night'].map(id => ({
    id,
    label: id[0]!.toUpperCase() + id.slice(1),
    location: `${id} kitchen`,
    sceneHints: 'making coffee',
  }));
  return {
    stillsCharacterId: CAST,
    dayMood: 'everyday',
    activeSlotId: 'morning',
    slots,
    stills: slots.map(slot => ({
      slotId: slot.id,
      promptId: `audit-${slot.id}`,
      imageUrl: '/icon.svg',
      status: 'completed',
    })),
  };
}

test('ComfyUI offline: banner, named chip, Queue and Animate disabled', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __castcutRenderOffline: boolean }).__castcutRenderOffline = true;
  });
  await page.route('**/api/health**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ llm: { ok: true }, comfyui: { ok: false }, diffusers: { ok: false } }),
    })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('render-offline-banner').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('render-offline-banner').first()).toContainText(
    'ComfyUI is offline'
  );
  const chip = page.getByTestId('connection-health-chip').first();
  await expect(chip).toHaveAttribute('data-state', 'offline');
  await expect(chip).toContainText('ComfyUI offline');
  await expect(page.getByTestId('day-queue-all').first()).toBeDisabled();
  await expect(page.getByTestId('day-animate-all').first()).toBeDisabled();
  await expect(page.getByTestId('day-queue-block-reason').first()).toContainText('ComfyUI is offline');
});

test('Online: no banner; the Made with tray names what a still used', async ({ page }) => {
  await page.route('**/api/comfyui/history/workflow**', route =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        promptId: 'audit-morning',
        comfyUrl: 'http://127.0.0.1:9',
        workflow: {
          '900': { class_type: 'LoadImage', inputs: { image: 'day-vacation-keep-a.png' } },
          '901': {
            class_type: 'LoadImage',
            inputs: { image: 'day-pose-guide-sit-a1b2c3-x1-0123456789abcdef.png' },
          },
          '902': { class_type: 'LoadImage', inputs: { image: 'day-face-id-ref-c.png' } },
        },
      }),
    })
  );
  await page.route('**/api/comfyui/view?**type=input**', route =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/day');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-queue-all').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('render-offline-banner')).toHaveCount(0);
  await openDaySlotSheet(page, 'morning');
  const tray = page.getByTestId('day-slot-references').first();
  await expect(tray).toBeVisible({ timeout: 15_000 });
  await expect(tray.getByTestId('day-slot-references-face')).toContainText('Face');
  await expect(tray.getByTestId('day-slot-references-look')).toContainText('Look');
  await expect(tray.getByTestId('day-slot-references-pose')).toContainText('Pose guide');
  await expect(tray.getByTestId('day-slot-references-place')).toContainText('morning kitchen');
  // Change or keep: the face opens the Cast; the pose can be pinned for the next take.
  await expect(tray.getByTestId('day-slot-references-face-change')).toHaveAttribute(
    'href',
    /\/characters\/e2e-audit/
  );
  await tray.getByTestId('day-slot-references-pose-keep').click();
  await expect(tray.getByTestId('day-slot-references-pose-keep')).toHaveCount(0);
});

test('Film steps: Cast, Day and Cut film are counted; the optional steps are named', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.sessionStorage.setItem(
      'play-campaign-v1',
      JSON.stringify({ version: 1, characterId: 'e2e-audit', stepIndex: 3, updatedAt: Date.now() })
    );
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
  });
  await gotoStable(page, '/play?character=e2e-audit');
  await dismissBlockingOverlays(page);
  // Mid-film the Steps list folds under "Edit cast & steps"; the strip shows Cut film as 3.
  await expect(page.getByTestId('play-funnel-step-cut').first()).toContainText('3. Cut film', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('play-funnel-step-fitting').first()).toHaveText('Outfit');
  await page.getByText('Edit cast & steps').click();
  const steps = page.getByTestId('play-campaign-steps');
  await expect(steps).toBeVisible();
  await expect(page.getByTestId('play-campaign-step-cut')).toContainText('Step 3');
  await expect(page.getByTestId('play-campaign-step-cut')).toContainText('Cut film');
  await expect(page.getByTestId('play-campaign-step-fitting')).toContainText('Optional');
  // The highlighted step is the film's (Day), not the optional Look.
  await expect(page.getByTestId('play-campaign-step-day')).toContainText('Continue');
  await expect(page.getByTestId('play-campaign-step-moodboard')).not.toContainText('Continue');
});

test('Studio keeps the film in view, with a way back to Film', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('comfy-workspace-mode-v1', 'studio');
    localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { day: finishedDay() },
  });
  await gotoStable(page, '/gallery');
  await dismissBlockingOverlays(page);
  const context = page.getByTestId('studio-film-context').first();
  await expect(context).toBeVisible({ timeout: 30_000 });
  await expect(context).toContainText('Audit Cast');
  await expect(context).toContainText('of 3');
  await expect(page.getByTestId('studio-film-context-back').first()).toBeVisible();
});
