import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';

mock.module('server-only', { defaultExport: {}, namedExports: {} });

describe('isolate-matte-comfy-server', async () => {
  const { buildComfyMatteGraph, pickBackgroundRemovalModel } = await import(
    './isolate-matte-comfy-server'
  );

  it('prefers a BiRefNet background-removal model, else the first offered', () => {
    assert.equal(
      pickBackgroundRemovalModel(['u2net.safetensors', 'birefnet.safetensors']),
      'birefnet.safetensors'
    );
    assert.equal(pickBackgroundRemovalModel(['  ', 'rmbg.safetensors']), 'rmbg.safetensors');
    assert.equal(pickBackgroundRemovalModel([]), null);
  });

  it('builds a mask-only graph that previews (never saves to the gallery)', () => {
    const graph = buildComfyMatteGraph({
      imageName: 'castcut-isolate-x.png',
      modelInput: 'bg_removal_name',
      modelName: 'birefnet.safetensors',
    }) as Record<string, { class_type: string; inputs: Record<string, unknown> }>;
    assert.deepEqual(graph['1']?.inputs, { image: 'castcut-isolate-x.png' });
    assert.deepEqual(graph['2']?.inputs, { bg_removal_name: 'birefnet.safetensors' });
    assert.equal(graph['3']?.class_type, 'RemoveBackground');
    assert.equal(graph['5']?.class_type, 'PreviewImage');
    assert.ok(
      !Object.values(graph).some(node => node.class_type === 'SaveImage'),
      'no SaveImage node'
    );
  });
});
