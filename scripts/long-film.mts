/**
 * A long film end to end (M6 V8): a Cut of many clips with sound — by default 60 clips of 10 s,
 * a 10-minute film — cut on the server, its loudness measured, packed with all its media, and the
 * package imported in a fresh browser. Each step is timed; the server's memory (RSS) and the
 * page's JS heap are sampled through it.
 *
 *   npm run build && npx tsx scripts/long-film.mts            # starts `next start` itself
 *   npx tsx scripts/long-film.mts --clips 60 --seconds 10 --json <file>
 *
 * The clips are made with ffmpeg's test sources (a moving pattern and a tone each, all
 * different), uploaded to an empty data folder as Gallery originals, and added to Cut as shots.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const CLIPS = Number(flag('--clips') ?? 60);
const SECONDS = Number(flag('--seconds') ?? 10);
const work = mkdtempSync(join(tmpdir(), 'castcut-long-film-'));
const results: Array<{ step: string; seconds: number; detail: string; ok: boolean }> = [];
const log = (...parts: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...parts);

function makeClips(): string[] {
  const dir = join(work, 'clips');
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (let i = 0; i < CLIPS; i += 1) {
    const file = join(dir, `clip-${String(i).padStart(3, '0')}.mp4`);
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=1280x720:rate=30:duration=${SECONDS}`,
      '-f',
      'lavfi',
      '-i',
      `sine=frequency=${220 + i * 7}:sample_rate=48000:duration=${SECONDS}`,
      '-vf',
      `hue=h=${(i * 37) % 360}`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '23',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      file,
    ]);
    files.push(file);
  }
  return files;
}

/** PROMPT_API_TOKEN, from the environment or .env.local. */
function apiToken() {
  if (process.env.PROMPT_API_TOKEN) return process.env.PROMPT_API_TOKEN;
  const file = join(process.cwd(), '.env.local');
  if (!existsSync(file)) return '';
  return (
    readFileSync(file, 'utf8')
      .match(/^PROMPT_API_TOKEN=(.*)$/m)?.[1]
      ?.trim() ?? ''
  );
}

async function startServer() {
  if (!existsSync(join(process.cwd(), '.next', 'BUILD_ID'))) {
    throw new Error('No production build: run `npm run build` first.');
  }
  if (
    await fetch('http://127.0.0.1:47926/api/health')
      .then(() => true)
      .catch(() => false)
  ) {
    throw new Error('Port 47926 is in use (a server left from an earlier run?): stop it first.');
  }
  const dataDir = join(work, 'data');
  mkdirSync(dataDir, { recursive: true });
  const port = 47926;
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
      detached: true,
    }
  );
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i += 1) {
    if (
      await fetch(`${base}/api/health`)
        .then(r => r.ok)
        .catch(() => false)
    )
      break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { base, child, dataDir };
}

/**
 * The largest resident memory (MB) of the server and everything it runs (ffmpeg included),
 * sampled each second: the processes in its process group (it is started detached, as a group).
 */
function rssSampler(rootPid: number) {
  let peak = 0;
  const sample = () => {
    try {
      const rows = execFileSync('ps', ['-eo', 'pgid=,rss=']).toString().trim().split('\n');
      const total = rows
        .map(row => row.trim().split(/\s+/).map(Number))
        .filter(([pgid]) => pgid === rootPid)
        .reduce((sum, [, rss]) => sum + (rss ?? 0), 0);
      peak = Math.max(peak, Math.round(total / 1024));
    } catch {
      // the server is gone
    }
  };
  const timer = setInterval(sample, 1000);
  sample();
  return { stop: () => (clearInterval(timer), peak) };
}

async function heapMB(page: Page) {
  return page
    .evaluate(() =>
      Math.round(
        ((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
          ?.usedJSHeapSize ?? 0) / 1048576
      )
    )
    .catch(() => 0);
}

async function timed(step: string, run: () => Promise<string>, rootPid: number, page?: Page) {
  const rss = rssSampler(rootPid);
  let heapPeak = page ? await heapMB(page) : 0;
  const heapTimer = page
    ? setInterval(() => void heapMB(page).then(mb => (heapPeak = Math.max(heapPeak, mb))), 1000)
    : null;
  const started = Date.now();
  let detail = '';
  let ok = true;
  try {
    detail = await run();
  } catch (error) {
    ok = false;
    detail = error instanceof Error ? error.message.split('\n')[0]! : String(error);
    if (page) {
      const shotPath = join(process.cwd(), `long-film-${step.split(' ')[0]}-failed.png`);
      await page.screenshot({ path: shotPath, fullPage: true }).catch(() => undefined);
      detail += ` (screenshot: ${shotPath})`;
    }
  }
  if (heapTimer) clearInterval(heapTimer);
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  const memory = `server RSS peak ${rss.stop()} MB${page ? ` · page heap peak ${heapPeak} MB` : ''}`;
  results.push({ step, seconds, detail: `${detail} · ${memory}`, ok });
  log(ok ? '✓' : '✗', step, `${seconds} s`, detail, '·', memory);
  return ok;
}

async function seed(page: Page, base: string, extras: unknown[]) {
  await page.goto(`${base}/api/health`);
  const now = Date.now();
  await page.evaluate(
    kv =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('comfy-prompt-studio-v1', 10);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv', { keyPath: 'key' });
          if (!db.objectStoreNames.contains('galleryEntries')) {
            const store = db.createObjectStore('galleryEntries', { keyPath: 'id' });
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
          const tx = db.transaction('kv', 'readwrite');
          for (const [key, value] of Object.entries(kv)) tx.objectStore('kv').put({ key, value });
          tx.oncomplete = () => (db.close(), resolve());
          tx.onerror = () => reject(tx.error);
        };
      }),
    {
      // A Cast lead to keep the film on (Cut keeps it on the active Cast's films).
      'comfy-prompt-tool-settings-v1': {
        shared: { activeCharacterId: 'cast-long' },
        tools: {},
        updatedAt: now,
      },
      'comfy-prompt-characters-v1': {
        version: 1,
        characters: [{ id: 'cast-long', name: 'Long', version: 1, updatedAt: now }],
        removedIds: [],
      },
      // Only the added clips (no Day, Story or Scene source), the review profile.
      'comfy-prompt-tool-settings-tools-v1': {
        tools: { cut: { sources: [], extras } },
        updatedAt: now,
      },
    } as Record<string, unknown>
  );
}

async function main() {
  log(`making ${CLIPS} clips of ${SECONDS} s`);
  const clips = makeClips();
  const clipBytes = clips.reduce((sum, file) => sum + statSync(file).size, 0);
  log(`clips: ${(clipBytes / 1048576).toFixed(1)} MB`);
  const server = await startServer();
  const rootPid = server.child.pid!;
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
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
  try {
    // Upload the clips as Gallery originals: the URLs Cut plays.
    const extras: unknown[] = [];
    await timed(
      'upload clips',
      async () => {
        for (const [i, file] of clips.entries()) {
          const form = new FormData();
          form.set('kind', 'original');
          form.set('galleryEntryId', `long-${i}`);
          form.set('filename', `clip-${i}.mp4`);
          form.set('file', new Blob([readFileSync(file)], { type: 'video/mp4' }), `clip-${i}.mp4`);
          const response = await fetch(`${server.base}/api/gallery/media/persist`, {
            method: 'POST',
            body: form,
            // Not a browser on the page: the API token, as any script or tool sends it.
            headers: { 'x-prompt-api-token': apiToken() },
          });
          if (!response.ok)
            throw new Error(`upload ${i}: HTTP ${response.status} ${await response.text()}`);
          const { url } = (await response.json()) as { url: string };
          extras.push({
            key: `added:long-${i}`,
            kind: 'media',
            title: `Clip ${i + 1}`,
            url,
            shotKind: 'clip',
            entryId: `long-${i}`,
          });
        }
        return `${clips.length} clips`;
      },
      rootPid
    );
    await seed(page, server.base, extras);

    await page.goto(`${server.base}/cut`);
    const film = page.getByTestId('cut-film').first();
    await film.waitFor({ timeout: 180_000 });
    await page.waitForFunction(
      count =>
        new RegExp(`${count} shots`).test(
          document.querySelector('[data-testid="cut-film"]')?.textContent ?? ''
        ),
      CLIPS,
      { timeout: 180_000 }
    );
    await page.getByTestId('cut-profile-review').click();
    await page.waitForTimeout(1500);

    const cut = await timed(
      'cut the film (server encode)',
      async () => {
        const before = await page.getByTestId('cut-film-entry').count();
        await film.click({ timeout: 60_000 });
        // Ten times the film's length, at least five minutes.
        const until = Date.now() + Math.max(5 * 60_000, CLIPS * SECONDS * 10_000);
        let said = '';
        let quiet = 0;
        while (Date.now() < until) {
          await page.waitForTimeout(2000);
          quiet += 2000;
          // The status line appears only once there is something to say: don't wait for it.
          const status =
            (await page
              .getByTestId('cut-status')
              .first()
              .textContent({ timeout: 1000 })
              .catch(() => '')) ?? '';
          if (status.trim() !== said || quiet >= 30_000) {
            said = status.trim();
            quiet = 0;
            log('  cut status:', said.slice(0, 200) || '(none)');
          }
          if (
            await page
              .getByTestId('cut-blocked-dialog')
              .isVisible()
              .catch(() => false)
          ) {
            await page.getByTestId('confirm-dialog-confirm').click();
          }
          if (
            await page
              .getByTestId('cut-problems-cut-anyway')
              .isVisible()
              .catch(() => false)
          ) {
            await page.getByTestId('cut-problems-cut-anyway').click();
          }
          if ((await page.getByTestId('cut-film-entry').count()) > before) break;
        }
        if ((await page.getByTestId('cut-film-entry').count()) <= before) {
          throw new Error(`no film: ${said || '(no status)'}`);
        }
        await page.waitForTimeout(3000);
        const output = await page
          .locator('[data-testid^="cut-output-"][data-status]')
          .evaluateAll(list =>
            list.map(
              el => `${el.getAttribute('data-testid')!.slice(11)}=${el.getAttribute('data-status')}`
            )
          );
        return output.join(' ');
      },
      rootPid,
      page
    );

    if (cut) {
      await timed(
        'measure loudness',
        async () => {
          await page.getByTestId('film-loudness-measure').first().click();
          const said = page
            .locator('[data-testid="film-loudness-result"], [data-testid="film-loudness-error"]')
            .first();
          await said.waitFor({ timeout: 600_000 });
          const text = (await said.textContent())?.trim() ?? '';
          if ((await said.getAttribute('data-testid')) === 'film-loudness-error')
            throw new Error(text);
          return text;
        },
        rootPid,
        page
      );
    }

    const zip = join(work, 'long-film-package.zip');
    const packed = await timed(
      'pack the cut with its media',
      async () => {
        const download = page.waitForEvent('download', { timeout: 30 * 60_000 });
        await page.getByTestId('cut-package-full').click();
        await (await download).saveAs(zip);
        return `${(statSync(zip).size / 1048576).toFixed(1)} MB · ${(await page.getByTestId('cut-status').textContent())?.trim()}`;
      },
      rootPid,
      page
    );

    if (packed) {
      const elsewhere = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      await elsewhere.addCookies([
        { name: 'comfy-workspace-mode-v1', value: 'studio', url: server.base },
      ]);
      const other = await elsewhere.newPage();
      await timed(
        'import the package in a fresh browser',
        async () => {
          await other.goto(`${server.base}/cut`);
          await other
            .getByTestId('cut-package-import')
            .waitFor({ state: 'attached', timeout: 180_000 });
          await other.waitForTimeout(3000);
          await other.getByTestId('cut-package-import').setInputFiles(zip);
          const status = other.getByTestId('cut-status');
          await status.filter({ hasText: 'Imported' }).waitFor({ timeout: 30 * 60_000 });
          return (await status.textContent())?.trim() ?? '';
        },
        rootPid,
        other
      );
      await elsewhere.close();
    }
  } finally {
    await browser.close();
    try {
      process.kill(-rootPid, 'SIGTERM');
    } catch {
      server.child.kill('SIGTERM');
    }
  }
  const out = flag('--json');
  if (out)
    writeFileSync(
      out,
      `${JSON.stringify({ clips: CLIPS, seconds: SECONDS, clipBytes, results }, null, 2)}\n`
    );
  rmSync(work, { recursive: true, force: true });
  process.exit(results.every(row => row.ok) ? 0 : 1);
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  rmSync(work, { recursive: true, force: true });
  process.exit(2);
});
