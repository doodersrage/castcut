/**
 * Ground-sit recovery, live: drive the real Day page with "Redo pose misses once" on and watch a
 * custom pose that the pose map sits down on the ground (sport_ski-5) get caught and redone
 * without the map (src/lib/pose/ground-sit-redo.ts).
 *
 * Seeds a Day like capture.mts (joints mode: each slot's custom pose is the reference skeleton,
 * the dressed plate `day-dress-plate-252d755af9eb93c0.png`), every Quality check off except
 * "Redo pose misses once", clicks Queue day and records, per slot, every take that lands, the
 * redo status lines and card marks seen, and the Gallery's pose check per take. The app must
 * point COMFYUI_API_URL at the real ComfyUI and have the vision model (LLM_*) set up.
 *
 *   node --import tsx scripts/pose-bench/ground-sit-redo.mts --engine <model> \
 *     --ids sport_ski-5,sport_ski-5,crouch-1 --out <dir> [--base URL]
 *
 * Writes <out>/result.json and a screenshot of the board (<out>/board.png).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { putAppKv, seedSettingsCacheOnNextLoad } from '../../e2e/helpers/idb';
import { isolateServerStorage } from '../../e2e/helpers/storage';
import { signInIfNeeded } from './sign-in.mts';
import { dayDressPlateRequestKey } from '../../src/lib/day/dress-plate';
import { normalizeFootwear } from '../../src/lib/wardrobe/footwear';

const arg = (flag: string, fallback?: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1]! : fallback;
};
const engine = arg('--engine')!;
const ids = arg('--ids')!.split(',').filter(Boolean);
const outDir = arg('--out')!;
const baseURL = arg('--base', 'http://127.0.0.1:47971')!;
const timeoutMin = Number(arg('--minutes', '40'));
if (!engine || !ids.length || !outDir) {
  console.error('usage: ground-sit-redo.mts --engine M --ids a,b --out DIR [--base URL]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const PLATE = 'day-dress-plate-252d755af9eb93c0.png';
const PLATE_URL = `/api/comfyui/view?filename=${PLATE}&subfolder=&type=input`;
const GARMENT_DESCRIPTION = 'a pink strapless mini dress with a gathered skirt';
const FOOTWEAR = 'hot pink pointed-toe pumps';
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
if (length !== ids.length) throw new Error(`give 2, 3, 4, 6 or 8 ids (got ${ids.length})`);
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
  const ref = refs.get(id);
  if (!ref) throw new Error(`no reference ${id}`);
  return {
    id: slotIds[index],
    label: `bench ${index + 1} ${id}`,
    location: PLACE,
    sceneHints: BEATS[index],
    sceneHintsTyped: BEATS[index],
    posePhoto: { aspect: ref.aspect, people: ref.people, source: 'edited' },
  };
});
const dayTool = {
  stillsCharacterId: NORA,
  slots,
  stills: [],
  dayLength: length,
  dayMood: 'everyday',
  intimateMix: 'solo',
  allowCompanions: false,
  identityBoost: false,
  faceFinish: false,
  autoReviewStills: false,
  // The switch under test.
  redoPoseMisses: true,
  bestOfTwoHardPoses: false,
  bestEnginePerPose: false,
  customGarmentImageFilename: PLATE,
  customGarmentImageUrl: PLATE_URL,
  customGarmentDescription: GARMENT_DESCRIPTION,
  footwear: FOOTWEAR,
};
const dressPlates = [
  {
    key: dayDressPlateRequestKey({
      model: engine,
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
  },
];

async function readDay(page: Page): Promise<Record<string, unknown> | null> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await page.evaluate(async () => {
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
    } catch (error) {
      if (attempt >= 5 || !/context was destroyed|navigation/i.test(String(error))) throw error;
      await page.waitForTimeout(3000);
    }
  }
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
await signInIfNeeded(page);
const notes: string[] = [];
page.on('pageerror', error => notes.push(`pageerror: ${String(error).slice(0, 300)}`));
const prompts: Array<{ at: number; prompt: unknown }> = [];
page.on('request', request => {
  if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/comfyui') {
    try {
      prompts.push({ at: Date.now(), prompt: request.postDataJSON() });
    } catch {
      /* not JSON */
    }
  }
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
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await queueAll.waitFor({ timeout: 180_000 });
await page.waitForTimeout(8000);
// The redo status line lives in the Advanced drawer's status list; open it if it is closed.
// Every change of the redo status line, as it happens (a line can last under a second).
const seen: string[] = [];
await page.exposeFunction('benchRedoStatus', (text: string) => {
  if (text && seen.at(-1) !== text) seen.push(text);
});
// A string, not a function: tsx would wrap a named arrow in its `__name` helper.
await page.evaluate(`(() => {
  const read = () => {
    const el = document.querySelector('[data-testid="day-pose-redo-status"]');
    window.benchRedoStatus((el && el.textContent ? el.textContent : '').trim());
  };
  new MutationObserver(read).observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
  });
})()`);
console.log('queueing', ids.length, 'slots on', engine);
await queueAll.click();

type Take = { promptId?: string; imageUrl?: string; at: number };
const takes: Record<string, Take[]> = Object.fromEntries(slotIds.map(id => [id, []]));
const statuses: string[] = [];
const marks: Record<string, string[]> = Object.fromEntries(slotIds.map(id => [id, []]));
const settledText = (label: string, text: string) =>
  text.startsWith(`${label} pose matched`) ||
  text.startsWith(`${label} missed the pose again`) ||
  text.startsWith(`${label}: pose not judged`) ||
  text.startsWith(`${label} pose check skipped`);
const settled = new Set<string>();
const deadline = Date.now() + timeoutMin * 60_000;
while (Date.now() < deadline) {
  await page.waitForTimeout(1000);
  while (statuses.length < seen.length) {
    const status = seen[statuses.length]!;
    statuses.push(status);
    console.log(new Date().toISOString().slice(11, 19), status);
  }
  for (const slot of slots) {
    for (const testId of [`day-progress-pose-redo-${slot.id}`, `day-progress-redone-${slot.id}`]) {
      const text = (
        await page
          .getByTestId(testId)
          .first()
          .textContent({ timeout: 200 })
          .catch(() => '')
      ).trim();
      if (text && marks[slot.id]!.at(-1) !== text) marks[slot.id]!.push(text);
    }
  }
  const state = await readDay(page);
  for (const still of (state?.stills ?? []) as Array<{
    slotId: string;
    status?: string;
    promptId?: string;
    imageUrl?: string;
  }>) {
    if (still.status !== 'completed' || !still.imageUrl) continue;
    const list = takes[still.slotId];
    if (list && !list.some(take => take.imageUrl === still.imageUrl)) {
      list.push({ promptId: still.promptId, imageUrl: still.imageUrl, at: Date.now() });
    }
  }
  for (const slot of slots) {
    // Settled: its last take's check said matched / missed again, and no redo is pending.
    if (statuses.some(text => settledText(slot.label, text))) {
      const last = [...statuses].reverse().find(text => text.includes(slot.label)) ?? '';
      if (settledText(slot.label, last)) settled.add(slot.id);
    }
  }
  if (settled.size >= slots.length) break;
}
await page.waitForTimeout(2000);
await page.screenshot({ path: join(outDir, 'board.png'), fullPage: true });
const gallery = await page.evaluate(() => {
  const out: Record<string, unknown> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)!;
    if (/gallery/i.test(key)) out[key] = localStorage.getItem(key)?.slice(0, 200_000);
  }
  return out;
});
writeFileSync(
  join(outDir, 'result.json'),
  JSON.stringify(
    {
      engine,
      ids,
      slots: slots.map(slot => ({
        id: slot.id,
        label: slot.label,
        takes: takes[slot.id],
        marks: marks[slot.id],
      })),
      statuses,
      settled: [...settled],
      prompts,
      notes,
      gallery,
    },
    null,
    1
  )
);
console.log('settled', settled.size, 'of', slots.length);
await browser.close();
