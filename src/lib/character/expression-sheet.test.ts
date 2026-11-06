import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CAST_EXPRESSIONS, castExpressionPrompt } from './expression-sheet';
import { imageEditGraph } from '../wardrobe/clothing-edit';

describe('Cast expression sheet', () => {
  it('six feelings, each an edit that keeps the person and changes only the expression', () => {
    assert.equal(CAST_EXPRESSIONS.length, 6);
    const prompt = castExpressionPrompt('a warm, natural smile');
    assert.match(prompt, /^Edit <image1>, a photo of a person: the same person with a warm, natural smile\./);
    assert.match(prompt, /only the expression changes/);
  });

  it('uses the shared edit graph on the plate', () => {
    const graph = imageEditGraph({
      image: 'plate.png',
      prompt: 'x',
      seed: 1,
      size: { width: 896, height: 1120 },
      filenamePrefix: 'Castcut/expression-smile',
    });
    assert.equal(graph['14']!.inputs.image, 'plate.png');
    assert.equal(graph['5']!.inputs.prompt, 'x');
    assert.equal(graph['6']!.inputs.width, 896);
    assert.equal(graph['13']!.inputs.filename_prefix, 'Castcut/expression-smile');
  });
});
