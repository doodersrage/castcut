/**
 * A Scene run rendered by the server (run-loop-server.ts): an episode run over two Scenes, a
 * take that fails its checks tried again and the best kept; and a run picked up again after the
 * server stopped mid-take waits for that take — never a second.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it, mock } from 'node:test';
import sharp from 'sharp';

mock.module('server-only', { defaultExport: {}, namedExports: {} });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'castcut-run-loop-'));
process.env.CASTCUT_INPUT_STORE_DIR = path.join(scratch, 'comfy-inputs');
process.env.PROMPT_DATA_DIR = scratch;
process.env.LLM_API_BASE_URL = 'http://127.0.0.1:9/v1';

const COMFY = 'http://127.0.0.1:8188';
const CAST = 'e2e-scene';
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
];

const scene = (id: string, name: string, sceneHints: string) => ({
  id,
  castId: CAST,
  name,
  slot: { id: 'evening', label: 'Evening', location: 'small kitchen', sceneHints },
  dayMood: 'everyday',
  takes: [],
  createdAt: 1,
  updatedAt: 1,
});

function sceneTool() {
  const first = scene('s1', 'Kitchen', 'stirring a pot of risotto at the stove');
  return {
    isolateSubject: false,
    scenes: [first, scene('s2', 'Window', 'looking out of the window with a cup of tea')],
    activeSceneId: 's1',
    slots: [first.slot],
    stills: [],
    stillsCharacterId: CAST,
    dayMood: 'everyday',
    run: {
      id: 'run-1',
      castId: CAST,
      label: 'Two Scenes',
      items: [
        { sceneId: 's1', include: true },
        { sceneId: 's2', include: true },
      ],
      maxTakes: 10,
      maxMinutes: 600,
      skipKept: false,
      state: 'prepared',
      position: 0,
      log: [],
      createdAt: 1,
      updatedAt: 1,
      auto: { keep: true, redo: 1, animate: false },
    },
  };
}

async function harness(edit: (tool: ReturnType<typeof sceneTool>) => void = () => undefined) {
  const { DEFAULT_SHARED_SETTINGS, normalizeSharedSettingsInPlace } = await import(
    '../settings/cache'
  );
  const { loadComfyUiSettings } = await import('../comfyui/settings');
  const { loadQueueParamsSettings } = await import('../queue/params-settings');
  const shared = { ...DEFAULT_SHARED_SETTINGS, activeCharacterId: CAST };
  normalizeSharedSettingsInPlace(shared);
  const bundle = {
    version: 1 as const,
    runId: 'run-1',
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
      sceneTool: (() => {
        const tool = sceneTool();
        edit(tool);
        return tool;
      })(),
      gallery: [],
      leanChrome: false,
      locations: [],
      poseLibrary: [],
    },
  };
  const png = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#000' } })
    .png()
    .toBuffer();
  let uploaded = 0;
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input), 'http://app');
    if (url.pathname === '/view' || url.host === 'app') {
      return new Response(new Uint8Array(png), { headers: { 'content-type': 'image/png' } });
    }
    if (url.pathname === '/upload/image' && init?.method === 'POST') {
      uploaded += 1;
      return Response.json({ name: `up-${uploaded}.png`, subfolder: '', type: 'input' });
    }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  const queued: string[] = [];
  const patches: unknown[] = [];
  let saved: unknown = null;
  const deps = {
    comfyUrl: COMFY,
    appOrigin: 'http://app',
    inventory: null,
    catalog: [],
    dressPlateStore: { all: () => [], find: () => null, save: () => undefined },
    fetchImpl,
    sleep: async () => undefined,
    status: async (promptId: string) => ({
      promptId,
      status: 'completed' as const,
      comfyUrl: COMFY,
      images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }],
    }),
    queue: async (_body: unknown, prompt: string) => {
      queued.push(prompt);
      return { ok: true, promptId: `job-${queued.length}` } as never;
    },
    jobStatus: async (promptId: string) => ({
      promptId,
      status: 'completed' as const,
      comfyUrl: COMFY,
      images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }],
    }),
    saveState: (state: unknown) => {
      saved = JSON.parse(JSON.stringify(state));
    },
    appendPatch: (patch: unknown) => patches.push(JSON.parse(JSON.stringify(patch))),
  };
  return { bundle, deps, queued, patches, saved: () => saved };
}

describe('a Scene run on the server (Phase 3, step 8)', () => {
  after(() => fs.rmSync(scratch, { recursive: true, force: true }));

  it('two Scenes: a take that fails its checks tried again, the best kept, the page patched', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued, patches } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      let checked = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        // The first take of the first Scene misses its outfit; every other take passes.
        checkTake: async () => {
          checked += 1;
          return checked === 1
            ? { outfitChecked: true, outfitMiss: 'a red dress', face: 0.7 }
            : { outfitChecked: true, face: 0.8 };
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      assert.equal(run?.attempts?.s1, 2, 'the Kitchen tried again once');
      const stills = queued.filter(prompt => !/outfit try-on/i.test(prompt));
      assert.equal(stills.length, 3, 'three stills: Kitchen twice, Window once');
      const scenes = state.sceneTool.scenes!;
      const kitchen = scenes.find(entry => entry.id === 's1')!;
      assert.equal(kitchen.takes.length, 2);
      assert.ok(kitchen.keptTakeId, 'a take kept');
      assert.notEqual(
        kitchen.keptTakeId,
        kitchen.takes[0]!.id,
        'the passing take kept, not the one that missed'
      );
      assert.ok(scenes.find(entry => entry.id === 's2')?.keptTakeId);
      assert.equal(run?.flagged, undefined, 'both kept takes passed');
      // The page hears of every take, with its checks, and of the run as it went.
      const takes = patches.flatMap(patch => (patch as { takes?: unknown[] }).takes ?? []);
      assert.equal(takes.length, 3);
      assert.ok(takes.every(take => (take as { playChecks?: unknown }).playChecks));
      assert.equal((patches.at(-1) as { run: { state: string } }).run.state, 'done');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a Preview run: each Scene once on the quick engine, unchecked, marked preview, nothing kept', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued, patches } = await harness(tool => {
      Object.assign(tool.run, { tier: 'preview', auto: { keep: false, redo: 0, animate: false } });
    });
    const bodies: string[] = [];
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const { PREVIEW_ENGINE } = await import('./run-tier');
      const state = serverRunState(bundle as never)!;
      let checked = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        queue: async (body: unknown, prompt: string) => {
          bodies.push(JSON.stringify(body));
          return deps.queue(body, prompt);
        },
        checkTake: async () => {
          checked += 1;
          return { outfitChecked: true, face: 0.8 };
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      assert.equal(checked, 0, 'a preview is not checked');
      const stills = queued.filter(prompt => !/outfit try-on/i.test(prompt));
      assert.equal(stills.length, 2, 'one take a Scene');
      for (const entry of state.sceneTool.scenes!) {
        assert.equal(entry.keptTakeId, undefined, `${entry.name}: nothing kept`);
        assert.deepEqual(
          entry.takes.map(take => take.tier),
          ['preview']
        );
      }
      const takes = patches.flatMap(
        patch => (patch as { takes?: { model?: string }[] }).takes ?? []
      );
      assert.deepEqual(
        takes.map(take => take.model),
        [PREVIEW_ENGINE, PREVIEW_ENGINE]
      );
      // The page's Scenes carry the mark too (the patch sends the Scene whole).
      const lastScenes = patches
        .map(patch => (patch as { scene?: { id: string; takes: { tier?: string }[] } }).scene)
        .filter(Boolean);
      assert.ok(lastScenes.some(scene => scene!.takes.some(take => take.tier === 'preview')));
      // Rendered on 2.1 Turbo: it queues on Rapid AIO's graph, which the runtime turns into 2.1's
      // eight-step Turbo pass (runtime-for-model.ts).
      assert.equal(bodies.length, 2);
      for (const body of bodies) {
        assert.match(body, /"qwenRenderer":"qwen-image-2\.1"/);
        assert.match(body, /"qwenImage21EightStep":"turbo"/);
      }
    } finally {
      globalThis.fetch = original;
    }
  });

  it('the adult check on a Suggestive take: withheld, off its Scene, redone once with the coverage line', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued, patches } = await harness(tool => {
      for (const entry of tool.scenes) (entry as { dayMood: string }).dayMood = 'suggestive';
      tool.dayMood = 'suggestive';
      Object.assign(tool.run, { items: [{ sceneId: 's1', include: true }] });
    });
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      const asked: Array<{ clothed: boolean; coveredTake: boolean }> = [];
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        checkTake: async () => ({ face: 0.8 }),
        // The first take shows bare skin; the covered one passes.
        adultGate: async (input: { clothed: boolean; coveredTake: boolean }) => {
          asked.push({ clothed: input.clothed, coveredTake: input.coveredTake });
          return asked.length === 1
            ? { verdict: 'requeue', reason: 'bare chest', cause: 'bare' }
            : { verdict: 'pass', reason: 'clearly adult (95%)' };
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(asked, [
        { clothed: true, coveredTake: false },
        { clothed: true, coveredTake: true },
      ]);
      const stills = queued.filter(prompt => !/outfit try-on/i.test(prompt));
      assert.equal(stills.length, 2, 'rendered again once');
      assert.match(stills[1]!, /cover/i, 'the redo says the coverage line');
      const kitchen = state.sceneTool.scenes!.find(entry => entry.id === 's1')!;
      assert.equal(kitchen.takes.length, 1, 'the withheld take is off the Scene');
      assert.equal(kitchen.keptTakeId, kitchen.takes[0]!.id);
      const takes = patches.flatMap(
        patch => (patch as { takes?: { adultCheck?: { state: string; covered?: boolean } }[] }).takes ?? []
      );
      assert.deepEqual(
        takes.map(take => [take.adultCheck?.state, take.adultCheck?.covered ?? false]),
        [
          ['withheld', false],
          ['passed', true],
        ]
      );
      assert.equal(state.gateRedo?.s1, undefined);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('the adult check withholds the redo too: the Scene fails, nothing kept; Everyday is never asked', async () => {
    const original = globalThis.fetch;
    const { bundle, deps } = await harness(tool => {
      // The second Scene (not the open one: the page's working copy is the open Scene's mood).
      (tool.scenes[1] as { dayMood: string }).dayMood = 'suggestive';
    });
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      let asked = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        adultGate: async (input: { strongTake: boolean }) => {
          asked += 1;
          return {
            verdict: input.strongTake ? 'withhold' : 'requeue',
            reason: 'read as not clearly adult (40%)',
            cause: 'age',
          };
        },
      } as never);
      assert.equal(asked, 2, 'the Suggestive Scene twice; the Everyday one never');
      assert.equal(run?.outcomes?.s1, 'landed');
      assert.equal(run?.outcomes?.s2, 'failed');
      // Two jobs, two tries: never read as a duplicate.
      assert.equal(run?.attempts?.s2, 2);
      const window = state.sceneTool.scenes!.find(entry => entry.id === 's2')!;
      assert.deepEqual([window.takes.length, window.keptTakeId], [0, undefined]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a Preview queues the next draft while one renders; each lands on its own Scene; a restart waits for both', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued, saved } = await harness(tool => {
      Object.assign(tool.run, { tier: 'preview', auto: { keep: false, redo: 0, animate: false } });
    });
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      // The server stops while the first draft renders: by then the second is queued ahead.
      let stopping = false;
      const first = serverRunState(bundle as never)!;
      await runSceneRunOnServer(bundle as never, first, {
        ...deps,
        checkTake: async () => undefined,
        jobStatus: async (promptId: string) => {
          stopping = true;
          return { promptId, status: 'running' as const, comfyUrl: COMFY };
        },
        shouldStop: () => (stopping ? 'the server stopped' : null),
      } as never);
      const stopped = (saved() as { sceneTool: { run: { current?: { sceneId: string; promptId?: string }; ahead?: { sceneId: string; promptId?: string } } } })
        .sceneTool.run;
      assert.deepEqual(
        [stopped.current?.sceneId, stopped.ahead?.sceneId],
        ['s1', 's2'],
        'the next draft queued while the first rendered'
      );
      assert.ok(stopped.current?.promptId && stopped.ahead?.promptId);
      const stills = () => queued.filter(prompt => !/outfit try-on/i.test(prompt)).length;
      assert.equal(stills(), 2);

      // Picked up again: both jobs waited for, nothing queued again; each on its own Scene.
      const again = serverRunState(bundle as never, saved())!;
      const asked = new Set<string>();
      const run = await runSceneRunOnServer(bundle as never, again, {
        ...deps,
        checkTake: async () => undefined,
        jobStatus: async (promptId: string) => {
          asked.add(promptId);
          return {
            promptId,
            status: 'completed' as const,
            comfyUrl: COMFY,
            images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }],
          };
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      assert.equal(stills(), 2, 'no draft queued twice');
      assert.deepEqual([...asked].sort(), [stopped.current!.promptId!, stopped.ahead!.promptId!].sort());
      for (const [id, job] of [
        ['s1', stopped.current!.promptId!],
        ['s2', stopped.ahead!.promptId!],
      ] as const) {
        const entry = again.sceneTool.scenes!.find(scene => scene.id === id)!;
        assert.deepEqual(
          entry.takes.map(take => [take.promptId, take.tier]),
          [[job, 'preview']],
          `${id}: its own draft, marked preview`
        );
      }
      assert.equal(run?.ahead, undefined);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a Preview with a draft withheld by the adult check: redone after the one queued ahead, one job a try', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued } = await harness(tool => {
      for (const entry of tool.scenes) (entry as { dayMood: string }).dayMood = 'suggestive';
      tool.dayMood = 'suggestive';
      Object.assign(tool.run, { tier: 'preview', auto: { keep: false, redo: 0, animate: false } });
    });
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      let asked = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        checkTake: async () => undefined,
        adultGate: async () => {
          asked += 1;
          return asked === 1
            ? { verdict: 'requeue', reason: 'bare chest', cause: 'bare' }
            : { verdict: 'pass', reason: 'clearly adult (95%)' };
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      const stills = queued.filter(prompt => !/outfit try-on/i.test(prompt));
      assert.equal(stills.length, 3, 'Kitchen, Window ahead, Kitchen again');
      assert.match(stills[2]!, /cover/i);
      assert.equal(run?.attempts?.s1, 2);
      const kitchen = state.sceneTool.scenes!.find(entry => entry.id === 's1')!;
      assert.equal(kitchen.takes.length, 1, 'only the draft that passed');
      assert.equal(kitchen.takes[0]!.tier, 'preview');
      const window = state.sceneTool.scenes!.find(entry => entry.id === 's2')!;
      assert.equal(window.takes.length, 1);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('picked up after the server stopped mid-take: it waits for that take, never queues another', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued, saved } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      // The first run stops once its first take is queued (the server going down mid-render).
      let stopping = false;
      const first = serverRunState(bundle as never)!;
      await runSceneRunOnServer(bundle as never, first, {
        ...deps,
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        jobStatus: async (promptId: string) => {
          stopping = true;
          return { promptId, status: 'running' as const, comfyUrl: COMFY };
        },
        shouldStop: () => (stopping ? 'the server stopped' : null),
      } as never);
      const queuedBefore = queued.length;
      const inFlight = (saved() as { sceneTool: { run: { current?: { promptId?: string } } } })
        .sceneTool.run.current?.promptId;
      assert.ok(inFlight, 'the take in flight is in the saved record');

      // Picked up again from what was saved: the same job lands, nothing new queued for it.
      const again = serverRunState(bundle as never, saved())!;
      const asked: string[] = [];
      const run = await runSceneRunOnServer(bundle as never, again, {
        ...deps,
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        jobStatus: async (promptId: string) => {
          asked.push(promptId);
          return {
            promptId,
            status: 'completed' as const,
            comfyUrl: COMFY,
            images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }],
          };
        },
      } as never);
      assert.equal(asked[0], inFlight, 'it waited for the take already in flight');
      assert.equal(run?.state, 'done');
      // Before the stop: the Kitchen's take and the Window's queued ahead (Final queues ahead too,
      // 2026-11-19); after it, both waited for and nothing queued again.
      const stillsBefore = queued
        .slice(0, queuedBefore)
        .filter(prompt => !/outfit try-on/i.test(prompt)).length;
      assert.equal(stillsBefore, 2);
      const after = queued.slice(queuedBefore).filter(prompt => !/outfit try-on/i.test(prompt));
      assert.equal(after.length, 0, 'nothing queued twice after the restart');
      assert.equal(new Set(asked).size, 2, 'both takes in flight were waited for');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('an establishing shot (the empty place) renders on the server too, kept with no checks owed', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued } = await harness(tool => {
      (tool.scenes[0]!.slot as Record<string, unknown>).placeOnly = true;
      (tool.slots[0] as Record<string, unknown>).placeOnly = true;
      // A Suggestive short: the empty place still has nobody for the adult check to judge.
      for (const entry of tool.scenes) (entry as { dayMood: string }).dayMood = 'suggestive';
      tool.dayMood = 'suggestive';
    });
    const gated: string[] = [];
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        adultGate: async (input: { imageUrl: string }) => {
          gated.push(input.imageUrl);
          return { verdict: 'pass', reason: 'clearly adult (95%)' };
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      assert.equal(gated.length, 1, 'only the Window shot, which has someone in it');
      assert.match(queued[0]!, /kitchen/i, 'the empty kitchen first');
      assert.equal(run?.flagged?.s1, undefined, 'nobody to check in an empty place');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a Final take queued ahead is checked from what it was rendered from, like the first', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      const checked: Array<{ promptId: string; report: boolean }> = [];
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        // The server's checks need the take's report (s26: none on takes queued ahead — 42 of 43
        // went unchecked).
        checkTake: async ({ promptId, report }: { promptId: string; report?: unknown }) => {
          checked.push({ promptId, report: Boolean(report) });
          return report ? { outfitChecked: true, face: 0.8 } : undefined;
        },
      } as never);
      assert.equal(run?.state, 'done');
      const stills = queued.filter(prompt => !/outfit try-on/i.test(prompt));
      assert.equal(stills.length, 2, 'one take a Scene, the second queued ahead');
      assert.equal(checked.length, 2);
      assert.ok(
        checked.every(entry => entry.report),
        `every take checked with its report: ${JSON.stringify(checked)}`
      );
      assert.equal(run?.flagged, undefined, 'nothing flagged as not checked');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('ComfyUI restarted under a take: the lost job queued again once, waited for, no second take', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { COMFY_PROMPT_LOST_MESSAGE } = await import('../comfyui/status');
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      const lost = new Set<string>();
      const requeued: string[] = [];
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        // The first still is lost once (ComfyUI restarted); asked again, it has landed.
        jobStatus: async (promptId: string) => {
          if (promptId === 'job-1' && !lost.has(promptId)) {
            lost.add(promptId);
            return { promptId, status: 'error' as const, statusMessage: COMFY_PROMPT_LOST_MESSAGE, comfyUrl: COMFY };
          }
          return {
            promptId,
            status: 'completed' as const,
            comfyUrl: COMFY,
            images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }],
          };
        },
        requeueLost: async (promptId: string) => {
          requeued.push(promptId);
          return `${promptId}-again`;
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(requeued, ['job-1']);
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      assert.equal(queued.length, 2, 'two takes, one a Scene — the lost one sent again by the watcher');
      assert.ok(run?.log.some(entry => entry.event === 'resumed' && /lost job-1/.test(entry.detail ?? '')));
    } finally {
      globalThis.fetch = original;
    }
  });

  it('ComfyUI hung under a take: the run pauses in minutes and says so, the take still in flight', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      let clock = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        now: () => clock,
        sleep: async (ms: number) => {
          clock += ms;
        },
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        // 2026-11-19: frozen mid-job — every status call times out.
        jobStatus: async (promptId: string) => ({
          promptId,
          status: 'unknown' as const,
          statusMessage: 'The operation was aborted due to timeout',
          comfyUrl: COMFY,
        }),
      } as never);
      assert.equal(run?.state, 'paused');
      assert.match(run?.stopReason ?? '', /ComfyUI stopped answering \(3 min\)/);
      // Within the 3 minutes, not the 20-minute render timeout; the take is not called failed.
      assert.ok(clock >= 3 * 60_000 && clock < 4 * 60_000, `paused at ${clock} ms`);
      assert.equal(run?.current?.promptId, 'job-1');
      assert.equal(run?.outcomes?.s1, undefined);
      // The next Scene's take was queued ahead before ComfyUI hung; none after it.
      assert.equal(queued.length, 2);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a slow ComfyUI that answers again in time is waited for (loading models)', async () => {
    const original = globalThis.fetch;
    const { bundle, deps } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      let clock = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        now: () => clock,
        sleep: async (ms: number) => {
          clock += ms;
        },
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        // Silent for 2 min, then pending, silent 2 min more, then landed: never 3 min in a row.
        jobStatus: async (promptId: string) => {
          const at = clock % 300_000;
          if (clock < 600_000 && at < 120_000) {
            return { promptId, status: 'unknown' as const, comfyUrl: COMFY };
          }
          if (clock < 600_000) return { promptId, status: 'running' as const, comfyUrl: COMFY };
          return {
            promptId,
            status: 'completed' as const,
            comfyUrl: COMFY,
            images: [{ filename: `${promptId}.png`, subfolder: '', type: 'output' }],
          };
        },
      } as never);
      assert.equal(run?.state, 'done');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('a take that could not be queued (ComfyUI restarting) is tried again, not left paused', async () => {
    const original = globalThis.fetch;
    const { bundle, deps, queued } = await harness();
    globalThis.fetch = deps.fetchImpl;
    try {
      const { runSceneRunOnServer, serverRunState } = await import('./run-loop-server');
      const state = serverRunState(bundle as never)!;
      let refused = 0;
      const run = await runSceneRunOnServer(bundle as never, state, {
        ...deps,
        notQueuedRetryMs: 0,
        checkTake: async () => ({ outfitChecked: true, face: 0.8 }),
        queue: async (body: unknown, prompt: string) => {
          if (refused === 0) {
            refused += 1;
            return { ok: false, error: 'connect ECONNREFUSED' } as never;
          }
          return deps.queue(body, prompt);
        },
      } as never);
      assert.equal(run?.state, 'done');
      assert.deepEqual(run?.outcomes, { s1: 'landed', s2: 'landed' });
      assert.equal(queued.length, 2);
    } finally {
      globalThis.fetch = original;
    }
  });
});
