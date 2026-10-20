import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  applyLoraScanResults,
  auditLoraStacksByModel,
  deleteLoraStackPreset,
  duplicateLoraEntries,
  loraEntriesNeedingScan,
  addScannedLorasToLibrary,
  scannedLorasMissingForModel,
  loraStackMembership,
  loraUsageStats,
  missingLoraEntries,
  removeLoraEntries,
  loraStackPresetsForModel,
  pruneIncompatibleLoraPicks,
  saveLoraStackPreset,
} from './library-tools';
import type { LoraLibraryEntry } from './stack';

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
      { filename: 'qwen-edit-skin.safetensors', family: 'qwen', source: 'keys', trigger: 'skin' },
      { filename: 'pose.safetensors', family: 'flux-klein', source: 'metadata', trigger: 'matchingpose9b' },
    ]);
    assert.equal(changed, 2);
    assert.equal(next[0]!.family, 'qwen');
    assert.equal(next[0]!.triggerPhrase, 'skin');
    assert.equal(next[1]!.triggerPhrase, 'mine');
    assert.equal(loraEntriesNeedingScan(next).length, 0);
  });

  it('rescans Qwen entries that only metadata identified (2.1 LoRAs tagged qwen-image)', () => {
    const library = [
      entry('glamour', 'qwen21_glamour_realism_v1.safetensors', { family: 'qwen', familySource: 'metadata', enabled: true }),
      entry('skin', 'qwen-edit-skin.safetensors', { family: 'qwen', familySource: 'keys' }),
    ];
    assert.deepEqual(loraEntriesNeedingScan(library).map(e => e.id), ['glamour']);
    const { library: next } = applyLoraScanResults(library, [
      { filename: 'qwen21_glamour_realism_v1.safetensors', family: 'qwen21', source: 'keys' },
    ]);
    assert.equal(next[0]!.family, 'qwen21');
    assert.equal(next[0]!.enabled, false);
    assert.equal(loraEntriesNeedingScan(next).length, 0);
  });

  it('offers ComfyUI files of the model family that are not in the library, added off', () => {
    const library = [entry('skin', 'qwen-edit-skin.safetensors', { family: 'qwen', familySource: 'keys' })];
    const rows = [
      { filename: 'qwen21_glamour_realism_v1.safetensors', family: 'qwen21' as const, source: 'keys' as const },
      { filename: 'qwen21-nsfw-f23gg.safetensors', family: 'qwen21' as const, source: 'keys' as const, trigger: 'nsfw_qwen_lora' },
      { filename: 'qwen-edit-skin.safetensors', family: 'qwen' as const, source: 'keys' as const },
      { filename: 'gone.safetensors', family: 'qwen21' as const, source: 'missing' as const },
      { filename: 'p_qwen_image_2.1_8step_v0.1.safetensors', family: 'qwen21' as const, source: 'keys' as const },
      { filename: 'Qwen-Image-2.1-Fun-Acc-4Step-PDD-T8.safetensors', family: 'qwen21' as const, source: 'keys' as const },
      { filename: 'qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors', family: 'qwen21' as const, source: 'keys' as const },
    ];
    const matches = scannedLorasMissingForModel(library, rows, 'qwen-image-2.1-edit-turbo-8');
    assert.deepEqual(matches.map(row => row.filename), [
      'qwen21_glamour_realism_v1.safetensors',
      'qwen21-nsfw-f23gg.safetensors',
    ]);
    assert.deepEqual(scannedLorasMissingForModel(library, rows, 'qwen-image-edit-2511'), []);
    const next = addScannedLorasToLibrary(library, matches);
    assert.equal(next.length, 3);
    assert.equal(next[1]!.family, 'qwen21');
    assert.equal(next[1]!.enabled, false);
    assert.equal(next[2]!.triggerPhrase, 'nsfw_qwen_lora');
    assert.equal(addScannedLorasToLibrary(next, matches).length, 3);
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

describe('library usage + tidy', () => {
  const entry = (id: string, over: Partial<LoraLibraryEntry> = {}): LoraLibraryEntry => ({
    id,
    label: id,
    triggerPhrase: '',
    tokenValue: `${id}.safetensors`,
    family: 'qwen',
    familySource: 'keys',
    ...over,
  });

  it('counts images, favorites and face match with vs without a LoRA', () => {
    const library = [entry('skin'), entry('xl', { family: 'sdxl' })];
    const shot = (ids: string[], face?: number, favorite = false) => ({
      status: 'completed',
      model: 'qwen-rapid-aio-edit-nsfw',
      sessionActiveLoraIds: ids,
      favorite,
      ...(face === undefined ? {} : { playChecks: { face } }),
    });
    const stats = loraUsageStats(library, [
      shot(['skin'], 0.4, true),
      shot(['skin'], 0.5),
      shot(['skin', 'xl'], 0.6),
      shot([], 0.7),
      shot([], 0.6),
      shot([], 0.5),
      { status: 'error', model: 'qwen-rapid-aio-edit-nsfw', sessionActiveLoraIds: ['skin'] },
    ]);
    assert.deepEqual(stats.get('skin'), {
      images: 3,
      favorites: 1,
      wellRated: 0,
      faceWith: 0.5,
      faceWithout: 0.6,
      faceSamples: 3,
    });
    // Picked, but an SDXL LoRA never applies on a Qwen model.
    assert.equal(stats.has('xl'), false);
  });

  it('finds missing files and duplicates, and moves picks to the kept entry', () => {
    const library = [
      entry('a'),
      entry('a2', { tokenValue: 'A.safetensors' }),
      entry('gone', { familySource: 'missing' }),
    ];
    assert.deepEqual(
      missingLoraEntries(library).map(item => item.id),
      ['gone']
    );
    assert.deepEqual(
      duplicateLoraEntries(library).map(group => group.map(item => item.id)),
      [['a', 'a2']]
    );
    const next = removeLoraEntries(
      library,
      { m1: ['a2', 'gone'], m2: ['a', 'a2'] },
      ['a2', 'gone'],
      { a2: 'a' }
    );
    assert.deepEqual(
      next.library.map(item => item.id),
      ['a']
    );
    assert.deepEqual(next.byModel, { m1: ['a'], m2: ['a'] });
  });
});

describe('loraStackMembership', () => {
  it('lists the model stacks and saved stacks each LoRA is in', () => {
    const membership = loraStackMembership({ m1: ['a', 'b'], m2: ['a'] }, [
      { id: 'p', name: 'Realism', family: 'qwen', loraIds: ['b'] },
    ]);
    assert.deepEqual(membership.get('a'), { models: ['m1', 'm2'], savedStacks: [] });
    assert.deepEqual(membership.get('b'), { models: ['m1'], savedStacks: ['Realism'] });
  });
});

describe('a Qwen-Image 2.1 LoRA starts off', () => {
  it('is switched off the first time a scan finds it is 2.1, and left alone after', async () => {
    const { applyLoraScanResults } = await import('./library-tools');
    const entry = { id: 'anatomy', label: 'anatomy', triggerPhrase: 'x', tokenValue: 'qwen21_a.safetensors', family: 'unknown' as const, familySource: 'keys' as const };
    const first = applyLoraScanResults([entry], [{ filename: 'qwen21_a.safetensors', family: 'qwen21', source: 'keys' }]);
    assert.equal(first.library[0]!.enabled, false);
    const turnedOn = { ...first.library[0]!, enabled: true };
    const again = applyLoraScanResults([turnedOn], [{ filename: 'qwen21_a.safetensors', family: 'qwen21', source: 'keys' }]);
    assert.equal(again.library[0]!.enabled, true);
  });
});
