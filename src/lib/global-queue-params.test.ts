import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dropLegacyDefaultQueueParams, globalQueueParamOverrides } from './comfyui-settings';

describe('global queue params', () => {
  it('drop the old saved placeholders and the old 1328 default, keep real choices', () => {
    assert.equal(dropLegacyDefaultQueueParams({ width: '1024', height: '1024', cfg: '7', steps: '20' }), undefined);
    assert.equal(dropLegacyDefaultQueueParams({ width: '1328', height: '1328', cfg: '', steps: '' }), undefined);
    assert.deepEqual(dropLegacyDefaultQueueParams({ width: '1024', height: '1024', cfg: '7', steps: '20', seed: '42' }), {
      seed: '42',
    });
    const chosen = { width: '896', height: '1152', cfg: '', steps: '' };
    assert.equal(dropLegacyDefaultQueueParams(chosen), chosen);
    assert.equal(dropLegacyDefaultQueueParams({ width: '1024', height: '1024', cfg: '4', steps: '20' })?.cfg, '4');
  });

  it('list what overrides every model', () => {
    assert.deepEqual(globalQueueParamOverrides({ width: '1024', height: '', cfg: '7', steps: '' }), ['width 1024', 'CFG 7']);
    assert.deepEqual(globalQueueParamOverrides(undefined), []);
  });
});
