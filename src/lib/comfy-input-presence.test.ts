import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  comfyInputFilesInGraph,
  findMissingComfyInputs,
  missingComfyInputsMessage,
  parseComfyInputName,
} from './comfy-input-presence';

const graph = {
  '1': { class_type: 'LoadImage', inputs: { image: 'day-face-crop-abc.png' } },
  '2': { class_type: 'LoadImage', inputs: { image: 'plates/cast-plate.png [output]' } },
  '3': { class_type: 'LoadImage', inputs: { image: ['9', 0] } },
  '4': { class_type: 'KSampler', inputs: { seed: 1 } },
  '5': { class_type: 'LoadImage', inputs: { image: 'day-face-crop-abc.png' } },
};

describe('comfy-input-presence', () => {
  it('reads annotated names', () => {
    assert.deepEqual(parseComfyInputName('a/b/c.png [temp]'), {
      filename: 'c.png',
      subfolder: 'a/b',
      type: 'temp',
    });
    assert.equal(parseComfyInputName('../x.png'), null);
  });

  it('lists each loaded file once, skipping linked inputs', () => {
    assert.deepEqual(
      comfyInputFilesInGraph(graph).map(ref => `${ref.type}:${ref.subfolder}:${ref.filename}`),
      ['input::day-face-crop-abc.png', 'output:plates:cast-plate.png']
    );
  });

  it('reports only what ComfyUI answers 404 for; an unreachable ComfyUI blocks nothing', async () => {
    const seen: string[] = [];
    const missing = await findMissingComfyInputs('http://comfy:8188/', graph, async (url, init) => {
      seen.push(`${init?.method} ${url}`);
      return new Response(null, { status: url.includes('cast-plate') ? 404 : 200 });
    });
    assert.deepEqual(
      missing.map(ref => ref.filename),
      ['cast-plate.png']
    );
    assert.ok(seen.every(line => line.startsWith('HEAD http://comfy:8188/view?')));
    assert.match(missingComfyInputsMessage(missing), /plates\/cast-plate\.png/);
    const offline = await findMissingComfyInputs('http://comfy:8188', graph, async () => {
      throw new Error('ECONNREFUSED');
    });
    assert.deepEqual(offline, []);
  });
});
