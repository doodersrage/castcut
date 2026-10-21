import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { openDaySlotSheet } from './helpers/day';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const PREFIX = 'day-slot-pose-preview';

async function seedDay(page: Page) {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: 'e2e-pose-3d' },
    tools: {
      day: {
        stillsCharacterId: 'e2e-pose-3d',
        slots: ['morning', 'afternoon', 'evening', 'night'].map(id => ({
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          location: 'small kitchen',
          sceneHints: 'stirring a pot of risotto at the stove',
        })),
      },
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfy-prompt-characters-v1',
      JSON.stringify({
        version: 1,
        characters: [{ id: 'e2e-pose-3d', name: 'Pose 3D', version: 1, updatedAt: Date.now() }],
        removedIds: [],
      })
    );
  });
}

async function openEditor(page: Page) {
  await openDaySlotSheet(page, 'morning');
  await page.getByTestId(`${PREFIX}-edit`).click();
  const canvas = page.getByTestId(`${PREFIX}-canvas`);
  await expect(canvas).toHaveAttribute('data-editor', '3d', { timeout: 60_000 });
  await expect(canvas).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  return canvas;
}

test('3D pose editor: drag a hand, use the pose, reopen exactly; render a pose picture', async ({
  page,
}) => {
  await seedDay(page);
  await gotoStable(page, '/day?character=e2e-pose-3d');
  await dismissBlockingOverlays(page);
  await openEditor(page);

  const wristBefore = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]![4]!);
  const hand = await page.evaluate(() => window.__castcutPose3d!.handlePoint('hand_R'));
  expect(hand).not.toBeNull();
  // Raise her right hand: drag its handle up and out.
  await page.mouse.move(hand!.x, hand!.y);
  await page.mouse.down();
  await page.mouse.move(hand!.x - 30, hand!.y - 90, { steps: 10 });
  await page.mouse.up();
  const wristAfter = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]![4]!);
  expect(wristAfter.y).toBeLessThan(wristBefore.y - 0.03);
  // The words follow the posed body.
  await expect(page.getByTestId(`${PREFIX}-words`)).toBeVisible();
  // Undo puts the hand back; redo raises it again.
  await page.getByTestId(`${PREFIX}-undo`).click();
  const undone = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]![4]!);
  expect(Math.abs(undone.y - wristBefore.y)).toBeLessThan(0.01);
  await page.getByTestId(`${PREFIX}-redo`).click();

  const saved = await page.evaluate(() => window.__castcutPose3d!.rig());
  const savedBodies = await page.evaluate(() => window.__castcutPose3d!.bodies());
  expect(savedBodies[0]).toHaveLength(18);
  await page.getByTestId(`${PREFIX}-editor-save`).click();
  await expect(page.getByTestId(`${PREFIX}-name`)).toHaveText('Your edit');

  // Reopen: the same rig, not a fresh guess from the points.
  await openEditor(page);
  const reopened = await page.evaluate(() => window.__castcutPose3d!.rig());
  for (const bone of ['upperarm_R', 'forearm_R', 'hips', 'head']) {
    const a = saved.figures[0]!.bones[bone]!;
    const b = reopened.figures[0]!.bones[bone]!;
    expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])).toBeGreaterThan(0.9999);
  }

  // The pose picture: the posed body rendered on a plain background.
  const picture = await page.evaluate(async rig => {
    const pose3d = window.__castcutPose3d!;
    return pose3d.renderPosePicture(
      { aspect: 2 / 3, people: pose3d.bodies(), source: 'edited', rig3d: rig },
      256
    );
  }, reopened);
  expect(picture.height).toBe(256);
  expect(picture.width).toBeGreaterThan(150);
  expect(picture.bytes).toBeGreaterThan(1000);
  expect(picture.nonBackground).toBeGreaterThan(2000);
  await page.getByTestId(`${PREFIX}-editor-save`).click();

  // Through storage: a fresh page (without this page's seeding init scripts) reopens the saved
  // rig — the slot's PhotoPose kept rig3d through normalizePhotoPose.
  await page.waitForTimeout(1500);
  const fresh = await page.context().newPage();
  await gotoStable(fresh, '/day?character=e2e-pose-3d');
  await dismissBlockingOverlays(fresh);
  await openDaySlotSheet(fresh, 'morning');
  await expect(fresh.getByTestId(`${PREFIX}-name`)).toHaveText('Your edit', {
    timeout: 30_000,
  });
  await openEditor(fresh);
  const afterReload = await fresh.evaluate(() => window.__castcutPose3d!.rig());
  const a = saved.figures[0]!.bones.forearm_R!;
  const b = afterReload.figures[0]!.bones.forearm_R!;
  expect(Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])).toBeGreaterThan(0.9999);
});

test('3D pose editor: views, flip depth, a partner, and the wireframe toggle (remembered)', async ({
  page,
}) => {
  await seedDay(page);
  await gotoStable(page, '/day?character=e2e-pose-3d');
  await dismissBlockingOverlays(page);
  await openEditor(page);

  // Side view: the camera moves, the pose map is the figure seen from the side.
  const front = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]!);
  await page.getByTestId(`${PREFIX}-view-side`).click();
  const side = await page.evaluate(() => window.__castcutPose3d!.bodies()[0]!);
  const width = (body: typeof front) => Math.abs(body[2]!.x - body[5]!.x);
  expect(width(side)).toBeLessThan(width(front) * 0.6);
  await page.getByTestId(`${PREFIX}-view-front`).click();

  // Flip an arm's depth: the picture barely moves, the arm does.
  const rigBefore = await page.evaluate(() => window.__castcutPose3d!.rig());
  await page.getByTestId(`${PREFIX}-flip-arm-R`).click();
  const rigAfter = await page.evaluate(() => window.__castcutPose3d!.rig());
  expect(rigAfter.figures[0]!.bones.upperarm_R).not.toEqual(rigBefore.figures[0]!.bones.upperarm_R);

  // A partner: two figures, posed one at a time.
  await page.getByTestId(`${PREFIX}-add-person`).click();
  await expect(page.getByTestId(`${PREFIX}-figure-tab-1`)).toHaveAttribute('aria-checked', 'true');
  expect(await page.evaluate(() => window.__castcutPose3d!.rig().figures.length)).toBe(2);
  await expect(page.getByTestId(`${PREFIX}-body-male`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`${PREFIX}-figure-tab-0`).click();
  await expect(page.getByTestId(`${PREFIX}-body-female`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`${PREFIX}-remove-person`).click();
  expect(await page.evaluate(() => window.__castcutPose3d!.rig().figures.length)).toBe(1);

  // The wireframe editor is one click away, and remembered.
  await page.getByTestId(`${PREFIX}-mode-wireframe`).click();
  await expect(page.getByTestId(`${PREFIX}-joint-0-4`)).toBeVisible();
  expect(
    await page.evaluate(() => window.localStorage.getItem('castcut-pose-editor-mode-v1'))
  ).toBe('wireframe');
  await page.getByTestId(`${PREFIX}-mode-3d`).click();
  await expect(page.getByTestId(`${PREFIX}-canvas`)).toHaveAttribute('data-editor', '3d');
  await expect(page.getByTestId(`${PREFIX}-canvas`)).toHaveAttribute('data-ready', 'true', {
    timeout: 30_000,
  });
});

test('without WebGL the wireframe editor opens', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (kind === 'webgl' || kind === 'webgl2') return null;
      return (original as (...args: unknown[]) => unknown).call(this, kind, ...rest);
    } as typeof original;
  });
  await seedDay(page);
  await gotoStable(page, '/day?character=e2e-pose-3d');
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'morning');
  await page.getByTestId(`${PREFIX}-edit`).click();
  await expect(page.getByTestId(`${PREFIX}-joint-0-4`)).toBeVisible();
  await expect(page.getByTestId(`${PREFIX}-mode-3d`)).toHaveCount(0);
});

test('3D pose editor on Outfit: one person, a Day pose keeps its words until posed by hand', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: '' },
    tools: {
      fitting: { referenceImageUrl: '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp' },
    },
    characters: { version: 1, characters: [], removedIds: [] },
  });
  await gotoStable(page, '/fitting');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('outfit-pose')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('outfit-pose-custom').click();
  await expect(page.getByTestId('outfit-pose-canvas')).toHaveAttribute('data-ready', 'true', {
    timeout: 60_000,
  });
  // One person on Outfit — no partner; the plate can show behind the body.
  await expect(page.getByTestId('outfit-pose-add-person')).toHaveCount(0);
  await expect(page.getByTestId('outfit-pose-show-backdrop')).toBeVisible();

  await page.getByTestId('outfit-pose-day-pose').click();
  await page.getByTestId('outfit-pose-day-pose-wave').click();
  await expect(page.getByTestId('outfit-pose-words')).toContainText('waving: one arm raised high');
  // A drag poses the body by hand: the words read the figure again.
  const foot = await page.evaluate(() => window.__castcutPose3d!.handlePoint('foot_L'));
  await page.mouse.move(foot!.x, foot!.y);
  await page.mouse.down();
  await page.mouse.move(foot!.x + 10, foot!.y - 70, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('outfit-pose-words')).not.toContainText('waving:');

  await page.getByTestId('outfit-pose-save-to-my-poses').click();
  await page.getByTestId('outfit-pose-save-name').fill('Knee up');
  await page.getByTestId('outfit-pose-save-name').press('Enter');
  await expect(page.getByTestId('outfit-pose-editor')).toContainText(
    'Saved to My poses as “Knee up”'
  );
  await page.getByTestId('outfit-pose-editor-save').click();
  await expect(page.getByTestId('outfit-pose-custom')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('outfit-pose-figure')).toBeVisible();
  await expect(page.getByTestId('outfit-my-poses')).toContainText('Knee up');
});
