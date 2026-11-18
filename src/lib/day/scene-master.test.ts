import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createScene } from './scenes';
import {
  buildMasterCutDetailGraph,
  masterCutFor,
  masterCutsInOrder,
  pngSize,
  sceneMasters,
} from './scene-master';

const scene = (name: string, extra: Record<string, unknown> = {}, slot: Record<string, unknown> = {}) => {
  const base = createScene({ castId: 'slyne', name, id: name, now: 1 });
  return {
    ...base,
    slot: { ...base.slot, ...slot },
    fromScript: { scriptId: 'sk', sceneId: 'stairwell', shotId: `stairwell~${name}` },
    ...extra,
  } as never;
};

// The flagship's stairwell (2026-11-17): every shot from one master.
describe('a scene shot from its master', () => {
  it('the master is the scene’s wide of the two of them, with a kept take', () => {
    const master = scene('7A STAIRWELL · Establishing', { allowCompanions: true, keptTakeId: 't' });
    const masters = sceneMasters([scene('7B STAIRWELL · Dialogue', { allowCompanions: true, keptTakeId: 'u' }), master]);
    assert.equal(masters.get('sk|stairwell'), master);
    assert.equal(sceneMasters([scene('7A STAIRWELL · Establishing', { keptTakeId: 't' })]).size, 0, 'her alone is no master');
  });

  it('each shot’s cut: a two-shot both, a close reaction the one who reacts, her alone her', () => {
    assert.deepEqual(masterCutFor(scene('7B · Dialogue', { allowCompanions: true }, { poseCamera: { shot: 'waist' } }), 'Slyne'), { who: 'both', shot: 'waist' });
    assert.deepEqual(
      masterCutFor(scene('7D · Reaction', { allowCompanions: true }, { poseCamera: { shot: 'head' }, sceneHints: 'In the stairwell. Jason reacts.' }), 'Slyne'),
      { who: 'partner', shot: 'head' }
    );
    assert.deepEqual(
      masterCutFor(scene('1G · Reaction', { allowCompanions: false }, { poseCamera: { shot: 'head' }, sceneHints: 'Slyne reacts.' }), 'Slyne'),
      { who: 'lead', shot: 'head' }
    );
    assert.equal(masterCutFor(scene('7A · Establishing', { allowCompanions: true }), 'Slyne'), null);
    assert.equal(masterCutFor(scene('2A · Action', {}, { poseCamera: { shot: 'full' } }), 'Slyne'), null);
  });

  it('the detail pass: the cut as the picture to keep and the start, the master’s faces after it', () => {
    const master = {
      '900': { class_type: 'LoadImage', inputs: { image: 'her.png' } },
      '903': { class_type: 'LoadImage', inputs: { image: 'him.png' } },
      '904': { class_type: 'LoadImage', inputs: { image: 'pose.png' } },
      '917': { class_type: 'VAELoader', inputs: {} },
      '919': {
        class_type: 'TextEncodeQwenImage21',
        inputs: { prompt: 'x', 'images.image_1': ['900', 0], 'images.image_2': ['903', 0], 'images.image_3': ['904', 0] },
      },
      '920': { class_type: 'EmptyLatentImage', inputs: {} },
      '921': { class_type: 'RandomNoise', inputs: { noise_seed: 1 } },
      '924': { class_type: 'ManualSigmas', inputs: { sigmas: '1.000000, 0.954180, 0.845148, 0.704534, 0.414568, 0.000000' } },
      '8': { class_type: 'SamplerCustomAdvanced', inputs: { latent_image: ['920', 0] } },
      '10': { class_type: 'SaveImage', inputs: { filename_prefix: 'Castcut' } },
    };
    const g = buildMasterCutDetailGraph(master, 'cut.png', 7)!;
    const enc = g['919']!.inputs;
    assert.deepEqual([enc['images.image_1'], enc['images.image_2'], enc['images.image_3']], [['mastercut', 0], ['900', 0], ['903', 0]]);
    assert.deepEqual(g['8']!.inputs.latent_image, ['mastercutlatent', 0]);
    assert.equal(g['924']!.inputs.sigmas, '0.845148, 0.704534, 0.414568, 0.000000');
    assert.equal(g['920'], undefined);
    assert.equal(g['921']!.inputs.noise_seed, 7);
  });

  it('no two shots in a row the same: a repeated two-shot goes in on her line, or on him listening', () => {
    const shot = (name: string, line?: string, framing = 'waist') =>
      scene(name, { allowCompanions: true }, { poseCamera: { shot: framing }, ...(line ? { line } : {}) });
    // The park (5B–5E, 2026-11-17): two two-shots back to back were the same picture.
    const cuts = masterCutsInOrder(
      [shot('5C CITY PARK · Dialogue'), shot('5B CITY PARK · Dialogue', 'What if we fight about the dishes?'), shot('5D CITY PARK · Dialogue', "That's the right answer.", 'head')],
      'Slyne'
    );
    assert.deepEqual(cuts.get('5B CITY PARK · Dialogue'), { who: 'both', shot: 'waist' });
    assert.deepEqual(cuts.get('5C CITY PARK · Dialogue'), { who: 'partner', shot: 'head' }, 'no line: him listening');
    const withLine = masterCutsInOrder([shot('7B · Dialogue'), shot('7C · Dialogue', 'Careful.')], 'Slyne');
    assert.deepEqual(withLine.get('7C · Dialogue'), { who: 'lead', shot: 'head' }, 'her line: on her');
  });

  it('a master’s size from the picture when its graph doesn’t say (a face finish)', () => {
    const header = new Uint8Array(24);
    header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(header.buffer);
    view.setUint32(16, 1664);
    view.setUint32(20, 928);
    assert.deepEqual(pngSize(header), { width: 1664, height: 928 });
    assert.equal(pngSize(new Uint8Array([1, 2, 3])), null);
  });
});
