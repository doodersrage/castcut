/**
 * Ground-sit recovery on the Story page, live: one photo-story scene posed with a custom pose
 * that the pose map sits down on the ground (sport_ski-5). Queue still → the pose check calls the
 * seat ("sat on the ground for the pose; Retry redoes it without the pose map") → Play another
 * still → the retry goes out words-only (no pose map) and its card says it was redone without
 * the map. The app must point COMFYUI_API_URL at the real ComfyUI and have the vision model.
 *
 *   node --import tsx scripts/pose-bench/story-ground-sit.mts --engine <model> --out <dir> \
 *     [--id sport_ski-5] [--base URL] [--minutes 20]
 *
 * Writes <out>/result.json (each take, the card lines, the prompts sent) and <out>/card-N.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { seedSettingsCacheOnNextLoad } from '../../e2e/helpers/idb';
import { openStoryBeatMenu } from '../../e2e/helpers/story';
import { isolateServerStorage } from '../../e2e/helpers/storage';
import { signInIfNeeded } from './sign-in.mts';

const arg = (flag: string, fallback?: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1]! : fallback;
};
const engine = arg('--engine')!;
const outDir = arg('--out')!;
const poseId = arg('--id', 'sport_ski-5')!;
const baseURL = arg('--base', 'http://127.0.0.1:47981')!;
const timeoutMin = Number(arg('--minutes', '20'));
if (!engine || !outDir) {
  console.error('usage: story-ground-sit.mts --engine M --out DIR [--id POSE] [--base URL]');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const PLATE = 'day-dress-plate-252d755af9eb93c0.png';
const PLATE_URL = `/api/comfyui/view?filename=${PLATE}&subfolder=&type=input`;
type Body = Array<{ x: number; y: number } | null>;
type Ref = { id: string; aspect: number; people: Body[] };
const ref = (
  JSON.parse(readFileSync('public/pose-references.json', 'utf8')) as { references: Ref[] }
).references.find(entry => entry.id === poseId);
if (!ref) throw new Error(`no reference ${poseId}`);

const NORA = 'bench-story-nora';
const now = Date.now();
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
const beat = {
  id: 'ski-1',
  at: now - 1000,
  kind: 'plot',
  title: 'Afternoon on the lawn',
  blurb: 'Nora takes a quiet moment for herself on a sunny city park lawn.',
  prompt:
    'Nora, in a pink strapless mini dress with a gathered skirt and hot pink pointed-toe pumps, ' +
    'takes a quiet moment for herself on a sunny city park lawn beside a wide paved plaza, ' +
    'afternoon sun, candid photo.',
  posePhoto: { aspect: ref.aspect, people: ref.people, source: 'edited' },
};
const roleplay = {
  activeSessionId: `cast-${NORA}`,
  characterName: 'Nora',
  bio: { name: 'Nora', look: 'a pink strapless mini dress', personality: 'calm' },
  tone: 'cozy',
  content: 'pg13',
  playAs: 'photo',
  isolateSubject: false,
  referenceImageUrl: PLATE_URL,
  referenceImageFilename: PLATE,
  story: [beat],
};

type Beat = {
  id: string;
  stillStatus?: string;
  imageUrl?: string;
  promptId?: string;
  poseGuideUrl?: string;
  poseGuideExpect?: { promptId?: string; wordsOnly?: string; poseKey?: string };
  poseMatch?: { imageUrl?: string; score?: number; groundSit?: boolean };
};

async function readBeat(page: Page): Promise<Beat | null> {
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
          tools?: { roleplay?: { story?: unknown[] } };
        } | null;
        return (record?.tools?.roleplay?.story?.[0] as never) ?? null;
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
  ({ cast }) => {
    try {
      localStorage.setItem('comfy-workspace-mode-v1', 'play');
      localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
      localStorage.setItem('comfy-prompt-characters-v1', JSON.stringify(cast));
      localStorage.setItem(
        'comfy-play-metrics-v1',
        JSON.stringify({ version: 1, firstFilmCutAt: Date.now() })
      );
    } catch {
      /* storage unavailable */
    }
  },
  { cast: characters }
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
await seedSettingsCacheOnNextLoad(page, {
  shared: { activeCharacterId: NORA, model: engine },
  tools: { roleplay },
  characters,
});
await page.goto(`/story?character=${NORA}`, { waitUntil: 'domcontentloaded' });
const card = page.getByTestId('story-beat-card').first();
await card.waitFor({ timeout: 180_000 });
await page.waitForTimeout(5000);

const cardLine = async () =>
  (
    await page
      .getByTestId('story-pose-match')
      .first()
      .textContent({ timeout: 500 })
      .catch(() => '')
  )?.trim() ?? '';

type Take = {
  imageUrl: string;
  promptId?: string;
  wordsOnly?: string;
  poseGuideUrl?: string;
  score?: number;
  groundSit?: boolean;
  line: string;
};
const takes: Take[] = [];
const log = (text: string) => console.log(new Date().toISOString().slice(11, 19), text);

async function waitForCheckedTake(label: string): Promise<Take | null> {
  const deadline = Date.now() + timeoutMin * 60_000;
  const seen = new Set(takes.map(take => take.imageUrl));
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const state = await readBeat(page);
    const url = state?.imageUrl?.trim();
    if (!state || !url || seen.has(url) || state.stillStatus !== 'completed') continue;
    if (state.poseMatch?.imageUrl !== url) continue;
    await page.waitForTimeout(1500);
    const line = await cardLine();
    const take: Take = {
      imageUrl: url,
      promptId: state.promptId,
      wordsOnly: state.poseGuideExpect?.wordsOnly,
      poseGuideUrl: state.poseGuideUrl,
      score: state.poseMatch.score,
      groundSit: state.poseMatch.groundSit,
      line,
    };
    takes.push(take);
    await card.screenshot({ path: join(outDir, `card-${takes.length}.png`) }).catch(() => {});
    log(`${label}: ${line}`);
    return take;
  }
  log(`${label}: timed out`);
  return null;
}

log(`queue still on ${engine}`);
const menu = await openStoryBeatMenu(page, 0);
await menu.getByRole('button', { name: 'Queue still' }).click();
const first = await waitForCheckedTake('first');
let retried: Take | null = null;
if (first?.groundSit) {
  await page.waitForTimeout(2000);
  const again = await openStoryBeatMenu(page, 0);
  await again.getByTestId('story-beat-retry').click();
  log('retry');
  retried = await waitForCheckedTake('retry');
}
writeFileSync(
  join(outDir, 'result.json'),
  JSON.stringify({ engine, poseId, takes, prompts, notes }, null, 1)
);
log(
  `done: first ${first ? (first.groundSit ? 'sat' : `${first.score}`) : 'none'}; retry ${
    retried ? `${retried.score} ${retried.wordsOnly ? 'words-only' : 'with map'}` : 'none'
  }`
);
await browser.close();
