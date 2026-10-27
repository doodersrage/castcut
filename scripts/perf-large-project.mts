/**
 * Performance on a large project (M6 V7): load and edit timings for Scene, Cut and Film Director
 * on a production build, with the project from the storage budgets (one Cast at every record cap:
 * 60 Scenes of 24 takes, 12 feature-length scripts, a full run log, 12 Cut versions) plus 1,000
 * Gallery entries.
 *
 *   npm run build && npm run perf:test             # starts `next start` on an empty data folder
 *   PERF_BASE=http://127.0.0.1:47924 npm run perf:test   # or measure a server you started
 *   … -- --json <file>                             # the timings as JSON too
 *   … -- --cpu-slowdown 4                          # as on a slower machine (Chrome's throttling)
 *   … -- --profile                                 # each edit's hottest functions (build with
 *                                                    PERF_SOURCEMAPS=1 to see them by source)
 *
 * Load: navigation to the page being usable (its main control on screen with the project in it),
 * three times, median. Edits: the browser's own Event Timing (what INP reports) — input to the
 * next paint — for typing in a Scene's name, drafting a script scene's shots, and leaving out a
 * shot or changing its framing in Cut; long tasks in the second after each are counted too.
 * Targets: Cut usable under 3 s, an edit reflected under 200 ms. Exit code 1 when one is missed.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { SourceMap } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { largeProjectAtCaps } from '../src/lib/day/storage-budget';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};

const TARGETS = { loadMs: 3000, editMs: 200 } as const;
const CAST = 'cast-mara';
const THUMB = '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp';
const GALLERY_ENTRIES = 1000;

async function startServer(): Promise<{ base: string; stop: () => void }> {
  if (process.env.PERF_BASE) return { base: process.env.PERF_BASE, stop: () => undefined };
  if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error('No production build: run `npm run build` first.');
  }
  const dataDir = mkdtempSync(join(tmpdir(), 'castcut-perf-'));
  const port = 47925;
  const child: ChildProcess = spawn(
    'npx',
    ['next', 'start', '-H', '127.0.0.1', '-p', String(port)],
    {
      env: {
        ...process.env,
        PROMPT_DATA_DIR: dataDir,
        PROMPT_AUTH_ENABLED: 'false',
        PROMPT_BIND_HOST: '127.0.0.1',
      },
      stdio: 'ignore',
    }
  );
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i += 1) {
    const up = await fetch(`${base}/api/health`)
      .then(r => r.ok)
      .catch(() => false);
    if (up) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return {
    base,
    stop: () => {
      child.kill('SIGTERM');
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/** The large project, as the app stores it: settings, the Cast, scripts, and the Gallery. */
function projectRecords() {
  const { settings, scripts } = largeProjectAtCaps();
  const now = Date.now();
  // Every take a real picture the server serves; every Scene's newest take kept (Cut has 60).
  const scenes = settings.tools.scene.scenes.map(scene => ({
    ...scene,
    takes: scene.takes.map(take => ({ ...take, imageUrl: THUMB, rawUrl: THUMB })),
    keptTakeId: scene.takes.at(-1)?.id,
  }));
  const gallery = Array.from({ length: GALLERY_ENTRIES }, (_, i) => ({
    id: `perf-${i}`,
    promptId: `perf-prompt-${i}`,
    prompt: `Mara pours coffee by the window, still half asleep (${i}).`,
    status: 'completed',
    tool: 'day',
    model: 'qwen-image-2.1-edit-turbo-8',
    queuedAt: now - i * 60_000,
    completedAt: now - i * 60_000 + 20_000,
    images: [{ filename: `perf-${i}.png`, subfolder: '', type: 'output' }],
    imageUrl: THUMB,
    characterId: CAST,
    playChecks: { at: now, pose: 0.8, poseMiss: false, face: 0.8, faceMiss: false },
    workflowJson: JSON.stringify({ graph: 'x'.repeat(9000) }),
  }));
  return {
    kv: {
      'comfy-prompt-tool-settings-v1': {
        shared: { activeCharacterId: CAST },
        tools: {},
        updatedAt: now,
      },
      'comfy-prompt-tool-settings-tools-v1': {
        tools: {
          ...settings.tools,
          scene: { ...settings.tools.scene, scenes, activeSceneId: scenes[0]!.id },
        },
        updatedAt: now,
      },
      'comfy-prompt-characters-v1': {
        version: 1,
        characters: [{ id: CAST, name: 'Mara', version: 1, updatedAt: now }],
        removedIds: [],
      },
      'castcut-scene-scripts-v1': { version: 1, scripts, removedAt: {} },
    } as Record<string, unknown>,
    gallery,
    scriptId: scripts[0]!.id,
  };
}

async function seed(page: Page, base: string, records: ReturnType<typeof projectRecords>) {
  // A same-origin page that isn't the app, so nothing writes its own copy back meanwhile.
  await page.goto(`${base}/api/health`);
  await page.evaluate(
    ({ kv, gallery }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('comfy-prompt-studio-v1', 10);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('galleryEntries')) {
            const store = db.createObjectStore('galleryEntries', { keyPath: 'id' });
            // As the app's schema has it (e2e/helpers/idb.ts).
            for (const index of [
              'queuedAt',
              'status',
              'favorite',
              'tool',
              'projectId',
              'completedAt',
              'reviewRating',
            ]) {
              store.createIndex(index, index);
            }
          }
        };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['kv', 'galleryEntries'], 'readwrite');
          for (const [key, value] of Object.entries(kv)) tx.objectStore('kv').put({ key, value });
          for (const entry of gallery) tx.objectStore('galleryEntries').put(entry);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { kv: records.kv, gallery: records.gallery }
  );
}

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

async function timeLoad(
  page: Page,
  base: string,
  path: string,
  ready: (page: Page) => Promise<unknown>
) {
  const runs: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    const started = Date.now();
    await page.goto(`${base}${path}`, { waitUntil: 'commit' });
    await ready(page);
    runs.push(Date.now() - started);
  }
  return runs;
}

/** Input-to-next-paint of what `act` does (Event Timing), and long tasks in the second after. */
const PROFILE = args.includes('--profile');

type CpuProfile = {
  nodes: Array<{
    id: number;
    callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number };
  }>;
  samples: number[];
  timeDeltas: number[];
};

const sourceMaps = new Map<string, SourceMap | null>();

/** A script position in the build, as its source file and line (needs PERF_SOURCEMAPS=1). */
async function sourceOf(url: string, line: number, column: number): Promise<string | null> {
  if (!url.includes('/_next/static/')) return null;
  if (!sourceMaps.has(url)) {
    // The chunk names its map (Turbopack: by the map's own hash, not `<chunk>.map`).
    const code = await fetch(url)
      .then(response => (response.ok ? response.text() : ''))
      .catch(() => '');
    const link = /sourceMappingURL=(\S+)\s*$/.exec(code)?.[1];
    const map = link
      ? await fetch(new URL(link, url))
          .then(response => (response.ok ? response.json() : null))
          .catch(() => null)
      : null;
    sourceMaps.set(url, map ? new SourceMap(map) : null);
  }
  const entry = sourceMaps.get(url)?.findEntry(line, column) as
    { originalSource?: string; originalLine?: number } | undefined;
  if (!entry?.originalSource) return null;
  const file = entry.originalSource.replace(/^.*?\/(src|node_modules)\//, '$1/');
  return `${file}:${(entry.originalLine ?? 0) + 1}`;
}

/** The functions the CPU spent most time in (self time), by source where the build has maps. */
async function topFunctions(profile: CpuProfile, top = 12): Promise<string[]> {
  const self = new Map<number, number>();
  profile.samples.forEach((id, i) =>
    self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0))
  );
  const byFunction = new Map<string, number>();
  for (const node of profile.nodes) {
    const micros = self.get(node.id) ?? 0;
    const frame = node.callFrame;
    if (!micros || !frame.url) continue;
    const where =
      (await sourceOf(frame.url, frame.lineNumber, frame.columnNumber)) ??
      `${frame.url.split('/').pop()}:${frame.lineNumber}`;
    const key = `${frame.functionName || '(anonymous)'} — ${where}`;
    byFunction.set(key, (byFunction.get(key) ?? 0) + micros);
  }
  return [...byFunction]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([key, micros]) => `${(micros / 1000).toFixed(1).padStart(7)} ms  ${key}`);
}

async function timeEdit(page: Page, label: string, act: () => Promise<unknown>) {
  const cdp = PROFILE ? await page.context().newCDPSession(page) : null;
  if (cdp) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');
  }
  await page.evaluate(() => {
    type Timed = { name: string; duration: number; delay: number; processing: number };
    const w = window as unknown as { __perf?: { events: Timed[]; longTasks: number[] } };
    w.__perf = { events: [], longTasks: [] };
    new PerformanceObserver(list => {
      for (const entry of list.getEntries() as PerformanceEventTiming[]) {
        if (
          [
            'keydown',
            'keyup',
            'keypress',
            'input',
            'click',
            'pointerdown',
            'pointerup',
            'change',
          ].includes(entry.name)
        ) {
          w.__perf!.events.push({
            name: entry.name,
            duration: entry.duration,
            delay: entry.processingStart - entry.startTime,
            processing: entry.processingEnd - entry.processingStart,
          });
        }
      }
    }).observe({ type: 'event', durationThreshold: 16 } as PerformanceObserverInit);
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) w.__perf!.longTasks.push(entry.duration);
    }).observe({ type: 'longtask' });
  });
  await act();
  await page.waitForTimeout(1500);
  if (cdp) {
    const { profile } = (await cdp.send('Profiler.stop')) as { profile: CpuProfile };
    console.log(`  ${label} — hottest functions (self time):`);
    for (const line of await topFunctions(profile)) console.log(`    ${line}`);
    await cdp.detach();
  }
  return page.evaluate(() => {
    type Timed = { name: string; duration: number; delay: number; processing: number };
    const perf = (window as unknown as { __perf: { events: Timed[]; longTasks: number[] } }).__perf;
    const worst = perf.events.reduce<Timed | null>(
      (top, entry) => (!top || entry.duration > top.duration ? entry : top),
      null
    );
    return {
      worstInteractionMs: Math.round(worst?.duration ?? 0),
      interactions: perf.events.length,
      longTaskMs: Math.round(perf.longTasks.reduce((sum, ms) => sum + ms, 0)),
      // Where the worst one's time went: waiting to start, its handlers, then until painted.
      worst: worst
        ? `${worst.name}: delay ${Math.round(worst.delay)} · handlers ${Math.round(worst.processing)} · to paint ${Math.round(worst.duration - worst.delay - worst.processing)} ms`
        : '',
    };
  });
}

function detailOf(timed: { interactions: number; longTaskMs: number; worst: string }) {
  return `${timed.interactions} inputs over 16 ms · long tasks ${timed.longTaskMs} ms · worst ${timed.worst || '—'}`;
}

const SLOWDOWN = Number(flag('--cpu-slowdown') ?? 1);

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: 'comfy-workspace-mode-v1', value: 'studio', url: server.base },
  ]);
  await context.addInitScript(() => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'studio');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
    } catch {
      // private mode
    }
  });
  const page = await context.newPage();
  if (SLOWDOWN > 1) {
    // A slower machine: Chrome's CPU throttling (DevTools' "4× slowdown" is a mid laptop).
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: SLOWDOWN });
  }
  const records = projectRecords();
  const results: Array<{ what: string; ms: number; target: number; detail: string }> = [];
  try {
    await seed(page, server.base, records);

    const scene = await timeLoad(page, server.base, `/scene?character=${CAST}`, p =>
      p.getByTestId(`script-open-${records.scriptId}`).waitFor({ timeout: 60_000 })
    );
    results.push({
      what: 'Scene: usable (its scripts listed)',
      ms: median(scene),
      target: TARGETS.loadMs,
      detail: scene.join(' / '),
    });

    const cut = await timeLoad(page, server.base, '/cut?from=scenes', async p => {
      await p.getByTestId('cut-film').first().waitFor({ timeout: 60_000 });
      await p.waitForFunction(
        () =>
          /60 shots/.test(document.querySelector('[data-testid="cut-film"]')?.textContent ?? ''),
        undefined,
        { timeout: 60_000 }
      );
    });
    results.push({
      what: 'Cut: usable (60 shots listed)',
      ms: median(cut),
      target: TARGETS.loadMs,
      detail: cut.join(' / '),
    });

    const director = await timeLoad(page, server.base, '/production', p =>
      p.getByTestId('director-scenes').waitFor({ timeout: 60_000 })
    );
    results.push({
      what: 'Film Director: usable',
      ms: median(director),
      target: TARGETS.loadMs,
      detail: director.join(' / '),
    });

    // Edits on the Scene page.
    await page.goto(`${server.base}/scene?character=${CAST}`);
    const name = page.getByTestId('scene-name');
    await name.waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    const typed = await timeEdit(page, 'typing in a Scene name', async () => {
      await name.click();
      await name.pressSequentially(' x', { delay: 120 });
    });
    results.push({
      what: 'Scene: typing in its name',
      ms: typed.worstInteractionMs,
      target: TARGETS.editMs,
      detail: detailOf(typed),
    });

    // A script renamed: the script store's save (one 146 KB script record).
    await page.getByTestId(`script-open-${records.scriptId}`).click();
    const scriptName = page.getByTestId('script-name');
    await scriptName.waitFor({ timeout: 30_000 });
    const renamed = await timeEdit(page, 'renaming a script', async () => {
      await scriptName.click();
      await scriptName.pressSequentially(' 2', { delay: 120 });
      await scriptName.press('Tab');
    });
    results.push({
      what: 'Scene: renaming a script (saved on leaving the field)',
      ms: renamed.worstInteractionMs,
      target: TARGETS.editMs,
      detail: detailOf(renamed),
    });

    // Edits in Cut.
    await page.goto(`${server.base}/cut?from=scenes`);
    await page.getByTestId('cut-film').first().waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2000);
    const key = 'scenes:scene-1';
    const left = await timeEdit(page, 'leaving a shot out in Cut', () =>
      page.getByTestId(`cut-shot-include-${key}`).uncheck()
    );
    results.push({
      what: 'Cut: leaving a shot out',
      ms: left.worstInteractionMs,
      target: TARGETS.editMs,
      detail: detailOf(left),
    });
    const framed = await timeEdit(page, 'framing a shot in Cut', () =>
      (async () => {
        // A real key press (a programmatic select is not timed by the browser).
        const framing = page.getByTestId('cut-shot-framing-scenes:scene-2');
        await framing.focus();
        await page.keyboard.press('ArrowDown');
      })()
    );
    results.push({
      what: 'Cut: changing a shot’s framing',
      ms: framed.worstInteractionMs,
      target: TARGETS.editMs,
      detail: detailOf(framed),
    });
  } finally {
    await browser.close();
    server.stop();
  }

  const width = Math.max(...results.map(row => row.what.length));
  let missed = 0;
  console.log(`CPU slowdown ${SLOWDOWN}×`);
  for (const row of results) {
    const timed = !/^0 inputs/.test(row.detail) || row.what.includes('usable');
    const ok = timed && row.ms <= row.target;
    if (!ok) missed += 1;
    console.log(
      `${row.what.padEnd(width)}  ${String(row.ms).padStart(6)} ms  ${!timed ? 'NOT TIMED' : ok ? '≤' : 'OVER'} ${row.target} ms  (${row.detail})`
    );
  }
  const out = flag('--json');
  if (out) writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
  process.exit(missed ? 1 : 0);
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
