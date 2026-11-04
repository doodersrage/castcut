import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  LOCATION_EMPTY_PROMPT,
  locationEmptyGraph,
  locationEmptySize,
  locationPictureGraph,
  locationPicturePrompt,
} from './picture';
import { photoShowsPeople } from './records';

const cafe = {
  name: 'Harbour café',
  setting: 'INT' as const,
  look: 'pale blue wooden counter, a copper espresso machine.',
};

describe("a location's picture (M8 T3)", () => {
  it('asks for the empty place from its words', () => {
    assert.equal(
      locationPicturePrompt(cafe),
      'A wide photograph of Harbour café, indoors: pale blue wooden counter, a copper espresso machine. Empty — no people anywhere. Eye-level, natural light, sharp, realistic.'
    );
    assert.match(
      locationPicturePrompt({ name: 'Rocky cove', setting: 'EXT', look: '' }),
      /^A wide photograph of Rocky cove, outdoors\. Empty/
    );
  });

  it('is a finished Qwen-Image 2.1 Turbo graph: text only, landscape, its seed', () => {
    const graph = locationPictureGraph(cafe, 424242.7);
    const byType = (type: string) => Object.values(graph).find(node => node.class_type === type);
    assert.equal(byType('TextEncodeQwenImage21')?.inputs.prompt, locationPicturePrompt(cafe));
    assert.equal(
      Object.keys(byType('TextEncodeQwenImage21')?.inputs ?? {}).some(key => key.startsWith('images')),
      false,
      'no reference picture'
    );
    assert.deepEqual(byType('EmptyLatentImage')?.inputs, { width: 1472, height: 1104, batch_size: 1 });
    assert.equal(byType('RandomNoise')?.inputs.noise_seed, 424242);
    assert.equal(byType('ManualSigmas')?.inputs.sigmas, '1.000000, 0.978453, 0.954180, 0.926626, 0.895080, 0.845148, 0.704534, 0.414568, 0.000000');
    // Every link points at a node of the graph.
    for (const node of Object.values(graph)) {
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(graph[value[0] as string], `${node.class_type} → ${value[0]}`);
      }
    }
  });
});

describe('a place photo with people in it, emptied', () => {
  it('is checked for anyone: a body or a face', () => {
    // The user's photo (a woman on a chair) counted 1 person, 1 face; the emptied one 0 and 0.
    assert.equal(photoShowsPeople({ people: 1, faces: 1 }), true);
    assert.equal(photoShowsPeople({ people: 0, faces: 1 }), true);
    assert.equal(photoShowsPeople({ people: 0, faces: 0 }), false);
    assert.equal(photoShowsPeople({ people: null, faces: null }), false);
  });

  it('is edited on Qwen-Image 2.1 Turbo, its own shape kept', () => {
    assert.deepEqual(locationEmptySize(1365, 2048), { width: 976, height: 1472 });
    assert.deepEqual(locationEmptySize(4000, 3000), { width: 1472, height: 1104 });
    const graph = locationEmptyGraph('room.png', { width: 976, height: 1472 }, 7);
    assert.deepEqual(graph['14'], { class_type: 'LoadImage', inputs: { image: 'room.png' } });
    assert.equal(graph['5']!.inputs.prompt, LOCATION_EMPTY_PROMPT);
    assert.deepEqual(graph['5']!.inputs['images.image_1'], ['14', 0]);
    assert.equal(graph['5']!.inputs.negative_prompt, '');
    assert.equal(graph['6']!.inputs.width, 976);
    assert.equal(graph['6']!.inputs.height, 1472);
    assert.equal(graph['7']!.inputs.noise_seed, 7);
    for (const node of Object.values(graph)) {
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value)) assert.ok(graph[value[0] as string], `${node.class_type} → ${value[0]}`);
      }
    }
  });
});
