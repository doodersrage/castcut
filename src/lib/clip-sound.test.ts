import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clipUrlIsSilent } from './clip-sound';

describe('clipUrlIsSilent', () => {
  it('reads WAN WebP as silent and MP4 as sound', () => {
    assert.equal(clipUrlIsSilent('/api/comfyui/view?filename=Castcut_00012_.webp&type=output'), true);
    assert.equal(clipUrlIsSilent('/api/comfyui/view?filename=clip_00001_.mp4&type=output'), false);
    assert.equal(clipUrlIsSilent('/api/gallery/media/abc?variant=original'), false);
    assert.equal(clipUrlIsSilent(''), false);
  });
});
