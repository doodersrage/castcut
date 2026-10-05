import { test, expect, type Page } from '@playwright/test';
import { ensureAuthenticated } from './helpers/auth';
import { seedSettingsCacheOnNextLoad } from './helpers/idb';
import { gotoStable } from './helpers/navigation';
import { dismissBlockingOverlays } from './helpers/overlays';
import { isolateServerStorage } from './helpers/storage';

/**
 * One Cast's Story must never land in another Cast's session. Seen on a demo install: Tomas's
 * Story session held Nora's scenes (same ids and times), with Tomas's bible and settings.
 */

const NORA = 'e2e-bleed-nora';
const TOMAS = 'e2e-bleed-tomas';
const LIBRARY_KEY = 'comfy-prompt-roleplay-library-v1';
const TOOLS_KEY = 'comfy-prompt-tool-settings-tools-v1';

test.beforeEach(async ({ page }) => {
  await isolateServerStorage(page);
  await ensureAuthenticated(page);
});

async function readKv(page: Page, key: string): Promise<unknown> {
  return page.evaluate(
    async storeKey =>
      new Promise<unknown>((resolve, reject) => {
        const request = indexedDB.open('comfy-prompt-studio-v1');
        request.onerror = () => reject(request.error ?? new Error('idb open failed'));
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('kv', 'readonly');
          const get = tx.objectStore('kv').get(storeKey);
          get.onsuccess = () => {
            db.close();
            resolve((get.result as { value?: unknown } | undefined)?.value ?? null);
          };
          get.onerror = () => reject(get.error ?? new Error('idb get failed'));
        };
      }),
    key
  );
}

type Beat = { id: string; title: string };
type Session = { id: string; snapshot: { story?: Beat[] } };

async function sessionTitles(page: Page, sessionId: string): Promise<string[]> {
  const library = ((await readKv(page, LIBRARY_KEY)) ?? []) as Session[];
  const session = library.find(entry => entry.id === sessionId);
  return (session?.snapshot.story ?? []).map(beat => beat.title);
}

async function liveStory(page: Page): Promise<{ sessionId?: string; titles: string[] }> {
  const tools = (await readKv(page, TOOLS_KEY)) as {
    tools?: { roleplay?: { activeSessionId?: string; story?: Beat[] } };
  } | null;
  const roleplay = tools?.tools?.roleplay;
  return {
    sessionId: roleplay?.activeSessionId,
    titles: (roleplay?.story ?? []).map(beat => beat.title),
  };
}

function castRecord(id: string, name: string, look: string, now: number) {
  return {
    id,
    name,
    characterName: name,
    version: 1,
    updatedAt: now,
    bio: { name, look, personality: 'calm' },
    tone: 'cozy',
    content: 'pg13',
  };
}

/**
 * Nora's Story is live (her second scene still rendering); Tomas was made the active Cast on
 * another page while it rendered, and the render has finished since.
 */
async function seedNoraReelTomasActive(page: Page, options: { noraSessionId?: string } = {}) {
  const now = Date.now();
  const characters = {
    version: 1,
    characters: [
      castRecord(NORA, 'Nora', 'denim jacket, brown hair', now),
      castRecord(TOMAS, 'Tomas', 'grey tee, short dark hair', now),
    ],
    removedIds: [],
  };
  await page.addInitScript(
    ({ cast, at }) => {
      window.localStorage.setItem('comfy-prompt-characters-v1', JSON.stringify(cast));
      window.localStorage.setItem(
        'comfy-play-metrics-v1',
        JSON.stringify({ version: 1, firstFilmCutAt: at })
      );
      window.localStorage.setItem(
        'comfyui-gallery-v1',
        JSON.stringify([
          {
            id: 'g-nora-2',
            promptId: 'p-nora-2',
            prompt: 'Nora wardrobe change',
            model: 'qwen-image-2512',
            tool: 'roleplay',
            comfyUrl: 'http://127.0.0.1:8188',
            status: 'completed',
            queuedAt: at - 60_000,
            completedAt: at - 1_000,
            characterId: 'e2e-bleed-nora',
            images: [{ filename: 'nora-2.png', subfolder: '', type: 'output' }],
          },
        ])
      );
    },
    { cast: characters, at: now }
  );
  await seedSettingsCacheOnNextLoad(page, {
    shared: { activeCharacterId: TOMAS },
    characters,
    tools: {
      roleplay: {
        activeSessionId: options.noraSessionId ?? `cast-${NORA}`,
        characterName: 'Nora',
        bio: { name: 'Nora', look: 'denim jacket, brown hair', personality: 'calm' },
        tone: 'melancholy',
        content: 'suggestive',
        playAs: 'bio',
        story: [
          {
            id: 'a-door-appears-1',
            at: now - 120_000,
            kind: 'plot',
            title: 'A door appears',
            blurb: 'Nora finds a door on the pier.',
            stillStatus: 'completed',
            imageUrl: '/wardrobe-thumbs/outfit-cropped-sage-slip-dress.webp',
          },
          {
            id: 'wardrobe-change-3',
            at: now - 60_000,
            kind: 'plot',
            title: 'Wardrobe change',
            blurb: 'Nora changes on the pier.',
            stillStatus: 'running',
            promptId: 'p-nora-2',
          },
        ],
      },
    },
  });
}

test('story: a Cast switched on another page never inherits the previous lead’s scenes', async ({
  page,
}) => {
  await seedNoraReelTomasActive(page);
  await gotoStable(page, '/story');
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('story-continue-cast')).toContainText('Tomas', {
    timeout: 30_000,
  });
  // The library save runs on a short debounce.
  await page.waitForTimeout(2_500);
  expect(await sessionTitles(page, `cast-${TOMAS}`)).not.toContain('Wardrobe change');
  const live = await liveStory(page);
  expect(live.sessionId).toBe(`cast-${TOMAS}`);
  expect(live.titles).not.toContain('Wardrobe change');
  // Nora's reel is kept under her own session.
  expect(await sessionTitles(page, `cast-${NORA}`)).toEqual(['A door appears', 'Wardrobe change']);
  await expect(page.getByText('Wardrobe change')).toHaveCount(0);

  await page.reload();
  await dismissBlockingOverlays(page);
  await expect(page.getByTestId('story-continue-cast')).toContainText('Tomas', {
    timeout: 30_000,
  });
  await page.waitForTimeout(2_000);
  expect(await sessionTitles(page, `cast-${TOMAS}`)).not.toContain('Wardrobe change');
  await expect(page.getByText('Wardrobe change')).toHaveCount(0);
});
