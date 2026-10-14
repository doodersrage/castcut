import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOutfit3dGraph,
  OUTFIT_3D_LOAD_NODE,
  OUTFIT_3D_SAVE_NODE,
  OUTFIT_3D_SEED_NODES,
} from './outfit-3d-graph';

describe('outfit 3D graph (TRELLIS.2)', () => {
  it('loads the picture, saves a GLB under 3d/ and seeds every stage', () => {
    const graph = buildOutfit3dGraph({ image: 'plate.png', prefix: 'castcut-outfit', seed: 100 });
    assert.equal(graph[OUTFIT_3D_LOAD_NODE]!.inputs.image, 'plate.png');
    assert.equal(graph[OUTFIT_3D_SAVE_NODE]!.class_type, 'SaveGLB');
    assert.equal(graph[OUTFIT_3D_SAVE_NODE]!.inputs.filename_prefix, '3d/castcut-outfit');
    assert.deepEqual(
      OUTFIT_3D_SEED_NODES.map(id => graph[id]!.inputs.seed),
      OUTFIT_3D_SEED_NODES.map((_, index) => 100 + index)
    );
    // Only the TRELLIS.2 branch: no Pixal3D, no switches or preview nodes.
    const types = new Set(Object.values(graph).map(node => node.class_type));
    for (const gone of ['Pixal3DConditioning', 'ComfySwitchNode', 'PreviewImage', 'MaskPreview']) {
      assert.equal(types.has(gone), false, gone);
    }
    // Every link points at a node in the graph.
    for (const node of Object.values(graph)) {
      for (const value of Object.values(node.inputs)) {
        if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
          assert.ok(graph[value[0]], `missing node ${value[0]}`);
        }
      }
    }
  });
  it('builds a fresh copy each time', () => {
    const a = buildOutfit3dGraph({ image: 'a.png', prefix: 'p', seed: 1 });
    const b = buildOutfit3dGraph({ image: 'b.png', prefix: 'p', seed: 1 });
    assert.notEqual(a[OUTFIT_3D_LOAD_NODE]!.inputs.image, b[OUTFIT_3D_LOAD_NODE]!.inputs.image);
  });
});
