/**
 * Pose bench, step 1: drive the real Day page and capture the graphs it queues.
 *
 * Seeds a demo Cast whose Day plate is the dressed plate `day-dress-plate-252d755af9eb93c0.png`
 * (already in ComfyUI's input; seeded as her Cast plate plus a stored Day dress plate for the
 * outfit Day is dressed in, so Day starts every still from it and never renders a plate), a Day
 * of up to 8 slots — one per target — with every Quality check off, then clicks Queue day. The
 * app server must point COMFYUI_API_URL at the capture proxy (proxy.mjs): the still graphs are
 * written to disk, never queued. Utility graphs (DWPose for "From a photo") run for real.
 *
 * Modes:
 *   joints — each slot's custom pose is the reference skeleton, stored as the joint editor
 *            stores a pose ({ aspect, people, source: 'edited' }).
 *   photo  — each slot's pose is read through the slot sheet's "From a photo" button: the
 *            original photo is uploaded, /api/pose-detect runs DWPose + the vision posture
 *            read, and the PhotoPose the app stores is recorded.
 *
 *   node --import tsx scripts/pose-bench/capture.mts --engine <model> --mode joints|photo \
 *     --ids a,b,c --out <dir> --capture <proxy capture dir> [--photos <dir>] [--base URL]
 *
 * Writes <out>/capture.json: per slot the target id, the stored pose, the captured graph and
 * the Day state (still prompt id, notes).
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { putAppKv, seedSettingsCacheOnNextLoad } from '../../e2e/helpers/idb';
import { isolateServerStorage } from '../../e2e/helpers/storage';
import { dayDressPlateRequestKey } from '../../src/lib/day/dress-plate';
import { normalizeFootwear } from '../../src/lib/wardrobe/footwear';

const arg = (flag: string, fallback?: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1]! : fallback;
};
const engine = arg('--engine')!;
const mode = arg('--mode', 'joints') as 'joints' | 'photo';
const ids = arg('--ids')!.split(',').filter(Boolean);
const outDir = arg('--out')!;
const captureDir = arg('--capture')!;
const photosDir = arg('--photos');
const baseURL = arg('--base', 'http://127.0.0.1:47963')!;
/** "Pick the best engine per pose" on (BENCH_BEST_ENGINE=1); off by default, as before. */
const BEST_ENGINE = process.env.BENCH_BEST_ENGINE === '1';
const BENCH_ENGINES = [
  'qwen-image-2.1-edit-turbo-8',
  'qwen-image-edit-2511-lightning-8',
  'qwen-image-2.1-edit-noct',
];
if (!engine || !ids.length || !outDir || !captureDir) {
  console.error(
    'usage: capture.mts --engine M --mode joints|photo --ids a,b --out DIR --capture DIR'
  );
  process.exit(1);
}
if (ids.length > 8) throw new Error('A Day holds at most 8 slots — split the ids.');
mkdirSync(outDir, { recursive: true });
mkdirSync(captureDir, { recursive: true });

export const PLATE = 'day-dress-plate-252d755af9eb93c0.png';
const PLATE_URL = `/api/comfyui/view?filename=${PLATE}&subfolder=&type=input`;
const GARMENT_DESCRIPTION = 'a pink strapless mini dress with a gathered skirt';
const FOOTWEAR = 'hot pink pointed-toe pumps';
/**
 * Neutral beats with no posture words, so the custom pose is the only pose the still gets — one
 * per slot (identical beats are rewritten by Day's scene diversifier). The place has ground,
 * grass and benches, so standing, sitting, kneeling and lying all have somewhere to happen.
 */
const BEATS = [
  'takes a quiet moment for herself',
  'enjoys the afternoon sun',
  'pauses between errands',
  'spends a few minutes outdoors',
  'takes a break in the fresh air',
  'lets the day slow down',
  'catches her breath in the sun',
  'unwinds for a moment',
];
const PLACE = 'a sunny city park lawn beside a wide paved plaza';
const SLOT_IDS: Record<number, string[]> = {
  2: ['morning', 'night'],
  3: ['morning', 'afternoon', 'night'],
  4: ['morning', 'afternoon', 'evening', 'night'],
  6: ['morning', 'morning-2', 'afternoon', 'evening', 'night', 'night-2'],
  8: [
    'morning',
    'morning-2',
    'afternoon',
    'afternoon-2',
    'evening',
    'evening-2',
    'night',
    'night-2',
  ],
};
const length = [2, 3, 4, 6, 8].find(n => n >= ids.length)!;
const slotIds = SLOT_IDS[length]!;

type Body = Array<{ x: number; y: number } | null>;
type Ref = { id: string; aspect: number; people: Body[] };
const refs = new Map(
  (
    JSON.parse(readFileSync('public/pose-references.json', 'utf8')) as { references: Ref[] }
  ).references.map(ref => [ref.id, ref])
);

const NORA = 'bench-nora';
const now = Date.now();
const castPlate = { filename: PLATE, imageUrl: PLATE_URL };
const characters = {
  version: 1,
  characters: [
    {
      id: NORA,
      name: 'Nora',
      version: 1,
      updatedAt: now,
      descriptor:
        'a White woman in her twenties, slender, with long auburn hair in a high ponytail',
      traits: {
        sex: 'woman',
        ethnicity: 'white',
        ageBand: '20s',
        bodyBuild: 'slender',
        hairColor: 'auburn',
        hairLength: 'long',
        hairStyle: 'ponytail',
      },
      reference: {
        originalUrl: PLATE_URL,
        isolatedUrl: PLATE_URL,
        isolatedFilename: PLATE,
        isolated: true,
      },
    },
  ],
  removedIds: [],
};

const slots = ids.map((id, index) => {
  const slot: Record<string, unknown> = {
    id: slotIds[index],
    label: `bench ${id}`,
    location: PLACE,
    sceneHints: BEATS[index],
    sceneHintsTyped: BEATS[index],
  };
  if (mode === 'joints') {
    const ref = refs.get(id);
    if (!ref) throw new Error(`no reference ${id}`);
    slot.posePhoto = { aspect: ref.aspect, people: ref.people, source: 'edited' };
  }
  return slot;
});
// Unused slots of the Day length: a plain standing beat, never queued for scoring.
for (let index = ids.length; index < slotIds.length; index += 1) {
  slots.push({
    id: slotIds[index],
    label: 'unused',
    location: PLACE,
    sceneHints: BEATS[index],
    sceneHintsTyped: BEATS[index],
  });
}

const dayTool = {
  stillsCharacterId: NORA,
  slots,
  stills: [],
  dayLength: length,
  dayMood: 'everyday',
  intimateMix: 'solo',
  allowCompanions: false,
  // Quality off: no face finish / redo / review / best-of-two; engine hand-off off unless
  // BENCH_BEST_ENGINE=1 ("Pick the best engine per pose": Edit 2511's off-plate custom poses go
  // to Noct-Q / Turbo, customPoseOffPlate; the pose report card may swap an engine too).
  identityBoost: false,
  faceFinish: false,
  autoReviewStills: false,
  redoPoseMisses: false,
  bestOfTwoHardPoses: false,
  bestEnginePerPose: BEST_ENGINE,
  // Dressed in the plate's own dress (stored below as this outfit's Day dress plate).
  customGarmentImageFilename: PLATE,
  customGarmentImageUrl: PLATE_URL,
  customGarmentDescription: GARMENT_DESCRIPTION,
  footwear: FOOTWEAR,
};
const dressKey = dayDressPlateRequestKey({
  model: engine,
  plate: castPlate,
  clothing: { imageUrl: PLATE_URL, imageFilename: PLATE },
  clothingLabel: GARMENT_DESCRIPTION,
  clothingDescription: GARMENT_DESCRIPTION,
  footwear: normalizeFootwear(FOOTWEAR),
  footwearImage: { imageUrl: undefined, imageFilename: undefined },
});
// With the hand-off on, a still can render on another engine: the same dressed plate is stored
// under every bench engine's key, so none renders a plate of its own.
const plateEngines = BEST_ENGINE ? [...new Set([engine, ...BENCH_ENGINES])] : [engine];
const dressPlates = plateEngines.map(model => ({
  key: dayDressPlateRequestKey({
    model,
    plate: castPlate,
    clothing: { imageUrl: PLATE_URL, imageFilename: PLATE },
    clothingLabel: GARMENT_DESCRIPTION,
    clothingDescription: GARMENT_DESCRIPTION,
    footwear: normalizeFootwear(FOOTWEAR),
    footwearImage: { imageUrl: undefined, imageFilename: undefined },
  }),
  filename: PLATE,
  imageUrl: PLATE_URL,
  at: now,
  shoesChecked: 99,
  engine: 'qwen-image-edit-2511-lightning-8',
  updatedAt: now,
}));

function capturedFiles(): string[] {
  return readdirSync(captureDir)
    .filter(name => name.endsWith('.json'))
    .sort();
}
// Leftovers from an earlier run are moved aside.
for (const name of capturedFiles()) {
  mkdirSync(join(captureDir, 'stale'), { recursive: true });
  renameSync(join(captureDir, name), join(captureDir, 'stale', name));
}

/** Day's tool settings as the app stored them (IndexedDB kv, else the localStorage mirror). */
async function readDayState(page: Page): Promise<Record<string, unknown> | null> {
  // A dev-server Fast Refresh reload can land mid-read: wait and read again.
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await readDayStateOnce(page);
    } catch (error) {
      if (attempt >= 5 || !/context was destroyed|navigation/i.test(String(error))) throw error;
      await page.waitForTimeout(3000);
      await page.getByTestId('day-queue-all').first().waitFor({ timeout: 180_000 });
    }
  }
}
async function readDayStateOnce(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate(async () => {
    const key = 'comfy-prompt-tool-settings-tools-v1';
    const fromIdb = await new Promise<unknown>(resolve => {
      const request = indexedDB.open('comfy-prompt-studio-v1');
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('kv')) {
          db.close();
          resolve(null);
          return;
        }
        const get = db.transaction('kv', 'readonly').objectStore('kv').get(key);
        get.onsuccess = () => {
          db.close();
          resolve((get.result as { value?: unknown } | undefined)?.value ?? null);
        };
        get.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    });
    const raw = localStorage.getItem(key);
    const record = (fromIdb ?? (raw ? JSON.parse(raw) : null)) as {
      tools?: { day?: Record<string, unknown> };
    } | null;
    return record?.tools?.day ?? null;
  });
}

const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1000 } });
await context.addCookies([{ name: 'comfy-workspace-mode-v1', value: 'play', url: baseURL }]);
await context.addInitScript(
  ({ entries }) => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      localStorage.setItem(
        'comfy-play-metrics-v1',
        JSON.stringify({ version: 1, firstFilmCutAt: Date.now() })
      );
      localStorage.setItem('dress-plates', JSON.stringify(entries));
    } catch {
      /* storage unavailable */
    }
  },
  { entries: dressPlates }
);
const page = await context.newPage();
const notes: string[] = [];
page.on('console', message => {
  const text = message.text();
  if (process.env.BENCH_DEBUG) console.log(`[browser ${message.type()}] ${text.slice(0, 800)}`);
  if (/pose|dress plate|guide|error/i.test(text) && text.length < 600)
    notes.push(`console: ${text}`);
});
page.on('pageerror', error => {
  notes.push(`pageerror: ${String(error).slice(0, 300)}`);
  if (process.env.BENCH_DEBUG) console.log(`[pageerror] ${error.stack ?? error}`);
});
if (process.env.BENCH_DEBUG)
  page.on('request', request => {
    if (request.url().includes('/api/') && request.method() === 'POST')
      console.log(`[req] ${request.method()} ${request.url()}`);
  });
await isolateServerStorage(page);
await page.route('**/api/version', route =>
  route.fulfill({ json: { updateAvailable: false, currentVersion: '0.0.0' } })
);
await page.goto('/manifest.json');
await putAppKv(page, { 'dress-plates': dressPlates });
await seedSettingsCacheOnNextLoad(page, {
  shared: { activeCharacterId: NORA, model: engine },
  tools: { day: dayTool },
  characters,
});
await page.goto('/day', { waitUntil: 'domcontentloaded' });
const queueAll = page.getByTestId('day-queue-all').first();
await queueAll.waitFor({ timeout: 180_000 });
await page.waitForTimeout(6000);
// Warm the dev server: a cold `next dev` compiles more chunks after the first load and Fast
// Refresh reloads the page; load Day once more so those reloads land before we act.
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await queueAll.waitFor({ timeout: 180_000 });
await page.waitForTimeout(8000);
await queueAll.waitFor({ timeout: 180_000 });

const photoStatus: Record<string, string> = {};
if (mode === 'photo') {
  if (!photosDir) throw new Error('--photos is required in photo mode');
  for (const [index, id] of ids.entries()) {
    const slotId = slotIds[index]!;
    const file = ['jpg', 'png'].map(ext => join(photosDir, `${id}.${ext}`)).find(existsSync);
    if (!file) throw new Error(`no photo for ${id}`);
    await page.getByTestId(`day-progress-edit-${slotId}`).first().click({ timeout: 60_000 });
    const sheet = page.getByTestId('day-slot-sheet');
    await sheet.waitFor({ timeout: 30_000 });
    const input = page.getByTestId('day-slot-pose-preview-photo-input');
    await input.setInputFiles(file);
    const status = page.getByTestId('day-slot-pose-preview-photo-status');
    let text = '';
    for (let i = 0; i < 180; i += 1) {
      await page.waitForTimeout(1000);
      text = (await status.innerText().catch(() => '')).trim();
      if (text && !/Reading the pose/i.test(text)) break;
      if (!text && i > 10) {
        // No status line: the pose was taken (the line only shows a note or an error).
        const state = await readDayState(page);
        const slot = (state?.slots as Array<{ id: string; posePhoto?: unknown }> | undefined)?.find(
          entry => entry.id === slotId
        );
        if (slot?.posePhoto) break;
      }
    }
    photoStatus[id] = text;
    console.log('photo', id, '→', text || '(read)');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(3000);
}

const before = await readDayState(page);
console.log('queueing', ids.length, 'slots on', engine);
// A cold `next dev --webpack` can compile a new chunk right after the click and Fast Refresh does a
// full reload, which drops the in-flight queue (nothing is ever sent). When no ComfyUI upload or
// prompt has gone out 90 s after the click, reload Day and click Queue day again (up to 3 times).
let comfySends = 0;
page.on('request', request => {
  if (
    request.method() === 'POST' &&
    /\/api\/comfyui(\/upload)?$/.test(new URL(request.url()).pathname)
  )
    comfySends += 1;
});
for (let attempt = 1; ; attempt += 1) {
  await queueAll.click();
  let sent = false;
  for (let s = 0; s < 90 && !sent; s += 1) {
    await page.waitForTimeout(1000);
    sent = comfySends > 0;
  }
  if (sent || attempt >= 3) break;
  console.log(
    `nothing sent ${attempt * 90}s after Queue day (a dev reload?) — reloading Day and queueing again`
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await queueAll.waitFor({ timeout: 180_000 });
  await page.waitForTimeout(6000);
}
const want = ids.length;
const capturedIds = () =>
  new Set(
    capturedFiles().map(name =>
      name
        .replace(/\.json$/, '')
        .split('-')
        .slice(2)
        .join('-')
    )
  );
// Done when every target slot's still has a prompt id the proxy captured (or 15 minutes).
for (let i = 0; i < 900; i += 1) {
  await page.waitForTimeout(1000);
  if (i % 10 !== 9) continue;
  const state = await readDayState(page);
  const have = capturedIds();
  const stillsNow = (state?.stills ?? []) as Array<{ slotId: string; promptId?: string }>;
  const done = slotIds
    .slice(0, want)
    .filter(slotId =>
      stillsNow.some(entry => entry.slotId === slotId && entry.promptId && have.has(entry.promptId))
    );
  if (i % 60 === 59) console.log(`… ${done.length}/${want} slots captured (${have.size} graphs)`);
  if (process.env.BENCH_DEBUG && i % 30 === 29) {
    await page.screenshot({ path: join(outDir, `debug-${i}.png`) }).catch(() => {});
    console.log('[day stills]', JSON.stringify(stillsNow).slice(0, 600));
  }
  if (done.length >= want) break;
}
await page.waitForTimeout(3000);
await page.screenshot({ path: join(outDir, 'page.png'), fullPage: false });
const after = await readDayState(page);
const graphs = new Map<string, unknown>();
for (const name of capturedFiles()) {
  const id = name
    .replace(/\.json$/, '')
    .split('-')
    .slice(2)
    .join('-');
  graphs.set(id, JSON.parse(readFileSync(join(captureDir, name), 'utf8')));
  mkdirSync(join(outDir, 'graphs'), { recursive: true });
  renameSync(join(captureDir, name), join(outDir, 'graphs', name));
}
const stills = (after?.stills ?? []) as Array<{ slotId: string; promptId?: string }>;
const afterSlots = (after?.slots ?? before?.slots ?? []) as Array<{
  id: string;
  posePhoto?: unknown;
  sceneHints?: string;
  location?: string;
}>;
const rows = ids.map((id, index) => {
  const slotId = slotIds[index]!;
  const still = stills.find(entry => entry.slotId === slotId);
  const slot = afterSlots.find(entry => entry.id === slotId);
  return {
    target: id,
    mode,
    engine,
    slotId,
    promptId: still?.promptId ?? null,
    posePhoto: slot?.posePhoto ?? null,
    beat: slot?.sceneHints,
    location: slot?.location,
    photoStatus: photoStatus[id],
    graph: still?.promptId ? (graphs.get(still.promptId) ?? null) : null,
  };
});
writeFileSync(
  join(outDir, 'capture.json'),
  JSON.stringify(
    { engine, mode, dressKey, bestEngine: BEST_ENGINE, rows, notes, captured: graphs.size, stills },
    null,
    1
  )
);
console.log(
  'captured',
  graphs.size,
  'graphs;',
  rows.filter(row => row.graph).length,
  'of',
  want,
  'matched to slots'
);
if (notes.length) console.log(notes.slice(0, 30).join('\n'));
await browser.close();
