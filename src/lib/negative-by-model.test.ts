import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveContextNegativeProfile } from './context-negative-profile';
import { modelIgnoresNegativeAtCfg } from './queue-negative';

describe('negative prompts follow the model', () => {
  it('uses the Qwen profile on Qwen when the selection is the shipped SD default', () => {
    assert.equal(resolveContextNegativeProfile(undefined, 'general-sd', { model: 'qwen-image-2512' })?.id, 'qwen-general');
    assert.equal(resolveContextNegativeProfile(undefined, undefined, { model: 'qwen-image-2512' })?.id, 'qwen-general');
    // A profile picked on purpose still wins, and SD models keep the SD one.
    assert.equal(resolveContextNegativeProfile(undefined, 'portrait', { model: 'qwen-image-2512' })?.id, 'portrait');
    assert.equal(resolveContextNegativeProfile(undefined, 'general-sd', { model: 'sdxl' })?.id, 'general-sd');
  });

  it('skips negatives on models that run at CFG 1 on every tier', () => {
    assert.equal(modelIgnoresNegativeAtCfg('qwen-rapid-aio-edit-nsfw'), true);
    assert.equal(modelIgnoresNegativeAtCfg('qwen-image-2512-lightning-8'), true);
    assert.equal(modelIgnoresNegativeAtCfg('qwen-image-2512'), false);
    assert.equal(modelIgnoresNegativeAtCfg('sdxl'), false);
  });
});
