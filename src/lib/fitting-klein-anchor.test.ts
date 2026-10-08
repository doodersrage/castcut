import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { kleinColorAnchorStrengthForTool } from './comfyui-runtime-for-model';

describe('Klein color anchor on Outfit try-ons', () => {
  it('caps the anchor at 0.1 for fitting and leaves every other tool alone', () => {
    assert.equal(kleinColorAnchorStrengthForTool(0.45, 'fitting'), 0.1);
    assert.equal(kleinColorAnchorStrengthForTool(undefined, 'fitting'), 0.1);
    assert.equal(kleinColorAnchorStrengthForTool(0.05, 'fitting'), 0.05);
    assert.equal(kleinColorAnchorStrengthForTool(0.45, 'day'), 0.45);
    assert.equal(kleinColorAnchorStrengthForTool(undefined, 'roleplay'), undefined);
  });
});
