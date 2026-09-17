import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyLoraTriggerToPrompt } from './lora-prompt-injection';
import {
  characterLookValidationQueuePins,
  suggestedLoraOutputPath,
  trainJobsForCharacter,
} from './character-lora-flywheel';
import { createBlankCharacter, normalizeCharacterRecord } from './character-os';
import { createTrainJob } from './lora-train-job';
import { isLoraDatasetStill, selectCharacterKeepers } from './gallery-lora-dataset-export';
import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

function still(id: string, extra: Partial<ComfyGalleryEntry> = {}): ComfyGalleryEntry {
  return {
    id,
    promptId: id,
    prompt: `portrait ${id}`,
    comfyUrl: 'http://127.0.0.1:8188',
    status: 'completed',
    queuedAt: 1,
    characterId: 'char-rin',
    images: [{ filename: `${id}.png`, subfolder: '', type: 'output' }],
    ...extra,
  };
}

describe('character-lora-flywheel', () => {
  it('uses explicit look keepers instead of gallery favorites', () => {
    const entries = [
      still('fav', { favorite: true }),
      still('picked'),
      still('clip', { derivedKind: 'i2v', tool: 'video', images: [{ filename: 'a.mp4', subfolder: '', type: 'output' }] }),
    ];
    assert.deepEqual(
      selectCharacterKeepers(entries, 'char-rin').map(entry => entry.id),
      ['fav']
    );
    assert.deepEqual(
      selectCharacterKeepers(entries, 'char-rin', { keeperIds: ['picked'] }).map(entry => entry.id),
      ['picked']
    );
    assert.equal(isLoraDatasetStill(entries[2]!), false);
  });

  it('scopes train jobs to the character that started them', () => {
    const jobs = [
      createTrainJob({ id: 'a', characterId: 'char-rin', trigger: 'rinstyle' }),
      createTrainJob({ id: 'b', characterId: 'char-kai', trigger: 'kai' }),
      createTrainJob({ id: 'c', trigger: 'orphan' }),
    ];
    assert.deepEqual(
      trainJobsForCharacter(jobs, 'char-rin').map(job => job.id),
      ['a']
    );
  });

  it('names a weight from the character and look', () => {
    assert.equal(
      suggestedLoraOutputPath({ id: 'char-rin', name: 'Rin Vale', version: 1, updatedAt: 1 }, 'Winter coat'),
      'rin-vale-winter-coat-v1.safetensors'
    );
  });

  it('prefixes a missing trigger and leaves one already present', () => {
    assert.equal(applyLoraTriggerToPrompt('standing portrait', 'rinstyle'), 'rinstyle, standing portrait');
    assert.equal(applyLoraTriggerToPrompt('rinstyle, alley', 'rinstyle'), 'rinstyle, alley');
    assert.equal(applyLoraTriggerToPrompt('  ', ''), '');
  });

  it('pins Cast face and LoRAs for Prove-it validation queues', () => {
    const blank = createBlankCharacter('Prove');
    assert.deepEqual(characterLookValidationQueuePins(blank), {
      faceBase: undefined,
      sessionActiveLoraIds: undefined,
    });
    const locked = normalizeCharacterRecord({
      ...blank,
      ipAdapter: { imageFilename: 'face.png', imageUrl: 'https://example.com/face.png' },
      loraLibraryIds: ['lora-rin'],
    });
    assert.deepEqual(characterLookValidationQueuePins(locked, 0.8), {
      faceBase: {
        ipAdapterImageFilename: 'face.png',
        ipAdapterImageFilenames: ['face.png'],
        ipAdapterStrength: 0.8,
      },
      sessionActiveLoraIds: ['lora-rin'],
    });
  });
});
