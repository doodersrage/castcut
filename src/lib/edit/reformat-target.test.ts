import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getReformatTargetLabel, getReformatTargetModel } from './reformat-target';

describe('getReformatTargetModel', () => {
  it('targets qwen-image-2512 when currently on flux-2-klein', () => {
    assert.equal(getReformatTargetModel('flux-2-klein'), 'qwen-image-2512');
  });

  it('targets flux-2-klein for any other current model', () => {
    assert.equal(getReformatTargetModel('sdxl'), 'flux-2-klein');
    assert.equal(getReformatTargetModel('qwen-image-2512'), 'flux-2-klein');
  });
});

describe('getReformatTargetLabel', () => {
  it('returns the real model definition label for the reformat target', () => {
    assert.equal(getReformatTargetLabel('flux-2-klein'), 'Qwen-Image-2512');
  });

  it('returns the FLUX label for any non-flux-2-klein current model', () => {
    assert.equal(getReformatTargetLabel('sdxl'), 'FLUX.2 Klein 4B Base');
  });
});
