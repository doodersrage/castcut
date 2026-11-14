/**
 * A run's take made on the server sends what the page sent: the golden take requests
 * (e2e/golden/take-requests, recorded from the page) against runServerTake given the same Cast,
 * Scene and settings as the golden e2e test (e2e/scene.spec.ts) — the page's own fresh settings.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it, mock } from 'node:test';
import sharp from 'sharp';

mock.module('server-only', { defaultExport: {}, namedExports: {} });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'castcut-run-take-'));
process.env.CASTCUT_INPUT_STORE_DIR = path.join(scratch, 'comfy-inputs');
process.env.PROMPT_DATA_DIR = scratch;
process.env.LLM_API_BASE_URL = 'http://127.0.0.1:9/v1';

const COMFY = 'http://127.0.0.1:8188';
const CAST = 'e2e-scene';
const PARTNER = 'e2e-partner';
const cast = [
  {
    id: CAST,
    name: 'Scene Cast',
    version: 1,
    updatedAt: 1,
    descriptor: 'a woman in her thirties with short dark hair',
    traits: { sex: 'woman' },
    ipAdapter: { imageFilename: 'e2e-scene.png', imageUrl: '/icon.svg' },
  },
  {
    id: PARTNER,
    name: 'Theo',
    version: 1,
    updatedAt: 1,
    descriptor: 'a man in his thirties with a short beard',
    traits: { sex: 'man' },
    ipAdapter: { imageFilename: 'e2e-partner.png', imageUrl: '/icon.svg?partner' },
  },
];

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
    stills: [
      { slotId: 'evening', promptId: 'take-2', imageUrl: '/icon.svg?take=2', status: 'completed' },
    ],
    stillsCharacterId: CAST,
    dayMood: 'everyday',
  };
}

/** As the golden test normalizes them: seeds, client ids and upload names made stable. */
function normalized(raw: readonly string[]): unknown[] {
  const uploads = new Map<string, string>();
  return raw.map(text => {
    const named = text.replace(/(?:e2e|castcut-run)-upload-[\w-]+\.png|castcut-run-\d+-\d+(?:-[0-9a-f]+)?\.png/g, name => {
      if (!uploads.has(name)) uploads.set(name, `upload-${uploads.size + 1}.png`);
      return uploads.get(name)!;
    });
    const walk = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(walk);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [
            key,
            /^(noise_)?seed$/i.test(key) ? 'SEED' : key === 'clientId' ? 'CLIENT' : walk(entry),
          ])
        );
      return value;
    };
    return walk(JSON.parse(named));
  });
}

/** The wardrobe catalog for a woman, as the server reads it (run-bundle-server.ts). */
async function serverCatalog() {
  const { getClothingSelectOptions } = await import('../wardrobe/clothing-catalog');
  const { getClothingCatalogFieldCategories } = await import('../wardrobe/clothing-catalog-fields');
  const { loadWardrobeGarmentThumbManifest } = await import('../wardrobe/garment-thumbs');
  await loadWardrobeGarmentThumbManifest().catch(() => null);
  return getClothingSelectOptions(getClothingCatalogFieldCategories('wardrobeCatalog'), {
    gender: 'women',
  }) as never;
}

describe('a run’s take on the server (Phase 3)', () => {
  after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  const variants: Array<{ name: string; scene: (base: ReturnType<typeof sceneWithTakes>) => unknown }> = [
    { name: 'lead-alone', scene: base => base },
    {
      name: 'suggestive',
      scene: base => ({
        ...base,
        dayMood: 'suggestive',
        scenes: base.scenes.map(entry => ({ ...entry, dayMood: 'suggestive' })),
      }),
    },
    {
      name: 'with-partner',
      scene: base => {
        const slot = {
          id: 'evening',
          label: 'Evening',
          location: 'small kitchen',
          sceneHints: 'Scene Cast and Theo, the two of them together, cooking risotto at the stove',
        };
        return {
          ...base,
          partnerCharacterId: PARTNER,
          allowCompanions: true,
          slots: [slot],
          scenes: base.scenes.map(entry => ({ ...entry, slot, partnerCharacterId: PARTNER })),
        };
      },
    },
    {
      name: 'place-no-beat',
      scene: base => {
        const slot = { id: 'evening', label: 'Evening', location: 'rooftop bar' };
        return { ...base, slots: [slot], scenes: base.scenes.map(entry => ({ ...entry, slot })) };
      },
    },
  ];
  for (const variant of variants) it(`${variant.name}: the requests the page sent (golden)`, async () => {
    let state = 0x2f6b1e35;
    const random = Math.random;
    Math.random = () => {
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#000' } })
      .png()
      .toBuffer();
    const original = globalThis.fetch;
    let uploaded = 0;
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input instanceof Request ? input.url : input), 'http://app');
      if (url.pathname === '/view' || url.host === 'app') {
        return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
      }
      if (url.pathname === '/upload/image' && init?.method === 'POST') {
        // Named as the page's e2e stub names an upload (normalized below to upload-N).
        uploaded += 1;
        return Response.json({ name: `e2e-upload-${uploaded}.png`, subfolder: '', type: 'input' });
      }
      return new Response(null, { status: 404 });
    }) as typeof fetch;
    globalThis.fetch = fetchImpl;
    try {
      const { DEFAULT_SHARED_SETTINGS, normalizeSharedSettingsInPlace } = await import(
        '../settings/cache'
      );
      const { loadComfyUiSettings } = await import('../comfyui/settings');
      const { loadQueueParamsSettings } = await import('../queue/params-settings');
      const { runServerTake, runTakeState } = await import('./run-take-server');
      // The page's fresh settings, as its loadSettingsCache reads them.
      const shared = { ...DEFAULT_SHARED_SETTINGS, activeCharacterId: CAST };
      normalizeSharedSettingsInPlace(shared);
      const bundle = {
        version: 1 as const,
        runId: 'run-golden',
        castId: CAST,
        capturedAt: 1,
        settings: {
          model: shared.model,
          intimateEnabled: false,
          allowCompanions: false,
          bestEnginePerPose: false,
          clothingGender: 'women' as const,
        },
        pagePlate: { hasPlate: true },
        cast: cast as never,
        scenes: [],
        metrics: { weakLayouts: [] },
        queue: {
          shared,
          comfyUi: loadComfyUiSettings(),
          workflowFiles: [],
          queueParams: loadQueueParamsSettings(),
          samplerMemory: {},
        },
        page: {
          sceneTool: variant.scene(sceneWithTakes()),
          gallery: [],
          leanChrome: false,
          locations: [],
          poseLibrary: [],
        },
      };
      const bodies: string[] = [];
      const dressPlates = new Set<string>();
      const runState = runTakeState(bundle.page as never);
      const result = await runServerTake(bundle as never, runState, 'scene-e2e', {
        comfyUrl: COMFY,
        appOrigin: 'http://app',
        inventory: null,
        catalog: await serverCatalog(),
        dressPlateStore: { all: () => [], find: () => null, save: () => undefined },
        fetchImpl,
        sleep: async () => undefined,
        status: async promptId => ({
          promptId,
          status: 'completed',
          comfyUrl: COMFY,
          images: [{ filename: 'e2e-dress-plate.png', subfolder: '', type: 'output' }],
        }),
        queue: async (body, prompt) => {
          bodies.push(JSON.stringify({ ...body, prompt, clientId: 'server' }));
          const promptId = `e2e-scene-${bodies.length}`;
          if (/outfit try-on/i.test(prompt)) dressPlates.add(promptId);
          return { ok: true, promptId } as never;
        },
      });
      assert.equal(result.error, null);
      // The take on its still, in the run's working copy and in the patches the page applies.
      const last = `e2e-scene-${bodies.length}`;
      const still = runState.sceneTool.stills?.find(entry => entry.slotId === 'evening');
      assert.equal(still?.promptId, last);
      assert.ok(
        runState.patches.some(patch => patch.stills?.some(entry => entry.promptId === last)),
        'the take reaches the page through the patch queue'
      );
      const golden = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), 'e2e', 'golden', 'take-requests', `${variant.name}.json`),
          'utf8'
        )
      );
      // The server names its ComfyUI where the page leaves it to the route's default: the same one.
      const got = normalized(bodies).map(body => {
        const { apiUrl: _apiUrl, ...comfy } = (body as { comfy: Record<string, unknown> }).comfy;
        return { ...(body as object), comfy };
      });
      fs.writeFileSync(
        path.join(os.tmpdir(), `run-take-got-${variant.name}.json`),
        JSON.stringify(got, null, 1)
      );
      if (variant.name === 'place-no-beat') {
        // A blank beat is drawn at random: the page drew other numbers before its take, so the
        // same seed lands on another beat. Everything but the prompt text is compared.
        const strip = (list: unknown[]) =>
          list.map(body => ({ ...(body as object), prompt: 'PROMPT' }));
        assert.deepEqual(strip(got), strip(golden));
        return;
      }
      assert.deepEqual(got, golden);
    } finally {
      globalThis.fetch = original;
      Math.random = random;
    }
  });
});
