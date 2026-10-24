import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hasComfyInputCopy, keepComfyInputCopy } from './input-store-server';
import { keepComfyFilesInBackground, keepComfyFilesSettled } from './input-store-keep-server';

// The store folder is the test runner's throwaway one (CASTCUT_INPUT_STORE_DIR).
describe('keeping the pictures the browser’s data names', () => {
  it('counts what is kept, copies what is not, and skips what ComfyUI lost', async () => {
    keepComfyInputCopy({ filename: 'keep-already.png' }, new Uint8Array([1]));
    const served: string[] = [];
    const fetchImpl = async (url: string) => {
      const name = new URL(url).searchParams.get('filename') ?? '';
      served.push(name);
      return name === 'keep-gone.png'
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array([7, 7]));
    };
    const result = keepComfyFilesInBackground(
      'http://comfy',
      [
        { filename: 'keep-already.png', type: 'input' },
        { filename: 'Castcut_09001_.png', subfolder: '', type: 'output' },
        { filename: 'keep-gone.png', type: 'input' },
        { filename: '../escape.png', type: 'input' },
        { filename: 'temp.png', type: 'temp' },
        'nonsense',
      ],
      fetchImpl
    );
    assert.deepEqual(result, { named: 3, kept: 1, queued: 2 });
    await keepComfyFilesSettled();
    assert.ok(hasComfyInputCopy({ filename: 'Castcut_09001_.png', type: 'output' }));
    assert.equal(hasComfyInputCopy({ filename: 'keep-gone.png' }), false);
    assert.ok(!served.includes('keep-already.png'), 'a kept copy is not fetched again');
  });
});
