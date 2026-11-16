import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { comfyInputFileOfViewUrl } from './voice-read-client';

describe('a read line as a ComfyUI input file', () => {
  it('the input file (with its subfolder); an output or no file is none', () => {
    assert.equal(comfyInputFileOfViewUrl('/api/comfyui/view?filename=castcut-line_1.wav&subfolder=&type=input'), 'castcut-line_1.wav');
    assert.equal(comfyInputFileOfViewUrl('/api/comfyui/view?filename=a.wav&subfolder=castcut&type=input'), 'castcut/a.wav');
    assert.equal(comfyInputFileOfViewUrl('/api/comfyui/view?filename=a.flac&subfolder=audio&type=output'), null);
    assert.equal(comfyInputFileOfViewUrl(undefined), null);
  });
});
