import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COMFY_IMAGE_MODELS } from '../comfy-models/client';
import {
  installedComfyModels,
  modelPickerGroup,
  modelPickerSections,
  modelPickerTags,
  pushRecentModel,
  toggleStarredModel,
} from './picker';

const byId = (id: string) => COMFY_IMAGE_MODELS.find(entry => entry.id === id)!;

describe('engine model picker', () => {
  it('lists only models whose weight file ComfyUI has', () => {
    const installed = installedComfyModels(
      COMFY_IMAGE_MODELS,
      {
        checkpoints: ['Qwen-Rapid-AIO-NSFW-v23.safetensors'],
        unets: ['qwen_image_2512_fp8_e4m3fn.safetensors'],
      } as never,
      {
        'qwen-image-2512-lightning-8': 'qwen_image_2512_fp8_e4m3fn.safetensors',
        'qwen-rapid-aio-nsfw': 'Qwen-Rapid-AIO-NSFW-v23.safetensors',
      }
    )!;
    assert.equal(installed.get('qwen-image-2512-lightning-8'), 'qwen_image_2512_fp8_e4m3fn.safetensors');
    assert.ok(installed.has('qwen-rapid-aio-nsfw'));
    assert.ok(!installed.has('sd15'));
    // ComfyUI unreachable: unknown, not "nothing installed".
    assert.equal(installedComfyModels(COMFY_IMAGE_MODELS, null), null);
  });

  it('groups by job and tags rows', () => {
    assert.equal(modelPickerGroup(byId('qwen-image-2512-lightning-8')), 'fast');
    assert.equal(modelPickerGroup(byId('qwen-image-2512')), 'quality');
    assert.equal(modelPickerGroup(byId('qwen-rapid-aio-sfw')), 'edit');
    assert.equal(modelPickerGroup(byId('qwen-rapid-aio-nsfw')), 'adult');
    assert.equal(modelPickerGroup(byId('wan-video')), 'video');
    // The label already says "(8-step)" — only the file precision is added.
    assert.deepEqual(
      modelPickerTags(byId('qwen-image-2512-lightning-8'), 'qwen_image_2512_fp8_e4m3fn.safetensors'),
      ['fp8']
    );
    assert.deepEqual(modelPickerTags({ id: 'qwen-image-2512-lightning-8', category: 'qwen' }), [
      '8-step',
    ]);
    assert.deepEqual(modelPickerTags({ id: 'qwen-rapid-aio-nsfw', category: 'qwen' }), ['NSFW']);
    assert.deepEqual(modelPickerTags(byId('qwen-rapid-aio-nsfw')), [], 'the label says NSFW');
  });

  it('keeps recents most-recent-first and toggles stars', () => {
    assert.deepEqual(pushRecentModel(['a', 'b', 'c'], 'b'), ['b', 'a', 'c']);
    assert.equal(pushRecentModel(['a', 'b', 'c', 'd', 'e'], 'f').length, 5);
    assert.deepEqual(toggleStarredModel(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(toggleStarredModel(['a', 'b'], 'a'), ['b']);
  });
});

describe('installedComfyModels: Turbo from its own checkpoint', () => {
  it('counts Turbo installed with only the int8 Turbo checkpoint', () => {
    const installed = installedComfyModels(COMFY_IMAGE_MODELS, {
      checkpoints: [],
      unets: ['qwen_image_2.1_turbo_int8_convrot.safetensors'],
    } as never);
    assert.ok(installed?.has('qwen-image-2.1-edit-turbo-8'));
    assert.ok(!installed?.has('qwen-image-2.1-edit-pruna-8'));
  });
});

describe('installedComfyModels: Qwen-Image 2.1 fast engines need their own file', () => {
  const base = {
    checkpoints: [],
    unets: ['qwen_image_2.1_bf16.safetensors'],
  };
  it('the 2.1 base alone installs only the full pass', () => {
    const installed = installedComfyModels(COMFY_IMAGE_MODELS, { ...base, loras: [] } as never)!;
    assert.ok(installed.has('qwen-image-2.1-edit'));
    for (const id of [
      'qwen-image-2.1-edit-lightning-4',
      'qwen-image-2.1-edit-pruna-8',
      'qwen-image-2.1-edit-turbo-8',
      'qwen-image-2.1-edit-noct',
    ]) {
      assert.ok(!installed.has(id), id);
    }
  });
  it('the Qwen-Edit 2512 base installs no 2.1 engine; Noct-Q needs only its own file', () => {
    const edit = installedComfyModels(COMFY_IMAGE_MODELS, {
      checkpoints: [],
      unets: ['qwen_image_2512_bf16.safetensors'],
      loras: [],
    } as never)!;
    assert.ok(![...edit.keys()].some(id => id.startsWith('qwen-image-2.1')));
    const noct = installedComfyModels(COMFY_IMAGE_MODELS, {
      checkpoints: [],
      unets: ['diffusion/NoctQ_V4_int8_convrot.safetensors'],
      loras: [],
    } as never)!;
    assert.deepEqual(
      [...noct.keys()].filter(id => id.startsWith('qwen-image-2.1')),
      ['qwen-image-2.1-edit-noct']
    );
  });
  it('each fast engine shows once its LoRA / paired file is there (any folder)', () => {
    const installed = installedComfyModels(COMFY_IMAGE_MODELS, {
      ...base,
      loras: [
        'qwen/p_qwen_image_2.1_8step_v0.1.safetensors',
        'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors',
        'Qwen-Image-2.1-Fun-Acc-4Step-PDD-T8.safetensors',
      ],
    } as never)!;
    assert.ok(installed.has('qwen-image-2.1-edit-pruna-8'));
    assert.ok(installed.has('qwen-image-2.1-edit-turbo-8'));
    assert.ok(installed.has('qwen-image-2.1-edit-lightning-4'));
  });
});

describe('modelPickerSections', () => {
  const catalog = [
    byId('qwen-image-2.1-edit'),
    byId('qwen-image-2.1-edit-noct'),
    byId('qwen-image-2.1-edit-turbo-8'),
    byId('qwen-image-2512'),
  ];
  const have = new Set(['qwen-image-2.1-edit', 'qwen-image-2512']);
  const isInstalled = (id: string) => have.has(id);
  const ids = (sections: ReturnType<typeof modelPickerSections>) =>
    sections.map(section => [
      section.key,
      section.rows.map(row => (row.kind === 'model' ? row.entry.id : `more:${row.count}`)),
    ]);

  it('installed engines first; the rest collapsed under one Not installed toggle', () => {
    const sections = modelPickerSections({ catalog, isInstalled, value: 'qwen-image-2512' });
    assert.deepEqual(ids(sections), [
      ['quality', ['qwen-image-2512']],
      ['edit', ['qwen-image-2.1-edit']],
      ['more', ['more:2']],
    ]);
    const open = modelPickerSections({
      catalog,
      isInstalled,
      value: 'qwen-image-2512',
      showMissing: true,
    });
    assert.deepEqual(ids(open).slice(-2), [
      ['more', ['more:2']],
      ['missing', ['qwen-image-2.1-edit-noct', 'qwen-image-2.1-edit-turbo-8']],
    ]);
    assert.equal(open.at(-1)!.label, 'Not installed');
  });

  it('keeps the current engine in its group even when it is not installed', () => {
    const sections = modelPickerSections({ catalog, isInstalled, value: 'qwen-image-2.1-edit-noct' });
    assert.deepEqual(ids(sections).find(([key]) => key === 'edit'), [
      'edit',
      ['qwen-image-2.1-edit', 'qwen-image-2.1-edit-noct'],
    ]);
    assert.deepEqual(ids(sections).at(-1), ['more', ['more:1']]);
  });

  it('search lists installed matches first; an unknown inventory shows everything', () => {
    const sections = modelPickerSections({ catalog, isInstalled, value: 'x', query: '2.1' });
    assert.deepEqual(ids(sections), [
      ['results', ['qwen-image-2.1-edit']],
      ['more', ['more:2']],
    ]);
    const unknown = modelPickerSections({ catalog, isInstalled: () => null, value: 'x' });
    assert.ok(!unknown.some(section => section.key === 'more'));
  });
});
