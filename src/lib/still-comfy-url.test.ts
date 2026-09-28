import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comfyViewUrlForStill, isComfyViewUrl } from './still-comfy-url';

describe('still-comfy-url', () => {
  const gallery = [
    { promptId: 'p1', images: [{ filename: 'Castcut_00326_.png', subfolder: '', type: 'output' }] },
  ];

  it('maps a durable gallery still back to its ComfyUI output', () => {
    const url = comfyViewUrlForStill(
      { imageUrl: '/api/gallery/media/abc?variant=original', promptId: 'p1' },
      gallery
    );
    assert.equal(url, '/api/comfyui/view?filename=Castcut_00326_.png&subfolder=&type=output');
    assert.equal(isComfyViewUrl(url), true);
  });

  it('keeps ComfyUI URLs and gives up without a gallery match', () => {
    const view = '/api/comfyui/view?filename=a.png&type=output&subfolder=';
    assert.equal(comfyViewUrlForStill({ imageUrl: view }, []), view);
    assert.equal(comfyViewUrlForStill({ imageUrl: '/api/gallery/media/x', promptId: 'zz' }, gallery), null);
    assert.equal(isComfyViewUrl('/api/gallery/media/x'), false);
  });
});
