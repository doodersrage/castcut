import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { closeStudioDb } from '@/lib/sqlite/studio-db';
import { readRunShadow, writeRunBundle } from '@/lib/sqlite/scene-run-bundles';
import { categoryLabel } from '@/lib/wardrobe/clothing-catalog-fields';
import type { DaySlot } from './planner';
import {
  normalizeRunBundle,
  plateGalleryEntries,
  RUN_BUNDLE_VERSION,
  takeDecisionDiffs,
  takeDecisionsFromBundle,
  takeInputDiffs,
  takeInputsFromBundle,
  type RunBundle,
  type TakeShadowReport,
} from './run-bundle';
import { planTakeModel, planTakeOutfit } from './take-plan';

const outfits = categoryLabel('outfit');
const catalog = [
  { value: '', label: 'Default' },
  { value: 'kit-romper', label: 'Black romper', group: outfits },
  { value: 'kit-jeans', label: 'Jeans and tee', group: outfits },
];
const slot = (extra: Partial<DaySlot> = {}) =>
  ({ id: 'evening', label: 'Evening', location: 'kitchen', sceneHints: 'stirring a pot', ...extra }) as DaySlot;

const bundle: RunBundle = {
  version: RUN_BUNDLE_VERSION,
  runId: 'run-1',
  castId: 'mara',
  capturedAt: 1,
  settings: {
    model: 'sdxl' as never,
    dayMood: 'everyday',
    intimateEnabled: false,
    allowCompanions: false,
    bestEnginePerPose: false,
    clothingGender: 'women',
  },
  pagePlate: { hasPlate: true, plateSource: 'cast' },
  cast: [{ id: 'mara', name: 'Mara', version: 1, updatedAt: 1, traits: { sex: 'woman' } } as never],
  scenes: [
    { id: 's1', slot: slot() },
    { id: 's2', slot: slot(), dayMood: 'vacation', outfit: { customGarmentImageUrl: '/dress.png' } },
  ],
  metrics: { weakLayouts: [] },
};

const report = (sceneId: string, extra: Partial<TakeShadowReport> = {}): TakeShadowReport => ({
  runId: 'run-1',
  sceneId,
  slot: slot(),
  outfitScenes: [],
  workingSlots: [slot()],
  latestSlots: [slot()],
  scriptShot: false,
  settings: { allowCompanions: false },
  look: { lookCharacterId: 'mara', hasPlate: true, plateSource: 'cast', customGarment: false },
  decisions: { stillModel: 'sdxl', queueModel: 'sdxl', partner: 'none', poseGuideSkip: false },
  ...extra,
});

describe('a run’s bundle (Phase 3, step 2)', () => {
  it('reads back from JSON, and refuses what isn’t one', () => {
    assert.deepEqual(normalizeRunBundle(JSON.parse(JSON.stringify(bundle)))?.scenes.length, 2);
    assert.equal(normalizeRunBundle({ ...bundle, version: 2 }), null);
    assert.equal(normalizeRunBundle({ ...bundle, settings: {} }), null);
    assert.equal(normalizeRunBundle(null), null);
  });

  it('a take’s settings and look: its Scene’s own over the page’s', () => {
    // A Scene never opened has no settings of its own: none (as its take on the page reads).
    assert.deepEqual(takeInputsFromBundle(bundle, 's1'), {
      settings: { dayMood: undefined, intimateMix: undefined, allowCompanions: false, partnerCharacterId: undefined },
      look: { lookCharacterId: 'mara', hasPlate: true, plateSource: 'cast', customGarment: false },
    });
    const s2 = takeInputsFromBundle(bundle, 's2');
    assert.equal(s2.settings.dayMood, 'vacation');
    assert.equal(s2.look.customGarment, true);
  });

  it('decides as the page’s plan does from the same inputs', () => {
    const deps = { catalog, hasPackshot: () => true, inventory: null };
    const fromBundle = takeDecisionsFromBundle(bundle, report('s1'), deps);
    // The page: the same plan functions on its own inputs.
    const outfit = planTakeOutfit({
      target: slot(),
      catalog,
      lookHasPlate: true,
      plateSource: 'cast',
      customGarment: false,
      dayMood: 'everyday',
      scene: { scenes: [], activeSceneId: 's1' },
      workingSlots: [slot()],
      latestSlots: [slot()],
      salt: 'mara',
      hasPackshot: () => true,
    });
    const model = planTakeModel({
      slot: outfit.target,
      pickedModel: 'sdxl' as never,
      dayMood: 'everyday',
      intimateEnabled: false,
      intimateMix: undefined,
      allowCompanions: false,
      bestEnginePerPose: false,
      hasPlate: true,
      inventory: null,
      weakLayouts: () => new Set(),
      poseReport: () => undefined,
    });
    assert.equal(fromBundle.wardrobeId, outfit.wardrobeId);
    assert.ok(fromBundle.wardrobeId, 'a kit picked');
    assert.equal(fromBundle.stillModel, model.stillModel);
    assert.equal(fromBundle.partner, 'none');
  });

  it('says where the page and the bundle differ', () => {
    assert.deepEqual(
      takeDecisionDiffs(report('s1').decisions, { ...report('s1').decisions, stillModel: 'flux-dev' }),
      ['stillModel: sdxl ≠ flux-dev']
    );
    const derived = takeInputsFromBundle(bundle, 's1');
    assert.deepEqual(takeInputDiffs({ settings: report('s1').settings, look: report('s1').look }, derived), []);
    assert.deepEqual(
      takeInputDiffs({ settings: report('s1').settings, look: { ...report('s1').look, hasPlate: false } }, derived),
      ['look.hasPlate: false ≠ true']
    );
  });
});

describe('the server’s shadow check of a run’s takes', () => {
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  let tempDir = '';
  beforeEach(() => {
    closeStudioDb();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cps-bundle-'));
    process.env.PROMPT_DATA_DIR = tempDir;
  });
  afterEach(() => {
    closeStudioDb();
    if (previousDataDir === undefined) delete process.env.PROMPT_DATA_DIR;
    else process.env.PROMPT_DATA_DIR = previousDataDir;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('records a take that agrees with the bundle, and one that doesn’t', async () => {
    const { shadowTakeDecisions } = await import('./run-bundle-server');
    writeRunBundle('global', 'run-1', bundle);
    // The server's own catalog and packshots pick the kit; the page reports the one it picked.
    const first = await shadowTakeDecisions('global', report('s1'));
    assert.ok(first.ok);
    const server = first.ok ? first.server : report('s1').decisions;
    const picked = server.wardrobeId;
    // With a plate, the engine sent is its Edit-capable variant (the page's take sends it too).
    assert.notEqual(server.queueModel, 'sdxl');
    const agreed = await shadowTakeDecisions('global', report('s1', { decisions: server }));
    assert.deepEqual(agreed.ok && agreed.diffs, []);
    const differs = await shadowTakeDecisions(
      'global',
      report('s2', { decisions: { ...report('s2').decisions, wardrobeId: picked } })
    );
    assert.ok(differs.ok && differs.diffs.some(diff => diff.startsWith('settings.dayMood')));
    assert.equal(readRunShadow('global', 'run-1').length, 3);
    assert.deepEqual(await shadowTakeDecisions('global', report('s1', { runId: 'nope' })), {
      ok: false,
      error: 'No bundle for that run.',
    });
  });
});

describe('a bundle’s queue settings (Phase 3)', () => {
  it('a bundle saved before them loads without (the server cannot render that run)', () => {
    const loaded = normalizeRunBundle(JSON.parse(JSON.stringify(bundle)));
    assert.ok(loaded);
    assert.equal('queue' in loaded!, false);
  });

  it('kept when well formed; workflow files without an id or a graph dropped', () => {
    const loaded = normalizeRunBundle({
      ...bundle,
      queue: {
        shared: { model: 'qwen-image-edit-2511' },
        comfyUi: { apiUrl: 'http://127.0.0.1:8188' },
        workflowFiles: [
          { id: 'wf-1', name: 'One', json: '{}' },
          { id: 'wf-2', name: 'No graph' },
          'junk',
        ],
        queueParams: { enabled: true, steps: '8' },
        samplerMemory: { 'sdxl-base': { cfg: '5', updatedAt: 1 } },
      },
    });
    assert.deepEqual(
      loaded?.queue?.workflowFiles.map(file => file.id),
      ['wf-1']
    );
    assert.equal(loaded?.queue?.shared.model, 'qwen-image-edit-2511');
    assert.equal(loaded?.queue?.queueParams?.steps, '8');
    assert.equal(loaded?.queue?.samplerMemory?.['sdxl-base']?.cfg, '5');
  });

  it('malformed queue settings are left out, the rest of the bundle kept', () => {
    for (const queue of [null, 'x', { shared: {} }, { shared: [], comfyUi: {} }]) {
      const loaded = normalizeRunBundle({ ...bundle, queue });
      assert.ok(loaded, `bundle kept with queue ${JSON.stringify(queue)}`);
      assert.equal(loaded!.queue, undefined);
      assert.equal(loaded!.scenes.length, 2);
    }
    const noFiles = normalizeRunBundle({ ...bundle, queue: { shared: {}, comfyUi: {} } });
    assert.deepEqual(noFiles?.queue?.workflowFiles, []);
    assert.equal(noFiles?.queue?.queueParams, undefined);
  });
});

describe('a bundle’s page section (Phase 3)', () => {
  it('older bundles have none; malformed is left out; the gallery keeps entries with an id', () => {
    assert.equal(normalizeRunBundle(JSON.parse(JSON.stringify(bundle)))?.page, undefined);
    assert.equal(normalizeRunBundle({ ...bundle, page: { sceneTool: 'x' } })?.page, undefined);
    const page = normalizeRunBundle({
      ...bundle,
      page: { sceneTool: { scenes: [] }, gallery: [{ id: 'g1' }, { nope: 1 }], leanChrome: true },
    })?.page;
    assert.deepEqual(page?.gallery.map(entry => entry.id), ['g1']);
    assert.equal(page?.leanChrome, true);
  });

  it('the plates’ gallery entries: every look’s keepers, nothing else', () => {
    const cast = [
      { id: 'a', looks: [{ id: 'l1', keeperEntryIds: ['k1', ' k2 '] }, { id: 'l2' }] },
      { id: 'b', looks: [{ id: 'l3', keeperEntryIds: ['k3'] }] },
    ] as never;
    const gallery = ['k1', 'k2', 'k3', 'other'].map(id => ({ id })) as never;
    assert.deepEqual(
      plateGalleryEntries(cast, gallery).map(entry => entry.id),
      ['k1', 'k2', 'k3']
    );
  });
});
