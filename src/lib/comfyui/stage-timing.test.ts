import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatRenderStages,
  nodeStage,
  normalizeRenderStages,
  renderStagesOf,
} from './stage-timing';

describe('where a render’s time went (ENGINE_PLAN.md phase 1)', () => {
  it('puts each node in a stage by its type', () => {
    assert.equal(nodeStage('UNETLoader'), 'load');
    assert.equal(nodeStage('CheckpointLoaderSimple'), 'load');
    assert.equal(nodeStage('LoraLoaderModelOnly'), 'load');
    assert.equal(nodeStage('ModelSamplingAuraFlow'), 'load');
    assert.equal(nodeStage('TextEncodeQwenImageEditPlus'), 'encode');
    assert.equal(nodeStage('CLIPTextEncode'), 'encode');
    assert.equal(nodeStage('VAEEncode'), 'encode');
    assert.equal(nodeStage('KSampler'), 'sample');
    assert.equal(nodeStage('SamplerCustomAdvanced'), 'sample');
    assert.equal(nodeStage('VAEDecode'), 'decode');
    assert.equal(nodeStage('VAEDecodeTiled'), 'decode');
    assert.equal(nodeStage('FaceDetailer'), 'finish');
    assert.equal(nodeStage('SaveImage'), 'save');
    assert.equal(nodeStage('CreateVideo'), 'save');
    assert.equal(nodeStage('LoadImage'), 'other');
    assert.equal(nodeStage('ImageScale'), 'other');
  });

  it('splits a sampler at its first step: the model moving to the GPU is load', () => {
    const graph = {
      '1': { class_type: 'UNETLoader' },
      '3': { class_type: 'TextEncodeQwenImageEditPlus' },
      '5': { class_type: 'KSampler' },
      '8': { class_type: 'VAEDecode' },
      '9': { class_type: 'SaveImage' },
    };
    const stages = renderStagesOf(graph, {
      started: 1000,
      ended: 13_000,
      cached: ['2'],
      nodes: [
        { id: '1', start: 1100, end: 1600 },
        { id: '3', start: 1600, end: 3600 },
        { id: '5', start: 3600, firstStep: 6600, end: 11_600 },
        { id: '8', start: 11_600, end: 12_400 },
        { id: '9', start: 12_400, end: 12_900 },
      ],
    })!;
    assert.deepEqual(stages, {
      load: 500 + 3000,
      encode: 2000,
      sample: 5000,
      decode: 800,
      finish: 0,
      save: 500,
      // Before the first node (100 ms) and after the last (100 ms).
      other: 200,
      totalMs: 12_000,
      cachedNodes: 1,
    });
    assert.equal(formatRenderStages(stages), 'load 3.5 s · encode 2.0 s · sample 5.0 s · decode 0.8 s · save 0.5 s · other 0.2 s');
  });

  it('a sampler with no step reported counts whole; no record, or still running: none', () => {
    const stages = renderStagesOf(
      { '5': { class_type: 'KSampler' } },
      { started: 0, ended: 4000, nodes: [{ id: '5', start: 0, end: 4000 }] }
    )!;
    assert.equal(stages.sample, 4000);
    assert.equal(stages.load, 0);
    assert.equal(renderStagesOf({}, null), null);
    assert.equal(renderStagesOf({}, { started: 0, ended: null, nodes: [{ id: '1', start: 0 }] }), null);
  });

  it('keeps a stored record only when whole', () => {
    const stored = { load: 1, encode: 2, sample: 3, decode: 4, finish: 0, save: 5, other: 6, totalMs: 21, cachedNodes: 2 };
    assert.deepEqual(normalizeRenderStages(stored), stored);
    assert.equal(normalizeRenderStages({ ...stored, sample: -1 }), undefined);
    assert.equal(normalizeRenderStages({ load: 1 }), undefined);
    assert.equal(normalizeRenderStages('x'), undefined);
  });
});
