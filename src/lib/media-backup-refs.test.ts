import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { collectComfyFileRefs, comfyRefFromViewUrl } from './media-backup-refs';

describe('media-backup-refs', () => {
  it('reads proxy and ComfyUI view links', () => {
    assert.deepEqual(
      comfyRefFromViewUrl(
        '/api/comfyui/view?filename=a.png&subfolder=day&type=output&comfyUrl=http%3A%2F%2F127.0.0.1%3A8188'
      ),
      { filename: 'a.png', subfolder: 'day', type: 'output' }
    );
    assert.deepEqual(comfyRefFromViewUrl('http://comfy:8188/view?filename=b.webp&type=input'), {
      filename: 'b.webp',
      subfolder: '',
      type: 'input',
    });
    assert.equal(comfyRefFromViewUrl('/api/comfyui/view?filename=..%2Fx.png&type=input'), null);
    assert.equal(comfyRefFromViewUrl('/api/comfyui/view?filename=t.png&type=temp'), null);
  });

  it('finds Cast and plate pictures but skips the Gallery and history', () => {
    const refs = collectComfyFileRefs({
      comfyGallery: [{ images: [{ filename: 'render.png', subfolder: '', type: 'output' }] }],
      history: [{ imageUrl: '/api/comfyui/view?filename=old.png&type=output' }],
      extras: {
        characters: [
          {
            ipAdapter: { imageUrl: '/api/comfyui/view?filename=lock.png&subfolder=&type=input' },
            reference: {
              originalUrl: '/api/comfyui/view?filename=ref.png&subfolder=cast&type=output',
              originalFilename: 'ref-upload.png',
            },
          },
        ],
        dressPlates: [{ key: 'k', filename: 'plates/dress-1.png' }],
        note: { filename: 'not a file name' },
      },
    });
    const keys = refs.map(ref => `${ref.type}:${ref.subfolder}:${ref.filename}`).sort();
    assert.deepEqual(keys, [
      'input::lock.png',
      'input::ref-upload.png',
      'input:plates:dress-1.png',
      'output:cast:ref.png',
    ]);
  });
});
