import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { gotoStable } from './helpers/navigation';
import { replaceGalleryIdb, seedSettingsCacheOnNextLoad } from './helpers/idb';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Upgrade compatibility (release hardening H2, ROADMAP §9.3 / §10): a data set in the shapes the
 * last release before this work stored (v2.12.36, commit 3c2856cb — its SavedScene, SceneTake,
 * CutShotEdit and CutToolCache types), opened by the current app. None of the fields M1–M5 added
 * are there: no take tombstones, pins, edit stamps, version tombstones, scripts, runs, subtitle
 * overrides or export profile.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-upgrade';
const thumb = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
const other = '/wardrobe-thumbs/bottom-aqua-baggy-jeans.webp';
const slot = (id: string, location: string) => ({ id, label: id, location, sceneHints: 'pours coffee' });

const V2_12_36 = {
  shared: { activeCharacterId: CAST },
  characters: {
    version: 1,
    characters: [
      {
        id: CAST,
        name: 'Ivy',
        version: 1,
        updatedAt: 1,
        descriptor: 'a woman in her thirties',
        traits: { sex: 'woman' },
        ipAdapter: { imageFilename: 'ivy.png', imageUrl: thumb },
      },
    ],
    removedIds: [],
  },
  tools: {
    scene: {
      scenes: [
        {
          id: 'up-kitchen',
          castId: CAST,
          name: 'Kitchen',
          slot: slot('morning', 'kitchen'),
          dayMood: 'everyday',
          takes: [
            { id: 'up-k1', promptId: 'up-k1', imageUrl: thumb, at: 1 },
            { id: 'up-k2', promptId: 'up-k2', imageUrl: other, at: 2 },
          ],
          keptTakeId: 'up-k2',
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: 'up-roof',
          castId: CAST,
          name: 'Rooftop',
          slot: slot('night', 'rooftop'),
          takes: [{ id: 'up-r1', promptId: 'up-r1', imageUrl: thumb, at: 3 }],
          createdAt: 3,
          updatedAt: 3,
        },
      ],
      activeSceneId: 'up-kitchen',
      slots: [slot('morning', 'kitchen')],
      stills: [{ slotId: 'morning', promptId: 'up-k2', imageUrl: other, status: 'completed' }],
      stillsCharacterId: CAST,
      dayMood: 'everyday',
    },
    cut: {
      sources: ['scenes'],
      extras: [{ key: 'x:card', kind: 'text', text: 'Later that night' }],
      options: {
        crossfadeSec: 0.5,
        audioBedUrl: '',
        stillMotion: true,
        titles: true,
        shotEdits: {
          order: ['scenes:up-kitchen', 'x:card'],
          shots: { 'scenes:up-kitchen': { caption: 'Old caption', holdSec: 4 } },
        },
      },
      versions: [
        {
          id: 'v-old',
          name: 'Long cut',
          savedAt: 5,
          sources: ['scenes'],
          options: { crossfadeSec: 0, audioBedUrl: '', shotEdits: { shots: {} } },
        },
      ],
    },
  },
};

const GALLERY_V2_12_36 = [
  {
    id: 'up-k2',
    promptId: 'up-k2',
    prompt: 'Kitchen',
    tool: 'day',
    characterId: CAST,
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: Date.now() - 60_000,
    completedAt: Date.now() - 50_000,
    images: [{ filename: 'up-k2.png', subfolder: '', type: 'output' }],
  },
];

type StoredTools = {
  scene: {
    scenes: Array<{ id: string; keptTakeId?: string; takes: unknown[] }>;
    run?: unknown;
  };
  cut: {
    editedAt?: number;
    versions?: unknown[];
    extras?: Array<{ text?: string }>;
    options?: { shotEdits?: { shots?: Record<string, { caption?: string }> } };
  };
};

async function stored(page: Page): Promise<StoredTools> {
  return page.evaluate(
    () =>
      new Promise<StoredTools>(resolve => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => resolve({} as StoredTools);
        request.onsuccess = () => {
          const db = request.result;
          const get = db
            .transaction('kv', 'readonly')
            .objectStore('kv')
            .get('comfy-prompt-tool-settings-tools-v1');
          get.onsuccess = () => {
            db.close();
            resolve(get.result?.value?.tools ?? {});
          };
          get.onerror = () => {
            db.close();
            resolve({} as StoredTools);
          };
        };
      })
  );
}

test('data from v2.12.36 opens in Scene, Cut, Film Director and the Queue with nothing lost', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, V2_12_36, { once: true });
  await gotoStable(page, `/scene?character=${CAST}`);
  await replaceGalleryIdb(page, GALLERY_V2_12_36);
  await page.reload();
  await dismissBlockingOverlays(page);

  // Scene: both Scenes, the open one with its takes and its keeper.
  await expect(page.getByTestId('scene-name')).toHaveValue('Kitchen', { timeout: 60_000 });
  await expect(page.getByTestId('scene-take')).toHaveCount(2);
  await expect(page.locator('[data-testid="scene-take"][data-kept="true"]')).toHaveCount(1);
  await expect(page.getByTestId('scene-list')).toContainText('Rooftop');

  // Cut: its shot (with the old caption), the text card and the saved version.
  await gotoStable(page, '/cut?from=scenes');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('cut-film').first()).toContainText('2 shots', { timeout: 60_000 });
  await expect(page.locator('[data-testid^="cut-shot-x:"]').first()).toContainText(
    'Later that night'
  );
  await page.getByTestId('cut-tab-versions').click();
  await expect(page.getByTestId('cut-version-Long cut')).toBeVisible();
  await expect(page.getByTestId('cut-tab-missing')).toHaveCount(0);
  await page.getByTestId('cut-tab-options').click();
  await expect(page.getByTestId('cut-preflight-shots')).toHaveAttribute('data-status', 'ok');

  // Film Director reads it all.
  await gotoStable(page, '/production');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('director-scenes-total')).toContainText('2', { timeout: 30_000 });
  await expect(page.getByTestId('director-scenes-kept')).toContainText('1');
  await expect(page.getByTestId('director-scenes-review')).toContainText('1');

  // The Queue opens on the old Gallery entries.
  await gotoStable(page, '/queue');
  await dismissBlockingOverlays(page);
  await expect(page.getByRole('heading', { name: /Queue/ }).first()).toBeVisible({
    timeout: 30_000,
  });

  // Nothing lost, and nothing new written just by looking.
  const tools = await stored(page);
  expect(tools.scene.scenes.map((scene: { id: string }) => scene.id)).toEqual([
    'up-kitchen',
    'up-roof',
  ]);
  expect(tools.scene.scenes[0].keptTakeId).toBe('up-k2');
  expect(tools.scene.scenes[0].takes).toHaveLength(2);
  expect(tools.cut.versions).toHaveLength(1);
  expect(tools.cut.options?.shotEdits?.shots?.['scenes:up-kitchen']?.caption).toBe('Old caption');
  expect(tools.cut.extras).toHaveLength(1);
  expect(tools.cut.editedAt).toBeUndefined();
  expect(tools.scene.run).toBeUndefined();
});

test('an old Cut edit, changed now, gains the new fields and keeps the old ones', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, V2_12_36, { once: true });
  await gotoStable(page, '/cut?from=scenes');
  await dismissBlockingOverlays(page);
  const card = page.locator('[data-testid^="cut-text-x:"]').first();
  await expect(card).toHaveValue('Later that night', { timeout: 60_000 });
  await card.fill('Much later');
  await card.blur();
  await expect
    .poll(async () => {
      const tools = await stored(page);
      return [
        typeof tools.cut?.editedAt,
        tools.cut?.extras?.[0]?.text,
        tools.cut?.options?.shotEdits?.shots?.['scenes:up-kitchen']?.caption,
        tools.cut?.versions?.length,
      ].join('|');
    }, { timeout: 30_000 })
    .toBe('number|Much later|Old caption|1');
});
