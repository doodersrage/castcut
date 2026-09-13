import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MODEL_GOAL_OPTIONS, resolveModelForGoal } from './model-goals';

describe('model-goals', () => {
  it('lists photoreal illustration edit video', () => {
    assert.deepEqual(
      MODEL_GOAL_OPTIONS.map(entry => entry.id),
      ['photoreal', 'illustration', 'edit', 'video']
    );
  });

  it('resolves preferred model when allowed', () => {
    assert.equal(resolveModelForGoal('photoreal', ['flux-ultrareal-v4', 'sdxl']), 'flux-ultrareal-v4');
  });

  it('falls back within allowed list when preferred missing', () => {
    assert.equal(resolveModelForGoal('photoreal', ['sdxl', 'qwen-image-2512']), 'sdxl');
  });
});
