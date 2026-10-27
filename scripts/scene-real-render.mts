/**
 * Scene against a REAL ComfyUI — not CI (renders take minutes and need the models).
 *
 *   SCENE_BASE=http://127.0.0.1:47923 SCENE_OUT=/tmp/scene-real \
 *     npx tsx scripts/scene-real-render.mts <phase> [<phase>…]
 *
 * The browser profile lives in SCENE_OUT/profile, so phases run one after another on the same
 * install (its settings, its Cast). Point it at a dev server with its own empty PROMPT_DATA_DIR.
 * Phases: setup (import the Cast files in SCENE_CASTS), scenes, takes, move, links, cut,
 * transfer, queue, phone. Screenshots go to SCENE_OUT.
 *
 * Script to film (M6 V2), in order on one install: setup engine script shots run keep cut2
 * package. `script` imports a short three-scene script for SCENE_CAST (default cast-mara);
 * `shots` drafts each scene's shots and makes one a Scene; `run` prepares a run over them,
 * starts it, reloads mid-run and resumes; `keep` waits for you to keep a take in each Scene
 * (SCENE_KEEP=first keeps each Scene's first take for you); `cut2` cuts a review copy and
 * measures it; `package` packs the cut with its media and imports it in a fresh browser.
 * Each phase's time and problems go to SCENE_OUT/report.json.
 */
import { chromium, type BrowserContext, type Locator, type Page } from '@playwright/test';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { putAppKv } from '../e2e/helpers/idb';

const BASE = process.env.SCENE_BASE ?? 'http://127.0.0.1:47923';
const OUT = process.env.SCENE_OUT ?? '/tmp/scene-real';
const CASTS = process.env.SCENE_CASTS ?? join(OUT, 'in');
mkdirSync(OUT, { recursive: true });
/** Screenshots: SCENE_SHOTS (default SCENE_OUT/shots), each phase run prefixed by its name. */
const SHOTS = process.env.SCENE_SHOTS ?? join(OUT, 'shots');
mkdirSync(SHOTS, { recursive: true });
let runName = 'run';

let step = 0;
async function shot(page: Page, name: string, fullPage = true) {
  step += 1;
  const file = join(SHOTS, `${runName}-${String(step).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage }).catch(() => undefined);
  console.log(`  📸 ${file}`);
}

function log(...args: unknown[]) {
  console.log(new Date().toISOString().slice(11, 19), ...args);
}

async function dismiss(page: Page) {
  for (const name of [/Decide later/i, /Skip — (?:use Play|start a film)/i, /Skip for now/i]) {
    const button = page.getByRole('button', { name });
    if (await button.isVisible({ timeout: 500 }).catch(() => false)) await button.click();
  }
}

/** Wait for `locator`; on a dev server's first load (a stale chunk) reload once and wait again. */
async function ready(page: Page, locator: Locator, timeout = 60_000) {
  try {
    await locator.waitFor({ timeout });
  } catch {
    log('not ready — reloading once');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await locator.waitFor({ timeout: 120_000 });
  }
}

async function go(page: Page, path: string) {
  // A navigation the page started itself (an import opening its Cast) can abort ours: once more.
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(async error => {
    if (!/ERR_ABORTED/.test(String(error))) throw error;
    await page.waitForTimeout(2000);
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  });
  await dismiss(page);
}

/** The tools settings as the app holds them (IndexedDB). */
export async function toolSettings(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>(resolve => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => resolve({});
        request.onsuccess = () => {
          const db = request.result;
          const get = db
            .transaction('kv', 'readonly')
            .objectStore('kv')
            .get('comfy-prompt-tool-settings-tools-v1');
          get.onsuccess = () => {
            db.close();
            resolve((get.result?.value?.tools ?? {}) as Record<string, unknown>);
          };
          get.onerror = () => resolve({});
        };
      })
  );
}

async function expectValue(locator: Locator, value: string, timeout = 30_000) {
  const until = Date.now() + timeout;
  let last = '';
  while (Date.now() < until) {
    last = await locator.inputValue().catch(() => '');
    if (last === value) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`expected "${value}", saw "${last}"`);
}

/** The Scene page on a Cast (the link's ?character= makes them the active Cast). */
async function openScene(page: Page, castId: string, path = '/scene') {
  await go(page, `${path}?character=${castId}`);
  const ready = page.locator('[data-testid="scene-shot"], [data-testid="scene-empty"]').first();
  try {
    await ready.waitFor({ timeout: 60_000 });
  } catch {
    await shot(page, 'scene-not-ready');
    log('scene page not ready — reloading once');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready.waitFor({ timeout: 120_000 });
  }
  await page.waitForTimeout(1500);
}

/** Pick the page's engine by its label (the model select in the Engine chip's column). */
async function setEngine(page: Page, label: string) {
  const chip = page.getByTestId('tool-engine-chip');
  if ((await chip.getAttribute('aria-expanded')) !== 'true') await chip.click();
  const sheet = page.getByRole('dialog').filter({ hasText: 'Model, quality, and LoRAs' }).first();
  await sheet.waitFor({ timeout: 30_000 });
  if (
    !(await sheet
      .getByText(label, { exact: true })
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    await sheet.getByRole('button', { name: 'Change', exact: true }).first().click();
    await page.waitForTimeout(1000);
    await shot(page, 'engine-picker', false);
    await page.getByText(label, { exact: true }).last().click();
    await page.waitForTimeout(1000);
  }
  log('engine →', (await chip.textContent())?.trim());
  await shot(page, 'engine', false);
  const done = sheet.getByRole('button', { name: 'Done', exact: true });
  if (await done.isVisible().catch(() => false)) await done.click();
}

/** One step of a phase: logged, and a failure noted (with a screenshot) without stopping it. */
const problems: string[] = [];
async function attempt(page: Page, what: string, work: () => Promise<unknown>) {
  try {
    await work();
    log('✓', what);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    problems.push(`${what}: ${message}`);
    log('✗', what, message);
    await shot(page, `fail-${what.replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}`);
  }
}

type SceneStill = {
  slotId?: string;
  promptId?: string;
  status?: string;
  imageUrl?: string;
  error?: string;
  clipStatus?: string;
  clipUrl?: string;
  clipPromptId?: string;
  poseCheck?: unknown;
};

async function sceneStill(page: Page): Promise<SceneStill | undefined> {
  const tools = await toolSettings(page);
  const scene = tools.scene as { stills?: SceneStill[]; slots?: Array<{ id: string }> } | undefined;
  // Day-shaped: a still entry per time of day; the scene's is its one slot's.
  const slotId = scene?.slots?.[0]?.id;
  return (
    scene?.stills?.find(still => still.slotId === slotId && still.promptId) ??
    scene?.stills?.find(still => still.slotId === slotId)
  );
}

/** Wait for the take on the card to finish (a new prompt id than `before`), logging its status. */
async function waitForTake(page: Page, before: string | undefined, label: string, minutes = 20) {
  const until = Date.now() + minutes * 60_000;
  let last = '';
  let shotTaken = false;
  while (Date.now() < until) {
    const still = await sceneStill(page).catch(() => undefined);
    const now = `${still?.promptId ?? '-'} ${still?.status ?? '-'}`;
    if (now !== last) {
      log(label, now, still?.error ?? '');
      last = now;
    }
    if (!shotTaken && still?.status === 'running') {
      await page.waitForTimeout(4000);
      await shot(page, `${label}-rendering`);
      shotTaken = true;
    }
    if (still?.promptId && still.promptId !== before) {
      if (still.status === 'completed' || still.status === 'error') return still;
    }
    await page.waitForTimeout(3000);
  }
  throw new Error(`${label}: no take within ${minutes} min (${last})`);
}

/** Wait for the card's clip to land (Animate / Copy moves / the Director). */
async function waitForClip(page: Page, label: string, before?: string, minutes = 40) {
  const until = Date.now() + minutes * 60_000;
  let last = '';
  while (Date.now() < until) {
    const still = await sceneStill(page).catch(() => undefined);
    const now = `${still?.clipPromptId ?? '-'} ${still?.clipStatus ?? '-'}`;
    if (now !== last) {
      log(label, now);
      last = now;
    }
    const fresh = still?.clipPromptId && still.clipPromptId !== before;
    if (fresh && (still?.clipStatus === 'completed' || still?.clipStatus === 'error')) return still;
    await page.waitForTimeout(5000);
  }
  throw new Error(`${label}: no clip within ${minutes} min (${last})`);
}

/** Reload: the open scene, its takes and the kept one come back as they were. */
async function reloadCheck(page: Page) {
  const read = async () => ({
    name: await page
      .getByTestId('scene-name')
      .inputValue()
      .catch(() => ''),
    takes: await page
      .getByTestId('scene-take')
      .evaluateAll(list =>
        list
          .map(
            el =>
              `${(el as HTMLElement).dataset.take}${(el as HTMLElement).dataset.kept === 'true' ? '★' : ''}`
          )
          .join(',')
      ),
    place: await page
      .getByTestId('day-slot-location')
      .inputValue()
      .catch(() => ''),
  });
  const before = await read();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('scene-shot').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(2500);
  const after = await read();
  const same = JSON.stringify(before) === JSON.stringify(after);
  if (!same)
    problems.push(`reload changed the page: ${JSON.stringify(before)} → ${JSON.stringify(after)}`);
  log(same ? '✓ reload kept' : '✗ reload changed', JSON.stringify(after));
}

/** Horizontal overflow (px) and the widest offenders. */
async function overflowOf(page: Page) {
  return page.evaluate(() => {
    const over = document.documentElement.scrollWidth - window.innerWidth;
    const wide = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(el => {
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.right <= window.innerWidth + 1) return false;
        // Inside a horizontal scroller (a strip) is fine.
        for (let p = el.parentElement; p; p = p.parentElement) {
          const style = getComputedStyle(p);
          if (
            /(auto|scroll|hidden)/.test(style.overflowX) &&
            p.getBoundingClientRect().right <= window.innerWidth + 1
          )
            return false;
        }
        return true;
      })
      .slice(0, 6)
      .map(
        el =>
          `${el.tagName.toLowerCase()}[${el.dataset.testid ?? ''}] ${String(el.className).slice(0, 60)} →${Math.round(el.getBoundingClientRect().right)}`
      );
    return { over, wide };
  });
}

/** Visible tap targets under 44 px (in `root`, default the page's main content). */
async function smallTargets(page: Page, root = 'main') {
  return page.evaluate(selector => {
    const scope = document.querySelector(selector) ?? document.body;
    const items = [
      ...scope.querySelectorAll<HTMLElement>(
        'button, a[href], select, input:not([type=hidden]):not(.sr-only), textarea, summary, [role=radio], label:has(> input.sr-only)'
      ),
    ];
    return (
      items
        // A checkbox is tapped through its label.
        .map(el => (el.matches('input') && el.closest('label')) || el)
        .filter(el => {
          const box = el.getBoundingClientRect();
          if (!box.width || !box.height) return false;
          if (getComputedStyle(el).visibility === 'hidden') return false;
          if (el.closest('[aria-hidden=true]')) return false;
          return box.height < 44 || box.width < 44;
        })
        .map(el => {
          const box = el.getBoundingClientRect();
          const name = (
            el.getAttribute('aria-label') ||
            el.textContent ||
            el.getAttribute('placeholder') ||
            ''
          )
            .trim()
            .slice(0, 28);
          return `${el.tagName.toLowerCase()}[${el.dataset.testid ?? ''}] "${name}" ${Math.round(box.width)}×${Math.round(box.height)}`;
        })
    );
  }, root);
}

async function phoneCheck(page: Page, tag: string, label: string, root = 'main') {
  const { over, wide } = await overflowOf(page);
  const small = await smallTargets(page, root);
  log(`[${tag}] ${label}: overflow ${over}px, small targets ${small.length}`);
  if (over > 1) {
    problems.push(`[${tag}] ${label}: horizontal overflow ${over}px — ${wide.join(' | ')}`);
  }
  for (const entry of small.slice(0, 40)) console.log('    small:', entry);
  await shot(page, `${tag}-${label}`, label === 'page');
  return small;
}

/** Open a sheet, check it fits and screenshot it, then close it. */
async function phoneSheet(
  page: Page,
  tag: string,
  label: string,
  open: () => Promise<unknown>,
  root: string
) {
  await attempt(page, `[${tag}] ${label}`, async () => {
    await open();
    await page.locator(root).first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    const box = await page.locator(root).first().boundingBox();
    const view = page.viewportSize()!;
    if (box && (box.x < -1 || box.x + box.width > view.width + 1)) {
      problems.push(
        `[${tag}] ${label}: sheet ${Math.round(box.x)}..${Math.round(box.x + box.width)} wider than ${view.width}`
      );
    }
    await phoneCheck(page, tag, label, root);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
  });
}

async function phoneStates(page: Page, tag: string) {
  await go(page, '/m/scene?character=cast-mara');
  await page.locator('[data-testid="scene-phone"]').waitFor({ timeout: 120_000 });
  // The Cast and scenes arrive with the server's settings sync.
  await page
    .locator('[data-testid="scene-shot"], [data-testid="scene-empty"]')
    .first()
    .waitFor({ timeout: 60_000 });
  await page.waitForTimeout(3000);
  const names = await page
    .locator('[data-testid^="scene-list-item-"][role=radio]')
    .allTextContents();
  log(`[${tag}] scenes from the server:`, names.map(t => t.trim()).join(' / '));
  await phoneCheck(page, tag, 'page');
  await shot(page, `${tag}-viewport`, false);
  // The action bar stays in reach while scrolling.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
  await page.waitForTimeout(500);
  const bar = await page
    .getByTestId('scene-action-bar')
    .boundingBox()
    .catch(() => null);
  const view = page.viewportSize()!;
  if (!bar || bar.y + bar.height > view.height + 1 || bar.y < 0) {
    problems.push(`[${tag}] action bar not in view mid-scroll (${JSON.stringify(bar)})`);
  } else {
    log(
      `[${tag}] action bar at ${Math.round(bar.y)}..${Math.round(bar.y + bar.height)} of ${view.height}`
    );
  }
  await shot(page, `${tag}-scrolled`, false);
  await page.evaluate(() => window.scrollTo(0, 0));
  // The take strip swipes.
  await attempt(page, `[${tag}] take strip`, async () => {
    const strip = page.getByTestId('scene-take-list');
    const info = await strip.evaluate(el => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
      ox: getComputedStyle(el).overflowX,
    }));
    log(`[${tag}] take strip`, JSON.stringify(info));
  });
  const sheetRoot = '[role="dialog"]';
  await phoneSheet(
    page,
    tag,
    'sheet-shot',
    () => page.getByTestId('scene-edit-shot').tap(),
    sheetRoot
  );
  await phoneSheet(
    page,
    tag,
    'sheet-mood',
    () => page.getByTestId('scene-edit-mood').tap(),
    sheetRoot
  );
  await phoneSheet(
    page,
    tag,
    'sheet-engine',
    () => page.getByTestId('scene-edit-engine').tap(),
    sheetRoot
  );
  await phoneSheet(
    page,
    tag,
    'sheet-send',
    () => page.getByTestId('scene-send-day').tap(),
    sheetRoot
  );
  await phoneSheet(
    page,
    tag,
    'sheet-setup',
    () => page.getByTestId('day-setup-chip').first().tap(),
    sheetRoot
  );
  await phoneSheet(
    page,
    tag,
    'sheet-animate',
    () => page.getByTestId('scene-animate').tap(),
    sheetRoot
  );
  await phoneSheet(
    page,
    tag,
    'sheet-moves',
    () => page.getByTestId('scene-copy-moves').tap(),
    sheetRoot
  );
  if (process.env.SCENE_PHONE_DEEP !== '0' && tag.startsWith('390')) {
    // The clothing sheet over the shot sheet; the 3D pose editor by touch; the Director.
    await attempt(page, `[${tag}] clothing over shot`, async () => {
      await page.getByTestId('scene-edit-shot').tap();
      await page.getByTestId('day-slot-clothing').getByRole('button').first().tap();
      await page.getByTestId('day-clothing').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(1000);
      await phoneCheck(page, tag, 'sheet-clothing', '[role="dialog"]:last-of-type');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await attempt(page, `[${tag}] pose editor 3D by touch`, async () => {
      if (
        !(await page
          .getByTestId('scene-editor')
          .isVisible()
          .catch(() => false))
      ) {
        await page.getByTestId('scene-edit-shot').tap();
      }
      await page.getByTestId('day-slot-pose-preview-edit').tap();
      await page.getByTestId('day-slot-pose-preview-editor').waitFor({ timeout: 30_000 });
      await page.waitForTimeout(800);
      const mode3d = page.getByTestId('day-slot-pose-preview-mode-3d');
      if (await mode3d.isVisible().catch(() => false)) await mode3d.tap();
      await page.waitForTimeout(2500);
      await phoneCheck(page, tag, 'pose-editor', '[role="dialog"]');
      const canvas = page.locator('[data-testid="day-slot-pose-preview-editor"] canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        // One finger drags (orbit / a handle); the editor must take it (touch-action none).
        const touchAction = await canvas.evaluate(el => getComputedStyle(el).touchAction);
        log(
          `[${tag}] 3D canvas ${Math.round(box.width)}×${Math.round(box.height)} touch-action ${touchAction}`
        );
        const cdp = await page.context().newCDPSession(page);
        const x = box.x + box.width * 0.3;
        const y = box.y + box.height * 0.5;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (let i = 1; i <= 8; i += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [{ x: x + i * 12, y }],
          });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // Two-finger pinch.
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [
            { x: cx - 30, y: cy, id: 1 },
            { x: cx + 30, y: cy, id: 2 },
          ],
        });
        for (let i = 1; i <= 6; i += 1) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: [
              { x: cx - 30 - i * 8, y: cy, id: 1 },
              { x: cx + 30 + i * 8, y: cy, id: 2 },
            ],
          });
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(800);
        await shot(page, `${tag}-pose-editor-after-touch`, false);
      }
      const discard = page.getByTestId('day-slot-pose-preview-discard');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      if (await discard.isVisible().catch(() => false)) await discard.tap();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    });
    await attempt(page, `[${tag}] director by touch`, async () => {
      await page.getByTestId('scene-director').tap();
      const sheet = page.getByTestId('scene-director-sheet');
      await sheet.waitFor({ timeout: 60_000 });
      await page.waitForTimeout(4000);
      await phoneCheck(page, tag, 'director', '[data-testid="scene-director-sheet"]');
      const canvas = sheet.locator('canvas').first();
      const box = await canvas.boundingBox();
      if (box) {
        const touchAction = await canvas.evaluate(el => getComputedStyle(el).touchAction);
        log(
          `[${tag}] director canvas ${Math.round(box.width)}×${Math.round(box.height)} touch-action ${touchAction}`
        );
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      }
      await page.getByTestId('scene-director-sheet-cancel').tap();
    });
  }
}

/** Import one Cast file (the Cast page's Import) and wait for it to open. */
async function importCast(page: Page, name: string) {
  await go(page, '/characters');
  await page.getByTestId('cast-import-input').waitFor({ state: 'attached', timeout: 120_000 });
  // Hydrated first: the input is in the server HTML before React listens to it.
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page.waitForTimeout(3000);
  await page.getByTestId('cast-import-input').setInputFiles(join(CASTS, name));
  const castName = name.split('.')[0]!;
  // Imported → the Cast's page opens; a picture problem leaves a note on this one.
  for (let i = 0; i < 90; i += 1) {
    if (!new URL(page.url()).pathname.endsWith('/characters')) break;
    const said = await page
      .locator('[data-testid="cast-import-note"], [role="alert"]')
      .allTextContents()
      .catch(() => []);
    if (said.join('').trim()) {
      log(name, 'said:', said.join(' | '));
      break;
    }
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(4000);
  log(name, '→', page.url());
  await shot(page, `import-${castName}`);
}

// M6 V2: the script-to-film run's Cast and script.
const V2_CAST = process.env.SCENE_CAST ?? 'cast-mara';
const V2_SCRIPT = [
  "Title: Mara's Day",
  '',
  'INT. KITCHEN - MORNING',
  '',
  'Mara pours coffee by the window, still half asleep.',
  '',
  'MARA',
  'Coffee first.',
  '',
  'INT. OFFICE - DAY',
  '',
  'Mara works at her desk, sleeves rolled up.',
  '',
  'EXT. ROOFTOP - NIGHT',
  '',
  'Mara looks out over the city lights.',
  '',
].join('\n');
const V2_SCENES = ['int-kitchen-morning', 'int-office-day', 'ext-rooftop-night'];

type V2Shot = { id: string; sceneId: string; purpose: string; madeSceneId?: string };
type V2Scene = { id: string; castId: string; name: string; takes: unknown[]; keptTakeId?: string };
type V2Run = {
  state?: string;
  stopReason?: string;
  current?: unknown;
  outcomes?: Record<string, string>;
  log?: Array<{ at: number; event: string; sceneId?: string; promptId?: string; note?: string }>;
};

async function v2Script(page: Page) {
  const scene = (await toolSettings(page)).scene as
    { scripts?: Array<{ id: string; castId: string; shots?: V2Shot[] }> } | undefined;
  return scene?.scripts?.find(entry => entry.castId === V2_CAST);
}

async function v2Scenes(page: Page): Promise<V2Scene[]> {
  const scene = (await toolSettings(page)).scene as { scenes?: V2Scene[] } | undefined;
  return (scene?.scenes ?? []).filter(entry => entry.castId === V2_CAST);
}

/** Wait until the stored run matches `done`, logging its state as it changes. */
async function waitForRun(page: Page, done: (run: V2Run) => boolean, minutes: number) {
  const until = Date.now() + minutes * 60_000;
  let last = '';
  while (Date.now() < until) {
    const run =
      ((await toolSettings(page).catch(() => ({}))) as { scene?: { run?: V2Run } }).scene?.run ??
      {};
    const now = `${run.state} ${JSON.stringify(run.outcomes ?? {})}`;
    if (now !== last) {
      log('run:', now);
      last = now;
    }
    if (done(run)) return run;
    await page.waitForTimeout(3000);
  }
  throw new Error(`run: not there within ${minutes} min (${last})`);
}

type Phase = (ctx: BrowserContext, page: Page) => Promise<void>;

const STANDALONE = new Set(['phone', 'tablet', 'dock', 'sync']);

const phases: Record<string, Phase> = {
  /** Look at a page (SCENE_PATH): a screenshot and its test ids. */
  async look(_ctx, page) {
    await go(page, process.env.SCENE_PATH ?? '/');
    await page.waitForTimeout(Number(process.env.SCENE_WAIT ?? 8000));
    await shot(page, 'look');
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid]')].map(el => el.getAttribute('data-testid'))
    );
    console.log([...new Set(ids)].join(' '));
  },
  /** Print what the Scene page has saved (the open scene, its takes, the card's still). */
  async dump(_ctx, page) {
    await openScene(page, process.env.SCENE_CAST ?? 'cast-mara');
    await page.waitForTimeout(4000);
    const tools = await toolSettings(page);
    const scene = (tools.scene ?? {}) as Record<string, unknown>;
    console.log('scene keys', Object.keys(scene).join(','));
    console.log('activeSceneId', scene.activeSceneId, 'stillsCharacterId', scene.stillsCharacterId);
    console.log('slots', JSON.stringify(scene.slots));
    for (const entry of (scene.scenes ?? []) as Array<Record<string, unknown>>) {
      console.log('saved slot', entry.name, JSON.stringify(entry.slot));
    }
    console.log('stills', JSON.stringify(scene.stills, null, 1)?.slice(0, 2500));
    for (const entry of (scene.scenes ?? []) as Array<Record<string, unknown>>) {
      console.log(
        'scene',
        entry.id,
        entry.castId,
        entry.name,
        'kept',
        entry.keptTakeId,
        'takes',
        JSON.stringify(entry.takes)?.slice(0, 600)
      );
    }
    const day = (tools.day ?? {}) as Record<string, unknown>;
    console.log('day stills', JSON.stringify(day.stills)?.slice(0, 800));
    await shot(page, 'dump');
  },

  /** The page's engine (the Engine chip's column): SCENE_MODEL, by its label. */
  async engine(_ctx, page) {
    await openScene(page, process.env.SCENE_CAST ?? 'cast-mara');
    await setEngine(page, process.env.SCENE_MODEL ?? 'Qwen-Image 2.1 Turbo (8-step)');
    await shot(page, 'engine');
  },

  /**
   * Scene 1's shot: evening, Everyday solo, setting + beat, a library pose, a close camera, an
   * outfit, Qwen-Image 2.1 Turbo.
   */
  async shot(_ctx, page) {
    await openScene(page, 'cast-mara');
    await page
      .locator('[data-testid^="scene-list-item-"]')
      .filter({ hasText: 'Scene 1' })
      .first()
      .click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 1');
    await setEngine(page, 'Qwen-Image 2.1 Turbo (8-step)');
    await attempt(page, 'time evening', async () => {
      await page.getByTestId('scene-time-evening').click();
      if ((await page.getByTestId('scene-time-evening').getAttribute('aria-checked')) !== 'true')
        throw new Error('not checked');
    });
    await attempt(page, 'mood everyday', () =>
      page.getByTestId('day-mood').selectOption('everyday')
    );
    await attempt(page, 'people solo', () => page.getByTestId('day-intimate-mix-solo').click());
    await attempt(page, 'setting + beat', async () => {
      await page.getByTestId('day-slot-location').fill('small kitchen with warm pendant lights');
      await page
        .getByTestId('day-slot-beat')
        .fill('stirring a pot of risotto at the stove, smiling over her shoulder');
      await page.getByTestId('day-slot-beat').blur();
    });
    await attempt(page, 'library pose', async () => {
      const select = page.getByTestId('day-slot-pose-preview-select');
      const options = await select
        .locator('option')
        .evaluateAll(list =>
          list.map(o => [(o as HTMLOptionElement).value, o.textContent?.trim() ?? ''])
        );
      log(
        'poses',
        options
          .slice(0, 40)
          .map(([v, t]) => `${v}=${t}`)
          .join(', ')
      );
      // A layout (a picked posture alone keeps the beat's layout — "Cooking" here).
      const pick = options.find(([v]) => v === 'cook') ?? options[1]!;
      await select.selectOption(pick[0]!);
      log('picked pose', pick);
    });
    await attempt(page, 'camera close', async () => {
      // A close shot: the still is reframed to it after it lands (shot-reframe).
      await page.getByTestId('day-slot-pose-preview-camera-shot').selectOption('head');
      await page.getByTestId('day-slot-pose-preview-camera-height').selectOption('eye');
    });
    await attempt(page, 'outfit', async () => {
      await page.getByTestId('day-slot-clothing').getByRole('button').first().click();
      const picker = page.getByTestId('day-clothing');
      await picker.waitFor({ timeout: 30_000 });
      await picker
        .getByTestId('day-footwear-auto')
        .click()
        .catch(() => undefined);
      await picker.getByPlaceholder(/Search kits/i).fill('sundress');
      await page.waitForTimeout(1500);
      await shot(page, 'clothing-search', false);
      const tiles = picker.locator('button:has(img)');
      log('kit tiles', await tiles.count());
      await tiles.first().click();
      await page.waitForTimeout(1000);
      await shot(page, 'clothing-picked', false);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      log('clothing:', (await page.getByTestId('day-slot-clothing').textContent())?.trim());
    });
    await page.waitForTimeout(1500);
    await shot(page, 'shot-set');
  },

  /** Takes: queue, wait, another; keep one, drop one, switch the shown one. */
  async takes(_ctx, page) {
    await openScene(page, 'cast-mara');
    const count = Number(process.env.SCENE_TAKES ?? 2);
    for (let i = 0; i < count; i += 1) {
      const before = (await sceneStill(page))?.promptId;
      const button = page.getByTestId('scene-queue-take');
      log(
        'queue button:',
        (await button.textContent())?.trim(),
        'disabled:',
        await button.isDisabled()
      );
      await button.click();
      const still = await waitForTake(page, before, `take${i + 1}`);
      await page.waitForTimeout(4000);
      log('landed', still.status, still.imageUrl);
      await shot(page, `take${i + 1}-landed`);
    }
    const takes = page.getByTestId('scene-take');
    log('takes listed:', await takes.count());
  },

  /** Show takes on the card, keep one, drop one; "Looks wrong · redo" from the card's ⋯. */
  async pick(_ctx, page) {
    await openScene(page, 'cast-mara');
    const takes = page.getByTestId('scene-take');
    const state = async () =>
      (
        await takes.evaluateAll(list =>
          list.map(
            el =>
              `${(el as HTMLElement).dataset.take?.slice(0, 6)}${(el as HTMLElement).dataset.kept === 'true' ? '★' : ''}${(el as HTMLElement).dataset.onCard === 'true' ? '▣' : ''}`
          )
        )
      ).join(' ');
    log('takes', await state());
    await attempt(page, 'show take 1', async () => {
      await page.getByTestId('scene-take-show-0').click();
      await page.waitForTimeout(800);
      if ((await takes.nth(0).getAttribute('data-on-card')) !== 'true')
        throw new Error(await state());
    });
    await attempt(page, 'keep take 2', async () => {
      await page.getByTestId('scene-take-keep-1').click();
      await page.waitForTimeout(800);
      if ((await takes.nth(1).getAttribute('data-kept')) !== 'true') throw new Error(await state());
      if ((await takes.nth(1).getAttribute('data-on-card')) !== 'true')
        throw new Error(`kept not on card: ${await state()}`);
    });
    const count = await takes.count();
    await attempt(page, 'drop the last take', async () => {
      await page.getByTestId(`scene-take-remove-${count - 1}`).click();
      await page.waitForTimeout(800);
      if ((await takes.count()) !== count - 1) throw new Error(await state());
    });
    log('takes', await state());
    await shot(page, 'picked');
    if (process.env.SCENE_REDO !== '0') {
      await attempt(page, 'looks wrong redo', async () => {
        const before = (await sceneStill(page))?.promptId;
        await page.getByTestId('day-progress-menu-evening').click();
        await page.waitForTimeout(800);
        await shot(page, 'card-menu', false);
        await page.getByTestId('day-progress-looks-wrong-evening').click();
        const still = await waitForTake(page, before, 'redo');
        log('redo landed', still.status, still.error ?? '');
        await page.waitForTimeout(4000);
        log('takes', await state());
        await shot(page, 'redo-landed');
      });
    }
    await reloadCheck(page);
  },

  /** Make it move from the kept take: Animate (real), Copy moves opens, the Director (real). */
  async move(_ctx, page) {
    await openScene(page, 'cast-mara');
    // Scene 1 has the kept take.
    await page
      .locator('[data-testid^="scene-list-item-"][role=radio]')
      .filter({ hasText: 'Scene 1' })
      .first()
      .click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 1');
    const which = (process.env.SCENE_MOVES ?? 'animate,moves,director').split(',');
    if (which.includes('animate')) {
      await attempt(page, 'animate', async () => {
        const before = (await sceneStill(page))?.clipPromptId;
        await page.getByTestId('scene-animate').click();
        await page.getByTestId('day-animate-sheet').waitFor({ timeout: 30_000 });
        await page.waitForTimeout(800);
        await shot(page, 'animate-sheet', false);
        await page.getByTestId('day-animate-submit').click();
        const still = await waitForClip(page, 'animate', before);
        log('clip', still.clipStatus, still.clipUrl);
        await page.waitForTimeout(3000);
        await shot(page, 'animate-landed');
        const kept = page.getByTestId('scene-kept-clip');
        log('kept clip shown:', await kept.count(), await kept.getAttribute('src').catch(() => ''));
      });
    }
    if (which.includes('moves')) {
      await attempt(page, 'copy moves sheet', async () => {
        await page.getByTestId('scene-copy-moves').click();
        await page.getByTestId('slot-media-sheet').waitFor({ timeout: 30_000 });
        await page.waitForTimeout(800);
        await shot(page, 'moves-sheet', false);
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
      });
    }
    if (which.includes('director')) {
      await attempt(page, 'director', async () => {
        const before = (await sceneStill(page))?.clipPromptId;
        await page.getByTestId('scene-director').click();
        const sheet = page.getByTestId('scene-director-sheet');
        await sheet.waitFor({ timeout: 60_000 });
        await page.waitForTimeout(5000);
        // A ready-made move after the start pose (the start alone is not a move).
        const wave = sheet.getByRole('button', { name: 'Wave', exact: true });
        // Enabled once the still is read and the 3D body has loaded.
        for (let i = 0; i < 90 && !(await wave.isEnabled().catch(() => false)); i += 1) {
          await page.waitForTimeout(2000);
        }
        log('director ready:', await wave.isEnabled());
        await wave.click({ timeout: 10_000 });
        await page.waitForTimeout(3000);
        await shot(page, 'director-sheet', false);
        await page.getByTestId('scene-director-sheet-render').click();
        // The driving video is filmed in the browser first, then the job goes to ComfyUI.
        await sheet.waitFor({ state: 'detached', timeout: 15 * 60_000 });
        log('director: driving video sent');
        page.on('console', message => {
          if (message.type() === 'error' || message.type() === 'warning')
            log('console', message.text().slice(0, 300));
        });
        for (let i = 0; i < 6; i += 1) {
          await page.waitForTimeout(5000);
          log(
            'move note:',
            await page
              .getByTestId('scene-move-note')
              .textContent()
              .catch(() => '(none)')
          );
        }
        const still = await waitForClip(page, 'director', before, 60);
        log('director clip', still.clipStatus, still.clipUrl);
        await page.waitForTimeout(3000);
        await shot(page, 'director-landed');
      });
    }
  },

  /**
   * A close-shot take keeps its cut when it goes back on the card: a new take, kept, another
   * shown, the kept one back — the card still shows the cut and Animate starts from it.
   */
  async framecheck(_ctx, page) {
    await openScene(page, 'cast-mara');
    // The cut reads a Qwen-Image 2.1 still's graph: keep the take on the page's engine (Balanced
    // hands a pose its engine keeps missing to another one).
    await page.getByTestId('day-quality-advanced').click();
    const best = page.getByTestId('day-best-engine-per-pose');
    await best.waitFor({ timeout: 30_000 });
    if ((await best.getAttribute('aria-checked')) === 'true') await best.click();
    log('best engine per pose:', await best.getAttribute('aria-checked'));
    await page.getByTestId('day-quality-advanced').click();
    const before = (await sceneStill(page))?.promptId;
    await page.getByTestId('scene-queue-take').click();
    const landed = await waitForTake(page, before, 'take');
    // The cut lands after the take (shot-reframe).
    for (let i = 0; i < 40; i += 1) {
      const still = (await sceneStill(page)) as SceneStill & { framedUrl?: string };
      if (still?.framedUrl && (still as { finishedFor?: string }).finishedFor === landed.promptId)
        break;
      await page.waitForTimeout(3000);
    }
    const framed = ((await sceneStill(page)) as SceneStill & { framedUrl?: string })?.framedUrl;
    log('landed', landed.promptId, 'framed', framed);
    const takes = page.getByTestId('scene-take');
    const last = (await takes.count()) - 1;
    await page.getByTestId(`scene-take-keep-${last}`).click();
    await page.waitForTimeout(800);
    await page.getByTestId('scene-take-show-0').click();
    await page.waitForTimeout(2500);
    await page.getByTestId(`scene-take-show-${last}`).click();
    // Long enough for the gallery sync and the reframe to have run if they would.
    await page.waitForTimeout(12_000);
    const back = (await sceneStill(page)) as SceneStill & { framedUrl?: string };
    log('back on card:', back?.imageUrl, 'framedUrl', back?.framedUrl);
    if (!framed || back?.imageUrl !== framed) {
      problems.push(`kept close-shot take came back as ${back?.imageUrl} (cut ${framed})`);
    }
    await shot(page, 'kept-back-on-card');
    if (process.env.SCENE_ANIMATE !== '0') {
      const clipBefore = back?.clipPromptId;
      await page.getByTestId('scene-animate').click();
      await page.getByTestId('day-animate-sheet').waitFor({ timeout: 30_000 });
      await page.getByTestId('day-animate-submit').click();
      const clip = await waitForClip(page, 'animate', clipBefore);
      log('clip', clip.clipStatus, clip.clipPromptId, clip.clipUrl);
      await page.waitForTimeout(3000);
      await shot(page, 'animate-landed');
    }
  },

  /**
   * The phone page at 360 / 390 / 430 px (and 844×390 landscape) in a fresh mobile browser (touch,
   * isMobile): it gets the Cast and scenes from the server's settings sync. Every state and sheet
   * screenshotted; horizontal overflow and tap targets measured.
   */
  async phone() {
    const sizes = (process.env.SCENE_SIZES ?? '360x780,390x844,430x932,844x390')
      .split(',')
      .map(entry => entry.split('x').map(Number) as [number, number]);
    // A copy of the desk profile (its Cast, scenes and real takes): this server runs with
    // NEXT_PUBLIC_PLAYWRIGHT, which turns the startup pull from the server off.
    const profile = join(OUT, 'profile-phone');
    rmSync(profile, { recursive: true, force: true });
    cpSync(join(OUT, 'profile'), profile, { recursive: true });
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      rmSync(join(profile, name), { force: true });
    }
    for (const [width, height] of sizes) {
      const ctx = await chromium.launchPersistentContext(profile, {
        viewport: { width, height },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
        baseURL: BASE,
      });
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      page.on('pageerror', error => log('pageerror', error.message));
      page.on('console', message => {
        if (message.type() === 'error') log('console error', message.text().slice(0, 400));
      });
      try {
        await phoneStates(page, `${width}x${height}`);
      } finally {
        await ctx.close();
      }
    }
  },

  /**
   * The app's normal server sync, on a server WITHOUT NEXT_PUBLIC_PLAYWRIGHT (SCENE_SYNC_BASE):
   * browser A imports the Cast and makes a scene; browser B, fresh, gets both from the server.
   */
  async sync() {
    const base = process.env.SCENE_SYNC_BASE ?? 'http://127.0.0.1:47924';
    const browser = await chromium.launch();
    const fresh = async () => {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        baseURL: base,
      });
      await ctx.addCookies([{ name: 'comfy-workspace-mode-v1', value: 'studio', url: base }]);
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('comfy-workspace-mode-v1', 'studio');
          localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
        } catch {
          // private mode
        }
      });
      const page = await ctx.newPage();
      page.on('pageerror', error => log('pageerror', error.message));
      return { ctx, page };
    };
    const serverScenes = async () => {
      const response = await fetch(`${base}/api/storage?namespace=settings-cache`, {
        method: 'PUT',
      });
      const body = (await response.json()) as {
        data?: {
          tools?: {
            scene?: {
              scenes?: Array<{ name: string; castId: string; slot?: { location?: string } }>;
            };
          };
        };
      };
      return (body.data?.tools?.scene?.scenes ?? []).map(
        s => `${s.castId}:${s.name}@${s.slot?.location ?? ''}`
      );
    };
    try {
      const a = await fresh();
      await a.page.goto(`${base}/characters`, { waitUntil: 'domcontentloaded' });
      await dismiss(a.page);
      await a.page
        .getByTestId('cast-import-input')
        .waitFor({ state: 'attached', timeout: 180_000 });
      await a.page.waitForLoadState('networkidle').catch(() => undefined);
      await a.page.waitForTimeout(6000);
      await dismiss(a.page);
      await shot(a.page, 'sync-A-before-import');
      await a.page.getByTestId('cast-import-input').setInputFiles(join(CASTS, 'mara.castcut.json'));
      for (let i = 0; i < 90; i += 1) {
        if (!new URL(a.page.url()).pathname.endsWith('/characters')) break;
        const said = await a.page
          .locator('[data-testid="cast-import-note"], [role="alert"]')
          .allTextContents()
          .catch(() => []);
        if (said.join('').trim()) log('A import said:', said.join(' | '));
        await a.page.waitForTimeout(2000);
      }
      log('A imported Mara →', a.page.url());
      await shot(a.page, 'sync-A-imported');
      await a.page.goto(`${base}/scene?character=cast-mara`, { waitUntil: 'domcontentloaded' });
      await a.page.getByTestId('scene-new').waitFor({ timeout: 180_000 });
      await a.page.waitForTimeout(2000);
      await a.page.getByTestId('scene-new').click();
      await a.page.getByTestId('scene-name').fill('Synced balcony');
      await a.page.getByTestId('scene-name').press('Enter');
      await a.page.getByTestId('day-slot-location').fill('balcony over the harbour');
      await a.page.getByTestId('day-slot-location').blur();
      let seen: string[] = [];
      for (let i = 0; i < 40; i += 1) {
        await a.page.waitForTimeout(3000);
        seen = await serverScenes();
        if (seen.some(entry => entry.includes('Synced balcony@balcony over the harbour'))) break;
      }
      log('server has scenes:', seen.join(' | ') || '(none)');
      if (!seen.some(entry => entry.includes('Synced balcony@balcony')))
        problems.push('sync: the scene never reached the server');
      await shot(a.page, 'sync-A');
      await a.ctx.close();

      const b = await fresh();
      await b.page.goto(`${base}/scene?character=cast-mara`, { waitUntil: 'domcontentloaded' });
      let name = '';
      for (let i = 0; i < 40; i += 1) {
        await b.page.waitForTimeout(3000);
        await dismiss(b.page);
        name = await b.page
          .getByTestId('scene-name')
          .inputValue()
          .catch(() => '');
        if (name) break;
      }
      const place = await b.page
        .getByTestId('day-slot-location')
        .inputValue()
        .catch(() => '');
      log('B (fresh browser) sees:', name, '@', place);
      if (name !== 'Synced balcony' || place !== 'balcony over the harbour') {
        problems.push(`sync: a fresh browser saw "${name}" @ "${place}"`);
      }
      await shot(b.page, 'sync-B');
      await b.ctx.close();
    } finally {
      await browser.close();
    }
  },

  /** Cast export → import round trip: the scenes' shots come along under the imported Cast. */
  async transfer(_ctx, page) {
    await go(page, '/characters/cast-mara');
    await ready(page, page.locator('summary', { hasText: 'More' }).first());
    await page.waitForTimeout(3000);
    // In the page's More fold.
    await page.locator('summary', { hasText: 'More' }).first().click();
    const download = page.waitForEvent('download', { timeout: 120_000 });
    await page.getByTestId('cast-export').click();
    const file = await download;
    const path = join(OUT, 'mara-export.castcut.json');
    await file.saveAs(path);
    const json = JSON.parse(readFileSync(path, 'utf8')) as {
      scenes?: Array<{ name: string; slot?: { location?: string; poseCamera?: unknown } }>;
    };
    log(
      'exported scenes:',
      (json.scenes ?? [])
        .map(
          s =>
            `${s.name}@${s.slot?.location ?? ''} cam ${JSON.stringify(s.slot?.poseCamera ?? null)}`
        )
        .join(' | ')
    );
    if (!json.scenes?.length) problems.push('transfer: the Cast file has no scenes');
    await go(page, '/characters');
    await page.getByTestId('cast-import-input').waitFor({ state: 'attached', timeout: 120_000 });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.waitForTimeout(3000);
    await page.getByTestId('cast-import-input').setInputFiles(path);
    await page.waitForURL(url => !url.pathname.endsWith('/characters'), { timeout: 180_000 });
    const castId = decodeURIComponent(new URL(page.url()).pathname.split('/').pop() ?? '');
    log('imported as', castId);
    await openScene(page, castId);
    const names = (
      await page.locator('[data-testid^="scene-list-item-"][role=radio]').allTextContents()
    ).map(t => t.trim());
    log(
      'imported Cast scenes:',
      names.join(' / '),
      'open:',
      await page
        .getByTestId('scene-name')
        .inputValue()
        .catch(() => '')
    );
    if (names.length !== (json.scenes ?? []).length)
      problems.push(
        `transfer: ${names.length} scenes after import, file had ${json.scenes?.length}`
      );
    await shot(page, 'transfer-imported');
  },

  /**
   * Day ↔ Scene: Open as Scene from a Day slot; Send to Day slot on Mara's live Day, then on her
   * parked Day (Day switched to Lena).
   */
  async links(_ctx, page) {
    const day = async () =>
      ((await toolSettings(page)).day ?? {}) as {
        slots?: Array<{ id: string; location?: string; sceneHints?: string }>;
        stills?: Array<{
          slotId: string;
          promptId?: string;
          imageUrl?: string;
          previousTake?: unknown;
        }>;
        stillsCharacterId?: string;
        parkedDays?: Record<
          string,
          {
            slots?: Array<{ id: string; location?: string }>;
            stills?: Array<{ slotId: string; promptId?: string }>;
          }
        >;
      };
    // Mara's Day: a plan with an evening slot.
    await go(page, '/day?character=cast-mara');
    await ready(page, page.getByTestId('day-progress-edit-evening').first());
    await page.waitForTimeout(3000);
    await attempt(page, 'open as scene', async () => {
      await page.getByTestId('day-progress-edit-evening').first().click();
      const sheet = page.getByTestId('day-slot-sheet');
      await sheet.waitFor({ timeout: 30_000 });
      await sheet.getByTestId('day-slot-location').fill('rooftop bar at dusk');
      await sheet.getByTestId('day-slot-beat').fill('laughing at the rail with a cocktail');
      await sheet.getByTestId('day-slot-beat').blur();
      await page.waitForTimeout(800);
      await shot(page, 'day-slot-sheet', false);
      await page.getByTestId('day-slot-open-as-scene').click();
      await page.waitForURL(/\/scene/, { timeout: 120_000 });
      await page.getByTestId('scene-shot').waitFor({ timeout: 120_000 });
      await page.waitForTimeout(2000);
      const place = await page.getByTestId('day-slot-location').inputValue();
      const beat = await page.getByTestId('day-slot-beat').inputValue();
      const name = await page.getByTestId('scene-name').inputValue();
      log(
        'opened as scene:',
        name,
        '|',
        place,
        '|',
        beat,
        'evening:',
        await page.getByTestId('scene-time-evening').getAttribute('aria-checked')
      );
      if (place !== 'rooftop bar at dusk') throw new Error(`place ${place}`);
      await shot(page, 'opened-as-scene');
    });
    // Back to Scene 1 (kept take) and send it to the live Day's morning slot.
    await openScene(page, 'cast-mara');
    await page
      .locator('[data-testid^="scene-list-item-"][role=radio]')
      .filter({ hasText: 'Scene 1' })
      .first()
      .click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 1');
    const kept = await page
      .locator('[data-testid="scene-take"][data-kept="true"]')
      .getAttribute('data-take');
    await attempt(page, 'send to live day', async () => {
      await page.getByTestId('scene-send-day-slot').focus();
      await page.waitForTimeout(500);
      await page.getByTestId('scene-send-day-slot').selectOption('morning');
      await page.getByTestId('scene-send-day-go').click();
      await page.waitForTimeout(2000);
      const d = await day();
      const slot = d.slots?.find(entry => entry.id === 'morning');
      const still = d.stills?.find(entry => entry.slotId === 'morning');
      log('live Day morning:', slot?.location, '| still', still?.promptId, 'kept', kept);
      if (slot?.location !== 'small kitchen with warm pendant lights')
        throw new Error(`slot ${JSON.stringify(slot)}`);
      if (still?.promptId !== kept) throw new Error(`still ${still?.promptId} ≠ kept ${kept}`);
      await go(page, '/day?character=cast-mara');
      await ready(page, page.getByTestId('day-progress-edit-morning').first());
      await page.waitForTimeout(3000);
      await shot(page, 'day-after-send');
    });
    await attempt(page, 'day follows the Cast', async () => {
      // Day on Lena parks Mara's Day; Scene on Mara makes her the active Cast again, so her Day
      // comes back live (Day swaps with the Cast) — a send goes to it, never to Lena's.
      await go(page, '/day?character=cast-lena');
      await ready(page, page.getByTestId('day-progress-edit-evening').first());
      await page.waitForTimeout(3000);
      const onLena = await day();
      log(
        'Day on Lena: owner',
        onLena.stillsCharacterId,
        'parked:',
        Object.keys(onLena.parkedDays ?? {}).join(',')
      );
      await openScene(page, 'cast-mara');
      await page
        .locator('[data-testid^="scene-list-item-"][role=radio]')
        .filter({ hasText: 'Scene 1' })
        .first()
        .click();
      const back = await day();
      log(
        'Scene on Mara: Day owner',
        back.stillsCharacterId,
        'parked:',
        Object.keys(back.parkedDays ?? {}).join(',')
      );
      await page.getByTestId('scene-send-day-slot').focus();
      await page.waitForTimeout(500);
      await page.getByTestId('scene-send-day-slot').selectOption('afternoon');
      await page.getByTestId('scene-send-day-go').click();
      await page.waitForTimeout(2000);
      const d = await day();
      const slot = d.slots?.find(entry => entry.id === 'afternoon');
      const still = d.stills?.find(entry => entry.slotId === 'afternoon');
      log("Mara's Day afternoon:", d.stillsCharacterId, slot?.location, '| still', still?.promptId);
      if (d.stillsCharacterId !== 'cast-mara' || still?.promptId !== kept) {
        throw new Error(`day ${JSON.stringify({ owner: d.stillsCharacterId, slot, still })}`);
      }
      await shot(page, 'sent-after-cast-switch');
    });
  },

  /** Cut's Scenes source: the kept takes (their clips), and the cut plays. */
  async cut(_ctx, page) {
    await go(page, '/cut?from=scenes&character=cast-mara');
    const source = page.getByTestId('cut-source-scenes');
    await source.waitFor({ timeout: 180_000 });
    await page.waitForTimeout(4000);
    log(
      'source:',
      (await source.textContent())?.trim(),
      'checked',
      await source.getAttribute('aria-checked')
    );
    await shot(page, 'cut-scenes');
    await attempt(page, 'cut plays', async () => {
      await page.getByTestId('cut-preview-play').click();
      await page.waitForTimeout(4000);
      const time = (await page.getByTestId('cut-preview-time').textContent())?.trim();
      const lit = await page.getByTestId('cut-preview-canvas').evaluate(el => {
        const canvas = el as HTMLCanvasElement;
        const ctx = canvas.getContext('2d');
        if (!ctx) return -1;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < data.length; i += 4 * 97) sum += data[i]! + data[i + 1]! + data[i + 2]!;
        return sum;
      });
      log('cut playing at', time, 'canvas brightness', lit);
      await shot(page, 'cut-playing', false);
      if (!lit) throw new Error('blank canvas');
    });
  },

  /** Animate the kept take, reload while it renders: the clip still lands on the kept take. */
  async reloadclip(_ctx, page) {
    await openScene(page, 'cast-mara');
    const before = (await sceneStill(page))?.clipPromptId;
    await page.getByTestId('scene-animate').click();
    await page.getByTestId('day-animate-sheet').waitFor({ timeout: 30_000 });
    await page.getByTestId('day-animate-submit').click();
    for (let i = 0; i < 60; i += 1) {
      const still = await sceneStill(page);
      if (still?.clipPromptId && still.clipPromptId !== before) break;
      await page.waitForTimeout(2000);
    }
    log('queued', (await sceneStill(page))?.clipPromptId);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByTestId('scene-shot').waitFor({ timeout: 120_000 });
    log('reloaded; card clip', JSON.stringify(await sceneStill(page)).slice(0, 300));
    const still = await waitForClip(page, 'clip-after-reload', before);
    log('clip after reload', still.clipStatus, still.clipUrl);
    await page.waitForTimeout(3000);
    const keptClip = await page
      .getByTestId('scene-kept-clip')
      .getAttribute('src')
      .catch(() => null);
    log('kept take shows clip:', keptClip);
    if (!keptClip) problems.push('reloadclip: the kept take shows no clip');
    await shot(page, 'reload-clip');
  },

  /**
   * Rooftop: Intimate (Playful shows only there) · Duo with Lena as the partner · Noct-Q · a
   * real take. Then the page's engine goes back to Qwen-Image 2.1 Turbo.
   */
  async adult(_ctx, page) {
    await openScene(page, 'cast-mara');
    await page
      .locator('[data-testid^="scene-list-item-"][role=radio]')
      .filter({ hasText: 'Rooftop' })
      .first()
      .click();
    await expectValue(page.getByTestId('scene-name'), 'Rooftop');
    // The NSFW flag is read from the server after the page loads.
    await page
      .getByTestId('day-mood')
      .locator('option[value="intimate"]')
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => undefined);
    const moods = await page.getByTestId('day-mood').locator('option').allTextContents();
    log('moods offered:', moods.join(' / '));
    if (!moods.some(m => /Intimate/.test(m)))
      problems.push('adult: no Intimate with the NSFW flag on');
    const playfulBefore = await page.getByTestId('day-intimate-playful').count();
    await page.getByTestId('day-mood').selectOption('intimate');
    await page.waitForTimeout(800);
    const playfulAfter = await page.getByTestId('day-intimate-playful').count();
    log('Playful toggle: everyday', playfulBefore, '→ intimate', playfulAfter);
    if (playfulBefore !== 0 || playfulAfter !== 1) problems.push('adult: Playful gating wrong');
    await page.getByTestId('day-intimate-playful').click();
    await page.getByTestId('day-intimate-mix-duo').click();
    await page.waitForTimeout(800);
    await attempt(page, 'partner Lena', async () => {
      await page.getByTestId('day-partner-option-cast-lena').click();
      await page.waitForTimeout(800);
      const checked = await page
        .getByTestId('day-partner-option-cast-lena')
        .getAttribute('aria-checked');
      if (checked !== 'true') throw new Error(`checked ${checked}`);
    });
    await page.getByTestId('scene-time-night').click();
    await page.getByTestId('day-slot-location').fill('rooftop terrace with string lights');
    await page.getByTestId('day-slot-beat').fill('');
    await page.getByTestId('day-slot-beat').blur();
    await page.waitForTimeout(800);
    await shot(page, 'adult-set');
    await setEngine(
      page,
      process.env.SCENE_ADULT_MODEL ?? 'Qwen-Image 2.1 Noct-Q Fast (12-step, uncensored)'
    );
    const before = (await sceneStill(page))?.promptId;
    await page.getByTestId('scene-queue-take').click();
    const still = await waitForTake(page, before, 'noctq', 25);
    log('noctq take', still.status, still.error ?? '');
    // The scene is still one shot on its own slot (Day's mood fit once made it a whole Day).
    const scene = ((await toolSettings(page)).scene ?? {}) as {
      slots?: Array<{ id: string; location?: string; sceneHints?: string }>;
    };
    log('scene slots after the take:', JSON.stringify(scene.slots));
    if ((scene.slots ?? []).length !== 1 || scene.slots?.[0]?.id !== 'night') {
      problems.push(`adult: scene slots became ${JSON.stringify(scene.slots)}`);
    }
    await page.waitForTimeout(6000);
    await shot(page, 'adult-landed');
    await setEngine(page, 'Qwen-Image 2.1 Turbo (8-step)');
  },

  /**
   * The Film bars with Scene in them: the phone dock (/m, six tabs + More) at 360/390/430, and
   * the Play kiosk's dock (phones, 768) and header tab row (1024, 1280). Story is shown (first
   * film done), the widest case.
   */
  async dock() {
    const browser = await chromium.launch();
    const measure = async (page: Page, selector: string) =>
      page.evaluate(sel => {
        const bar = document.querySelector<HTMLElement>(sel);
        if (!bar) return null;
        // The bar's own tabs (not the More menu's links, laid out in its closed panel).
        const items = [
          ...bar.querySelectorAll<HTMLElement>(
            ':scope ul > li > a, :scope ul > li > button, :scope summary, :scope > a, :scope > button'
          ),
        ].filter(el => el.getBoundingClientRect().width > 0);
        const tops = new Set(items.map(el => Math.round(el.getBoundingClientRect().top)));
        return {
          barOverflow: bar.scrollWidth - bar.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
          rows: tops.size,
          items: items.map(el => {
            const box = el.getBoundingClientRect();
            const label = el.querySelector('span') ?? el;
            return {
              text: (el.textContent ?? '').trim(),
              w: Math.round(box.width),
              h: Math.round(box.height),
              clipped: label.scrollWidth > label.clientWidth + 1,
            };
          }),
        };
      }, selector);
    const report = (tag: string, result: Awaited<ReturnType<typeof measure>>) => {
      if (!result) {
        problems.push(`${tag}: bar not found`);
        return;
      }
      const small = result.items.filter(item => item.h < 44 || item.w < 44);
      const clipped = result.items.filter(item => item.clipped);
      log(
        tag,
        result.items.map(item => `${item.text} ${item.w}×${item.h}`).join(' | '),
        `rows ${result.rows} overflow ${result.barOverflow}/${result.pageOverflow}`
      );
      if (small.length)
        problems.push(`${tag}: small ${small.map(i => `${i.text} ${i.w}×${i.h}`).join(', ')}`);
      if (clipped.length) problems.push(`${tag}: clipped ${clipped.map(i => i.text).join(', ')}`);
      if (result.rows > 1) problems.push(`${tag}: wraps to ${result.rows} rows`);
      if (result.barOverflow > 1 || result.pageOverflow > 1)
        problems.push(`${tag}: overflow ${result.barOverflow}/${result.pageOverflow}`);
    };
    const seed = (mode: 'studio' | 'play') => () => {
      try {
        localStorage.setItem('comfy-workspace-mode-v1', mode);
        localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
        localStorage.setItem(
          'comfy-play-metrics-v1',
          JSON.stringify({
            version: 1,
            firstPlayCampaignAt: Date.now() - 86_400_000,
            firstFilmCutAt: Date.now(),
            firstFullDayAt: Date.now(),
          })
        );
      } catch {
        // private mode
      }
    };
    try {
      for (const width of [360, 390, 430]) {
        const ctx = await browser.newContext({
          viewport: { width, height: 800 },
          isMobile: true,
          hasTouch: true,
          baseURL: BASE,
        });
        await ctx.addInitScript(seed('studio'));
        const page = await ctx.newPage();
        // First film done (Story's tab shows): the metrics live in IndexedDB.
        await page.goto(`${BASE}/manifest.json`);
        await putAppKv(page, {
          'comfy-play-metrics-v1': {
            version: 1,
            firstFilmCutAt: Date.now(),
            firstFullDayAt: Date.now(),
          },
        });
        await go(page, '/m/scene');
        await page.locator('nav[aria-label="Film"]').waitFor({ timeout: 120_000 });
        await page
          .getByTestId('mobile-tab-story')
          .waitFor({ timeout: 30_000 })
          .catch(() => log('no Story tab'));
        await page.waitForTimeout(1500);
        report(`[phone dock ${width}]`, await measure(page, 'nav[aria-label="Film"]'));
        await page.screenshot({ path: join(SHOTS, `dock-phone-${width}.png`) });
        await page.getByTestId('mobile-tab-more').tap();
        await page.waitForTimeout(600);
        const menuItems = await page
          .locator('[data-testid="mobile-more-menu"] a')
          .evaluateAll(list =>
            list.map(
              el =>
                `${el.textContent?.trim()} ${Math.round(el.getBoundingClientRect().width)}×${Math.round(el.getBoundingClientRect().height)}`
            )
          );
        log(`[phone More menu ${width}]`, menuItems.join(' | '));
        await page.screenshot({ path: join(SHOTS, `dock-phone-${width}-more.png`) });
        await ctx.close();
      }
      for (const [width, height] of [
        [360, 780],
        [390, 844],
        [430, 932],
        [768, 1024],
        [1024, 768],
        [1280, 800],
      ] as const) {
        const phone = width < 640;
        const ctx = await browser.newContext({
          viewport: { width, height },
          isMobile: phone,
          hasTouch: phone,
          baseURL: BASE,
        });
        await ctx.addCookies([{ name: 'comfy-workspace-mode-v1', value: 'play', url: BASE }]);
        await ctx.addInitScript(seed('play'));
        const page = await ctx.newPage();
        await page.goto(`${BASE}/manifest.json`);
        await putAppKv(page, {
          'comfy-play-metrics-v1': {
            version: 1,
            firstFilmCutAt: Date.now(),
            firstFullDayAt: Date.now(),
          },
        });
        await go(page, '/scene');
        await page.waitForTimeout(6000);
        const bar =
          width >= 1024
            ? 'nav[aria-label="Film sections"]'
            : 'nav.fixed.bottom-0, nav[class*="bottom-0"]';
        report(`[kiosk ${width}]`, await measure(page, bar));
        await page.screenshot({ path: join(SHOTS, `dock-kiosk-${width}.png`) });
        await ctx.close();
      }
    } finally {
      await browser.close();
    }
  },

  /** Desk /scene at tablet widths (768, 1024): fits, nothing cut off. */
  async tablet() {
    const profile = join(OUT, 'profile-tablet');
    rmSync(profile, { recursive: true, force: true });
    cpSync(join(OUT, 'profile'), profile, { recursive: true });
    for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
      rmSync(join(profile, name), { force: true });
    }
    for (const [width, height] of [
      [768, 1024],
      [1024, 768],
    ] as const) {
      const ctx = await chromium.launchPersistentContext(profile, {
        viewport: { width, height },
        baseURL: BASE,
      });
      const page = ctx.pages()[0] ?? (await ctx.newPage());
      try {
        await openScene(page, 'cast-mara');
        await page.waitForTimeout(3000);
        const { over, wide } = await overflowOf(page);
        log(`[desk ${width}] overflow ${over}`, wide.join(' | '));
        if (over > 1) problems.push(`[desk ${width}] overflow ${over}: ${wide.join(' | ')}`);
        await shot(page, `desk-${width}`);
      } finally {
        await ctx.close();
      }
    }
  },

  /**
   * A clip that finished while no page polled it (NEXT_PUBLIC_PLAYWRIGHT turns the background
   * poller off): the Queue page resumes the polls, and Scene attaches the clip when it opens.
   */
  async resume(_ctx, page) {
    await go(page, '/queue');
    await page.waitForTimeout(15_000);
    await openScene(page, 'cast-mara');
    const still = await waitForClip(page, 'resumed', undefined, 3);
    log('clip on the card', still.clipStatus, still.clipPromptId, still.clipUrl);
    await page.waitForTimeout(3000);
    const keptClip = await page
      .getByTestId('scene-kept-clip')
      .getAttribute('src')
      .catch(() => null);
    log('kept take shows clip:', keptClip);
    if (!keptClip) problems.push('resume: the kept take shows no clip');
    await shot(page, 'resumed-clip');
  },

  /** The browser gallery's entry for SCENE_PROMPT (status, tool, its media). */
  async entry(_ctx, page) {
    await go(page, '/queue');
    await page.waitForTimeout(4000);
    const id = process.env.SCENE_PROMPT ?? '';
    const found = await page.evaluate(
      promptId =>
        new Promise<unknown>(resolve => {
          const request = indexedDB.open('comfy-prompt-studio-v1');
          request.onsuccess = () => {
            const db = request.result;
            const all = db
              .transaction('galleryEntries', 'readonly')
              .objectStore('galleryEntries')
              .getAll();
            all.onsuccess = () => {
              const rows = (all.result as Array<Record<string, unknown>>).filter(
                row => row.promptId === promptId
              );
              resolve(
                rows.map(row => ({
                  id: row.id,
                  status: row.status,
                  tool: row.tool,
                  derivedKind: row.derivedKind,
                  images: row.images,
                  statusMessage: row.statusMessage,
                  adultCheck: row.adultCheck,
                }))
              );
            };
          };
        }),
      id
    );
    console.log(JSON.stringify(found, null, 1));
  },

  /** A real take with a real clip: the card and the kept take open the clip in the lightbox. */
  async clipbox(_ctx, page) {
    await openScene(page, process.env.SCENE_CAST ?? 'cast-mara');
    const takeId = process.env.SCENE_CLIP_TAKE ?? '347ee8c6-3f5a-4c70-a8b7-9c13e4ebcc18';
    const takes = page.getByTestId('scene-take');
    const ids = await takes.evaluateAll(list => list.map(el => (el as HTMLElement).dataset.take));
    const index = ids.indexOf(takeId);
    if (index < 0) throw new Error(`no take ${takeId}`);
    if ((await takes.nth(index).getAttribute('data-kept')) !== 'true') {
      await page.getByTestId(`scene-take-keep-${index}`).click();
    }
    await page.getByTestId(`scene-take-show-${index}`).click();
    await page.waitForTimeout(1500);
    const lightbox = page.getByTestId('image-lightbox');
    const shown = lightbox.getByRole('link', { name: 'Open original' });
    await page.getByTestId('day-slot-select-evening').click();
    await lightbox.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(2000);
    const fromCard = await shown.getAttribute('href');
    await shot(page, 'clip-lightbox-card', false);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(600);
    await page.getByTestId('scene-kept-open').click();
    await lightbox.waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1500);
    const fromKept = await shown.getAttribute('href');
    await shot(page, 'clip-lightbox-kept', false);
    await page.keyboard.press('Escape');
    log('card opens', fromCard, '| kept opens', fromKept);
    for (const href of [fromCard, fromKept]) {
      if (!/webp|mp4|gallery\/media/.test(href ?? '') || /reframe|\.png/.test(href ?? '')) {
        problems.push(`clipbox: opened ${href}, not the clip`);
      }
    }
  },

  /** Open the scene named SCENE_NAME on Mara (and say why not, when it does not open). */
  async switchto(_ctx, page) {
    page.on('response', async response => {
      if (response.url().includes('/api/adult-check')) {
        log(
          'adult-check',
          response.status(),
          (await response.text().catch(() => '')).slice(0, 300)
        );
      }
    });
    await openScene(page, 'cast-mara');
    await page.waitForTimeout(Number(process.env.SCENE_WAIT ?? 0));
    log(
      'card:',
      (
        await page
          .getByTestId('day-slot-progress-night')
          .textContent()
          .catch(() => '')
      ).slice(0, 200)
    );
    const name = process.env.SCENE_NAME ?? 'Scene 1';
    const tile = page
      .locator('[data-testid^="scene-list-item-"][role=radio]')
      .filter({ hasText: name })
      .first();
    log(
      'tile',
      await tile.getAttribute('data-testid'),
      'checked',
      await tile.getAttribute('aria-checked'),
      'disabled',
      await tile.isDisabled()
    );
    await tile.click();
    await page.waitForTimeout(2000);
    log(
      'open now:',
      await page.getByTestId('scene-name').inputValue(),
      '| note:',
      await page
        .getByTestId('scene-note')
        .textContent()
        .catch(() => '(none)')
    );
    await shot(page, 'switchto');
  },

  /** The Queue page names the Scene page's jobs "Scene" (not "Day"). */
  async queue(_ctx, page) {
    await go(page, '/queue');
    await page.waitForTimeout(8000);
    const text = await page.locator('body').innerText();
    const lines = text
      .split('\n')
      .filter(line => /^(Scene|Day|Image → Prompt)\b/.test(line.trim()));
    log('queue labels:', [...new Set(lines.map(line => line.trim()))].slice(0, 12).join(' | '));
    if (!lines.some(line => line.trim().startsWith('Scene')))
      problems.push('queue: no job labelled Scene');
    if (lines.some(line => /^Day\b/.test(line.trim())))
      problems.push('queue: a job still labelled Day');
    await shot(page, 'queue');
  },

  /** New / rename / switch / delete, and each Cast's own list. */
  async scenes(_ctx, page) {
    await openScene(page, 'cast-mara');
    const names = async () =>
      (await page.locator('[data-testid^="scene-list-item-"]').allTextContents()).map(t =>
        t.trim()
      );
    // Start clean: delete what an earlier run left (Delete scene, confirmed).
    while ((await page.getByTestId('scene-delete').count()) > 0) {
      await page.getByTestId('scene-delete').click();
      await page.getByTestId('scene-delete-yes').click();
      await page.waitForTimeout(600);
    }
    log('emptied:', await page.getByTestId('scene-empty').count());
    await page.getByTestId('scene-new').click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 1');
    await page.getByTestId('scene-new').click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 2');
    await page.getByTestId('scene-name').fill('Rooftop');
    await page.getByTestId('scene-name').press('Enter');
    await page.waitForTimeout(500);
    // The next free number: "Scene 2" again (Rooftop was Scene 2).
    await page.getByTestId('scene-new').click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 2');
    log('list', await names());
    await shot(page, 'scenes-three');
    await page.getByTestId('scene-delete').click();
    await page.getByTestId('scene-delete-yes').click();
    await page.waitForTimeout(500);
    log('after delete', await names(), 'open:', await page.getByTestId('scene-name').inputValue());
    await page
      .locator('[data-testid^="scene-list-item-"]')
      .filter({ hasText: 'Scene 1' })
      .first()
      .click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 1');
    // Another Cast: their own list (empty), then back.
    await openScene(page, 'cast-lena');
    log('lena list', await names(), 'empty:', await page.getByTestId('scene-empty').count());
    while ((await page.getByTestId('scene-delete').count()) > 0) {
      await page.getByTestId('scene-delete').click();
      await page.getByTestId('scene-delete-yes').click();
      await page.waitForTimeout(600);
    }
    await page.getByTestId('scene-new').click();
    await expectValue(page.getByTestId('scene-name'), 'Scene 1');
    await page.getByTestId('scene-name').fill('Lena kitchen');
    await page.getByTestId('scene-name').press('Enter');
    await shot(page, 'scenes-lena');
    await openScene(page, 'cast-mara');
    log(
      'mara list again',
      await names(),
      'open:',
      await page.getByTestId('scene-name').inputValue()
    );
    await shot(page, 'scenes-mara-again');
  },

  /** M6 V2: a short three-scene script imported for the Cast, who's who confirmed. */
  async script(_ctx, page) {
    await openScene(page, V2_CAST);
    await page.getByTestId('scene-scripts').waitFor({ timeout: 60_000 });
    await page.getByTestId('script-import').click();
    await page.getByTestId('script-import-text').fill(V2_SCRIPT);
    await attempt(page, 'script reads as 3 scenes', async () => {
      const summary = (await page.getByTestId('script-summary').textContent())?.trim() ?? '';
      log('summary:', summary);
      if (!summary.startsWith('3 scenes')) throw new Error(summary);
    });
    await shot(page, 'script-read');
    await page.getByTestId('script-keep').click();
    await page.getByTestId('script-reading').waitFor({ timeout: 30_000 });
    await attempt(page, 'who is who: MARA is the Cast', async () => {
      const part = page.getByTestId('script-speaker-MARA');
      const confirm = page.getByTestId('script-speaker-confirm-MARA');
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      else await part.getByRole('combobox').selectOption(V2_CAST);
      await page.waitForTimeout(800);
      const status = await part.getAttribute('data-status');
      if (status !== 'confirmed') throw new Error(`status ${status}`);
    });
    for (const place of ['KITCHEN', 'OFFICE', 'ROOFTOP']) {
      const choice = await page
        .getByTestId(`script-place-${place}`)
        .getAttribute('data-choice')
        .catch(() => null);
      log('place', place, '→', choice);
    }
    await shot(page, 'script-kept');
  },

  /** M6 V2: draft every scene's shots; make the kitchen's line a Scene by hand. */
  async shots(_ctx, page) {
    await openScene(page, V2_CAST);
    const script = await v2Script(page);
    if (!script) throw new Error('no script — run the script phase first');
    await go(page, `/scene?character=${V2_CAST}&script=${script.id}`);
    await page.getByTestId('script-reading').waitFor({ timeout: 60_000 });
    for (const sceneId of V2_SCENES) {
      await attempt(page, `draft ${sceneId}`, async () => {
        const scene = page.getByTestId(`script-scene-${sceneId}`);
        if ((await scene.getAttribute('open')) === null) await scene.locator('summary').click();
        await page.getByTestId(`script-shots-draft-${sceneId}`).click();
        await page.locator(`[data-testid^="script-shot-${sceneId}~"]`).first().waitFor();
      });
    }
    const drafted = (await v2Script(page))?.shots ?? [];
    log('drafted', drafted.length, 'shots:', drafted.map(entry => entry.id).join(', '));
    await shot(page, 'shots-drafted');
    const line = drafted.find(
      entry => entry.sceneId === V2_SCENES[0] && entry.purpose === 'dialogue'
    );
    await attempt(page, 'make the kitchen line a Scene', async () => {
      if (!line) throw new Error('no dialogue shot drafted in the kitchen');
      await page.getByTestId(`script-shot-make-${line.id}`).click();
      await page.waitForTimeout(2000);
      const status = await page.getByTestId(`script-shot-${line.id}`).getAttribute('data-status');
      log('made:', await page.getByTestId('scene-name').inputValue(), 'shot status', status);
      if (status !== 'made') throw new Error(`status ${status}`);
    });
    await shot(page, 'shot-made');
  },

  /**
   * M6 V2: prepare a run over the script, start it, reload once a take has landed (the run
   * shows paused), resume, and wait for it to finish. No take is queued twice.
   */
  async run(_ctx, page) {
    await openScene(page, V2_CAST);
    const script = await v2Script(page);
    if (!script) throw new Error('no script — run the script phase first');
    await go(page, `/scene?character=${V2_CAST}&script=${script.id}`);
    await page.getByTestId('script-prepare-run').click({ timeout: 60_000 });
    log('prepare:', (await page.getByTestId('script-prepare-note').textContent())?.trim());
    const limit = process.env.SCENE_RUN_TAKES;
    if (limit) await page.getByTestId('scene-run-max-takes').fill(limit);
    log('plan:', (await page.getByTestId('scene-run-summary').textContent())?.trim());
    await shot(page, 'run-prepared');
    const started = Date.now();
    await page.getByTestId('scene-run-start').click();
    await attempt(page, 'first take lands, then reload mid-run', async () => {
      await waitForRun(
        page,
        run => Object.keys(run.outcomes ?? {}).length >= 1 && Boolean(run.current),
        30
      );
      await shot(page, 'run-midway');
      await page.reload({ waitUntil: 'domcontentloaded' });
      await dismiss(page);
      const state = page.getByTestId('scene-run-state');
      await state.waitFor({ timeout: 120_000 });
      await page.waitForTimeout(2000);
      log(
        'after reload:',
        await state.getAttribute('data-state'),
        '·',
        (
          await page
            .getByTestId('scene-run-stop-reason')
            .textContent()
            .catch(() => '')
        )?.trim()
      );
      if ((await state.getAttribute('data-state')) !== 'paused') throw new Error('not paused');
      await shot(page, 'run-paused');
      await page.getByTestId('scene-run-start').click();
    });
    const run = await waitForRun(
      page,
      entry => ['done', 'stopped', 'cancelled'].includes(entry.state ?? ''),
      60
    );
    const queued = (run.log ?? []).filter(entry => entry.event === 'queued');
    const ids = queued.map(entry => entry.promptId ?? entry.sceneId);
    log(
      'run',
      run.state,
      'in',
      Math.round((Date.now() - started) / 1000),
      's ·',
      queued.length,
      'queued'
    );
    for (const entry of run.log ?? [])
      log(
        '  log',
        new Date(entry.at).toISOString().slice(11, 19),
        entry.event,
        entry.sceneId ?? '',
        entry.note ?? ''
      );
    await attempt(page, 'run done', async () => {
      if (run.state !== 'done') throw new Error(`${run.state}: ${run.stopReason ?? ''}`);
    });
    await attempt(page, 'no take queued twice', async () => {
      const scenes = queued.map(entry => entry.sceneId);
      if (new Set(scenes).size !== scenes.length) throw new Error(ids.join(', '));
    });
    await attempt(page, 'nothing kept by the run', async () => {
      const kept = (await v2Scenes(page)).filter(scene => scene.keptTakeId);
      if (kept.length) throw new Error(kept.map(scene => scene.name).join(', '));
    });
    await shot(page, 'run-done');
    await go(page, '/production');
    await page
      .getByTestId('director-next')
      .waitFor({ timeout: 120_000 })
      .catch(() => undefined);
    await page.waitForTimeout(2000);
    await shot(page, 'director');
  },

  /** M6 V2: the human keeps one take per Scene (SCENE_KEEP=first: the first, for you). */
  async keep(_ctx, page) {
    await openScene(page, V2_CAST);
    const pending = async () =>
      (await v2Scenes(page)).filter(scene => scene.takes.length && !scene.keptTakeId);
    if (process.env.SCENE_KEEP === 'first') {
      for (const scene of await pending()) {
        await attempt(page, `keep ${scene.name}`, async () => {
          await go(page, `/scene?character=${V2_CAST}&scene=${scene.id}`);
          await expectValue(page.getByTestId('scene-name'), scene.name, 60_000);
          await page.getByTestId('scene-take-keep-0').click();
          await page.waitForTimeout(1000);
        });
      }
    } else {
      log('Keep one take in each of these Scenes (the script waits, up to 60 min):');
      for (const scene of await pending()) log('  ', scene.name);
      const until = Date.now() + 60 * 60_000;
      while ((await pending()).length && Date.now() < until) await page.waitForTimeout(10_000);
    }
    const left = await pending();
    await attempt(page, 'every rendered Scene has a kept take', async () => {
      if (left.length) throw new Error(left.map(scene => scene.name).join(', '));
    });
    await shot(page, 'kept');
  },

  /** M6 V2: Cut — review copy, Before cutting, cut, The film as cut, Measure loudness. */
  async cut2(_ctx, page) {
    await go(page, `/cut?from=scenes&character=${V2_CAST}`);
    const button = page.getByTestId('cut-film').first();
    await button.waitFor({ timeout: 180_000 });
    await page.waitForTimeout(4000);
    log('cut:', (await button.textContent())?.trim());
    await page.getByTestId('cut-profile-review').click();
    await page.waitForTimeout(1500);
    const checks = async (prefix: string) =>
      page
        .locator(`[data-testid^="${prefix}-"][data-status]`)
        .evaluateAll(list =>
          list.map(
            el =>
              `${(el as HTMLElement).dataset.testid?.split('-').pop()}=${(el as HTMLElement).dataset.status}: ${el.textContent?.trim()}`
          )
        );
    for (const line of await checks('cut-preflight')) log('  before:', line);
    await shot(page, 'cut-before');
    const started = Date.now();
    const filmsBefore = await page.getByTestId('cut-film-entry').count();
    await button.click();
    // The ask on a ✗ (M6 D1), then the shot checks: both go on, and are logged.
    for (let i = 0; i < 20; i += 1) {
      await page.waitForTimeout(1500);
      if (
        await page
          .getByTestId('cut-blocked-dialog')
          .isVisible()
          .catch(() => false)
      ) {
        log('asked:', (await page.getByTestId('cut-blocked-ask').textContent())?.trim());
        await page.getByTestId('confirm-dialog-confirm').click();
      }
      if (
        await page
          .getByTestId('cut-problems-cut-anyway')
          .isVisible()
          .catch(() => false)
      ) {
        log(
          'shot checks:',
          (await page.getByTestId('cut-problems').textContent())?.trim().slice(0, 300)
        );
        await page.getByTestId('cut-problems-cut-anyway').click();
      }
      if (
        await page
          .getByText('Cutting…')
          .first()
          .isVisible()
          .catch(() => false)
      )
        break;
    }
    await attempt(page, 'the film is cut', async () => {
      const until = Date.now() + 20 * 60_000;
      while (Date.now() < until) {
        if ((await page.getByTestId('cut-film-entry').count()) > filmsBefore) break;
        await page.waitForTimeout(3000);
      }
      if ((await page.getByTestId('cut-film-entry').count()) <= filmsBefore) {
        throw new Error((await page.getByTestId('cut-status').textContent())?.trim() ?? 'no film');
      }
      log('cut in', Math.round((Date.now() - started) / 1000), 's');
    });
    await page.waitForTimeout(3000);
    log(
      'status:',
      (
        await page
          .getByTestId('cut-status')
          .textContent()
          .catch(() => '')
      )?.trim()
    );
    await attempt(page, 'the film as cut is read back', async () => {
      const lines = await checks('cut-output');
      for (const line of lines) log('  output:', line);
      if (!lines.length) throw new Error('no output checks');
      if (lines.some(line => line.includes('=fail'))) throw new Error('an output check failed');
    });
    await shot(page, 'cut-done');
    await attempt(page, 'loudness measured', async () => {
      await page.getByTestId('film-loudness-measure').first().click();
      // A result — or, for a silent cut, the error saying there is no sound to measure.
      const said = page
        .locator('[data-testid="film-loudness-result"], [data-testid="film-loudness-error"]')
        .first();
      await said.waitFor({ timeout: 300_000 });
      const text = (await said.textContent())?.trim() ?? '';
      log('loudness:', text);
      const silent = (
        await page
          .getByTestId('cut-output-sound')
          .textContent()
          .catch(() => '')
      )?.includes('Silent');
      if (
        (await said.getAttribute('data-testid')) === 'film-loudness-error' &&
        !(silent && /no sound/i.test(text))
      ) {
        throw new Error(text);
      }
    });
    await shot(page, 'cut-loudness');
  },

  /**
   * M6 V2: pack the cut with its media, then import it in a fresh browser whose server sync is
   * cut off (a second machine's browser; the server and its Gallery are still this one).
   */
  async package(ctx, page) {
    await go(page, `/cut?from=scenes&character=${V2_CAST}`);
    await page.getByTestId('cut-package-full').waitFor({ timeout: 180_000 });
    await page.waitForTimeout(3000);
    const download = page.waitForEvent('download', { timeout: 300_000 });
    const started = Date.now();
    await page.getByTestId('cut-package-full').click();
    const zip = join(OUT, 'v2-package.castcut.zip');
    await (await download).saveAs(zip);
    log(
      'packed in',
      Math.round((Date.now() - started) / 1000),
      's ·',
      (await page.getByTestId('cut-status').textContent())?.trim()
    );
    const launched = ctx.browser() ? null : await chromium.launch();
    const browser = ctx.browser() ?? launched!;
    const other = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      baseURL: BASE,
    });
    await desk(other);
    try {
      const elsewhere = await other.newPage();
      await elsewhere.route(/\/api\/storage(?:\?.*)?$/, route =>
        route.request().method() === 'POST'
          ? route.fulfill({ json: { ok: true } })
          : route.fulfill({ json: { data: null } })
      );
      await importCast(
        elsewhere,
        readdirSync(CASTS).find(name => name.startsWith(V2_CAST.replace(/^cast-/, '')))!
      );
      await go(elsewhere, `/cut?from=scenes&character=${V2_CAST}`);
      await elsewhere
        .getByTestId('cut-package-import')
        .waitFor({ state: 'attached', timeout: 180_000 });
      await elsewhere.waitForTimeout(3000);
      await elsewhere.getByTestId('cut-package-import').setInputFiles(zip);
      await attempt(elsewhere, 'the package imports', async () => {
        const status = elsewhere.getByTestId('cut-status');
        await status.filter({ hasText: 'Imported' }).waitFor({ timeout: 300_000 });
        log('import:', (await status.textContent())?.trim());
      });
      await attempt(elsewhere, 'the imported cut plays with nothing missing', async () => {
        await elsewhere.locator('[data-testid^="cut-version-open-Imported"]').first().click();
        await elsewhere.waitForTimeout(4000);
        const blocking = await elsewhere
          .locator('[data-testid^="cut-missing-"][data-blocks="true"]')
          .count();
        log('blocking missing media:', blocking);
        if (blocking) throw new Error(`${blocking} shot(s) can't play`);
      });
      await shot(elsewhere, 'package-imported');
    } finally {
      await other.close();
      await launched?.close();
    }
  },

  /** Import the Cast files (the Cast page's Import), each with its plate. */
  async setup(_ctx, page) {
    const files = readdirSync(CASTS).filter(name => name.endsWith('.castcut.json'));
    for (const name of files) await importCast(page, name);
  },
};

/** The studio workspace, chosen (no first-visit chooser). */
async function desk(ctx: BrowserContext) {
  await ctx.addCookies([{ name: 'comfy-workspace-mode-v1', value: 'studio', url: BASE }]);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // private mode
    }
  });
}

/** Each phase's outcome, appended to SCENE_OUT/report.json. */
function record(entry: Record<string, unknown>) {
  const file = join(OUT, 'report.json');
  const all = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as unknown[]) : [];
  writeFileSync(file, `${JSON.stringify([...all, entry], null, 2)}\n`);
}

async function main() {
  const wanted = process.argv.slice(2);
  if (!wanted.length || wanted.some(name => !phases[name])) {
    console.error(`phases: ${Object.keys(phases).join(', ')}`);
    process.exit(2);
  }
  // Phases with their own browser (a fresh phone) do not need the desk profile.
  if (wanted.every(name => STANDALONE.has(name))) {
    for (const name of wanted) {
      log(`— ${name}`);
      runName = name;
      step = 0;
      await (phases[name] as () => Promise<void>)();
    }
    console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nno problems');
    return;
  }
  const ctx = await chromium.launchPersistentContext(join(OUT, 'profile'), {
    viewport: { width: 1440, height: 1000 },
    baseURL: BASE,
  });
  await desk(ctx);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  page.on('pageerror', error =>
    log('pageerror', error.message, (error.stack ?? '').split('\n').slice(0, 4).join(' | '))
  );
  page.on('console', message => {
    if (message.type() === 'error' && /hydrat/i.test(message.text())) {
      log('console error', message.text().slice(0, 300));
    }
  });
  page.on('response', response => {
    if (response.status() >= 400 && /_next|\/api\//.test(response.url()))
      log('http', response.status(), response.url().slice(0, 160));
  });
  try {
    for (const name of wanted) {
      log(`— ${name}`);
      runName = name;
      step = 0;
      const started = Date.now();
      const before = problems.length;
      let error: string | undefined;
      try {
        await phases[name]!(ctx, page);
      } catch (cause) {
        error = cause instanceof Error ? cause.message.split('\n')[0] : String(cause);
        problems.push(`${name}: ${error}`);
        log('✗ phase', name, error);
        await shot(page, `phase-failed`);
      }
      record({
        phase: name,
        startedAt: new Date(started).toISOString(),
        seconds: Math.round((Date.now() - started) / 1000),
        problems: problems.slice(before),
        ...(error ? { error } : {}),
      });
      if (error) break;
    }
  } finally {
    await ctx.close();
    console.log(problems.length ? `\nPROBLEMS:\n- ${problems.join('\n- ')}` : '\nno problems');
  }
}

void main();
