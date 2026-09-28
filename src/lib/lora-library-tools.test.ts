import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLoraScanResults,
  auditLoraStacksByModel,
  deleteLoraStackPreset,
  loraEntriesNeedingScan,
  loraStackPresetsForModel,
  pruneIncompatibleLoraPicks,
  saveLoraStackPreset,
} from './lora-library-tools';
import type { LoraLibraryEntry } from './lora-stack';

const entry = (id: string, file: string, extra: Partial<LoraLibraryEntry> = {}): LoraLibraryEntry => ({
  id,
  label: id,
  tokenValue: file,
  triggerPhrase: '',
  ...extra,
});

describe('lora-library-tools', () => {
  it('merges scan results and fills blank triggers only', () => {
    const library = [entry('skin', 'qwen-edit-skin.safetensors'), entry('pose', 'pose.safetensors', { triggerPhrase: 'mine' })];
    assert.equal(loraEntriesNeedingScan(library).length, 2);
    const { library: next, changed } = applyLoraScanResults(library, [
      { filename: 'qwen-edit-skin.safetensors', family: 'qwen', source: 'metadata', trigger: 'skin' },
      { filename: 'pose.safetensors', family: 'flux-klein', source: 'metadata', trigger: 'matchingpose9b' },
    ]);
    assert.equal(changed, 2);
    assert.equal(next[0]!.family, 'qwen');
    assert.equal(next[0]!.triggerPhrase, 'skin');
    assert.equal(next[1]!.triggerPhrase, 'mine');
    assert.equal(loraEntriesNeedingScan(next).length, 0);
  });

  it('finds and prunes picks that cannot apply to their model', () => {
    const library = [
      entry('qwen-skin', 'a.safetensors', { family: 'qwen', familySource: 'metadata' }),
      entry('sdxl-detail', 'b.safetensors', { family: 'sdxl', familySource: 'keys' }),
      entry('klein-real', 'c.safetensors', { family: 'flux-klein', familySource: 'metadata' }),
    ];
    const byModel = {
      'qwen-image-2512-lightning-8': ['qwen-skin', 'sdxl-detail', 'gone'],
      'flux-2-klein-9b-distilled': ['klein-real'],
    };
    const audit = auditLoraStacksByModel(library, byModel);
    assert.equal(audit.length, 1);
    assert.deepEqual(audit[0]!.incompatible, ['sdxl-detail', 'gone']);
    const pruned = pruneIncompatibleLoraPicks(library, byModel);
    assert.equal(pruned.removed, 2);
    assert.deepEqual(pruned.byModel['qwen-image-2512-lightning-8'], ['qwen-skin']);
    assert.deepEqual(pruned.byModel['flux-2-klein-9b-distilled'], ['klein-real']);
  });

  it('saves named stacks per family and offers them on every model of that family', () => {
    let presets = saveLoraStackPreset([], { name: 'Realism', model: 'qwen-rapid-aio-edit-nsfw', loraIds: ['qwen-skin'] });
    presets = saveLoraStackPreset(presets, { name: 'Realism', model: 'qwen-image-2512-lightning-8', loraIds: ['qwen-skin', 'x'] });
    assert.equal(presets.length, 1, 'same name in the same family replaces');
    assert.deepEqual(presets[0]!.loraIds, ['qwen-skin', 'x']);
    assert.equal(loraStackPresetsForModel(presets, 'qwen-image-edit-2511-lightning-8').length, 1);
    assert.equal(loraStackPresetsForModel(presets, 'flux-2-klein-9b-distilled').length, 0);
    assert.equal(deleteLoraStackPreset(presets, presets[0]!.id).length, 0);
  });
});
