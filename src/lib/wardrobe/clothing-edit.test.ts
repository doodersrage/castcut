import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { CLOTHING_EDIT_SIZE, clothingEditGraph, clothingEditPrompt } from './clothing-edit';

describe('the clothing editor\'s picture change', () => {
  it('asks for only the change, on the garment alone', () => {
    const prompt = clothingEditPrompt('make it deep red.');
    assert.match(prompt, /^Edit <image1>, a product photo of a piece of clothing: make it deep red\. /);
    assert.match(prompt, /Everything else about the garment stays exactly as it is/);
    assert.match(prompt, /no person/);
  });

  it('edits the picture on Qwen-Image 2.1 Turbo at a packshot\'s shape', () => {
    // Live (2026-11-04, catalog packshots): red, mini length, black leather and lace trim, each
    // the same garment with only that changed.
    const graph = clothingEditGraph('dress.png', 'add lace trim', 9);
    assert.deepEqual(graph['14'], { class_type: 'LoadImage', inputs: { image: 'dress.png' } });
    assert.deepEqual(graph['5']!.inputs['images.image_1'], ['14', 0]);
    assert.equal(graph['6']!.inputs.width, CLOTHING_EDIT_SIZE.width);
    assert.equal(graph['6']!.inputs.height, CLOTHING_EDIT_SIZE.height);
    assert.equal(graph['7']!.inputs.noise_seed, 9);
    for (const node of Object.values(graph)) {
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(graph[value[0] as string], `${node.class_type} → ${value[0]}`);
      }
    }
  });
});
