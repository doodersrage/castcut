import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { openDaySlotSheet } from './helpers/day';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * Scene — one shot, exactly as you want it: Day's slot editor and engine on one shot, the Cast's
 * saved scenes, takes kept, Make it move from the kept take, Day ↔ Scene links and Cut's Scenes
 * source.
 */

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

const CAST = 'e2e-scene';
const SHOTS = process.env.SCENE_SHOTS_DIR;
const PREFIX = 'day-slot-pose-preview';

const cast = {
  version: 1,
  characters: [
    {
      id: CAST,
      name: 'Scene Cast',
      version: 1,
      updatedAt: Date.now(),
      descriptor: 'a woman in her thirties with short dark hair',
      traits: { sex: 'woman' },
      ipAdapter: { imageFilename: 'e2e-scene.png', imageUrl: '/icon.svg' },
    },
  ],
  removedIds: [],
};

/** ComfyUI stubbed: queued jobs are captured, uploads accepted, pictures a 1×1 PNG. */
async function stubComfyQueue(page: Page) {
  const queued: string[] = [];
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  await page.context().route(/\/api\/comfyui(?:\/|\?|$)/, async route => {
    const request = route.request();
    let path = request.url();
    try {
      path = new URL(request.url()).pathname.replace(/\/$/, '');
    } catch {
      // keep the raw url
    }
    if (request.method() === 'POST' && path === '/api/comfyui') {
      queued.push(request.postData() ?? '');
      await route.fulfill({
        json: { ok: true, promptId: `e2e-scene-${queued.length}`, comfyUrl: 'http://127.0.0.1:8188' },
      });
      return;
    }
    if (path === '/api/comfyui/upload') {
      await route.fulfill({
        json: { name: `e2e-upload-${Date.now()}.png`, subfolder: '', type: 'input' },
      });
      return;
    }
    if (path.startsWith('/api/comfyui/view')) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: png });
      return;
    }
    if (path === '/api/comfyui/preview') {
      await route.fulfill({
        json: {
          ok: true,
          workflowSource: 'minimal',
          replacements: { positive: 1, negative: 0, params: {} },
          workflowJson: JSON.stringify({
            '1': {
              class_type: 'CheckpointLoaderSimple',
              inputs: { ckpt_name: 'model.safetensors' },
            },
          }),
        },
      });
      return;
    }
    if (path.startsWith('/api/comfyui/object-info')) {
      await route.fulfill({ status: 502, json: { error: 'e2e: no ComfyUI' } });
      return;
    }
    await route.continue();
  });
  return queued;
}

/** A saved scene with two finished takes, open on the page. */
function sceneWithTakes() {
  const slot = {
    id: 'evening',
    label: 'Evening',
    location: 'small kitchen',
    sceneHints: 'stirring a pot of risotto at the stove',
  };
  const takes = [
    { id: 'take-1', promptId: 'take-1', imageUrl: '/icon.svg?take=1', at: 1 },
    { id: 'take-2', promptId: 'take-2', imageUrl: '/icon.svg?take=2', at: 2 },
  ];
  return {
    isolateSubject: false,
    scenes: [
      {
        id: 'scene-e2e',
        castId: CAST,
        name: 'Kitchen',
        slot,
        dayMood: 'everyday',
        takes,
        createdAt: 1,
        updatedAt: 2,
      },
    ],
    activeSceneId: 'scene-e2e',
    slots: [slot],
    stills: [{ slotId: 'evening', promptId: 'take-2', imageUrl: '/icon.svg?take=2', status: 'completed' }],
    stillsCharacterId: CAST,
    dayMood: 'everyday',
  };
}

/** The prompt text of a queued job (the encoder's, wherever it sits in the body). */
function promptOf(body: string): string {
  return body.replace(/\\n/g, '\n').replace(/\\"/g, '"');
}

/** The first stored scene, read from the app's IndexedDB settings ("count|cast|slot|place|cam"). */
async function storedScene(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => resolve('');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.close();
            resolve('');
            return;
          }
          const get = db
            .transaction('kv', 'readonly')
            .objectStore('kv')
            .get('comfy-prompt-tool-settings-tools-v1');
          get.onsuccess = () => {
            db.close();
            const scenes = get.result?.value?.tools?.scene?.scenes;
            const scene = Array.isArray(scenes) ? scenes[0] : null;
            resolve(
              scene
                ? `${scenes.length}|${scene.castId}|${scene.slot?.id}|${scene.slot?.location}|${scene.slot?.poseCamera?.height}`
                : ''
            );
          };
          get.onerror = () => {
            db.close();
            resolve('');
          };
        };
      })
  );
}

/** The Scene page's stored settings (tools.scene), as JSON, read from the app's IndexedDB. */
async function storedSceneTool(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => resolve('');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.close();
            resolve('');
            return;
          }
          const get = db
            .transaction('kv', 'readonly')
            .objectStore('kv')
            .get('comfy-prompt-tool-settings-tools-v1');
          get.onsuccess = () => {
            db.close();
            resolve(JSON.stringify(get.result?.value?.tools?.scene ?? {}));
          };
          get.onerror = () => {
            db.close();
            resolve('');
          };
        };
      })
  );
}

/** The stored scripts, read from the app's IndexedDB settings ("count|cast|name" of the first). */
async function storedScripts(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>(resolve => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => resolve('');
        request.onsuccess = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) {
            db.close();
            resolve('');
            return;
          }
          const get = db
            .transaction('kv', 'readonly')
            .objectStore('kv')
            .get('comfy-prompt-tool-settings-tools-v1');
          get.onsuccess = () => {
            db.close();
            const scripts = get.result?.value?.tools?.scene?.scripts;
            const first = Array.isArray(scripts) ? scripts[0] : null;
            resolve(
              Array.isArray(scripts)
                ? first
                  ? `${scripts.length}|${first.castId}|${first.name}`
                  : '0'
                : '0'
            );
          };
          get.onerror = () => {
            db.close();
            resolve('');
          };
        };
      })
  );
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

test('a new scene: the shot, its pose camera, and a take queued on Day’s engine', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { isolateSubject: false } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);

  await expect(page.getByTestId('scene-empty')).toBeVisible({ timeout: 60_000 });
  await page.getByTestId('scene-new').click();
  await expect(page.getByTestId('scene-shot')).toBeVisible();
  await expect(page.getByTestId('scene-name')).toHaveValue('Scene 1');
  // Not a Day: no length, one shot.
  await expect(page.getByTestId('scene-plan-bar')).toBeVisible();
  await expect(page.getByTestId('day-length')).toHaveCount(0);

  await page.getByTestId('scene-time-evening').click();
  await expect(page.getByTestId('scene-time-evening')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('day-slot-location').fill('small kitchen');
  await page.getByTestId('day-slot-beat').fill('stirring a pot of risotto at the stove');
  // The slot's Camera row (Day's pose preview).
  await page.getByTestId(`${PREFIX}-camera-height`).selectOption('low');
  await page.getByTestId(`${PREFIX}-camera-shot`).selectOption('waist');
  await expect(page.getByTestId(`${PREFIX}-camera`)).toHaveAttribute('data-from', 'slot');
  await shot(page, 'scene-desk-new');

  await page.getByTestId('scene-queue-take').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  const prompt = promptOf(queued[0]!);
  expect(prompt).toContain('Camera: a low angle looking up at her');
  expect(prompt).toContain('waist-up shot');
  expect(prompt).toMatch(/risotto/);

  // Saved with the Cast: the tools settings (IndexedDB — what syncs and what a reload reads; a
  // real reload here would run the seed again).
  await expect.poll(() => storedScene(page), { timeout: 30_000 }).toBe(
    `1|${CAST}|evening|small kitchen|low`
  );
  await expect(page.getByTestId('scene-list-items')).toBeVisible();
});

test('keep a take, the Director from it, and the kept take in Cut', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: sceneWithTakes() },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);

  const takes = page.getByTestId('scene-take');
  await expect(takes).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByTestId('scene-move-needs-keep')).toBeVisible();
  await expect(page.getByTestId('scene-director')).toBeDisabled();

  // Keep the first take: it goes on the card and Make it move starts from it.
  await page.getByTestId('scene-take-keep-0').click();
  await expect(takes.nth(0)).toHaveAttribute('data-kept', 'true');
  await expect(takes.nth(0)).toHaveAttribute('data-on-card', 'true');
  await expect(page.getByTestId('scene-kept')).toBeVisible();
  await shot(page, 'scene-desk-kept');

  await page.getByTestId('scene-director').click();
  await expect(page.getByTestId('scene-director-sheet')).toBeVisible({ timeout: 60_000 });
  await shot(page, 'scene-desk-director');
  await page.getByTestId('scene-director-sheet-cancel').click();
  await expect(page.getByTestId('scene-director-sheet')).toHaveCount(0);

  // Cut: Scenes is a source, with the kept take (its link, so the seed does not run again).
  await page.getByTestId('scene-open-cut').click();
  await expect(page).toHaveURL(/\/cut\?from=scenes/, { timeout: 60_000 });
  await dismissBlockingOverlays(page);
  const source = page.getByTestId('cut-source-scenes');
  await expect(source).toContainText('Scenes · 1 shot', { timeout: 60_000 });
  await expect(source).toHaveAttribute('aria-checked', 'true');
  await shot(page, 'scene-cut-source');
});

// M3 S2: a screenplay is imported, read scene by scene, kept with the Cast, and deleted.
test('a script is imported, read scene by scene, kept after a reload, and deleted', async ({
  page,
}) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: sceneWithTakes() },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-scripts')).toBeVisible({ timeout: 60_000 });

  await page.getByTestId('script-import').click();
  await page
    .getByTestId('script-import-text')
    .fill(
      'Title: The Rooftop\n\nINT. KITCHEN - MORNING\n\nShe pours coffee. [[check the cup\n\nNORA\nCoffee first.\n\nEXT. ROOFTOP - NIGHT\n\nThe city.\n'
    );
  // Read before it is kept: two scenes, one speaking part, and the unclosed note said.
  await expect(page.getByTestId('script-summary')).toContainText('2 scenes · 1 speaking part');
  await expect(page.getByTestId('script-issues')).toContainText('never closed');
  await page.getByTestId('script-keep').click();
  await expect(page.getByTestId('script-reading')).toBeVisible();
  await expect(page.getByTestId('script-name')).toHaveValue('The Rooftop');
  await expect(page.getByTestId('script-scene-int-kitchen-morning')).toBeVisible();

  // Who's who (S3): NORA isn't in this Cast — unknown until you say; the kitchen reads as home.
  const nora = page.getByTestId('script-speaker-NORA');
  await expect(nora).toHaveAttribute('data-status', 'unknown');
  await nora.getByRole('combobox').selectOption('none');
  await expect(nora).toHaveAttribute('data-status', 'confirmed');
  await expect(nora).toContainText('Not in the Cast');
  await expect(page.getByTestId('script-place-KITCHEN')).toHaveAttribute('data-choice', 'home');
  await expect(page.getByTestId('script-place-ROOFTOP')).toHaveAttribute('data-choice', 'elsewhere');

  // Kept with the Cast in the app's settings (IndexedDB — what syncs and what a reload reads;
  // a reload here would run the seed again, which replaces the Scene settings).
  await expect
    .poll(() => storedScripts(page), { timeout: 30_000 })
    .toBe(`1|${CAST}|The Rooftop`);

  await page.getByTestId('script-delete').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(page.getByRole('button', { name: 'The Rooftop' })).toHaveCount(0);
  await expect.poll(() => storedScripts(page), { timeout: 30_000 }).toBe('0');
});

// M3 S4: a script scene's shots are drafted, one is made a Scene — filled in and linked both ways.
test('a script scene is drafted into shots and a shot is made a Scene', async ({ page }) => {
  const source = [
    'INT. KITCHEN - MORNING',
    '',
    'She pours coffee.',
    '',
    'NORA',
    'Coffee first.',
    '',
    'TOMAS',
    'You always say that.',
    '',
  ].join('\n');
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...sceneWithTakes(),
        scripts: [
          {
            id: 'script-e2e',
            castId: CAST,
            name: 'Morning',
            source,
            castMap: { NORA: CAST },
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await page.getByTestId('script-open-script-e2e').click({ timeout: 60_000 });
  await page.getByTestId('script-scene-int-kitchen-morning').locator('summary').click();
  await page.getByTestId('script-shots-draft-int-kitchen-morning').click();

  // The draft: establishing wide, her line, his line, his reaction... as planned shots.
  const lead = page.getByTestId('script-shot-int-kitchen-morning~2');
  await expect(page.getByTestId('script-shot-int-kitchen-morning~1')).toBeVisible();
  await expect(lead).toContainText('Coffee first.');
  await expect(lead).toHaveAttribute('data-status', 'planned');

  await page.getByTestId('script-shot-make-int-kitchen-morning~2').click();
  // Opened as the Scene page's scene, named for the shot.
  await expect(page.getByTestId('scene-name')).toHaveValue('1B KITCHEN · Dialogue', {
    timeout: 30_000,
  });
  await expect(lead).toHaveAttribute('data-status', 'made');
  await expect(page.getByTestId('script-shot-status-int-kitchen-morning~2')).toHaveText(
    'Scene made'
  );

  // Stored: the Scene filled in from the script and linked to the shot, and the shot to it.
  await expect
    .poll(
      async () => {
        const tool = JSON.parse((await storedSceneTool(page)) || '{}');
        const made = (tool.scenes ?? []).find(
          (scene: { fromScript?: { shotId: string } }) =>
            scene.fromScript?.shotId === 'int-kitchen-morning~2'
        );
        const shot = tool.scripts?.[0]?.shots?.find(
          (entry: { id: string }) => entry.id === 'int-kitchen-morning~2'
        );
        return made
          ? [
              made.slot.id,
              made.slot.location,
              made.slot.line,
              made.slot.poseCamera?.shot,
              shot?.madeSceneId === made.id,
              tool.activeSceneId === made.id,
            ].join('|')
          : '';
      },
      { timeout: 30_000 }
    )
    .toBe('morning|kitchen at home|Coffee first.|waist|true|true');

  // Coverage (S5): how far the scene has got, and what looks missing — decided like Cut's.
  await expect(page.getByTestId('script-coverage')).toContainText(
    '1 of 1 scene planned · 1 shot made · 0 kept · 0 in the Cut · 1 to look at'
  );
  await expect(page.getByTestId('script-coverage-int-kitchen-morning')).toContainText(
    '4 planned · 1 made · 0 kept · 0 in the Cut'
  );
  const nothingKept = page.getByTestId('script-finding-coverage-kept');
  await expect(nothingKept).toContainText('1 shot made, none kept');
  await page.getByTestId('script-finding-dismiss-coverage-kept').click();
  await expect(nothingKept).toHaveAttribute('data-decision', 'dismissed');
  await expect(page.getByTestId('script-coverage')).not.toContainText('to look at');
});

// R4: a take says how it was made — read from its Gallery entry.
test('a take says how it was made, and when its Gallery entry is gone', async ({ page }) => {
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: (() => {
        const seeded = sceneWithTakes();
        return {
          ...seeded,
          scenes: seeded.scenes.map(scene => ({
            ...scene,
            takes: [
              ...scene.takes,
              { id: 'take-3', promptId: 'take-3', imageUrl: '/icon.svg?take=3', at: 3 },
            ],
          })),
        };
      })(),
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          id: 'e2e-take-1-entry',
          promptId: 'take-1',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: stirring a pot of risotto at the stove',
          characterId: 'e2e-scene',
          model: 'qwen-e2e-model',
          queueParams: { seed: 777, width: 832, height: 1216, steps: 8 },
          hasStoredWorkflow: true,
          workflowJson: '{"1":{"class_type":"KSampler","inputs":{}}}',
          status: 'completed',
          queuedAt: Date.now() - 60_000,
          completedAt: Date.now() - 18_000,
          renderDurationMs: 42_000,
          images: [{ filename: 'e2e-take-1.png', subfolder: '', type: 'output' }],
        },
        {
          // Came by server sync: says it has a stored graph, but graphs never sync.
          id: 'e2e-take-3-entry',
          promptId: 'take-3',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: by the window',
          model: 'qwen-e2e-model',
          hasStoredWorkflow: true,
          status: 'completed',
          queuedAt: Date.now() - 30_000,
          completedAt: Date.now() - 10_000,
          images: [{ filename: 'e2e-take-3.png', subfolder: '', type: 'output' }],
        },
      ])
    );
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(3, { timeout: 60_000 });

  await page.getByTestId('scene-take-made-0').click();
  const dialog = page.getByTestId('scene-take-provenance');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('How take 1 was made');
  await expect(page.getByTestId('scene-take-provenance-still-made-with')).toContainText('Scene');
  await expect(page.getByTestId('scene-take-provenance-still-model')).toContainText('qwen-e2e-model');
  await expect(page.getByTestId('scene-take-provenance-still-seed')).toContainText('777');
  await expect(page.getByTestId('scene-take-provenance-still-size')).toContainText('832 × 1216');
  await expect(page.getByTestId('scene-take-provenance-still-render-time')).toContainText('42 s');
  await expect(page.getByTestId('scene-take-provenance-still-cast')).toContainText('Scene Cast');
  await expect(page.getByTestId('scene-take-provenance-still-graph')).toContainText('Stored');
  await expect(page.getByTestId('scene-take-provenance-still-prompt')).toContainText('risotto');
  await shot(page, 'scene-desk-take-provenance');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // Take 2 has no Gallery entry in this browser: it says so instead of inventing details.
  await page.getByTestId('scene-take-made-1').click();
  await expect(page.getByTestId('scene-take-provenance-missing')).toBeVisible();
  await expect(page.getByTestId('scene-take-provenance-still')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Take 3's entry claims a stored graph it doesn't have here: it says so.
  await page.getByTestId('scene-take-made-2').click();
  await expect(page.getByTestId('scene-take-provenance-still-graph')).toContainText(
    'Not stored with this render'
  );
});

// R7: the kept take is what Cut uses — removing it asks first; deleting the scene says so.
test('removing the kept take asks first, and deleting a scene says what Cut loses', async ({
  page,
}) => {
  const seeded = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...seeded,
        scenes: seeded.scenes.map(scene => ({ ...scene, keptTakeId: 'take-1' })),
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  const takes = page.getByTestId('scene-take');
  await expect(takes).toHaveCount(2, { timeout: 60_000 });
  await expect(takes.nth(0)).toHaveAttribute('data-kept', 'true');

  // The kept take: asked, and Cancel keeps it.
  await page.getByTestId('scene-take-remove-0').click();
  const ask = page.getByTestId('scene-remove-kept-confirm');
  await expect(ask).toBeVisible();
  await expect(ask).toContainText('leaves the cut');
  await page.getByTestId('confirm-dialog-cancel').click();
  await expect(takes).toHaveCount(2);

  // Delete says Cut loses the shot (and Keep keeps the scene).
  await page.getByTestId('scene-delete').click();
  await expect(page.getByTestId('scene-delete-cut-note')).toContainText('leaves the cut');
  await page.getByRole('button', { name: 'Keep', exact: true }).click();

  // Confirmed, it goes; a take that isn't kept goes at once.
  await page.getByTestId('scene-take-remove-0').click();
  await page.getByTestId('confirm-dialog-confirm').click();
  await expect(takes).toHaveCount(1);
  await page.getByTestId('scene-take-remove-0').click();
  await expect(takes).toHaveCount(0);
  await expect(page.getByTestId('scene-remove-kept-confirm')).toHaveCount(0);
});

test('Open as Scene from a Day slot copies its shot and take', async ({ page }) => {
  await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      day: {
        stillsCharacterId: CAST,
        isolateSubject: false,
        dayMood: 'everyday',
        slots: ['morning', 'afternoon', 'evening', 'night'].map(id => ({
          id,
          label: id[0]!.toUpperCase() + id.slice(1),
          location: id === 'evening' ? 'rooftop bar' : 'small kitchen',
          sceneHints: id === 'evening' ? 'laughing at the rail' : 'making coffee',
        })),
        stills: [
          { slotId: 'evening', promptId: 'day-evening', imageUrl: '/icon.svg', status: 'completed' },
        ],
      },
    },
  });
  await gotoStable(page, `/day?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await openDaySlotSheet(page, 'evening');
  await page.getByTestId('day-slot-open-as-scene').click();

  await expect(page).toHaveURL(/\/scene/, { timeout: 60_000 });
  await expect(page.getByTestId('scene-name')).toHaveValue('Scene 1', { timeout: 60_000 });
  await expect(page.getByTestId('day-slot-location')).toHaveValue('rooftop bar');
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('laughing at the rail');
  await expect(page.getByTestId('scene-time-evening')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('scene-take')).toHaveCount(1);
});

/** Horizontal overflow (px) of the page, and what sticks out (outside any scrolling strip). */
async function horizontalOverflow(page: Page): Promise<{ over: number; wide: string[] }> {
  return page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(el => {
        const box = el.getBoundingClientRect();
        if (!box.width || box.right <= window.innerWidth + 1) return false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflowX)) return false;
        }
        return true;
      })
      .slice(0, 8)
      .map(el => `${el.tagName}[${el.dataset.testid ?? ''}] →${Math.round(el.getBoundingClientRect().right)}`);
    return { over, wide };
  });
}

/** Of these bars, the ones whose own background lets what is behind them show (alpha < 1). */
async function translucentBars(page: Page, testIds: string[]): Promise<string[]> {
  return page.evaluate(
    ids =>
      ids.flatMap(id => {
        const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
        if (!el) return [`no ${id}`];
        const color = getComputedStyle(el).backgroundColor;
        const parts = (color.match(/\(([^)]*)\)/)?.[1] ?? '').split(/[\s,/]+/).filter(Boolean);
        const alpha = parts.length > 3 ? Number(parts[3]) : color.startsWith('rgb') ? 1 : 0;
        return alpha >= 1 ? [] : [`${id}: ${color}`];
      }),
    testIds
  );
}

/** Visible controls in `selector` smaller than 44 × 44 px (a phone tap target). */
async function smallTapTargets(page: Page, selector: string): Promise<string[]> {
  return page.evaluate(root => {
    const scope = document.querySelector(root);
    if (!scope) return [`no ${root}`];
    const controls: HTMLElement[] = [
      ...scope.querySelectorAll<HTMLElement>(
        'button, a[href], select, input:not([type=hidden]):not(.sr-only), textarea, [role=radio]'
      ),
    ];
    return controls
      // A checkbox is tapped through its label.
      .map(el => (el.matches('input') && el.closest('label')) || el)
      .filter(el => {
        const box = el.getBoundingClientRect();
        if (!box.width || !box.height || getComputedStyle(el).visibility === 'hidden') return false;
        return box.height < 44 || box.width < 44;
      })
      .map(el => {
        const box = el.getBoundingClientRect();
        const name = (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24);
        return `${el.tagName}[${el.dataset.testid ?? ''}] "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`;
      });
  }, selector);
}

for (const [width, height] of [
  [360, 780],
  [390, 844],
  [430, 932],
  [844, 390],
] as const) {
  test(`phone ${width}×${height}: its own layout — fits, 44 px targets, sheets, Queue in reach`, async ({
    browser,
  }) => {
    // A phone: touch, mobile viewport.
    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
      storageState: undefined,
    });
    const page = await context.newPage();
    await isolateServerStorage(page);
    await ensureAuthenticated(page);
    await stubComfyQueue(page);
    await seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: { scene: sceneWithTakes() },
    });
    await gotoStable(page, `/m/scene?character=${CAST}`);
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('scene-phone')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
    // Not the desk page in the phone shell.
    await expect(page.getByTestId('scene-plan-bar')).toHaveCount(0);
    await expect(page.getByTestId('scene-shot-summary')).toBeVisible();

    const { over, wide } = await horizontalOverflow(page);
    expect(over, wide.join('\n')).toBeLessThanOrEqual(1);
    // Scene's own controls (the shell and the get-started card are other pages' too).
    for (const root of [
      '[data-testid="scene-list"]',
      '[data-testid="scene-shot"]',
      '[data-testid="scene-take-list"]',
      '[data-testid="scene-shot-summary"]',
      '[data-testid="scene-move"]',
      '[data-testid="scene-action-bar"]',
    ]) {
      expect(await smallTapTargets(page, root), root).toEqual([]);
    }
    // Each summary row reads label | value | ›: the label starts inside the card, left-aligned
    // (a long value used to centre the row and push "Shot" off the left edge at 360 px).
    const clipped = await page
      .locator('[data-testid="scene-shot-summary"] button')
      .evaluateAll(rows =>
        rows.flatMap(row => {
          const box = row.getBoundingClientRect();
          const label = row.querySelector('span');
          if (!label) return [];
          const lb = label.getBoundingClientRect();
          return lb.left < box.left - 0.5 || lb.left > box.left + 24
            ? [`${label.textContent}: label at ${Math.round(lb.left)}, row at ${Math.round(box.left)}`]
            : [];
        })
      );
    expect(clipped).toEqual([]);
    // The header, the Film dock and the pinned Queue bar are opaque: scrolled text never shows
    // through them (light and dark).
    for (const theme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: theme });
      await expect.poll(() => page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
      expect(
        await translucentBars(page, ['mobile-studio-header', 'mobile-studio-dock', 'scene-action-bar']),
        theme
      ).toEqual([]);
    }
    // The takes: one swipeable strip.
    const strip = await page
      .getByTestId('scene-take-list')
      .evaluate(el => getComputedStyle(el).overflowX);
    expect(strip).toBe('auto');
    await shot(page, `scene-phone-${width}`);

    // Queue a take stays in reach while the page scrolls.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const bar = await page.getByTestId('scene-action-bar').boundingBox();
    expect(bar).not.toBeNull();
    expect(bar!.y + bar!.height).toBeLessThanOrEqual(height + 1);
    await expect(page.getByTestId('scene-queue-take')).toHaveText('Another take');
    await page.evaluate(() => window.scrollTo(0, 0));

    // Each sheet opens as a phone sheet and fits.
    const sheets: Array<[string, string]> = [
      ['scene-edit-shot', 'scene-shot-sheet'],
      ['scene-edit-mood', 'scene-mood-sheet'],
      ['scene-edit-engine', 'scene-engine-sheet'],
      ['scene-send-day', 'scene-send-day-sheet'],
    ];
    for (const [opener, sheet] of sheets) {
      await page.getByTestId(opener).tap();
      const dialog = page.getByTestId(sheet);
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(-1);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
      expect((await horizontalOverflow(page)).over).toBeLessThanOrEqual(1);
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    }
    // The shot sheet holds Day's slot editor; Queue from it too.
    await page.getByTestId('scene-action-edit').tap();
    await expect(page.getByTestId('scene-shot-sheet')).toBeVisible();
    await expect(page.getByTestId('day-slot-location')).toHaveValue('small kitchen');
    await page.keyboard.press('Escape');

    // Make it move from the kept take: Animate and Copy moves open their sheets.
    await page.getByTestId('scene-take-keep-0').tap();
    await expect(page.getByTestId('scene-take').nth(0)).toHaveAttribute('data-kept', 'true');
    await page.getByTestId('scene-animate').tap();
    await expect(page.getByTestId('day-animate-sheet')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('scene-copy-moves').tap();
    await expect(page.getByTestId('slot-media-sheet')).toBeVisible({ timeout: 30_000 });
    await page.keyboard.press('Escape');
    await context.close();
  });
}

test('queue: the Scene page’s jobs are labelled Scene, not Day', async ({ page }) => {
  const scene = sceneWithTakes();
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...scene,
        stills: [{ slotId: 'evening', promptId: 'e2e-scene-live', status: 'running' }],
        // A take dropped from the scene: still Scene's job.
        jobLog: [{ promptId: 'e2e-scene-dropped', scene: 'Kitchen', kind: 'still' }],
      },
    },
  });
  await page.addInitScript(cast => {
    const now = Date.now();
    window.localStorage.setItem('comfy-prompt-characters-v1', JSON.stringify(cast));
    const base = {
      comfyUrl: 'http://127.0.0.1:8188',
      // Queued like a Day still: the edit pipeline, a Day still's prompt.
      tool: 'image-prompt',
      prompt: 'Edit instruction for a Day still: stirring risotto',
      characterId: 'e2e-scene',
      model: 'qwen-e2e',
      images: [],
    };
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        { ...base, id: 'e2e-scene-live', promptId: 'e2e-scene-live', status: 'running', queuedAt: now - 20_000 },
        { ...base, id: 'e2e-scene-dropped', promptId: 'e2e-scene-dropped', status: 'pending', queuePosition: 1, queuedAt: now - 10_000 },
      ])
    );
  }, cast);
  await gotoStable(page, '/queue');
  await dismissBlockingOverlays(page);
  const batch = page.getByTestId('queue-batch');
  await expect(batch).toContainText('Scene · 2 jobs', { timeout: 30_000 });
  await expect(batch.getByText('Scene · Kitchen · Scene Cast').first()).toBeVisible();
  await expect(batch.getByRole('link', { name: 'Open in Scene' }).first()).toHaveAttribute(
    'href',
    `/scene?character=${CAST}`
  );
  await expect(page.getByText(/^Day · /)).toHaveCount(0);
});

test('Make it move: the clip engine choice (Day’s), its requirements, and Animate renders on it', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: { ...sceneWithTakes(), dayMood: 'intimate', intimateMix: 'duo' } },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
  // Only once a take is kept (Make it move starts from it).
  await expect(page.getByTestId('scene-clip-engine')).toHaveCount(0);
  await page.getByTestId('scene-take-keep-1').click();
  const block = page.getByTestId('scene-clip-engine');
  await expect(block).toBeVisible();
  await expect(block).toContainText('Animate clips on');
  await expect(page.getByTestId('scene-clip-engine-hint')).toContainText('Wan Animate');
  // Day's own setting: what Day's Animate uses, so Scene's too.
  await page.getByTestId('clip-engine-day').selectOption('wan');
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>(resolve => {
              const request = indexedDB.open('comfy-prompt-studio-v1');
              request.onsuccess = () => {
                const get = request.result
                  .transaction('kv', 'readonly')
                  .objectStore('kv')
                  .get('comfy-prompt-tool-settings-tools-v1');
                get.onsuccess = () => resolve(String(get.result?.value?.tools?.video?.dayClips ?? ''));
              };
            })
        ),
      { timeout: 15_000 }
    )
    .toBe('wan');
  await page.getByTestId('scene-animate').click();
  await expect(page.getByTestId('day-animate-sheet')).toBeVisible({ timeout: 30_000 });
  const before = queued.length;
  await page.getByTestId('day-animate-submit').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(before);
  const body = queued.at(-1)!;
  // The clip renders on WAN (the engine picked), not LTX-2.5.
  const model = (JSON.parse(body) as { model?: string }).model ?? '';
  expect(model).toMatch(/^wan-video/);
  await shot(page, 'scene-desk-clip-engine');
});

for (const phone of [false, true]) {
  test(`${phone ? 'phone' : 'desk'}: a take with a clip opens the clip in the lightbox, a still-only take the still`, async ({
    page,
  }) => {
    if (phone) await page.setViewportSize({ width: 390, height: 844 });
    const clip = '/e2e-scene-clip.mp4';
    await page.route(`**${clip}`, route =>
      route.fulfill({ status: 200, contentType: 'video/mp4', body: Buffer.alloc(16) })
    );
    const seeded = sceneWithTakes();
    const scene = seeded.scenes[0]!;
    await seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: {
        scene: {
          ...seeded,
          scenes: [
            {
              ...scene,
              keptTakeId: 'take-2',
              takes: [scene.takes[0], { ...scene.takes[1], clipUrl: clip, clipPromptId: 'clip-2' }],
            },
          ],
          stills: [
            {
              slotId: 'evening',
              promptId: 'take-2',
              imageUrl: '/icon.svg?take=2',
              status: 'completed',
              clipUrl: clip,
              clipPromptId: 'clip-2',
              clipStatus: 'completed',
            },
          ],
        },
      },
    });
    await gotoStable(page, `${phone ? '/m/scene' : '/scene'}?character=${CAST}`);
    await dismissBlockingOverlays(page);
    await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
    const lightbox = page.getByTestId('image-lightbox');
    // What the lightbox shows (its Open original link is the slide's own file).
    const shown = lightbox.getByRole('link', { name: 'Open original' });

    // The card: its clip (as on Day).
    await page.getByTestId('day-slot-select-evening').click();
    await expect(lightbox).toBeVisible({ timeout: 30_000 });
    await expect(shown).toHaveAttribute('href', clip);
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);

    // The kept take in Make it move: its clip.
    await page.getByTestId('scene-kept-open').click();
    await expect(shown).toHaveAttribute('href', clip);
    await page.keyboard.press('Escape');
    await expect(lightbox).toHaveCount(0);

    // A still-only take on the card opens the still.
    await page.getByTestId('scene-take-show-0').click();
    await expect(page.getByTestId('scene-take').nth(0)).toHaveAttribute('data-on-card', 'true');
    await page.getByTestId('day-slot-select-evening').click();
    await expect(lightbox).toBeVisible({ timeout: 30_000 });
    await expect(shown).toHaveAttribute('href', /take=1/);
  });
}

test('phone: every /m page has an opaque header and Film dock, dark and light', async ({ browser }) => {
  for (const colorScheme of ['dark', 'light'] as const) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      colorScheme,
    });
    const page = await context.newPage();
    await isolateServerStorage(page);
    await ensureAuthenticated(page);
    await stubComfyQueue(page);
    await seedSettingsCacheOnNextLoad(page, {
      shared: { activeCharacterId: CAST },
      characters: cast,
      tools: { scene: sceneWithTakes() },
    });
    for (const path of ['/m', '/m/film', '/m/day', '/m/scene', '/m/story', '/m/fitting', '/m/cut', '/m/gallery', '/m/queue']) {
      await gotoStable(page, `${path}?character=${CAST}`);
      await dismissBlockingOverlays(page);
      await expect(page.getByTestId('mobile-studio-dock')).toBeVisible({ timeout: 60_000 });
      expect(
        await translucentBars(page, ['mobile-studio-header', 'mobile-studio-dock']),
        `${path} ${colorScheme}`
      ).toEqual([]);
    }
    await context.close();
  }
});

/** The Scene page seeded with two scenes of the Cast, Kitchen open. */
function twoScenes(stills: Array<Record<string, unknown>>) {
  const seeded = sceneWithTakes();
  return {
    ...seeded,
    scenes: [
      ...seeded.scenes,
      {
        id: 'scene-roof',
        castId: CAST,
        name: 'Rooftop',
        slot: { id: 'night', label: 'Night', location: 'rooftop bar', sceneHints: 'laughing at the rail' },
        dayMood: 'everyday',
        takes: [],
        createdAt: 3,
        updatedAt: 3,
      },
    ],
    stills,
  };
}

test('a take at the adult check: another scene opens, and the verdict lands on its own scene', async ({
  page,
}) => {
  await stubComfyQueue(page);
  // The vision model's answer waits until the other scene is open.
  let answer: () => void = () => {};
  const answered = new Promise<void>(resolve => {
    answer = resolve;
  });
  let asked = 0;
  await page.route('**/api/adult-check', async route => {
    asked += 1;
    await answered;
    await route.fulfill({
      json: { available: true, reply: { answer: 'yes', confidence: 97, youngestAge: 32, people: 1 } },
    });
  });
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: twoScenes([{ slotId: 'evening', promptId: 'e2e-checking', status: 'running' }]),
    },
  });
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'comfyui-gallery-v1',
      JSON.stringify([
        {
          id: 'e2e-checking',
          promptId: 'e2e-checking',
          comfyUrl: 'http://127.0.0.1:8188',
          tool: 'image-prompt',
          prompt: 'Edit instruction for a Day still: stirring risotto',
          characterId: 'e2e-scene',
          model: 'qwen-e2e',
          status: 'completed',
          queuedAt: Date.now() - 20_000,
          images: [{ filename: 'e2e-checking.png', subfolder: '', type: 'output' }],
          adultCheck: { state: 'pending', at: Date.now() - 5_000 },
        },
      ])
    );
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-take')).toHaveCount(2, { timeout: 60_000 });
  // Checking, not rendering.
  await expect(page.getByTestId('scene-queue-take')).toHaveText('Checking…', { timeout: 30_000 });
  await expect.poll(() => asked, { timeout: 30_000 }).toBeGreaterThan(0);
  await expect(page.getByTestId('scene-new')).toBeEnabled();

  // Another scene opens while the take is checked.
  await page.getByTestId('scene-list-item-scene-roof').click();
  await expect(page.getByTestId('scene-name')).toHaveValue('Rooftop');
  await expect(page.getByTestId('scene-note')).toContainText('being checked');
  await expect(page.getByTestId('scene-note')).not.toContainText('rendering');
  await expect(page.getByTestId('scene-take')).toHaveCount(0);

  // The verdict: the take joins Kitchen, not the open Rooftop.
  answer();
  await expect(page.getByTestId('scene-list-item-scene-e2e')).toContainText('3 takes', {
    timeout: 30_000,
  });
  await expect(page.getByTestId('scene-list-item-scene-roof')).toContainText('No takes yet');
  await expect(page.getByTestId('scene-take')).toHaveCount(0);
  await shot(page, 'scene-check-switched');
  await page.getByTestId('scene-list-item-scene-e2e').click();
  await expect(page.getByTestId('scene-name')).toHaveValue('Kitchen');
  await expect(page.getByTestId('scene-take')).toHaveCount(3);
});

test('a take still rendering keeps its scene open (its job lands there)', async ({ page }) => {
  await stubComfyQueue(page);
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: { scene: twoScenes([{ slotId: 'evening', promptId: 'e2e-rendering', status: 'running' }]) },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('scene-queue-take')).toHaveText('Rendering…', { timeout: 60_000 });
  await expect(page.getByTestId('scene-new')).toBeDisabled();
  await page.getByTestId('scene-list-item-scene-roof').click();
  await expect(page.getByTestId('scene-note')).toContainText('A take is rendering');
  await expect(page.getByTestId('scene-name')).toHaveValue('Kitchen');
});

test('mood fit never replaces the scene’s own Setting (a blank beat is filled under it)', async ({
  page,
}) => {
  const queued = await stubComfyQueue(page);
  const setting = 'my grandmother’s sunlit attic studio';
  const seeded = sceneWithTakes();
  const slot = { id: 'evening', label: 'Evening', location: setting };
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: CAST },
    characters: cast,
    tools: {
      scene: {
        ...seeded,
        scenes: [{ ...seeded.scenes[0]!, slot }],
        slots: [slot],
      },
    },
  });
  await gotoStable(page, `/scene?character=${CAST}`);
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting, { timeout: 60_000 });
  await expect(page.getByTestId('day-slot-beat')).toHaveValue('');

  // A theme's mood fit: Day rerolls a blank-beat slot's Setting with its beat; a scene's stays.
  await page.getByTestId('day-mood').selectOption('date-night');
  await expect(page.getByTestId('day-mood')).toHaveValue('date-night');
  await expect(page.getByTestId('day-slot-beat')).not.toHaveValue('', { timeout: 15_000 });
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting);
  await page.getByTestId('day-mood').selectOption('everyday');
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting);

  // Queue: its fit and beat draw keep the Setting too.
  await page.getByTestId('scene-queue-take').click();
  await expect.poll(() => queued.length, { timeout: 60_000 }).toBeGreaterThan(0);
  expect(promptOf(queued[0]!)).toContain('attic studio');
  await expect(page.getByTestId('day-slot-location')).toHaveValue(setting);
});
