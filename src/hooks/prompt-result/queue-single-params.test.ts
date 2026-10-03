import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildQueueSingleParams } from './queue-single-params';

const base = {
  config: { tool: 'image-prompt' },
  queueModel: 'qwen-rapid-aio-edit' as never,
  effectiveTool: 'image-prompt',
  effectiveQualityProfile: 'good' as never,
  inputImageFilenames: [],
  controlImageFilenames: [],
};

describe('queue seed', () => {
  it('rolls a new seed for every queue', async () => {
    const a = await buildQueueSingleParams({ ...base, options: { queueParamsBase: { seed: '5' } } });
    assert.notEqual(String(a.seed), '5');
  });

  it('keeps the seed a same-seed redo asks for', async () => {
    const a = await buildQueueSingleParams({ ...base, options: { seed: '123456789' } });
    assert.equal(String(a.seed), '123456789');
  });
});
