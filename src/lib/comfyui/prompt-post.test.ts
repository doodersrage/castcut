import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildComfyPromptPostBody } from './client';

describe('buildComfyPromptPostBody', () => {
  const prompt = { '1': { class_type: 'SaveImage', inputs: {} } };

  it('embeds the graph in extra_pnginfo for PNG replay', () => {
    const body = buildComfyPromptPostBody({ prompt, clientId: 'client-1' });
    assert.equal(body.client_id, 'client-1');
    assert.equal(body.prompt, prompt);
    assert.equal(body.extra_data.extra_pnginfo.workflow, prompt);
    assert.equal(body.front, undefined);
  });

  it('sets front only when requested', () => {
    const body = buildComfyPromptPostBody({ prompt, clientId: 'client-1', front: true });
    assert.equal(body.front, true);
  });
});
