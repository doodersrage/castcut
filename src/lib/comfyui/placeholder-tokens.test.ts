import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_NEGATIVE_TOKEN, DEFAULT_POSITIVE_TOKEN, DEFAULT_SEED_TOKEN } from './config';
import { placeholderTokensFromSettings } from './settings';

describe('placeholderTokensFromSettings', () => {
  // Settings' workflow validation memoizes on these two fields only (useSettingsToolOrchestrationPart2).
  it('reads only the positive and negative tokens; the rest are fixed defaults', () => {
    const tokens = placeholderTokensFromSettings({
      positiveToken: ' {{POS}} ',
      negativeToken: '',
    });
    assert.equal(tokens.positive, '{{POS}}');
    assert.equal(tokens.negative, DEFAULT_NEGATIVE_TOKEN);
    assert.equal(tokens.seed, DEFAULT_SEED_TOKEN);
    assert.equal(placeholderTokensFromSettings({}).positive, DEFAULT_POSITIVE_TOKEN);
  });
});
