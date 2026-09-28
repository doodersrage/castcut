import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectGraphModelNames,
  engineFamilyLabel,
  groupModelFilesByEngine,
  guessEngineFamilyFromFile,
  modelFileDeleteBlock,
  modelFileKey,
  modelFileUses,
  type ModelFileRow,
} from './model-files';

const DAY = 24 * 60 * 60 * 1000;
const file = (path: string, over: Partial<ModelFileRow> = {}): ModelFileRow => {
  const [folder, ...rest] = path.split('/');
  return { path, folder: folder!, name: rest.join('/'), bytes: 1e9, modifiedAt: 0, ...over };
};

describe('model files', () => {
  it('collects every model file a graph loads', () => {
    assert.deepEqual(
      collectGraphModelNames({
        '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'rapid.safetensors' } },
        '2': { class_type: 'LoraLoaderModelOnly', inputs: { lora_name: 'sub\\skin.safetensors', model: ['1', 0] } },
        '3': { class_type: 'CLIPTextEncode', inputs: { text: 'a photo' } },
        '4': { class_type: 'UpscaleModelLoader', inputs: { model_name: '4x.pth' } },
      }).sort(),
      ['4x.pth', 'rapid.safetensors', 'sub\\skin.safetensors']
    );
    assert.equal(modelFileKey('sub\\Skin.safetensors'), 'skin.safetensors');
  });

  it('knows what points at a file and blocks deleting it', () => {
    const files = [
      file('loras/skin.safetensors'),
      file('checkpoints/rapid.safetensors'),
      file('checkpoints/old.safetensors'),
      file('diffusion_models/fresh.safetensors', { lastUsedAt: Date.now() - DAY }),
      file('diffusion_models/stale.safetensors', { lastUsedAt: Date.now() - 90 * DAY }),
      file('diffusion_models/half.safetensors.partial', { partial: true, lastUsedAt: Date.now() }),
      file('checkpoints/target.safetensors', { linkedBy: 1 }),
    ];
    const uses = modelFileUses({
      files,
      catalog: [{ filename: 'old.safetensors', modelIds: ['sdxl'] }],
      loraLibrary: [{ id: 'skin', label: 'Skin', tokenValue: 'skin.safetensors' }],
      loaderMaps: [{ 'qwen-rapid-aio-edit-nsfw': 'rapid.safetensors' }],
    });
    const block = (path: string) => modelFileDeleteBlock(files.find(f => f.path === path)!, uses.get(path));
    assert.match(block('loras/skin.safetensors')!, /LoRA library/);
    assert.match(block('checkpoints/rapid.safetensors')!, /Mapped/);
    assert.match(block('diffusion_models/fresh.safetensors')!, /last 30 days/);
    assert.match(block('checkpoints/target.safetensors')!, /link/);
    // A catalog engine that nobody has rendered with lately doesn't pin the file.
    assert.equal(block('checkpoints/old.safetensors'), null);
    assert.equal(block('diffusion_models/stale.safetensors'), null);
    assert.equal(block('diffusion_models/half.safetensors.partial'), null);
  });

  it('groups files by engine family, with shared files apart', () => {
    const files = [
      file('checkpoints/rapid-v21.safetensors', { bytes: 3 }),
      file('text_encoders/qwen_vl.safetensors', { bytes: 2 }),
      file('loras/skin.safetensors', { bytes: 1 }),
      file('misc/unknown.safetensors', { bytes: 1 }),
    ];
    const uses = modelFileUses({
      files,
      catalog: [
        { filename: 'rapid-v21.safetensors', modelIds: ['qwen-rapid-aio-edit', 'qwen-rapid-aio-nsfw'] },
        { filename: 'qwen_vl.safetensors', modelIds: ['qwen-image-2512', 'qwen-image-edit-2511'] },
      ],
      loraLibrary: [],
      loaderMaps: [],
    });
    const groups = groupModelFilesByEngine(files, uses, id => engineFamilyLabel(id));
    assert.deepEqual(
      groups.map(group => [group.label, group.files.length]),
      [
        ['Qwen Rapid AIO', 1],
        ['Shared by several engines', 1],
        ['LoRAs', 1],
        ['Not linked to an engine', 1],
      ]
    );
  });

  it('guesses the engine of files the catalog does not list', () => {
    const guess = (p: string) => guessEngineFamilyFromFile(file(p));
    assert.equal(guess('checkpoints/Qwen-Rapid-AIO-NSFW-v21.safetensors'), 'Qwen Rapid AIO');
    assert.equal(guess('diffusion_models/flux-2-klein-9b-fp8.safetensors'), 'FLUX.2 Klein');
    assert.equal(guess('diffusion_models/Qwen-Image-Edit-2509-Q8_0.gguf'), 'Qwen Image Edit 2509');
    assert.match(guess('facerestore_models/GFPGANv1.4.pth')!, /Helpers/);
    assert.equal(guess('text_encoders/mystery.safetensors'), null);
  });
});
