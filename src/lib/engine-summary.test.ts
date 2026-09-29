import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { engineSummary, formatEngineSummary } from './engine-summary';

describe('engine summary chip', () => {
  it('names the model, the queue quality and the LoRA stack', () => {
    const summary = engineSummary({
      model: 'qwen-image-2512',
      queueQualityProfile: 'final',
      sessionActiveLoraIdsByModel: { 'qwen-image-2512': ['a', 'b'] },
    });
    assert.equal(formatEngineSummary(summary), 'Qwen-Image-2512 · Good · 2 LoRAs');
  });

  it('uses the tool override and hides an empty LoRA stack', () => {
    const summary = engineSummary(
      {
        model: 'qwen-image-2512',
        queueQualityProfile: 'final',
        toolQueueQualityProfiles: { day: 'max' },
        sessionActiveLoraIdsByModel: { 'qwen-image-2512': [] },
      },
      'day'
    );
    assert.equal(formatEngineSummary(summary), 'Qwen-Image-2512 · Best');
  });

  it('names the sampler preset when quality follows it', () => {
    assert.equal(
      engineSummary({
        model: 'qwen-image-2512',
        queueQualityProfile: 'followSettings',
        modelSamplerPreset: 'optimized',
      }).quality,
      'Optimized'
    );
  });
});
