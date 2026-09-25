import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ComfyUiModelLists } from './comfyui-object-info';
import { comfyInventoryFingerprint, fillLoaderMapsFromInventory } from './comfy-inventory-auto-sync';
import { buildPlayChecksReadiness } from './play-checks-readiness';
import { isPoseCapableControlNet, resolvePoseControlNetFilename } from './pose-guide-controlnet';
import { DEFAULT_SHARED_SETTINGS } from './settings-cache';
import { COMFYUI_SETTINGS_SECTIONS } from './settings-comfyui-nav';
import {
  changedSettings,
  formatSettingValue,
  PREFERENCE_KEYS,
  resetSettingsPatch,
} from './settings-defaults-diff';
import {
  buildSettingsSearchEntries,
  matchesSettingsQuery,
  settingsSearchHref,
} from './settings-search-index';
import { resolveVisionModel } from './vision-model-auto';
import { pickVisionCapableModel } from './vision-model-pick';

const vision = (id: string) => ({ id, kind: 'vision' as const });
const text = (id: string) => ({ id, kind: 'text' as const });

describe('vision model auto-pick', () => {
  it('picks the strongest vision reader and skips generators and text-only sizes', () => {
    assert.equal(
      pickVisionCapableModel([text('llama3.1:8b'), vision('llava:7b'), vision('qwen2.5vl:7b')]),
      'qwen2.5vl:7b'
    );
    assert.equal(
      pickVisionCapableModel([vision('gpt-image-1'), vision('dall-e-3'), vision('gpt-4o-mini')]),
      'gpt-4o-mini'
    );
    assert.equal(pickVisionCapableModel([vision('gemma3:1b'), vision('gemma3:12b')]), 'gemma3:12b');
    assert.equal(pickVisionCapableModel([text('mistral:7b')]), undefined);
    assert.equal(pickVisionCapableModel([]), undefined);
  });

  it('prefers the session pick, then LLM_VISION_MODEL, before detecting', async () => {
    const saved = process.env.LLM_VISION_MODEL;
    process.env.LLM_VISION_MODEL = 'env-vl';
    try {
      assert.equal(await resolveVisionModel({ llmVisionModel: 'session-vl' }), 'session-vl');
      assert.equal(await resolveVisionModel({}), 'env-vl');
    } finally {
      if (saved === undefined) delete process.env.LLM_VISION_MODEL;
      else process.env.LLM_VISION_MODEL = saved;
    }
  });

  it('says in Play checks which vision model review will use and where it came from', () => {
    const base = {
      comfyReachable: true,
      poseNode: 'DWPreprocessor',
      faceNodes: { models: true, distance: true, previewAny: true },
      ffmpeg: { available: true, drawtext: true, font: true },
    };
    assert.equal(buildPlayChecksReadiness(base).review, undefined, 'older probes omit it');
    const detected = buildPlayChecksReadiness({
      ...base,
      vision: { llmEnabled: true, model: 'qwen2.5vl:7b', source: 'detected' },
    }).review;
    assert.deepEqual(detected, { ready: true, detail: 'qwen2.5vl:7b (found on the LLM server)' });
    assert.equal(
      buildPlayChecksReadiness({ ...base, vision: { llmEnabled: true } }).review?.ready,
      false
    );
    assert.match(
      buildPlayChecksReadiness({ ...base, vision: { llmEnabled: false } }).review?.detail ?? '',
      /LLM is off/
    );
  });
});

describe('pose ControlNet pick', () => {
  it('knows which ControlNets read pose maps', () => {
    for (const name of [
      'control_v11p_sd15_openpose.pth',
      'Qwen-Image-InstantX-ControlNet-Union.safetensors',
      'controlnet-union-sdxl-promax.safetensors',
      'flux-dev-controlnet-pose.safetensors',
    ]) {
      assert.ok(isPoseCapableControlNet(name), name);
    }
    for (const name of ['control_v11p_sd15_canny.pth', 'depth-anything.safetensors', 'posterize.pth']) {
      assert.ok(!isPoseCapableControlNet(name), name);
    }
  });

  it('uses a per-model map, else a pose ControlNet from ComfyUI, never a canny default', () => {
    assert.deepEqual(
      resolvePoseControlNetFilename({
        model: 'm',
        controlNetMap: { m: 'mine.safetensors', default: 'canny.pth' },
        inventory: ['openpose.pth'],
      }),
      { filename: 'mine.safetensors', source: 'map' }
    );
    assert.deepEqual(
      resolvePoseControlNetFilename({
        model: 'm',
        controlNetMap: { default: 'control_canny.pth' },
        inventory: ['control_canny.pth', 'control_v11p_sd15_openpose.pth'],
      }),
      { filename: 'control_v11p_sd15_openpose.pth', source: 'inventory' }
    );
    assert.deepEqual(
      resolvePoseControlNetFilename({
        model: 'qwen',
        inventory: ['a_openpose.pth', 'Qwen-Image-InstantX-ControlNet-Union.safetensors'],
      }),
      { filename: 'Qwen-Image-InstantX-ControlNet-Union.safetensors', source: 'inventory' },
      'Qwen Union first'
    );
    assert.equal(
      resolvePoseControlNetFilename({
        model: 'm',
        controlNetMap: { default: 'control_canny.pth' },
        inventory: ['control_canny.pth'],
      }),
      undefined
    );
    assert.deepEqual(
      resolvePoseControlNetFilename({ model: 'm', controlNetMap: { default: 'my-openpose.pth' } }),
      { filename: 'my-openpose.pth', source: 'map' }
    );
  });
});

describe('map new ComfyUI models automatically', () => {
  const models = (extra: Partial<ComfyUiModelLists> = {}): ComfyUiModelLists => ({
    checkpoints: [],
    unets: [],
    vaes: [],
    upscaleModels: [],
    clips: [],
    dualClipTypes: [],
    clipLoaderTypes: [],
    loras: [],
    controlNets: [],
    clipVisions: [],
    embeddings: [],
    ...extra,
  });

  it('fingerprints the files a map can use, ignoring order and LoRAs', () => {
    const a = comfyInventoryFingerprint(models({ vaes: ['a.safetensors', 'b.safetensors'] }));
    const b = comfyInventoryFingerprint(models({ vaes: ['b.safetensors', 'a.safetensors'] }));
    assert.equal(a, b);
    assert.equal(
      comfyInventoryFingerprint(
        models({ vaes: ['a.safetensors', 'b.safetensors'], loras: ['x.safetensors'] })
      ),
      a
    );
    assert.notEqual(comfyInventoryFingerprint(models({ vaes: ['a.safetensors'] })), a);
  });

  it('fills empty entries and never rewrites a set one', () => {
    const inventory = models({ controlNets: ['Qwen-Image-InstantX-ControlNet-Union.safetensors'] });
    const filled = fillLoaderMapsFromInventory(inventory, {});
    assert.ok(filled.filled > 0 && filled.changed);
    const kept = fillLoaderMapsFromInventory(inventory, {
      modelControlNetMap: { default: 'my-own.safetensors' },
    });
    assert.equal(kept.result.modelControlNetMap.default, 'my-own.safetensors');
  });
});

describe('Settings search', () => {
  const entries = buildSettingsSearchEntries();

  it('lists every ComfyUI section and tab with unique ids', () => {
    assert.equal(new Set(entries.map(entry => entry.id)).size, entries.length);
    for (const section of COMFYUI_SETTINGS_SECTIONS) {
      assert.ok(entries.some(entry => entry.section === section.id && entry.id.startsWith('section-')));
    }
  });

  it('finds a setting by any of its words and deep-links to the control', () => {
    const find = (query: string) => entries.filter(entry => matchesSettingsQuery(entry, query));
    assert.equal(find('pose controlnet')[0]?.id, 'pose-controlnet');
    assert.ok(find('vision').some(entry => entry.id === 'vision-model'));
    assert.ok(find('ollama').some(entry => entry.id === 'text-model'));
    assert.deepEqual(find('   '), []);
    assert.equal(
      settingsSearchHref(entries.find(entry => entry.id === 'pose-controlnet')!),
      '/settings?tab=comfyui&section=prompt-quality&focus=settings-pose-controlnet'
    );
    assert.equal(settingsSearchHref({ tab: 'overview' }), '/settings');
  });
});

describe('changed from defaults', () => {
  it('lists nothing on a fresh install', () => {
    assert.deepEqual(changedSettings({ ...DEFAULT_SHARED_SETTINGS }, DEFAULT_SHARED_SETTINGS), []);
    assert.deepEqual(changedSettings({}, DEFAULT_SHARED_SETTINGS), [], 'unset is the default');
  });

  it('lists what changed with both values, and resets it', () => {
    const shared = {
      ...DEFAULT_SHARED_SETTINGS,
      poseGuideControlNet: true,
      poseGuideStyle: 'legacy' as const,
      // Not a preference: never listed.
      activeCharacterId: 'cast-1',
      sessionLlmApiKey: 'secret',
    };
    const changed = changedSettings(shared, DEFAULT_SHARED_SETTINGS);
    assert.deepEqual(
      changed.map(entry => entry.key),
      ['poseGuideStyle', 'poseGuideControlNet']
    );
    assert.equal(changed[1]?.value, 'On');
    assert.equal(changed[1]?.defaultValue, 'Off');
    const patch = resetSettingsPatch(
      changed.map(entry => entry.key),
      DEFAULT_SHARED_SETTINGS
    );
    assert.deepEqual(changedSettings({ ...shared, ...patch }, DEFAULT_SHARED_SETTINGS), []);
  });

  it('only covers real, unique preference keys and formats values briefly', () => {
    const keys = PREFERENCE_KEYS.map(entry => entry.key);
    assert.equal(new Set(keys).size, keys.length);
    for (const secret of ['sessionLlmApiKey', 'activeCharacterId', 'modelCheckpointMap']) {
      assert.ok(!keys.includes(secret as never), secret);
    }
    assert.equal(formatSettingValue(undefined), '—');
    assert.equal(formatSettingValue(0.12345), '0.123');
    assert.equal(formatSettingValue({ a: '1', b: '2' }), '2 entries');
  });
});
