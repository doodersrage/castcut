import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  appendEmbeddingTokens,
  embeddingPromptToken,
  modelSupportsTextualInversion,
  toggleEmbeddingName,
} from './textual-inversion';

describe('textual inversion helpers', () => {
  it('builds embedding: tokens', () => {
    assert.equal(embeddingPromptToken('easynegative'), 'embedding:easynegative');
    assert.equal(embeddingPromptToken('embedding:foo'), 'embedding:foo');
  });

  it('appends missing tokens only', () => {
    assert.equal(
      appendEmbeddingTokens('a portrait', ['easynegative']),
      'a portrait, embedding:easynegative'
    );
    assert.equal(
      appendEmbeddingTokens('a portrait, embedding:easynegative', ['easynegative']),
      'a portrait, embedding:easynegative'
    );
  });

  it('toggles selected stems', () => {
    assert.deepEqual(toggleEmbeddingName([], 'Foo'), ['Foo']);
    assert.deepEqual(toggleEmbeddingName(['Foo'], 'foo'), []);
  });

  it('is true for SD/SDXL registry models', () => {
    assert.equal(modelSupportsTextualInversion('sdxl'), true);
    assert.equal(modelSupportsTextualInversion('qwen-image-2512'), false);
  });
});
