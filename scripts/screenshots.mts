/**
 * Retakes the README screenshots (docs/screenshots/*.png) against a running Castcut — the way
 * they were taken by hand (commit 506f57ed): a demo Cast "Nora", light theme, Film workspace,
 * 1440×900 desk and 390×844 @2x phone. The demo data is seeded into the browser the way the
 * e2e specs seed it (e2e/helpers/idb.ts, storage.ts), so it needs no demo install and no
 * ComfyUI: the "renders" are the bundled sample stills in public/samples.
 *
 *   npm run screenshots -- [--url http://127.0.0.1:47832] [--only day,phone-day] [--out dir]
 *
 * The URL also comes from SCREENSHOTS_URL or PROMPT_API_URL. With sign-in on, it logs in with
 * PROMPT_E2E_USERNAME / PROMPT_E2E_PASSWORD (or PROMPT_ADMIN_*; .env.local is read). Look at
 * the PNGs before committing them.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { seedSettingsCacheOnNextLoad } from '../e2e/helpers/idb';
import { isolateServerStorage } from '../e2e/helpers/storage';
import { dismissBlockingOverlays } from '../e2e/helpers/overlays';
import { e2eApiHeaders, e2eCredentials } from '../e2e/helpers/auth';

const root = join(dirname(new URL(import.meta.url).pathname), '..');

function loadEnvLocal(): void {
  const path = resolve(root, '.env.local');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const at = trimmed.indexOf('=');
    if (at <= 0) continue;
    const key = trimmed.slice(0, at).trim();
    const value = trimmed
      .slice(at + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2');
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvLocal();

const arg = (flag: string) => {
  const index = process.argv.indexOf(flag);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const baseURL = (
  arg('--url') ??
  process.env.SCREENSHOTS_URL ??
  process.env.PROMPT_API_URL ??
  'http://127.0.0.1:47832'
).replace(/\/$/, '');
const outDir = resolve(root, arg('--out') ?? 'docs/screenshots');
const only = arg('--only')
  ?.split(',')
  .map(name => name.trim())
  .filter(Boolean);

const DESK = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

// ─── The demo install: Nora and three more Cast, a planned Day, a short Story ─────────────────

const NORA = 'demo-nora';
const now = Date.now();
const sample = (slot: string) => `/samples/day-${slot}.webp`;
const NORA_PICTURE = sample('morning');

const castRecord = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  version: 1,
  updatedAt: now,
  ...extra,
});

const CHARACTERS = {
  version: 1,
  characters: [
    castRecord('demo-tomas', 'Tomas', {
      traits: { sex: 'man', ageBand: '30s', height: 'tall', bodyBuild: 'athletic' },
    }),
    castRecord(NORA, 'Nora', {
      descriptor:
        'a White woman in her thirties, average height, slender and lean with long limbs and little soft tissue, with long wavy brown hair',
      traits: {
        sex: 'woman',
        ethnicity: 'white',
        ageBand: '30s',
        height: 'average',
        bodyBuild: 'slender',
        hairColor: 'brown',
        hairLength: 'long',
        hairStyle: 'wavy',
      },
      ipAdapter: { imageUrl: NORA_PICTURE, imageFilename: 'Nora-cutout.png', kind: 'ipadapter' },
      reference: {
        originalUrl: NORA_PICTURE,
        isolatedUrl: NORA_PICTURE,
        isolatedFilename: 'Nora-cutout.png',
        isolated: true,
      },
    }),
    castRecord('demo-sam', 'Sam'),
    castRecord('demo-nova', 'Nova'),
  ],
  removedIds: [],
};

// What the bundled sample stills (public/samples/day-*.webp, Nora rendered by Castcut) show.
const DAY_SLOTS = [
  {
    id: 'morning',
    label: 'morning',
    location: 'corner café by the window with a flat white and a notebook',
    sceneHints: 'writes in her notebook',
  },
  {
    id: 'afternoon',
    label: 'afternoon',
    location: 'tree-lined park path in autumn, leaves underfoot',
    sceneHints: 'walks with a coffee to go',
  },
  {
    id: 'evening',
    label: 'evening',
    location: 'old bookshop with floor-to-ceiling shelves and warm lamps',
    sceneHints: 'reads a page between the stacks',
  },
  {
    id: 'night',
    label: 'night',
    location: 'rooftop terrace over the city lights at dusk',
    sceneHints: 'leans on the railing and smiles',
  },
];

const DAY_TOOL = {
  stillsCharacterId: NORA,
  slots: DAY_SLOTS,
  stills: DAY_SLOTS.map((slot, index) => ({
    slotId: slot.id,
    status: 'completed',
    imageUrl: sample(slot.id),
    promptId: `demo-${slot.id}`,
    completedAt: now - (DAY_SLOTS.length - index) * 60_000,
  })),
};

const STORY_TOOL = {
  activeSessionId: `cast-${NORA}`,
  characterName: 'Nora',
  bio: {
    name: 'Nora',
    look: 'long wavy brown hair, white wrap dress',
    personality: 'warm, restless, quick to laugh',
  },
  story: [
    ['The notebook', 'Nora starts the day at the café, writing the list she never finishes.'],
    ['Autumn walk', 'Coffee in hand, she takes the long way through the park.'],
    ['The bookshop', 'A paperback falls open at a page someone has marked for her.'],
  ].map(([title, blurb], index) => ({
    id: `demo-beat-${index + 1}`,
    at: now - (3 - index) * 60_000,
    kind: 'plot',
    title,
    blurb,
    stillStatus: 'completed',
    imageUrl: sample(DAY_SLOTS[index]!.id),
  })),
};

const SETTINGS = {
  shared: { activeCharacterId: NORA },
  characters: CHARACTERS,
  tools: {
    day: DAY_TOOL,
    roleplay: STORY_TOOL,
    // Outfit's try-on plate: the pose editor draws the figure over it.
    fitting: { referenceImageUrl: sample('afternoon') },
  },
};

// ─── Browser setup ──────────────────────────────────────────────────────────────────────────

async function newContext(browser: Browser, device: typeof DESK | typeof PHONE) {
  const context = await browser.newContext({
    ...device,
    baseURL,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    extraHTTPHeaders: e2eApiHeaders(),
  });
  const url = new URL(baseURL);
  await context.addCookies([{ name: 'comfy-workspace-mode-v1', value: 'play', url: url.origin }]);
  await context.addInitScript(
    ({ characterId }) => {
      try {
        localStorage.setItem('comfy-app-theme-v1', 'light');
        localStorage.setItem('comfy-workspace-mode-v1', 'play');
        localStorage.setItem('comfy-workspace-mode-chosen-v1', '1');
        // A Cast who has cut a film: no first-film coaching over the pages.
        localStorage.setItem(
          'comfy-play-metrics-v1',
          JSON.stringify({ version: 1, firstFilmCutAt: Date.now() })
        );
        sessionStorage.setItem(
          'play-campaign-v1',
          JSON.stringify({ version: 1, characterId, stepIndex: 3, updatedAt: Date.now() })
        );
      } catch {
        /* storage unavailable */
      }
    },
    { characterId: NORA }
  );
  return context;
}

/** Sign in when the app has sign-in on (the pages render signed out, but without the tabs). */
async function login(context: BrowserContext): Promise<void> {
  const session = await context.request.get('/api/auth/session');
  const data = (await session.json().catch(() => ({}))) as {
    authEnabled?: boolean;
    user?: unknown;
  };
  if (!data.authEnabled || data.user) return;
  const { username, password } = e2eCredentials();
  const response = await context.request.post('/api/auth/login', {
    headers: e2eApiHeaders(),
    data: { username, password },
  });
  if (!response.ok()) {
    throw new Error(
      `Login failed (${response.status()}) — set PROMPT_E2E_USERNAME / PROMPT_E2E_PASSWORD.`
    );
  }
}

async function openPage(context: BrowserContext, path: string): Promise<Page> {
  const page = await context.newPage();
  // Read-only against the app: the seeded Cast would otherwise send its picture to ComfyUI
  // (isolate, pose read, uploads) and could queue renders. Every write to the API is answered
  // here; reads (engine, models, health) still reach the server so the chrome looks real.
  await page.route('**/api/**', route =>
    route.request().method() === 'GET'
      ? route.fallback()
      : route.fulfill({ status: 503, json: { error: 'Screenshots are read-only.' } })
  );
  // Registered after, so it answers /api/storage first (routes run newest first).
  await isolateServerStorage(page);
  // No "Castcut x.y is available" notice over the picture.
  await page.route('**/api/version', route =>
    route.fulfill({ json: { updateAvailable: false, currentVersion: '0.0.0' } })
  );
  await page.goto('/manifest.json');
  await seedSettingsCacheOnNextLoad(page, SETTINGS);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await dismissBlockingOverlays(page);
  return page;
}

/** Scroll `target` to `offset` px below the top of the viewport (window or the page's scroller). */
async function scrollTo(target: Locator, offset = 80): Promise<void> {
  await target.waitFor({ state: 'attached', timeout: 60_000 });
  await target.evaluate((node, gap) => {
    let scroller: Element | null = node.parentElement;
    while (scroller && scroller !== document.body) {
      const style = getComputedStyle(scroller);
      if (/(auto|scroll)/.test(style.overflowY) && scroller.scrollHeight > scroller.clientHeight) {
        break;
      }
      scroller = scroller.parentElement;
    }
    const delta = node.getBoundingClientRect().top - gap;
    if (scroller && scroller !== document.body) scroller.scrollTop += delta;
    else window.scrollBy({ top: delta, behavior: 'instant' });
  }, offset);
}

const scrollToTestId = (page: Page, testId: string, offset?: number) =>
  scrollTo(page.getByTestId(testId).first(), offset);

/** Let images, fonts and entrance transitions finish before the picture. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.evaluate(async () => {
    await document.fonts.ready;
    // Lazy images below the fold never load — wait a few seconds at most.
    const loads = Array.from(document.images)
      .filter(image => !image.complete && image.loading !== 'lazy')
      .map(
        image =>
          new Promise(done => {
            image.addEventListener('load', done, { once: true });
            image.addEventListener('error', done, { once: true });
          })
      );
    await Promise.race([Promise.all(loads), new Promise(done => setTimeout(done, 5000))]);
  });
  await dismissBlockingOverlays(page);
  // "This Day needs 1 file in ComfyUI" and the like depend on the ComfyUI behind the app.
  for (const notNow of await page.getByRole('button', { name: 'Not now', exact: true }).all()) {
    await notNow.click().catch(() => {});
  }
  // next dev's own badge, and the jobs chip: the read-only API leaves the seeded Cast's plate
  // check looking "active", which a demo install at rest would not show.
  await page.addStyleTag({
    content: 'nextjs-portal, [data-testid="active-jobs-chip"] { display: none !important; }',
  });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(800);
}

// ─── The shots ──────────────────────────────────────────────────────────────────────────────

type Shot = {
  name: string;
  device: typeof DESK | typeof PHONE;
  take: (context: BrowserContext) => Promise<Page>;
  /** After the page settles: scroll to the part the picture is of. */
  frame?: (page: Page) => Promise<void>;
};

const SHOTS: Shot[] = [
  {
    name: 'film',
    device: DESK,
    take: async context => {
      const page = await openPage(context, '/play');
      await page.getByTestId('play-campaign').waitFor({ timeout: 60_000 });
      // The Cast picker (Nora and the others) sits under "Edit cast & steps".
      await page.getByText('Edit cast & steps').first().click();
      return page;
    },
    frame: page => scrollTo(page.getByText('Edit cast & steps').first(), 460),
  },
  {
    name: 'day',
    device: DESK,
    take: async context => {
      const page = await openPage(context, `/day?character=${NORA}`);
      await page.getByTestId('day-reel').waitFor({ timeout: 60_000 });
      return page;
    },
    frame: page => scrollToTestId(page, 'day-slot-board'),
  },
  {
    name: 'phone-day',
    device: PHONE,
    take: async context => {
      const page = await openPage(context, `/m/day?character=${NORA}`);
      await page.getByTestId('mobile-day').waitFor({ timeout: 60_000 });
      return page;
    },
    frame: page => scrollToTestId(page, 'day-progress-morning', 270),
  },
  {
    name: 'cast',
    device: DESK,
    take: async context => {
      const page = await openPage(context, `/characters/${NORA}`);
      await page.getByRole('tab', { name: /^Bible$/ }).click({ timeout: 60_000 });
      return page;
    },
    frame: page => scrollTo(page.getByRole('tab', { name: /^Bible$/ }), 90),
  },
  {
    name: 'story',
    device: DESK,
    take: async context => {
      const page = await openPage(context, `/story?character=${NORA}`);
      await page.getByTestId('story-reel').first().waitFor({ state: 'attached', timeout: 60_000 });
      return page;
    },
  },
  {
    name: 'pose-editor',
    device: DESK,
    take: async context => {
      const page = await openPage(context, `/fitting?character=${NORA}`);
      await page.getByTestId('outfit-pose-custom').click({ timeout: 60_000 });
      await page.getByTestId('outfit-pose-editor').waitFor({ timeout: 60_000 });
      return page;
    },
  },
];

async function main(): Promise<void> {
  mkdirSync(outDir, { recursive: true });
  const shots = SHOTS.filter(shot => !only || only.includes(shot.name));
  if (shots.length === 0) throw new Error(`No shot named ${only?.join(', ')}`);
  const browser = await chromium.launch();
  try {
    for (const shot of shots) {
      console.log(`… ${shot.name}`);
      const context = await newContext(browser, shot.device);
      context.setDefaultTimeout(60_000);
      context.setDefaultNavigationTimeout(120_000);
      await login(context);
      const page = await shot.take(context).catch(async error => {
        const pages = context.pages();
        const last = pages[pages.length - 1];
        const debug = join(tmpdir(), `screenshots-${shot.name}-failed.png`);
        await last?.screenshot({ path: debug }).catch(() => {});
        console.error(`✗ ${shot.name}: what the page showed → ${debug}`);
        throw error;
      });
      await settle(page);
      if (shot.frame) {
        await shot.frame(page);
        await page.waitForTimeout(600);
      }
      const file = join(outDir, `${shot.name}.png`);
      await page.screenshot({ path: file });
      console.log(`✓ ${shot.name} → ${file}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
