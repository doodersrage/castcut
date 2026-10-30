import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildPhantomGraph,
  PHANTOM_FILES,
  PHANTOM_SAVE_NODE,
  phantomPrompt,
  phantomReadiness,
  phantomSize,
} from './phantom';

describe('Generate a shot with the Cast (Phantom)', () => {
  it('sizes the film’s shape on Phantom’s grid', () => {
    assert.deepEqual(phantomSize('wide'), { width: 832, height: 480 });
    assert.deepEqual(phantomSize('vertical'), { width: 480, height: 832 });
    assert.deepEqual(phantomSize('square'), { width: 624, height: 624 });
  });

  it('says who is in the pictures and her look', () => {
    const prompt = phantomPrompt('She waves from the doorway.', { name: 'Nora', look: 'Short red hair.' });
    assert.match(prompt, /^She waves from the doorway\. Nora is the person in the reference pictures/);
    assert.match(prompt, /Short red hair\./);
  });

  it('batches the pictures, and goes fast with the LoRA', () => {
    const graph = buildPhantomGraph({
      prompt: 'p',
      references: ['face.png', 'plate.png', 'outfit.png', 'extra.png'],
      width: 832,
      height: 480,
      seed: 7,
      prefix: 'Castcut-phantom',
      fast: true,
    });
    const loads = Object.values(graph).filter(node => node.class_type === 'LoadImage');
    assert.deepEqual(loads.map(node => node.inputs.image), ['face.png', 'plate.png', 'outfit.png']);
    assert.deepEqual(graph.phantom!.inputs.images, ['batch2', 0]);
    assert.equal(graph.lora!.inputs.lora_name, PHANTOM_FILES.lora);
    assert.equal(graph.sigmas!.inputs.steps, 6);
    assert.equal(graph.guider!.inputs.cfg_conds, 1);
    assert.equal(graph[PHANTOM_SAVE_NODE]!.inputs.filename_prefix, 'Castcut-phantom');
    const slow = buildPhantomGraph({ prompt: 'p', references: ['face.png'], width: 832, height: 480, seed: 7, prefix: 'x', fast: false });
    assert.equal(slow.lora, undefined);
    assert.deepEqual(slow.shift!.inputs.model, ['unet', 0]);
    assert.deepEqual([slow.guider!.inputs.cfg_conds, slow.guider!.inputs.cfg_cond2_negative, slow.sigmas!.inputs.steps], [7.5, 5, 20]);
    assert.throws(() => buildPhantomGraph({ prompt: 'p', references: [], width: 1, height: 1, seed: 1, prefix: 'x', fast: true }));
  });

  it('is offered only with the node and the model; fast with the LoRA', () => {
    const nodes = ['WanPhantomSubjectToVideo'];
    assert.deepEqual(phantomReadiness({ unets: [], loras: [], nodes }), { available: false, fast: false });
    assert.deepEqual(
      phantomReadiness({ unets: [`wan/${PHANTOM_FILES.unet}`], loras: [], nodes }),
      { available: true, fast: false }
    );
    assert.deepEqual(
      phantomReadiness({ unets: [PHANTOM_FILES.unet], loras: [PHANTOM_FILES.lora], nodes }),
      { available: true, fast: true }
    );
    assert.equal(phantomReadiness({ unets: [PHANTOM_FILES.unet], loras: [], nodes: [] }).available, false);
  });
});
