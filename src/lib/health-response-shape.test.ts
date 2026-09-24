import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isHealthResponse } from '../components/settings/tabs/settings-tool-shared';

describe('isHealthResponse', () => {
  it('accepts a real health payload', () => {
    assert.equal(
      isHealthResponse({ llm: { ok: false, enabled: true }, comfyui: { ok: true, url: 'x' } }),
      true
    );
  });

  it('rejects error bodies that used to crash Settings (429 rate limit, 5xx)', () => {
    assert.equal(isHealthResponse({ error: 'Too many requests' }), false);
    assert.equal(isHealthResponse({ llm: { ok: true } }), false);
    assert.equal(isHealthResponse(null), false);
    assert.equal(isHealthResponse('nope'), false);
  });
});
